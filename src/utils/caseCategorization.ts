import { ImportRow } from "../types";

export const PRESET_CASE_TYPES: string[] = [
  "Bullying",
  "Tardiness",
  "Vaping",
  "Cutting Classes",
  "Physical fighting",
  "Cheating",
  "Academic Dishonesty",
  "Classroom disruption",
  "Defiance / non-compliance",
  "Insubordination",
  "Vandalism / property damage",
  "Theft & dishonesty",
  "Inappropriate language",
  "Dress Code Violation",
  "Unauthorized Phone Usage",
  "Loitering During Class Hours",
  "Gambling",
  "Substance use",
  "Substance possession",
  "Gang-related behaviour",
  "Assault on staff",
  "Weapons possession",
  "Threats & intimidation",
  "Sexual harassment",
  "Peer relationship issues",
  "Family problems",
  "Self-esteem & identity",
  "Adjustment difficulties",
  "Grief & loss",
  "Gender & sexuality",
  "Social media issues",
  "Self-harm & suicide risk",
  "Anxiety & depression",
  "Trauma & abuse",
  "Crisis intervention",
  "Poor academic performance",
  "Learning difficulties",
  "Study skills & habits",
  "Absenteeism / tardiness",
  "Course selection",
  "Dropout prevention",
  "Truancy / skipping",
  "Vandalism",
];

// Semantic keyword mapping dictionary for offline heuristic classification
const KEYWORD_MAPPINGS: { pattern: RegExp; category: string }[] = [
  // Vaping / E-Cigarette
  { pattern: /\b(vape|vaping|vaped|e-cig|e-cigarette|electronic cigarette|pod|juul|relx|smoke in cr|smoking in cr|smoking inside)\b/i, category: "Vaping" },
  
  // Bullying / Harassment
  { pattern: /\b(bully|bullied|bullying|cyberbully|cyberbullying|teasing|ridicul|intimidat|mocking)\b/i, category: "Bullying" },
  
  // Tardiness / Late
  { pattern: /\b(tardy|tardiness|late|latecomer|habitual late|arrived late|late for class|flag ceremony)\b/i, category: "Tardiness" },
  
  // Cutting classes / Skipping / Truancy
  { pattern: /\b(cutting|cutting class|cutting classes|skipped|skipping|skip class|truan|absenteeism|absent without leave)\b/i, category: "Cutting Classes" },
  
  // Cheating / Academic Dishonesty
  { pattern: /\b(cheat|cheated|cheating|plagiar|plagiarism|kodigo|copying|exam leak|test leak|academic dishonest|dishonesty in exam|cheating in)\b/i, category: "Cheating" },
  
  // Physical fighting / Altercation
  { pattern: /\b(fight|fought|fighting|brawl|brawling|punched|punching|physical altercation|slapped|kicked|scuffle|wrestling|hit classmate)\b/i, category: "Physical fighting" },
  
  // Vandalism / Property damage
  { pattern: /\b(vandal|vandalism|property damage|damage|damaging|defac|graffiti|breaking chair|broken window|destruction of school property|carved desk)\b/i, category: "Vandalism / property damage" },
  
  // Theft / Stealing
  { pattern: /\b(theft|steal|stealing|stole|stolen|robbery|shoplifting|took money|taking money|stole money|pocketed)\b/i, category: "Theft & dishonesty" },
  
  // Inappropriate language / Profanity
  { pattern: /\b(profanity|cursing|cursed|bad word|bad words|foul language|vulgar|swearing|inappropriate language|cursed at)\b/i, category: "Inappropriate language" },
  
  // Insubordination / Defiance / Disrespect
  { pattern: /\b(insubordinat|defian|disrespect|disrespectful|refused to obey|non-compliance|refusal|rude to teacher|talking back)\b/i, category: "Insubordination" },
  
  // Dress Code Violation
  { pattern: /\b(dress code|uniform|improper uniform|haircut|hair color|piercing|earring on male|no id|unauthorized attire|civilian clothes)\b/i, category: "Dress Code Violation" },
  
  // Unauthorized Phone Usage
  { pattern: /\b(phone|cellphone|cell phone|mobile phone|gadget|using phone|unauthorized phone|mobile games|playing games|playing on phone)\b/i, category: "Unauthorized Phone Usage" },
  
  // Loitering
  { pattern: /\b(loiter|loitering|corridor|hallway|roaming|roaming around|tambay|wandering)\b/i, category: "Loitering During Class Hours" },
  
  // Gambling
  { pattern: /\b(gambl|gambling|betting|playing cards for money|tong-its|pusoy|cara y cruz|dice)\b/i, category: "Gambling" },
  
  // Substance use / Alcohol / Drugs
  { pattern: /\b(alcohol|liquor|beer|drunk|drinking|drugs|marijuana|weed|shabu|substance|illegal drug)\b/i, category: "Substance use" },
  
  // Weapons
  { pattern: /\b(weapon|knife|blade|cutter|gun|brass knuckle|sharp object|pointed weapon)\b/i, category: "Weapons possession" },
  
  // Sexual harassment
  { pattern: /\b(sexual|harassment|catcalling|indecent|unwanted touch|molest|groping)\b/i, category: "Sexual harassment" },
  
  // Mental Health / Anxiety / Depression / Self-harm
  { pattern: /\b(suicid|self-harm|cutting wrist|depression|anxiety|panic attack|mental health|trauma|emotional breakdown)\b/i, category: "Anxiety & depression" },
  
  // Peer / Family
  { pattern: /\b(peer|friendship|conflict with friend|misunderstanding with friend|quarrel with friend)\b/i, category: "Peer relationship issues" },
  { pattern: /\b(family|parent|parents|home problem|domestic|broken family)\b/i, category: "Family problems" },
  
  // Academic Performance
  { pattern: /\b(poor academic|failing grade|failed|low score|academic difficulty|learning difficulty|study habits|struggling in class)\b/i, category: "Poor academic performance" },
];

/**
 * Normalizes and categorizes a case string using exact matching,
 * preset canonical matching, and semantic heuristic rules.
 */
export function smartCategorizeCase(caseStr: string, description?: string): string {
  const trimmed = (caseStr || "").trim();
  const descTrimmed = (description || "").trim();
  
  if (!trimmed && !descTrimmed) return "Others";

  const lowerCase = trimmed.toLowerCase();

  // 1. Direct exact or lowercase match with presets
  for (const preset of PRESET_CASE_TYPES) {
    if (preset.toLowerCase() === lowerCase) {
      return preset;
    }
  }

  // 2. Direct match with slash split
  for (const preset of PRESET_CASE_TYPES) {
    const parts = preset.toLowerCase().split("/").map((p) => p.trim());
    if (parts.includes(lowerCase)) {
      return preset;
    }
  }

  // 3. Keyword/regex mapping against case string
  const combinedText = `${trimmed} ${descTrimmed}`;
  for (const mapping of KEYWORD_MAPPINGS) {
    if (mapping.pattern.test(lowerCase) || mapping.pattern.test(combinedText)) {
      return mapping.category;
    }
  }

  // 4. Substring fallback match
  for (const preset of PRESET_CASE_TYPES) {
    if (lowerCase.includes(preset.toLowerCase()) || preset.toLowerCase().includes(lowerCase)) {
      return preset;
    }
  }

  return trimmed || "Others";
}

/**
 * Uses Gemini AI with fallback to heuristic mapping to categorize a single case.
 */
export async function categorizeCaseWithAi(
  caseStr: string,
  description: string = "",
  apiKey?: string
): Promise<string> {
  const fallback = smartCategorizeCase(caseStr, description);
  
  if (!apiKey || !apiKey.trim()) {
    return fallback;
  }

  try {
    const prompt = `You are an expert school guidance counselor. Classify the following student incident into EXACTLY ONE category from this allowed list:
${JSON.stringify(PRESET_CASE_TYPES, null, 2)}

Case Info:
- Raw Case Title/Type: "${caseStr}"
- Description/Notes: "${description}"

RULES:
1. Output ONLY the exact category name from the allowed list.
2. If none fit closely, output "Others".
3. Do not include quotes, markdown, or extra commentary.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey.trim()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 50,
          },
        }),
      }
    );

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (candidateText) {
      const cleaned = candidateText.replace(/^["'`]|["'`]$/g, "").trim();
      const matched = PRESET_CASE_TYPES.find(
        (p) => p.toLowerCase() === cleaned.toLowerCase()
      );
      if (matched) return matched;
    }

    return fallback;
  } catch (err) {
    console.warn("[AI Categorization Exception, using heuristic fallback]", err);
    return fallback;
  }
}

/**
 * Batch categorizes import rows using AI (in batches to minimize API latency and respect rate limits),
 * with instant fallback to smart heuristics.
 */
export async function batchCategorizeRowsWithAi(
  rows: ImportRow[],
  apiKey?: string,
  onProgress?: (progressPercent: number) => void
): Promise<{ updatedRows: ImportRow[]; modifiedCount: number }> {
  if (!rows || rows.length === 0) {
    return { updatedRows: [], modifiedCount: 0 };
  }

  let modifiedCount = 0;

  // If no Gemini key is available, use high-accuracy offline heuristic categorization
  if (!apiKey || !apiKey.trim()) {
    const updatedRows = rows.map((row, idx) => {
      const newCategory = smartCategorizeCase(row.case, row.description);
      if (newCategory && newCategory !== row.case) {
        modifiedCount++;
        return { ...row, case: newCategory };
      }
      if (onProgress) onProgress(Math.round(((idx + 1) / rows.length) * 100));
      return row;
    });
    return { updatedRows, modifiedCount };
  }

  // With API key, process in chunks of 10 rows
  const CHUNK_SIZE = 10;
  const updatedRows: ImportRow[] = [...rows];

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    
    try {
      const chunkPrompt = `You are a school guidance counseling classifier. Classify each numbered student incident into EXACTLY ONE valid category from this list:
${JSON.stringify(PRESET_CASE_TYPES)}

Incidents to classify:
${chunk.map((r, idx) => `${idx + 1}. Case: "${r.case}" | Notes: "${r.description || ""}"`).join("\n")}

Respond ONLY with a JSON array of category strings matching each item in order.
Example format:
["Vaping", "Bullying", "Tardiness"]`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: chunkPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        let parsedCategories: string[] = [];
        try {
          parsedCategories = JSON.parse(jsonText);
        } catch {
          parsedCategories = [];
        }

        chunk.forEach((row, chunkIdx) => {
          const globalIdx = i + chunkIdx;
          const aiCategory = parsedCategories[chunkIdx];
          const matched = aiCategory ? PRESET_CASE_TYPES.find(p => p.toLowerCase() === aiCategory.toLowerCase()) : null;
          const finalCategory = matched || smartCategorizeCase(row.case, row.description);

          if (finalCategory && finalCategory !== row.case) {
            modifiedCount++;
            updatedRows[globalIdx] = { ...row, case: finalCategory };
          }
        });
      } else {
        // Fallback for this chunk
        chunk.forEach((row, chunkIdx) => {
          const globalIdx = i + chunkIdx;
          const fallback = smartCategorizeCase(row.case, row.description);
          if (fallback && fallback !== row.case) {
            modifiedCount++;
            updatedRows[globalIdx] = { ...row, case: fallback };
          }
        });
      }
    } catch {
      // Chunk exception fallback
      chunk.forEach((row, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        const fallback = smartCategorizeCase(row.case, row.description);
        if (fallback && fallback !== row.case) {
          modifiedCount++;
          updatedRows[globalIdx] = { ...row, case: fallback };
        }
      });
    }

    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + chunk.length) / rows.length) * 100)));
    }
  }

  return { updatedRows, modifiedCount };
}

export interface DomainInfo {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const CASE_DOMAINS: DomainInfo[] = [
  {
    id: "academic",
    label: "Academic",
    color: "#185FA5",
    bg: "#E6F1FB",
    border: "#B5D4F4",
  },
  {
    id: "behavioural",
    label: "Behavioural",
    color: "#854F0B",
    bg: "#FAEEDA",
    border: "#FAC775",
  },
  {
    id: "personal",
    label: "Personal & Social",
    color: "#0F6E56",
    bg: "#E1F5EE",
    border: "#9FE1CB",
  },
  {
    id: "crisis",
    label: "Crisis, Violence & Health",
    color: "#A32D2D",
    bg: "#FCEBEB",
    border: "#F7C1C1",
  },
  {
    id: "other",
    label: "Other Offenses",
    color: "#475569",
    bg: "#F1F5F9",
    border: "#CBD5E1",
  },
];

export function getCategoryDomain(category: string): DomainInfo {
  const cat = (category || "").toLowerCase();

  if (
    cat.includes("academic") ||
    cat.includes("learning") ||
    cat.includes("study") ||
    cat.includes("course") ||
    cat.includes("dropout") ||
    cat.includes("cheat") ||
    cat.includes("plagiar")
  ) {
    return CASE_DOMAINS[0]; // Academic
  }

  if (
    cat.includes("bully") ||
    cat.includes("defian") ||
    cat.includes("disrupt") ||
    cat.includes("truan") ||
    cat.includes("cut") ||
    cat.includes("vandal") ||
    cat.includes("theft") ||
    cat.includes("dishonest") ||
    cat.includes("language") ||
    cat.includes("gang") ||
    cat.includes("insubordinat") ||
    cat.includes("dress code") ||
    cat.includes("uniform") ||
    cat.includes("phone") ||
    cat.includes("loiter") ||
    cat.includes("gambl") ||
    cat.includes("tardy") ||
    cat.includes("late")
  ) {
    return CASE_DOMAINS[1]; // Behavioural
  }

  if (
    cat.includes("peer") ||
    cat.includes("family") ||
    cat.includes("self-esteem") ||
    cat.includes("adjust") ||
    cat.includes("grief") ||
    cat.includes("gender") ||
    cat.includes("social media")
  ) {
    return CASE_DOMAINS[2]; // Personal
  }

  if (
    cat.includes("fight") ||
    cat.includes("assault") ||
    cat.includes("weapon") ||
    cat.includes("threat") ||
    cat.includes("self-harm") ||
    cat.includes("suicid") ||
    cat.includes("sexual") ||
    cat.includes("anxiety") ||
    cat.includes("depress") ||
    cat.includes("trauma") ||
    cat.includes("crisis") ||
    cat.includes("vape") ||
    cat.includes("vaping") ||
    cat.includes("substance") ||
    cat.includes("drug") ||
    cat.includes("alcohol")
  ) {
    return CASE_DOMAINS[3]; // Crisis
  }

  return CASE_DOMAINS[4]; // Other
}

