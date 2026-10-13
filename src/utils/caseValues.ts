export function normalizeGrade(value?: string): string {
  const trimmed = (value || "").trim();
  const match = trimmed.match(/^(?:grade\s*)?(\d{1,2})$/i);
  return match && +match[1] >= 7 && +match[1] <= 12 ? `Grade ${+match[1]}` : trimmed;
}
export function caseDay(value?: string): string {
  const text = (value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return mdy ? `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}` : "";
}

export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
