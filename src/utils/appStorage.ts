/**
 * Browser-side caches that mirror database content. They must be cleared when the
 * database is reset or replaced so screens never show records that no longer exist.
 */
const LOCAL_KEYS = ["lc_pending_import_rows", "lc_pending_import_filename", "new_case_draft"];
const LOCAL_PREFIXES = ["case_proofs_"];
const SESSION_PREFIXES = ["case_catalog_", "filter_", "selected_school_year"];

function removeMatching(storage: Storage, keys: string[], prefixes: string[]) {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (keys.includes(key) || prefixes.some((prefix) => key.startsWith(prefix)))) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}

export function clearCachedCaseData() {
  try {
    removeMatching(localStorage, LOCAL_KEYS, LOCAL_PREFIXES);
    removeMatching(sessionStorage, [], SESSION_PREFIXES);
  } finally {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("cases:changed"));
    window.dispatchEvent(new Event("pending:changed"));
  }
}
