# Native fresh-state walkthrough

October 13, 2026. Application 0.1.10, commit `18e2692`.

Status: **hands-on audit completed for the available isolated macOS environment; release verdict remains HOLD.** The walkthrough reached import, filing, attachments, editing, pending transitions, reports, exports, backup, valid restore, sign-out and full quit/relaunch through actual native Tauri commands. Several data-integrity and reporting failures were reproduced. Windows and live-service acceptance remain incomplete.

## Environment

- Native macOS Tauri application, built from an isolated copy of the current Rust source, using the actual React frontend at localhost:1420.
- Source comparison confirmed no application-code changes. Only application identifier/window title changed to isolate storage and distinguish the test window; bundling was disabled while constructing the disposable local `.app` wrapper.
- Application: `/tmp/lc-guidance-native-audit-cJ0ELO/Guidance Audit.app`.
- Database: `/tmp/lc-guidance-native-audit-cJ0ELO/src-tauri/db/guidance.db`.
- App storage: `/Users/harleyalcos/Library/Application Support/local.guidance.audit.cj0elo`.
- Native computer use: `mcp__cua_repl`, app binding `app`.
- No mocked IPC/backend. No institutional credentials or live email used. No changes to the original database; its SHA-256 was checked unchanged.

## Verified workflows and failures

| Workflow | Actual native result |
| --- | --- |
| Fresh launch and empty state | Build and launch passed. Zero cases/configuration keys, SQLite integrity `ok`. Setup fields and button visible at 1366×768. Empty submission displayed “Create a 6-digit login PIN.” |
| Sign-in | Incorrect PIN rejected; synthetic existing PIN accepted. Empty Dashboard and Catalog rendered. |
| Clean Excel import | Selected `01` through the native chooser; 3 ready, 0 issues, 0 duplicates. Commit saved all 3. [clean-import.json](clean-import.json) |
| Cross-file duplicates / independent incidents | Selected the two-row `02` workbook and its identical `05` copy together. Review incorrectly marked 4 ready, 0 duplicates; commit inserted all 4 and grouped unrelated same-day incidents. R05/R06. [duplicate-and-group-import.json](duplicate-and-group-import.json) |
| Invalid-row validation and correction | `03` produced 3 issues, 0 ready; import disabled. Corrected Frank's February 30 to February 28; Save & Validate produced 1 ready, 2 issues. Import Ready saved Frank; the other two remained staged through restart. [corrected-import.json](corrected-import.json) |
| Manual single-case filing | Required case-type validation blocked an incomplete step. Entered Bullying, synthetic student/adviser/sanction/narrative, attached a PNG, reviewed and saved. Actual database reached 9 cases, with one attachment. [manual-case-with-proof.json](manual-case-with-proof.json) |
| Details and editing | Saved an edited narrative. Attachment remained present. Creation history displayed an invalid double timestamp; edit history timestamp was valid. R17. |
| Pending → resolved / closed | Both confirmation flows updated progress and removed the record from the queue. Resolving the manually filed case left history at 2 entries, with no status-change entry. R18. [pending-resolution.json](pending-resolution.json) |
| Group participants and editing | Imported group view displayed sanction `—` although individual records held `Warning`. Added one shared Complainant / Subject. Edit showed the participant twice; saving without changes persisted two copies in each respondent record. R08/R26. [group-after-edit.json](group-after-edit.json) |
| Pending role display | Title called the two Complainant / Subject rows “other respondents” while its table correctly labelled their roles. R28. [11-pending-roles.ax.txt](11-pending-roles.ax.txt) |
| Report preview and PDF save | Generated and saved a valid one-page A4 landscape PDF. Render inspected: layout legible, 9 records visible. Totals show 9 total, 7 pending, 2 resolved, 1 reprimand; period begins August 14 although earliest record is August 15. R13/R14. [native-summary.pdf](native-summary.pdf), [native-summary-preview.png](native-summary-preview.png) |
| Grade-specific reporting | Grade 7 scope listed Harper, Frank and Alice (3), omitting imported Ben (`level = 7`), despite the all-records table displaying him as Grade 7. There are 4 equivalent Grade 7 records. R12. [09-grade7-report.ax.txt](09-grade7-report.ax.txt) |
| Default Excel export | Saved actual workbook with 9 records and eight headers on row 8. Modal closed normally after exit animation. R23 withdrawn; R16 remains. [native-workbook-inspection.json](native-workbook-inspection.json) |
| ZIP export with proofs/history | Saved ZIP containing workbook, the case-9 PNG and nine history files. Archive listing inspected. Direct checkbox click failed to toggle; clicking surrounding title worked. Section missing from chooser. R27. [native-archive-inspection.json](native-archive-inspection.json) |
| Manual backup | Backup Now produced snapshot.db (integrity `ok`, 9 cases) and CSV (9 records, 21 headers). [native-backup-inspection.json](native-backup-inspection.json) |
| Valid restore | Closed Cara after backup; restored the valid baseline through confirmation UI. App reloaded to login. After sign-in, 9 cases, Cara Pending again, and case-9 attachment retained. [before-valid-restore.json](before-valid-restore.json), [after-valid-restore.json](after-valid-restore.json) |
| Guidance AI without a key | Displayed “Gemini API Key is not configured. Please add it in Account Settings.” No external service request made. Error feedback passed; real service unverified. |
| Sign-out and full quit/relaunch | Sign-out confirmation returned to login. Full quit/relaunch required PIN, then Dashboard showed 9 records. SQLite integrity `ok`; attachment, edits and statuses persisted. Original database checksum unchanged. [full-restart.json](full-restart.json), [10-restart-dashboard.png](10-restart-dashboard.png) |

## Reconciliations and evidence limits

- The Mac locked twice during the walkthrough; the user unlocked it and testing resumed. These were host/tool interruptions, not app defects.
- Synthetic PIN-only setup was seeded offline while the app was closed using its real Argon2 hashing function. Live first-time SMTP setup, recovery delivery, credential changes and OTP interactions are **not passed** by this fixture.
- R23 was a timing false positive in the earlier browser assertion. Native Excel save and modal closure passed. The report explicitly withdraws it; original browser evidence is retained as historical observation.
- One long narrative was saved before native typing had fully settled. The shorter stored text is not reported as an app truncation bug.
- Print was invoked, but no operating-system print dialog was observed. Physical output and print-flow completion remain inconclusive, not a passed check or a confirmed Windows defect.
- The attempted native date-field keyboard input did not establish a changed filter. R15 remains supported by earlier browser reproduction and source, not a claimed native date-range reproduction.
- New multi-respondent filing failure/retry was covered by the earlier frontend fault-injection check, not a new native fault injection. Native group coverage used actual imported groups and participant editing.
- Corrupt restore, database migration replacement and reset were reviewed/tested in isolated backend evidence; no destructive native replacement/reset was run. A valid restore does not negate R01's failure-path risk.
- This is a macOS **debug** app with real native IPC and isolated SQLite, not a Windows installer or native release build. Automatic release backups, WebView2, institutional SMTP, live Gemini access, physical printing, signed updates, offline first-run fonts, full-size office datasets and Windows display scaling still require acceptance testing.
- The office's actual Excel workbook was not available. Fixture success cannot certify its layout or migration counts.

Use `python3 docs/audits/2026-10-13/native/checkpoint.py <label>` for read-only snapshots of the isolated data. It excludes credential values and refuses the production database. The isolated app was left at its test Catalog for review; application source and the original database were not changed.
