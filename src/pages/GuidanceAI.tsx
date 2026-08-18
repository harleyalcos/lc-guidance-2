import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AiReportPdfGenerator, { AiReportMetadata, AiReportPdfGeneratorRef } from "../components/AiReportPdfGenerator";

interface Message {
  role: "user" | "model";
  parts: { text?: string; functionCall?: any; functionResponse?: any }[];
  timestamp: Date;
  id: string;
}

const SYSTEM_PROMPT = `You are the Laguna College Guidance AI Assistant. Your purpose is to help guidance counselors analyze student case records and answer their questions. 
Use the \`query_database_for_ai\` tool to get context from the SQLite database. The table is named 'cases'.

Schema for 'cases' table:
- id (INTEGER): Unique case ID.
- title (TEXT): Title of the case or incident.
- case (TEXT): The type/category of the incident or offense (e.g. 'Bullying', 'Vaping', 'Tardiness', 'Academic Dishonesty').
- description (TEXT): Detailed description or narrative of the incident.
- progress (TEXT): THE CASE STATUS! Values include: 'Pending', 'Reprimand' (or 'Reprimanded'), 'Resolved', 'Closed'.
  *CRITICAL STATUS RULE*: In this database, 'progress' is the column that stores the status of the case. When users ask for status counts, reprimand cases, pending cases, resolved cases, or closed cases, you MUST query the 'progress' column (e.g., LOWER(progress) LIKE '%reprimand%').
- sanction (TEXT): The action taken, disciplinary penalty, or consequence assigned (e.g. 'Verbal Warning', 'Written Reprimand', 'Suspension', 'Community Service').
- date (TEXT, format YYYY-MM-DD): Date when the incident occurred.
- date_filed (TEXT, format YYYY-MM-DD): Date when the case was filed.
- first_name, last_name, middle_initial (TEXT): Respondent student's primary name details.
- level (TEXT): Grade level (e.g. 'Grade 7', 'Grade 11').
- section (TEXT): Section name.
- adviser (TEXT): Adviser's name.
- reporting_student (TEXT): Student who reported the incident.
- students (TEXT, JSON array): JSON array of all involved students with attributes: firstName, lastName, middleInitial, level, section, adviser, role ('Respondent', 'Complainant / Subject').
- student_roles (TEXT, JSON array): JSON array of student roles.
- proofs (TEXT, JSON array): Attached proof files metadata.
- group_id (TEXT): Unique ID linking group incidents involving multiple students.
- update_history (TEXT, JSON array): History log of status and case updates.

IMPORTANT RULES & RESPONSE FORMATTING:
1. ALWAYS use the \`query_database_for_ai\` tool if you need information about cases.
2. Understanding Status vs. Sanction:
   - CASE STATUS is stored in the 'progress' column ('Pending', 'Reprimand', 'Resolved', 'Closed').
   - CASE SANCTION is stored in the 'sanction' column and is purely a descriptive text field (e.g. 'Written Reprimand', 'Verbal Warning', 'Suspension'). It has no impact on case status counts.
   - When asked for case statuses, status counts, or reprimand cases, always query the 'progress' column (e.g., LOWER(progress) LIKE '%reprimand%').
3. NEVER fabricate statistics, names, or case details. If information is unavailable or the query returns no results, clearly state that.
4. Keep queries efficient (e.g. use COUNT, GROUP BY). Use case-insensitive matching like LOWER(...) or LIKE '%...%' for text comparisons.
5. CONVERSATIONAL DEFAULT (PLAIN TEXT):
   - When the user asks a question, requests numbers/counts, inquires about specific students, or asks for advice/explanations: respond in clear, helpful, and concise standard Markdown text (with bullet points or short tables as appropriate). DO NOT generate a formal report sheet.
6. FORMAL REPORT SHEETS (ONLY WHEN EXPLICITLY REQUESTED):
   - ONLY generate a formal printable report sheet if the user EXPLICITLY asks to generate or create a report (e.g., "generate a report", "create a weekly/monthly report", "export a report", "give me a report sheet", or when using a report template).
   - The report format MUST BE IDENTICAL to the Reports page format of Laguna College Guidance Office.
   - When listing cases, use the EXACT standard table column headers matching the Reports page:
     | # | Date | Student | Grade | Adviser | Type | Description | Sanction | Status |
     - '#' is the row number (1, 2, 3...)
     - 'Date' is formatted as 'MMM D, YYYY' (e.g., Oct 14, 2025)
     - 'Student' is formatted as 'LastName, FirstName M.' (e.g., Santos, Maria C.)
     - 'Grade' is formatted as 'Grade X' (e.g., Grade 7, Grade 10)
     - 'Adviser' is the teacher/adviser name or '—'
     - 'Type' is the case type/offense (e.g., Bullying, Vaping, Tardiness)
     - 'Description' is the incident description or '—'
     - 'Sanction' is the consequence or penalty (e.g., Verbal Warning, Written Reprimand, 1-Day Suspension) or '—'
     - 'Status' is the exact case status ('Pending', 'Reprimand', 'Resolved', 'Closed')
   - Section heading: Use '### Case List' (or specific section name) above the table.
   - You MUST append the following JSON block at the very end of your response to provide report metadata and summary metrics:
\`\`\`json report_metadata
{
  "title": "Guidance Office Cases Report",
  "reporting_period": "e.g., August 1, 2025 – May 31, 2026",
  "scope": "e.g., All year levels",
  "status_filter": "e.g., All statuses",
  "stats": {
    "total": 12,
    "pending": 3,
    "resolved": 5,
    "reprimand": 2,
    "closed": 2
  }
}
\`\`\`
   - For all ordinary questions, inquiries, and conversations, NEVER include this JSON block.
`;

const extractPdfMetadata = (text: string): { metadata: AiReportMetadata | null; cleanText: string } => {
  const marker1 = "```json report_metadata";
  const marker2 = "```json\nreport_metadata";
  let startIdx = text.indexOf(marker1);
  let markerLength = marker1.length;
  if (startIdx === -1) {
    startIdx = text.indexOf(marker2);
    markerLength = marker2.length;
  }
  
  if (startIdx === -1) return { metadata: null, cleanText: text };

  const endIdx = text.indexOf("```", startIdx + markerLength);
  if (endIdx === -1) return { metadata: null, cleanText: text };

  const jsonStr = text.substring(startIdx + markerLength, endIdx).trim();
  try {
    const metadata = JSON.parse(jsonStr) as AiReportMetadata;
    const cleanText = text.substring(0, startIdx).trim() + "\n" + text.substring(endIdx + 3).trim();
    return { metadata, cleanText: cleanText.trim() };
  } catch (e) {
    return { metadata: null, cleanText: text };
  }
};

interface SuggestionItem {
  ref: string;
  title: string;
  sub: string;
  prompt: string;
}

const SUGGESTIONS: SuggestionItem[] = [
  {
    ref: "RPT-WK",
    title: "Weekly Report",
    sub: "Current week · all levels",
    prompt: "Generate a Weekly Disciplinary Case Report for the current week covering all year levels.",
  },
  {
    ref: "RPT-MO",
    title: "Monthly Summary",
    sub: "Current month · all levels",
    prompt: "Generate a Monthly Case Summary Report for the current month covering all grade levels.",
  },
  {
    ref: "RPT-YR",
    title: "Annual Summary Report",
    sub: "Year 2026 · all levels",
    prompt: "Generate an Annual Case Summary Report for the year 2026 covering all year levels.",
  },
  {
    ref: "RPT-GL",
    title: "Grade Level Trends",
    sub: "Year 2026 · Grades 7–12",
    prompt: "Generate a Grade Level Case Trends Report for 2026 across Grades 7 to 12.",
  },
  {
    ref: "CMP-YR",
    title: "Year-over-Year Comparison",
    sub: "2026 vs 2025",
    prompt: "Compare case counts, status breakdown, and incident trends between 2026 and 2025.",
  },
  {
    ref: "RPT-BH",
    title: "Top Behavioral Offenses",
    sub: "Year 2026 · all levels",
    prompt: "Identify and summarize the most common behavioral offenses for 2026 covering all year levels.",
  },
  {
    ref: "RPT-AC",
    title: "Top Academic Concerns",
    sub: "Year 2026 · Senior High",
    prompt: "Report on the most common academic issues and attendance concerns for 2026 for Senior High School (Grades 11-12).",
  },
  {
    ref: "RPT-MU",
    title: "Repeat Offender Audit",
    sub: "Year 2026 · multiple cases",
    prompt: "Identify and list all students with multiple recorded case records during 2026.",
  },
  {
    ref: "PLN-INT",
    title: "Intervention Guidance Plan",
    sub: "Year 2026 · all levels",
    prompt: "Provide counselor intervention recommendations based on case trends for 2026 across all year levels.",
  },
  {
    ref: "PRD-HR",
    title: "High-Risk Student Identification",
    sub: "Year 2026 · early warning",
    prompt: "Analyze case history to identify high-risk students needing immediate guidance counseling for 2026.",
  },
];

const MessageBubble = ({ isUser, cleanText, metadata }: { isUser: boolean, cleanText: string, metadata: AiReportMetadata | null }) => {
  const pdfGeneratorRef = useRef<AiReportPdfGeneratorRef>(null);

  const handleDownload = () => {
    // Small timeout to ensure no lingering state issues, though typically immediate is fine
    setTimeout(() => {
      pdfGeneratorRef.current?.generatePdf();
    }, 50);
  };

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? "bg-primary text-on-primary" : "bg-primary-container text-on-primary-container"
      }`}>
        <span className="material-symbols-outlined text-[18px]">
          {isUser ? "person" : "smart_toy"}
        </span>
      </div>
      <div className={`max-w-[85%] ${!metadata ? "rounded-2xl p-4 shadow-sm" : "w-full"} ${
        isUser 
          ? "bg-primary text-on-primary rounded-tr-none" 
          : !metadata ? "bg-surface-container-low dark:bg-surface-container border border-outline-variant text-on-surface rounded-tl-none" : ""
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap font-body-md text-sm">{cleanText}</p>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {metadata ? (
              <div className="flex flex-col w-full items-start">
                <AiReportPdfGenerator
                  ref={pdfGeneratorRef}
                  metadata={metadata}
                  bodyMarkdown={cleanText}
                  isPreview={true}
                />
                <button
                  onClick={handleDownload}
                  className="btn-secondary text-xs h-8 px-4 mt-2"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  Download PDF Report
                </button>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-surface-container-lowest prose-pre:border prose-pre:border-outline-variant prose-th:bg-surface-container-high">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function GuidanceAI() {
  const [apiKey, setApiKey] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    invoke<string>("get_gemini_api_key")
      .then(setApiKey)
      .catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const callGemini = async (currentMessages: Message[], _initialCall = true) => {
    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          parts: [{ text: "Error: Gemini API Key is not configured. Please add it in Account Settings." }],
          timestamp: new Date(),
          id: generateId(),
        },
      ]);
      setIsGenerating(false);
      return;
    }

    try {
      const formattedContents = currentMessages
        .map((m) => {
          const validParts = m.parts.filter((p) => {
            if (p.text !== undefined) return p.text.trim().length > 0;
            if (p.functionCall) return true;
            if (p.functionResponse) return true;
            return false;
          });
          return {
            role: m.role,
            parts: validParts,
          };
        })
        .filter((m) => m.parts.length > 0);

      console.log("[Guidance AI Request Payload]", {
        model: "gemini-3.1-flash-lite",
        contents: formattedContents,
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: formattedContents,
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "query_database_for_ai",
                    description:
                      "Execute a read-only SQLite SELECT query against the 'cases' table. Use this to fetch case counts, trends, and details to answer the user's question.",
                    parameters: {
                      type: "object",
                      properties: {
                        sql: { type: "string", description: "The SQLite SELECT query." },
                      },
                      required: ["sql"],
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Guidance AI Error] gemini-3.1-flash-lite returned status ${response.status}:`, errText);
        throw new Error(`Gemini 3.1 Flash Lite API Error (${response.status}): ${errText}`);
      }

      if (!response.body) throw new Error("No response body received from Gemini API.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let textBuffer = "";
      let sseBuffer = "";
      let functionCallPart: any = null;
      let modelMessageId = generateId();

      setMessages((prev) => [
        ...prev,
        { role: "model", parts: [{ text: "" }], timestamp: new Date(), id: modelMessageId },
      ]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || ""; // Keep incomplete line in buffer for next chunk

          for (let line of lines) {
            line = line.trim();
            if (line.startsWith("data:")) {
              line = line.substring(5).trim();
            } else if (line.startsWith(":")) {
              continue;
            }
            if (!line || line === "[" || line === "]" || line === ",") continue;

            try {
              const data = JSON.parse(line);
              console.log("[Guidance AI Stream Event]", data);
              const candidate = data.candidates?.[0];
              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    textBuffer += part.text;
                    const currentText = textBuffer;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === modelMessageId
                          ? { ...msg, parts: [{ text: currentText }] }
                          : msg
                      )
                    );
                  }
                  if (part.functionCall) {
                    console.log("[Guidance AI Function Call Detected]", part);
                    if (!functionCallPart) {
                      functionCallPart = JSON.parse(JSON.stringify(part));
                    } else {
                      if (part.functionCall.name) functionCallPart.functionCall.name = part.functionCall.name;
                      if (part.functionCall.args) {
                        functionCallPart.functionCall.args = {
                          ...(functionCallPart.functionCall.args || {}),
                          ...part.functionCall.args
                        };
                      }
                      for (const key in part) {
                        if (key !== 'functionCall' && key !== 'text') {
                          functionCallPart[key] = part[key];
                        }
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error("[Guidance AI Stream JSON Parse Error]", e, "Raw Line:", line);
            }
          }
        }
      }

      if (functionCallPart && functionCallPart.functionCall && functionCallPart.functionCall.name === "query_database_for_ai") {
        const sql = functionCallPart.functionCall.args?.sql;
        console.log("[Guidance AI Executing Tool]", functionCallPart.functionCall.name, "SQL:", sql);
        let queryResult: any;
        try {
          queryResult = await invoke("query_database_for_ai", { sql });
          console.log("[Guidance AI SQL Query Result]", queryResult);
        } catch (dbErr) {
          console.error("[Guidance AI SQL Query Error]", dbErr);
          queryResult = { error: dbErr instanceof Error ? dbErr.message : String(dbErr) };
        }

        const functionCallMessage: Message = {
          role: "model",
          parts: [functionCallPart],
          timestamp: new Date(),
          id: generateId(),
        };
        const functionResponseMessage: Message = {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: functionCallPart.functionCall.name,
                response: { result: queryResult },
              },
            },
          ],
          timestamp: new Date(),
          id: generateId(),
        };

        const updatedHistory = [...currentMessages, functionCallMessage, functionResponseMessage];

        // Remove placeholder text message and insert tool call history
        setMessages((prev) => prev.filter((m) => m.id !== modelMessageId));
        setMessages((prev) => [...prev, functionCallMessage, functionResponseMessage]);

        await callGemini(updatedHistory, false);
      } else {
        if (!textBuffer.trim()) {
          console.warn("[Guidance AI Warning] Empty text response from Gemini model.");
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === modelMessageId
                ? {
                    ...msg,
                    parts: [
                      {
                        text: "Unable to generate a response. Please check developer console (F12) for logs.",
                      },
                    ],
                  }
                : msg
            )
          );
        }
        setIsGenerating(false);
      }
    } catch (err) {
      console.error("[Guidance AI Chat Fatal Error]", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          parts: [{ text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          timestamp: new Date(),
          id: generateId(),
        },
      ]);
      setIsGenerating(false);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || inputValue;
    if (!text.trim() || isGenerating) return;

    const newUserMessage: Message = {
      role: "user",
      parts: [{ text: text.trim() }],
      timestamp: new Date(),
      id: generateId(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsGenerating(true);

    await callGemini([...messages, newUserMessage]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleClear = () => setMessages([]);

  const handleSelectSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest relative overflow-hidden animate-fade-in">
      {messages.length > 0 && (
        <div className="absolute top-4 right-6 z-20">
          <button
            onClick={handleClear}
            className="btn-secondary text-xs h-8 px-3 shadow-xs bg-surface dark:bg-surface-container"
            title="Clear Conversation"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            Clear
          </button>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="page-header-h1 m-0 mb-2">Guidance AI</h1>
              <p className="text-sm text-gray-600 dark:text-secondary leading-relaxed max-w-md">
                Query case records, generate reports, and compare trends across the archive.
              </p>
            </div>
            
            <div className="w-full max-w-3xl mx-auto flex flex-col">
              <div className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface shadow-xs">
                {/* Table Header */}
                <div className="flex items-center px-6 py-3 border-b border-outline-variant bg-surface-container-low micro-label text-left">
                  <span className="flex-1">SUGGESTED REQUESTS</span>
                </div>

                {/* Rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 bg-outline-variant gap-[1px]">
                  {(showAllSuggestions ? SUGGESTIONS : SUGGESTIONS.slice(0, 4)).map((suggestion) => (
                    <button
                      key={suggestion.ref}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion.prompt)}
                      className="w-full h-full flex items-center px-6 py-4 bg-surface hover:bg-surface-container transition-colors text-left group cursor-pointer"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="font-serif text-sm font-bold text-gray-900 dark:text-on-surface group-hover:text-primary transition-colors">
                          {suggestion.title}
                        </div>
                        <div className="font-data-mono text-xs text-gray-500 dark:text-secondary mt-0.5">
                          {suggestion.sub}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-gray-400 dark:text-secondary opacity-80 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-primary transition-all text-[18px]">
                        arrow_forward
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAllSuggestions((prev) => !prev)}
                className="mt-4 text-xs font-serif font-medium text-gray-600 dark:text-secondary hover:text-primary dark:hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>{showAllSuggestions ? "Show fewer templates" : "View all report templates"}</span>
                <span className="material-symbols-outlined text-[16px]">
                  {showAllSuggestions ? "expand_less" : "expand_more"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-4">
            {messages.map((msg) => {
              if (msg.role === "model" && msg.parts[0]?.functionCall) {
                  return (
                      <div key={msg.id} className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                            <span className="material-symbols-outlined text-[18px]">database</span>
                          </div>
                          <div className="bg-surface-container-low border border-outline-variant text-secondary text-xs p-3 rounded-2xl rounded-tl-none font-data-mono">
                            Querying database: {msg.parts[0].functionCall.name}
                          </div>
                      </div>
                  )
              }
              if (msg.role === "user" && msg.parts[0]?.functionResponse) {
                  return null; // hide raw function responses from UI
              }

              const isUser = msg.role === "user";
              const rawTextContent = msg.parts.map(p => p.text).join("");
              const { metadata, cleanText } = isUser ? { metadata: null, cleanText: rawTextContent } : extractPdfMetadata(rawTextContent);
              
              if (!cleanText && isUser) return null;

              return (
                <MessageBubble 
                  key={msg.id} 
                  isUser={isUser} 
                  cleanText={cleanText} 
                  metadata={metadata} 
                />
              );
            })}
            
            {isGenerating && messages[messages.length - 1]?.role !== "model" && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] animate-pulse">smart_toy</span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 md:p-6 bg-surface dark:bg-surface-container-lowest relative z-20">
        <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between text-xs text-secondary px-1">
          <div className="flex items-center gap-1.5 font-medium text-[11px] text-primary/80 dark:text-[#7f9cf8]">
            <span className="material-symbols-outlined text-[14px]">tune</span>
            <span><strong>Tip:</strong> Include <strong>Date Range / AY</strong> &amp; <strong>Scope</strong> (e.g. <em>AY 2026-2027, Grade 10</em>) in your prompt for precise records context.</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto relative flex items-center">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about case trends or generate reports (e.g., 'Generate monthly summary for AY 2026-2027 covering Grade 10')..."
            className="w-full bg-surface border border-outline-variant rounded-2xl pl-5 pr-14 py-3.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none overflow-y-auto shadow-sm"
            style={{ minHeight: "52px", maxHeight: "200px" }}
            rows={1}
            disabled={isGenerating}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isGenerating}
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              inputValue.trim() && !isGenerating
                ? "bg-primary text-on-primary hover:bg-primary/90"
                : "bg-surface-container text-secondary cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined text-[18px] translate-x-[1px]">send</span>
          </button>
        </div>
        <p className="text-center text-xs text-secondary mt-2.5 font-medium">
          Guidance AI can make mistakes. Always verify important statistics and recommendations.
        </p>
      </div>
    </div>
  );
}
