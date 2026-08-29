import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AiReportPdfGenerator, { AiReportMetadata } from "../components/AiReportPdfGenerator";
import AiHistoryDrawer, { AiSession, AiSavedMessage } from "../components/AiHistoryDrawer";

interface Message {
  role: "user" | "model";
  parts: { text?: string; functionCall?: any; functionResponse?: any }[];
  timestamp: Date;
  id: string;
}

const getDynamicSystemPrompt = (): string => {
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const dayOfWeek = dayNames[now.getDay()];
  const monthName = monthNames[now.getMonth()];
  const day = now.getDate();
  const year = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const isoDate = `${year}-${mm}-${dd}`;
  const currentMonthYear = `${monthName} ${year}`;
  const currentMonthIso = `${year}-${mm}`;
  const academicYear = now.getMonth() >= 7 ? `AY ${year}–${year + 1}` : `AY ${year - 1}–${year}`;

  return `You are the Laguna College Guidance AI Assistant and Interactive User Manual.
Your dual purpose is:
1. DATA & COUNSELING ASSISTANT: Help guidance counselors analyze student case records, identify behavioral trends, suggest restorative interventions, and generate official institutional guidance reports.
2. INTERACTIVE USER MANUAL & SYSTEM GUIDE: Serve as an on-demand, expert guide for counselors and staff on how to use every feature and workflow in the Laguna College Guidance Information System (LCGO).

CALENDAR & REAL-TIME TEMPORAL CONTEXT (MANDATORY):
- Current Real-World Date: ${dayOfWeek}, ${monthName} ${day}, ${year} (${isoDate})
- Current Year: ${year}
- Current Month: ${currentMonthYear} (Numeric: ${mm}/${year}, SQLite pattern: '${currentMonthIso}%')
- Current Academic Year: ${academicYear}
*CRITICAL TEMPORAL RULES*:
- When the user asks for "today", "current month", "this month", "this year", "recent cases", or any relative time frame, you MUST strictly use the current real-world calendar context above (Year: ${year}, Month: ${currentMonthYear} / ${mm}/${year}).
- For "current month" queries, query the database matching dates starting with '${currentMonthIso}' (e.g. \`WHERE date LIKE '${currentMonthIso}%'\` or \`date_filed LIKE '${currentMonthIso}%'\`).
- For "current year" or "this year" queries, match dates starting with '${year}' (e.g. \`WHERE date LIKE '${year}%'\`).
- When the user asks "what is the date today" or "what is the month today", state: "${currentMonthYear}" or "${monthName} ${day}, ${year}".
- NEVER assume or default to past years like 2024 or 2025 unless the user explicitly asks for historical data from those specific years.

======================================================================
SCHEMA FOR 'cases' TABLE (FOR DATABASE QUERIES):
======================================================================
- id (INTEGER): Unique case ID.
- title (TEXT): Title of the case or incident.
- case (TEXT): The type/category of the incident or offense (e.g. 'Bullying', 'Vaping', 'Tardiness', 'Academic Dishonesty', 'Peer relationship issues').
- description (TEXT): Detailed description or narrative of the incident.
- progress (TEXT): THE CASE STATUS! Values include: 'Pending', 'Resolved', 'Closed' (or legacy 'Reprimand').
  *CRITICAL STATUS RULE*: 'progress' stores the lifecycle status (Pending, Resolved, Closed). When users ask for status counts (e.g. pending, resolved, closed), query the 'progress' column. When users ask for reprimand, sanctioned cases, or disciplinary action counts, query both 'sanction' (e.g., LOWER(sanction) LIKE '%reprimand%') and 'progress' (e.g., LOWER(progress) LIKE '%reprimand%').
- sanction (TEXT): The action taken, disciplinary penalty, or consequence assigned (e.g. 'Verbal Warning', 'Written Reprimand', 'Reprimand', 'Suspension', 'Community Service', 'Parent Conference').
- date (TEXT, format YYYY-MM-DD): Date when the incident occurred.
- date_filed (TEXT, format YYYY-MM-DD): Date when the case was filed.
- first_name, last_name, middle_initial (TEXT): Respondent student's primary name details.
- level (TEXT): Grade level (e.g. 'Grade 7', 'Grade 11', 'College').
- section (TEXT): Section name.
- adviser (TEXT): Adviser's name.
- reporting_student (TEXT): Student who reported the incident.
- students (TEXT, JSON array): JSON array of all involved students with attributes: firstName, lastName, middleInitial, level, section, adviser, role ('Respondent', 'Complainant / Subject').
- student_roles (TEXT, JSON array): JSON array of student roles.
- proofs (TEXT, JSON array): Attached proof files metadata.
- group_id (TEXT): Unique ID linking group incidents involving multiple students.
- update_history (TEXT, JSON array): History log of status and case updates.

======================================================================
APP USER MANUAL & WORKFLOW KNOWLEDGE BASE:
======================================================================
When the user asks "How do I...", "Where is...", "Help me with...", "I forgot how to...", "Guide me on...", "What is the difference between...", or asks about any app feature or troubleshooting steps, use this official knowledge base. Provide concise, numbered, step-by-step guidance referencing exact UI buttons and page sections. DO NOT call \`query_database_for_ai\` for how-to/manual questions.

1. APPLICATION NAVIGATION & FEATURE DIRECTORY:
- **Sign In & Security Access (\`/login\`)**:
  * PIN Authentication: Access requires a 6-digit or 4-digit security PIN.
  * First-Time Setup: Prompts the user to set their master PIN and configure 3 security questions (e.g. Mother's maiden name, First pet, Childhood school).
  * 'Forgot PIN?': If the user forgets their PIN, click 'Forgot PIN?' on the sign-in screen, answer the configured security questions, and set a new PIN.
  * Sign Out: Click the 'Sign Out' icon/button at the bottom of the left sidebar to lock the session.
- **Dashboard (\`/\`)**:
  * Real-time metrics cards: Total Cases, Pending Cases, Reprimand Cases, Resolved Cases.
  * Academic Year (AY) Selector: Select an academic year (e.g. AY 2025–2026, AY 2026–2027) in the top header to filter dashboard metrics, charts, and tables.
  * Visual Charts: Grade Level Breakdown bar chart, Monthly Incident Trend chart, and Recent Cases table.
  * Quick Actions: '+ New Case', 'Export', 'Import', 'Guidance AI'.
- **Case Catalog (\`/catalog\`)**:
  * Master searchable database of all student disciplinary and guidance records.
  * Search Bar: Real-time search across student names, case titles, case numbers, sections, advisers, and offense types.
  * Filter Chips: Filter by Status ('All', 'Pending', 'Reprimand', 'Resolved', 'Closed'), Grade Levels (Grade 7 to 12, College), and Academic Year.
  * '+ New Case' Button: Launches modal to file an Individual Case or Group Incident.
  * 'Export' Button: Export table records as CSV or Excel (.xlsx) file, or open a printable catalog table.
  * Table Actions: Click any row or 'View Details' to open the case workspace.
- **Pending Cases (\`/pending\`)**:
  * Dedicated queue for cases requiring immediate counselor action or monitoring (specifically 'Pending' and 'Reprimand' cases).
  * Fast-track status updating and ongoing case tracking without wading through resolved records.
- **Case Details (\`/case/:id\`) & Group Case Details (\`/group-case/:groupId\`)**:
  * Comprehensive case workspace for individual or multi-student incidents.
  * Student Profiles: Lists all involved students with their assigned roles (Respondent, Complainant/Subject, Witness), Grade Level, Section, and Adviser.
  * Case Status Dropdown: Update lifecycle status ('Pending', 'Reprimand', 'Resolved', 'Closed').
  * Case Sanction Field: Record disciplinary action or guidance intervention (e.g., 'Verbal Warning', 'Written Reprimand', 'Parent Conference', 'Suspension', 'Community Service', 'Referral').
  * Case Update History / Progress Notes: Add timestamped counselor notes, follow-up logs, and meeting records.
  * Proof Documents & Attachments: Upload, view, and download evidence files (PDFs, PNG, JPG images). Delete obsolete proofs.
  * 'Print / Export PDF' Button: Generates and prints an official Laguna College Case Incident Sheet formatted with institutional header, student details, case narrative, counselor notes, and signature line.
  * Delete / Archive Case: Permanent deletion with safety confirmation modal.
- **Summary Reports (\`/reports\`)**:
  * Institutional analytics and formal report generation suite.
  * Report Scope Filters: Filter by Period (Monthly, Quarterly, Semester, Annual), Academic Year, Grade Level, and Case Category.
  * Visual Charts: Offense distribution, status breakdown, and monthly incident trends.
  * Official Printable PDF Generator: Export formal summary reports with official Laguna College letterhead, statistical data tables, counselor observations, and authorized signature fields.
- **Import Review (\`/import-review\`)**:
  * Spreadsheet batch importer for onboarding case records from \`.xlsx\` or \`.csv\` files.
  * Data Mapping: Automatically maps spreadsheet headers to system columns (Student Name, Grade, Section, Adviser, Case Type, Date, Description, Status, Sanction).
  * Interactive Validation Grid: Inspect uploaded rows before saving. The system flags errors (missing required fields, invalid date formats) in red/amber and allows inline editing directly in the grid to correct values.
  * 'Confirm & Import' Button: Inserts all validated rows directly into the SQLite database.
- **Account & System Settings (\`/account\`)**:
  * 'Profile & Security' Tab: Change current security PIN, update security recovery questions and answers.
  * 'AI Configuration' Tab: Enter and save the Google Gemini API Key required for Guidance AI.
  * 'System Backup & Recovery' Tab (\`/account?tab=backup\`):
    - Create instant database backup (downloads SQLite \`.db\` file).
    - Restore system database from a previous backup file (replaces current records with backup data).
    - Factory reset / database purge option (requires confirmation).
  * 'Appearance' Tab: Toggle between Light Mode and Dark Mode.
  * 'System Updates' Tab: Check software version, release notes, and update status.
- **Guidance AI (\`/ai\`)**:
  * Natural language AI assistant for data analysis, trend identification, counselor intervention strategies, printable PDF report generation, and interactive app help.
  * History Drawer (top right): Save conversation sessions, switch between chats, rename session titles, delete single sessions, or clear all history.
  * Suggested Request Tabs: Toggle between '📊 Report Templates' and '📖 App Guide & Manual'.

2. STEP-BY-STEP WORKFLOW PROCEDURES:
- **How to File an Individual Case**:
  1. Click **Case Catalog** in the sidebar (or **+ New Case** on Dashboard).
  2. Click the **+ New Case** button at the top right.
  3. Select **Individual Case**.
  4. Enter the student's First Name, Last Name, Middle Initial, Grade Level, Section, and Adviser.
  5. Select the **Case / Offense Type** (e.g. Bullying, Vaping, Tardiness, Academic Dishonesty) and the **Incident Date**.
  6. Write the **Description / Narrative** detailing what occurred.
  7. (Optional) Upload initial proof files (images or PDFs).
  8. Click **Save Case** to record the incident.
- **How to File a Group Incident (Multiple Students)**:
  1. Click **+ New Case** and select **Group Incident**.
  2. Enter the Incident Title, Date, and Description.
  3. Add each involved student, specifying their role:
     * **Respondent**: Student(s) facing the complaint or disciplinary concern.
     * **Complainant / Subject**: Student(s) who reported or were affected by the incident.
  4. Set grade level, section, and adviser for each student.
  5. Click **Create Group Case**.
- **How to Update Case Status vs. Sanctions**:
  * **Case Status (progress)** tracks the case lifecycle:
    - *Pending*: Newly filed; awaiting counselor review or parent meeting.
    - *Reprimand / Reprimanded*: Action or formal warning issued; student is under behavioral monitoring.
    - *Resolved*: Counseling session or amicable resolution completed.
    - *Closed*: Final case disposition; no further action needed.
  * **Case Sanction (sanction)** describes the specific disciplinary measure or guidance intervention (e.g., 'Verbal Warning', 'Written Reprimand', 'Parent Conference', 'Suspension', 'Community Service').
  * *To update:* Open the case from Case Catalog or Pending Cases > Change Status in the dropdown > Select or type the Sanction > Add a note in Update History > Click Save.
- **How to Batch Import Cases from Excel / CSV**:
  1. Navigate to **Import Review** in the sidebar (or click **Import** on the Dashboard).
  2. Upload your \`.xlsx\` or \`.csv\` file via drag-and-drop or file picker.
  3. Review the parsed table:
     * Ensure columns (Student Name, Grade, Case Type, Date) align properly.
     * Look for highlighted red/amber rows. You can click on cells to edit and fix errors directly in the table.
  4. Click **Confirm & Import Cases** to commit all valid records into the database.
- **How to Create a System Backup & Restore**:
  1. Go to **Settings** in the sidebar, then select **System Backup & Recovery** (or navigate to \`/account?tab=backup\`).
  2. *To Backup:* Click **Create Backup** to download the latest SQLite database file (.db) to your device.
  3. *To Restore:* Click **Restore from Backup**, select your previously saved .db file, and confirm. (Note: Restoring replaces current database records with the backup data).
- **How to Recover a Forgotten PIN**:
  1. On the Sign In screen, click **Forgot PIN?**.
  2. Answer your preset security recovery questions correctly.
  3. Enter and confirm your new security PIN.
- **How to Configure the Gemini API Key**:
  1. Open **Settings** > **AI Configuration**.
  2. Paste your Google Gemini API key into the input field.
  3. Click **Save API Key**. The Guidance AI assistant will now be fully active.
- **How to Generate and Print Official Reports**:
  * *Institutional Summary Report:* Go to **Reports** > Choose Period and filters > Click **Print / Export PDF**.
  * *Individual Case Incident Sheet:* Open the case in **Case Catalog** > Click **Print Incident Report**.
  * *AI Custom Analysis Report:* Ask Guidance AI to *"Generate a [Weekly/Monthly/Annual] Report"* > Preview the formatted report > Click **Download / Print PDF**.

======================================================================
RESPONSE FORMATTING & ROUTING RULES:
======================================================================
1. **HOW-TO / MANUAL INQUIRIES (NO DATABASE QUERY NEEDED)**:
   - When the user asks how to perform actions in the app, where features are, or how to navigate:
   - Provide direct, clear, numbered steps using bold text for UI buttons and page names.
   - DO NOT call \`query_database_for_ai\` for user manual questions.

2. **DATABASE INQUIRIES (ALWAYS QUERY SQLITE)**:
   - When the user asks for case statistics, student histories, offense counts, or trends:
   - ALWAYS call the \`query_database_for_ai\` tool.
   - Use efficient SQL with LOWER() and LIKE for case-insensitive matching.
   - NEVER fabricate statistics, student names, or dates.

3. **CONVERSATIONAL DEFAULT (PLAIN TEXT MARKDOWN)**:
   - For regular questions, counts, or app guidance, respond in clean Markdown with clear headings and bullet points. DO NOT generate the JSON metadata block.

4. **FORMAL PDF REPORTS (ONLY WHEN EXPLICITLY REQUESTED)**:
   - ONLY generate a formal printable report document when the user explicitly requests to "generate a report", "create a weekly/monthly/annual report", "export a report", or clicks a report template chip.
   - Structure:
     1. Executive Overview
     2. Focused Data Table
     3. Counselor Insights & Recommendations
     4. Metadata JSON Block:
\`\`\`json report_metadata
{
  "title": "Descriptive Report Title (e.g. Monthly Case Summary Report)",
  "reporting_period": "${mm}/${year}",
  "scope": "e.g., All Year Levels or Junior High School",
  "status_filter": "e.g., All statuses or Resolved Only"
}
\`\`\`
`;
};

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

const getSuggestions = (): SuggestionItem[] => {
  const currentYear = new Date().getFullYear();
  return [
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
      sub: `Year ${currentYear} · all levels`,
      prompt: `Generate an Annual Case Summary Report for the year ${currentYear} covering all year levels.`,
    },
    {
      ref: "RPT-GL",
      title: "Grade Level Trends",
      sub: `Year ${currentYear} · Grades 7–12`,
      prompt: `Generate a Grade Level Case Trends Report for ${currentYear} across Grades 7 to 12.`,
    },
    {
      ref: "CMP-YR",
      title: "Year-over-Year Comparison",
      sub: `${currentYear} vs ${currentYear - 1}`,
      prompt: `Compare case counts, status breakdown, and incident trends between ${currentYear} and ${currentYear - 1}.`,
    },
    {
      ref: "RPT-BH",
      title: "Top Behavioral Offenses",
      sub: `Year ${currentYear} · all levels`,
      prompt: `Identify and summarize the most common behavioral offenses for ${currentYear} covering all year levels.`,
    },
    {
      ref: "RPT-AC",
      title: "Top Academic Concerns",
      sub: `Year ${currentYear} · Senior High`,
      prompt: `Report on the most common academic issues and attendance concerns for ${currentYear} for Senior High School (Grades 11-12).`,
    },
    {
      ref: "RPT-MU",
      title: "Repeat Offender Audit",
      sub: `Year ${currentYear} · multiple cases`,
      prompt: `Identify and list all students with multiple recorded case records during ${currentYear}.`,
    },
    {
      ref: "PLN-INT",
      title: "Intervention Guidance Plan",
      sub: `Year ${currentYear} · all levels`,
      prompt: `Provide counselor intervention recommendations based on case trends for ${currentYear} across all year levels.`,
    },
    {
      ref: "PRD-HR",
      title: "High-Risk Student Identification",
      sub: `Year ${currentYear} · early warning`,
      prompt: `Analyze case history to identify high-risk students needing immediate guidance counseling for ${currentYear}.`,
    },
  ];
};

const getManualSuggestions = (): SuggestionItem[] => {
  return [
    {
      ref: "MAN-FILE",
      title: "Filing Cases & Incidents",
      sub: "Individual vs. Group cases step-by-step",
      prompt: "How do I file a new individual or group case in the system?",
    },
    {
      ref: "MAN-IMP",
      title: "Excel & CSV Batch Import",
      sub: "Uploading spreadsheets & Import Review",
      prompt: "Guide me on how to import multiple case records from an Excel or CSV file.",
    },
    {
      ref: "MAN-STS",
      title: "Case Status vs. Sanctions",
      sub: "Lifecycle: Pending, Reprimand, Resolved",
      prompt: "What is the difference between Case Status and Case Sanction, and how do I update them?",
    },
    {
      ref: "MAN-BAK",
      title: "System Backup & Recovery",
      sub: "Creating backups & restoring database",
      prompt: "How do I create a database backup and restore it if needed?",
    },
    {
      ref: "MAN-RPT",
      title: "Printing Official Reports",
      sub: "PDF exports, case sheets & summaries",
      prompt: "How do I generate and print official case sheets and summary reports?",
    },
    {
      ref: "MAN-SEC",
      title: "PIN & Security Management",
      sub: "Updating PIN, security questions & API key",
      prompt: "How do I change my security PIN and configure my Gemini AI API key?",
    },
    {
      ref: "MAN-CAT",
      title: "Searching & Filtering Cases",
      sub: "Using search filters, academic years & tags",
      prompt: "How can I search and filter cases by student, grade level, and academic year in the Case Catalog?",
    },
    {
      ref: "MAN-ATT",
      title: "Attaching Proofs & Notes",
      sub: "Uploading evidence files & update history",
      prompt: "How do I upload proof documents and record case update logs for an ongoing case?",
    },
  ];
};

const MessageBubble = ({
  isUser,
  cleanText,
  metadata,
}: {
  isUser: boolean;
  cleanText: string;
  metadata: AiReportMetadata | null;
}) => {
  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary text-on-primary" : "bg-primary-container text-on-primary-container"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">
          {isUser ? "person" : "smart_toy"}
        </span>
      </div>
      <div
        className={`max-w-[85%] ${!metadata ? "rounded-2xl p-4 shadow-sm" : "w-full"} ${
          isUser
            ? "bg-primary text-on-primary rounded-tr-none"
            : !metadata
            ? "bg-surface-container-low dark:bg-surface-container border border-outline-variant text-on-surface rounded-tl-none"
            : ""
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap font-body-md text-sm">{cleanText}</p>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {metadata ? (
              <AiReportPdfGenerator metadata={metadata} bodyMarkdown={cleanText} />
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
  const [suggestionTab, setSuggestionTab] = useState<"reports" | "manual">("reports");

  // History Drawer State
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [showDeleteActiveModal, setShowDeleteActiveModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load API Key
  useEffect(() => {
    invoke<string>("get_gemini_api_key")
      .then(setApiKey)
      .catch(console.error);
  }, []);

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch session history list from SQLite
  const fetchSessions = async () => {
    try {
      const list = await invoke<AiSession[]>("get_ai_sessions");
      setSessions(list || []);
    } catch (err) {
      console.error("[Guidance AI Failed to fetch sessions]", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const callGemini = async (
    currentMessages: Message[],
    sessionId: string,
    defaultTitle: string,
    _initialCall = true
  ) => {
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
      // Sliding window context: keep only recent turns to maintain token efficiency and low memory
      const recentMessages = currentMessages.slice(-8);

      const formattedContents = recentMessages
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
            systemInstruction: { parts: [{ text: getDynamicSystemPrompt() }] },
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
                    if (!functionCallPart) {
                      functionCallPart = JSON.parse(JSON.stringify(part));
                    } else {
                      if (part.functionCall.name) functionCallPart.functionCall.name = part.functionCall.name;
                      if (part.functionCall.args) {
                        functionCallPart.functionCall.args = {
                          ...(functionCallPart.functionCall.args || {}),
                          ...part.functionCall.args,
                        };
                      }
                      for (const key in part) {
                        if (key !== "functionCall" && key !== "text") {
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

      if (
        functionCallPart &&
        functionCallPart.functionCall &&
        functionCallPart.functionCall.name === "query_database_for_ai"
      ) {
        const sql = functionCallPart.functionCall.args?.sql;
        let queryResult: any;
        try {
          queryResult = await invoke("query_database_for_ai", { sql });
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

        await callGemini(updatedHistory, sessionId, defaultTitle, false);
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
        } else {
          // Persist the synthesized model response to SQLite
          const { metadata } = extractPdfMetadata(textBuffer);
          const tag = metadata ? "Reports" : "Queries";
          const sessionTitle = metadata?.title || defaultTitle;

          try {
            await invoke("save_ai_message", {
              sessionId,
              sessionTitle,
              tag,
              message: {
                id: modelMessageId,
                session_id: sessionId,
                role: "model",
                content: textBuffer,
                metadata: metadata ? JSON.stringify(metadata) : null,
                timestamp: new Date().toISOString(),
              },
            });
            fetchSessions();
          } catch (saveErr) {
            console.error("[Guidance AI Failed to save model message]", saveErr);
          }
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

    let sessionId = currentSessionId;
    let isFirst = false;
    if (!sessionId) {
      sessionId = generateId();
      setCurrentSessionId(sessionId);
      isFirst = true;
    }

    const newUserMessage: Message = {
      role: "user",
      parts: [{ text: text.trim() }],
      timestamp: new Date(),
      id: generateId(),
    };

    const nextMessages = [...messages, newUserMessage];
    setMessages(nextMessages);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsGenerating(true);

    const derivedTitle = text.trim().length > 40 ? text.trim().substring(0, 40) + "..." : text.trim();

    // Save user message to SQLite
    try {
      await invoke("save_ai_message", {
        sessionId,
        sessionTitle: isFirst ? derivedTitle : null,
        tag: "Queries",
        message: {
          id: newUserMessage.id,
          session_id: sessionId,
          role: "user",
          content: text.trim(),
          metadata: null,
          timestamp: newUserMessage.timestamp.toISOString(),
        },
      });
      fetchSessions();
    } catch (err) {
      console.error("[Guidance AI Error saving user message]", err);
    }

    await callGemini(nextMessages, sessionId, derivedTitle);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      setIsGenerating(false);
      const savedMessages = await invoke<AiSavedMessage[]>("get_ai_session_messages", { sessionId });
      const loaded: Message[] = (savedMessages || []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "model",
        parts: [{ text: m.content }],
        timestamp: new Date(m.timestamp),
      }));
      setMessages(loaded);
      setCurrentSessionId(sessionId);
    } catch (err) {
      console.error("[Guidance AI Failed to load session messages]", err);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (window.confirm("Are you sure you want to delete this conversation? All messages in this session will be permanently removed.")) {
      try {
        await invoke("delete_ai_session", { sessionId });
        if (currentSessionId === sessionId) {
          handleNewChat();
        }
        fetchSessions();
      } catch (err) {
        console.error("[Guidance AI Failed to delete session]", err);
      }
    }
  };

  const handleDeleteActiveConversation = () => {
    setShowDeleteActiveModal(true);
  };

  const handleConfirmDeleteActive = async () => {
    setShowDeleteActiveModal(false);
    if (currentSessionId) {
      try {
        await invoke("delete_ai_session", { sessionId: currentSessionId });
        fetchSessions();
      } catch (err) {
        console.error("[Guidance AI Failed to delete active session]", err);
      }
    }
    handleNewChat();
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      await invoke("rename_ai_session", { sessionId, newTitle });
      fetchSessions();
    } catch (err) {
      console.error("[Guidance AI Failed to rename session]", err);
    }
  };

  const handleClearAllSessions = async () => {
    try {
      await invoke("clear_all_ai_sessions");
      handleNewChat();
      fetchSessions();
    } catch (err) {
      console.error("[Guidance AI Failed to clear sessions]", err);
    }
  };

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
      {/* ─── Top Header Bar (Matching other pages: h-16 px-8) ─── */}
      <div className="flex-none h-16 px-8 border-b border-outline-variant bg-surface/80 dark:bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-between z-20">
        <div className="flex items-center gap-3">

          <h2 className="font-serif text-base font-semibold text-primary dark:text-primary-fixed-dim m-0 text-left truncate max-w-md">
            {messages.length > 0
              ? sessions.find((s) => s.id === currentSessionId)?.title || "Active Conversation"
              : "Guidance AI"}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDeleteActiveConversation}
                className="btn-secondary text-xs h-8 px-2.5 shadow-xs bg-surface dark:bg-surface-container hover:bg-red-50 dark:hover:bg-red-950/40 text-secondary hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 cursor-pointer transition-colors"
                title="Delete this conversation"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={handleNewChat}
                className="btn-secondary text-xs h-8 px-2.5 shadow-xs bg-surface dark:bg-surface-container flex items-center gap-1 cursor-pointer"
                title="Start a new chat session"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>New Chat</span>
              </button>
            </>
          )}

          {/* Slide-over History Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsHistoryDrawerOpen(true)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-xs cursor-pointer ${
              isHistoryDrawerOpen
                ? "bg-primary text-on-primary border-primary font-bold"
                : "bg-surface dark:bg-surface-container border-outline-variant hover:bg-surface-container-high text-on-surface"
            }`}
            title="Open Conversation History"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">history</span>
            <span>History</span>
            {sessions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                {sessions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ─── Chat Area ─── */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center max-w-3xl mx-auto">
            <div className="w-full max-w-3xl mx-auto flex flex-col">
              <div className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface shadow-xs">
                {/* Table Header with Tabs */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container-low">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestionTab("reports");
                        setShowAllSuggestions(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        suggestionTab === "reports"
                          ? "bg-primary text-on-primary shadow-xs"
                          : "text-secondary hover:text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">analytics</span>
                      <span>Report Templates</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestionTab("manual");
                        setShowAllSuggestions(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        suggestionTab === "manual"
                          ? "bg-primary text-on-primary shadow-xs"
                          : "text-secondary hover:text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">menu_book</span>
                      <span>App Guide &amp; Manual</span>
                    </button>
                  </div>
                  <span className="micro-label hidden sm:inline-block text-secondary">
                    {suggestionTab === "reports" ? "ANALYTICS & REPORTS" : "HOW-TO & TUTORIALS"}
                  </span>
                </div>

                {/* Rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 bg-outline-variant gap-[1px]">
                  {(showAllSuggestions
                    ? suggestionTab === "reports"
                      ? getSuggestions()
                      : getManualSuggestions()
                    : (suggestionTab === "reports" ? getSuggestions() : getManualSuggestions()).slice(0, 4)
                  ).map((suggestion) => (
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
                <span>
                  {showAllSuggestions
                    ? "Show fewer"
                    : suggestionTab === "reports"
                    ? "View all report templates"
                    : "View all guide topics"}
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  {showAllSuggestions ? "expand_less" : "expand_more"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-4 pt-4">
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
                );
              }
              if (msg.role === "user" && msg.parts[0]?.functionResponse) {
                return null; // hide raw function responses from UI
              }

              const isUser = msg.role === "user";
              const rawTextContent = msg.parts.map((p) => p.text).join("");
              const { metadata, cleanText } = isUser
                ? { metadata: null, cleanText: rawTextContent }
                : extractPdfMetadata(rawTextContent);

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
                  <span className="material-symbols-outlined text-[18px] animate-pulse">
                    smart_toy
                  </span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full bg-secondary animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></span>
                  <span
                    className="w-2 h-2 rounded-full bg-secondary animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></span>
                  <span
                    className="w-2 h-2 rounded-full bg-secondary animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ─── Input Area ─── */}
      <div className="flex-none p-4 md:p-6 bg-surface dark:bg-surface-container-lowest relative z-20">
        <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between text-xs text-secondary px-1">
          <div className="flex items-center gap-1.5 font-medium text-[11px] text-primary/80 dark:text-[#7f9cf8]">
            <span className="material-symbols-outlined text-[14px]">help_outline</span>
            <span>
              <strong>Tip:</strong> Ask for case trends, generate formal reports, or ask <em>"How do I...?"</em> for step-by-step app guides.
            </span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto relative flex items-center">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about case trends, generate reports, or ask how to use the app..."
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
                ? "bg-primary text-on-primary hover:bg-primary/90 cursor-pointer"
                : "bg-surface-container text-secondary cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isGenerating ? "hourglass_empty" : "arrow_upward"}
            </span>
          </button>
        </div>
      </div>

      {/* ─── Slide-Over History Drawer (Right Side) ─── */}
      <AiHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        sessions={sessions}
        activeSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAll={handleClearAllSessions}
      />

      {/* ─── Delete Active Conversation Confirmation Modal ─── */}
      {showDeleteActiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-surface dark:bg-surface-container border border-outline-variant rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/60 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">delete</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface m-0">Delete Conversation?</h3>
                <p className="text-[11px] text-secondary m-0 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-secondary leading-relaxed m-0">
              Are you sure you want to permanently delete this conversation and all its generated reports?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setShowDeleteActiveModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteActive}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
