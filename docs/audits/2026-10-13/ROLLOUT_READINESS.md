> Historical baseline at commit `18e2692`. Current fixes and validation are recorded in [the 2026-10-14 verification](../2026-10-14/FIX_VERIFICATION.md).

# Guidance Office rollout readiness audit

**Verdict: HOLD the installation for operational use.** The application builds, but confirmed failures affect migration accuracy, case integrity, recovery, and reporting. Fix the blockers and complete Windows acceptance testing before loading school records.

Date: October 13, 2026 (Asia/Manila). Version: 0.1.10. Commit: `18e2692`. Intended deployment: fresh Windows installation followed by migration from the office's existing Excel files. The checkout was clean at the start. This audit adds evidence and diagnostic harnesses only; application behavior and production dependencies were not changed.

## What was actually verified

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript and frontend production build, `npm run build` | PASS; one 4.29 MB JavaScript bundle warning | Executed successfully; 526 modules transformed |
| Existing Rust suite, `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 7 passed | [existing-tests.txt](existing-tests.txt) |
| Rust release configuration, `cargo check --release --locked --manifest-path src-tauri/Cargo.toml` | PASS on macOS; Windows installer not tested | [release-check.txt](release-check.txt) |
| New isolated backend expectations | 4 passed, **11 failed** | [backend-checks.txt](backend-checks.txt), [harness/src/lib.rs](harness/src/lib.rs) |
| Reporting expectations in Asia/Manila | 1 passed, **3 failed** | [report-checks.json](report-checks.json), [report-checks.mjs](report-checks.mjs) |
| Browser navigation, accessibility and workflow checks | Ten main views rendered without uncaught JS errors; several workflow failures reproduced | [ui-results.json](ui-results.json), [ui-checks.mjs](ui-checks.mjs) |
| Actual frontend Excel generation | Workbook produced and read successfully; importer rejects it | [export-workbook-inspection.json](export-workbook-inspection.json) |
| Actual frontend PDF generation | A4 landscape PDF produced and rendered; sample layout legible, contents contain incorrect period and overlapping totals | [report-preview.png](report-preview.png), [generated-report-text.txt](generated-report-text.txt) |
| Native fresh-state walkthrough with actual IPC/SQLite | Sign-in, clean import/correction, single-case filing/attachment/edit, status changes, PDF/Excel/ZIP save, manual backup, valid restore, sign-out and full restart exercised; multiple integrity/reporting bugs reproduced | [NATIVE_WALKTHROUGH.md](native/NATIVE_WALKTHROUGH.md) |
| Native restart and data isolation | Nine test cases and attachment persisted; integrity `ok`; original database checksum unchanged | [full-restart.json](native/full-restart.json), [10-restart-dashboard.png](native/10-restart-dashboard.png) |
| Dependency vulnerability scan | Full graph: 20 affected packages (12 high, 7 moderate, 1 low). Production graph: 6 (2 high, 4 moderate) | [npm-full-audit.json](npm-full-audit.json), [npm-production-audit.json](npm-production-audit.json) |

**Evidence limits:** Backend tests call real application commands/repository methods against synthetic in-memory SQLite databases. Tauri's mock runtime only supplies command state; backend behavior is not mocked. Browser checks run the actual frontend with synthetic backend fixtures and mocked IPC, dialogs and save destinations. They verify frontend behavior and generated file bytes, **not** real Windows WebView2, native dialogs, filesystem persistence, SMTP, AI services, or the installer. The PDF/Excel evidence contains synthetic students only. Failed expectations remain intentionally red; this is an audit, not a remediation release.

The subsequent native macOS debug walkthrough uses actual Tauri IPC, file dialogs, saved artifacts and an isolated database starting at zero cases. It confirms persistence and a valid restore, but cannot certify Windows installation or live email/AI/printer/update services. First-time SMTP setup was not completed: a synthetic existing PIN-only account was seeded offline to exercise case workflows. R23 is withdrawn after native testing; there are 27 remaining findings (17 P1, 10 P2), with reproduction level stated per item.

## Workflow coverage

| Office workflow | Coverage and readiness |
| --- | --- |
| First launch → PIN and email setup → sign in | Native fresh/empty state and required-field validation passed; incorrect and correct PIN paths passed using a seeded synthetic account. Setup overwrite protection fails. Live setup/SMTP unverified. |
| Forgot PIN / recovery email / changing PIN | Authorization inspected and expired verified OTP reproduced. Recovery UI lacks a resend/back path after entering verification. |
| Existing Excel → parse → review/edit → import | Native clean import, invalid-row blocking, correction and partial-ready import passed. Native commit confirmed false grouping and duplicate insertion; numeric grade reporting fails. Office workbook not supplied. |
| File single case → four steps → review → save | Native required-field validation, single-case save with PNG, narrative edit and restart persistence passed. Manual timestamps break academic-year derivation and creation history. |
| File multiple respondents → linked group | Second-save failure injected into real frontend flow: first record remains saved. Group creation needs one transaction. |
| Catalog → search/status/date filters → case detail → edit | Views/rendering inspected; backend date/year changes tested. Academic-year membership and edited year metadata fail. |
| Group details → edit participants/status/shared details | Native participant add/save confirmed complainants multiply in actual stored records. Imported group sanctions are missing in the view. |
| Pending queue → resolved/closed | Native confirmation/status changes passed, but real history remained unchanged. Pending titles misidentify complainants as respondents. |
| Dashboard → counts/trends → distribution | Views exercised. Status totals overlap and resolution chart excludes reprimand cases. |
| Reports → scope/status/date options → PDF preview/export/print | Native PDF saved/rendered and grade-specific scope exercised. Period, grade scope and totals fail. Print invoked without observed OS dialog; physical printing unverified. |
| Catalog → Excel/ZIP export | Native workbook/ZIP saved and inspected, attachment/history included. Successful dialog closure passed (R23 withdrawn). End-date filtering/re-import fail; direct checkbox interaction fails. |
| Settings → backup → restore/migrate/reset | Native manual backup and valid restore passed, with intact record count/attachment. Failure-path restore safety and policy/reset defects remain. No destructive operations against live data. |
| Guidance AI → queries/report/history | Native missing-key feedback passed. External API functionality untested. Confidential AI history survives reset in backend test. |
| Sign out → sign in / restart | Native sign-out and full quit/relaunch passed; persisted records and attachment verified. Backend session/revocation boundary remains absent. |
| Application updater | Code/config reviewed; actual signed Windows update/relaunch untested. |

## Findings

P1 = fix before operational rollout. P2 = resolve before acceptance sign-off or document an explicit operational constraint. P3 = lower-impact polish. “Source” findings are verified from the current code but have not been reproduced through native Windows execution.

### R01 — P1: Database replacement can destroy the current database before validating the replacement

Source: `src-tauri/src/commands/mod.rs:644` and `:739` (`restore_backup`, `import_db_file`).

Both commands replace the live connection with an empty in-memory connection, copy the selected file over the active database, and only then open it and run migrations. A corrupt/non-SQLite file replaces the working data before validation fails. A copy failure leaves the running app pointed at the empty connection. There is no preserved pre-replacement snapshot or rollback. An unrelated but valid SQLite file can also be initialized as an empty guidance database.

Validate integrity, expected schema and migrations in a staging file first; make a recoverable snapshot; swap atomically; retain the existing connection/database on every failure. Test corrupt files, unrelated SQLite files, failed copies, and successful restore on Windows. **Evidence: source; no destructive native execution.**

### R02 — P1: First-launch setup can overwrite an already configured account

Source: `src-tauri/src/commands/mod.rs:60`.

`complete_setup` never checks `is_setup_complete` and requires no existing PIN or OTP. Calling it a second time replaces the PIN hash, SMTP credentials and recovery email. The isolated test successfully overwrote a configured synthetic account. Restrict setup to the uninitialized state and save it transactionally. This is a local IPC/WebView authorization flaw, not a demonstrated remote attack.

### R03 — P1: Sign-in protects the interface but not the backend

Source: `src/App.tsx:73`, `src-tauri/src/commands/mod.rs:93`, `:369`, and `src-tauri/src/main.rs:30`.

Authentication is React state. `verify_pin` returns a boolean and does not establish a backend session. Case reads/writes, AI history, and several maintenance commands have no backend login requirement. An isolated app state returned case records before any PIN verification. Sign-out reloads the UI but cannot revoke backend authorization because no session exists. Establish and enforce a backend session for protected operations; keep only narrowly scoped setup/recovery operations available before login.

### R04 — P1: A previously verified OTP can authorize actions after expiry and across sign-out

Source: `src-tauri/src/commands/mod.rs:244`, `:302`, `:346`.

Mutation authorization checks whether a token has `used = 1`; it does not check its expiry or tie authorization to the current session. An expired, verified synthetic recovery token allowed a new recovery email to be saved. PIN reset uses the same lifetime mistake. SMTP authorization also accepts PIN-change tokens and does not consume them. Use short-lived, purpose-specific, single-use grants and revoke them at sign-out.

### R05 — P1: Independent Excel incidents are silently linked into one group

Source: `src-tauri/src/commands/import.rs:210`. Native evidence: [duplicate-and-group-import.json](native/duplicate-and-group-import.json).

Two adjacent, fully populated rows with the same date and case type receive one generated group ID. A synthetic workbook with two independent tardiness records reproduced this. Real office sheets commonly contain several incidents of the same type on one day. Group editing can then propagate changes across unrelated students. Require an explicit group identifier, merged-cell evidence, or a review decision; date and type alone cannot establish incident identity.

### R06 — P1: Duplicates across selected files reach the import commit and are not rejected there

Source: `src/components/ImportExcelModal.tsx:128`, `src/pages/ImportReview.tsx:482`, `src-tauri/src/commands/import.rs:498`.

Each file is checked independently, then rows are concatenated without rechecking duplicates across files. Selecting the same 20-row sample twice produced a frontend commit of **40 rows for 20 unique names**. The native follow-up selected two identical two-row files: review showed 4 ready and 0 duplicates, and the actual SQLite commit inserted both Dana and Evan twice. Revalidation sets `is_duplicate`, but the backend loop only skips `has_errors`. Add cross-file/session duplicate detection and enforce the duplicate policy inside the transaction. **Actual native reproduction:** [review screenshot](native/05-duplicates-marked-ready.png), [stored records](native/duplicate-and-group-import.json).

### R07 — P1: Group creation and updates can partially save, then duplicate data on retry

Source: `src/components/FileNewCaseModal.tsx:623`, `src/pages/CaseDetails.tsx:828`, `src/pages/GroupCaseDetails.tsx:392`.

The frontend sends independent commands per respondent/sibling. Injecting a failure on the second group save left the first synthetic record created while the UI reported failure. Retrying sends the first record again. Adding a respondent can update the original group link before the new record is successfully created. Move group creation/editing into backend transactions, with an idempotent retry boundary. **Real frontend failure path reproduced with mocked persistence; individual real repository commands are independently committed.**

### R08 — P1: Group edits duplicate shared complainants in every saved record

Source: `src/pages/GroupCaseDetails.tsx:207`, `:376`, `:420`.

Edit rows are populated from every record, each already containing the shared complainant. Saving gathers all of these entries and attaches them to every respondent without deduplication. Two linked records containing one shared complainant produced update payloads with **two complainants per record**. Further edits can multiply them again. Model shared participants once and deduplicate by a stable identity.

The native follow-up added Jamie as one shared Complainant / Subject, then saved the group edit without changes. Actual SQLite records 6 and 7 each changed from one Jamie entry to two. See [before edit](native/group-shared-participant-added.json) and [after edit](native/group-after-edit.json).

### R09 — P1: Manual incident timestamps produce the wrong academic year

Source: `src/components/FileNewCaseModal.tsx:162`, `src-tauri/src/db/repository.rs:300`.

The form sends local timestamps such as `2025-03-10T08:30`. Academic-year derivation accepts only date-only strings, then falls back to the first four digits, returning `2025-2026` instead of `2024-2025`. The expected July cutoff works for date-only imported records, but not this manual path. Parse all supported date/time formats before deriving the year. July is the current code's convention; confirm it with the school before treating it as a domain requirement.

### R10 — P1: Academic-year filters include cases from a different academic year

Source: `src-tauri/src/db/repository.rs:49`.

Filtering AY `2025-2026` includes a March 2025 case whose stored school year is `2024-2025`, because the query accepts any date starting `2025`. Calendar-year and academic-year filters are mixed in one OR expression. Reproduced through the real repository. Match normalized academic-year membership exactly; support calendar years as a separate explicit filter mode if required.

### R11 — P1: Changing an incident date leaves its school-year metadata stale

Source: `src-tauri/src/db/repository.rs:188`.

The update statement changes the date but never updates `school_year`. Moving a synthetic case from August 2024 to August 2026 left it assigned to `2024-2025`. Define the distinction between a derived year and an intentional override, then update consistently.

### R12 — P1: Numeric grades from Excel disappear under grade-specific filters

Source: `src-tauri/src/models.rs:279`, `src/reports/utils/reportCalculations.ts:171`, `src/components/ExportExcelModal.tsx:162`.

Import validation accepts and stores `7`; manual entry stores `Grade 7`; filtering requires an exact string match. A valid imported `7` record returned zero rows for a Grade 7 report. Normalize numeric and named grades at import/storage boundaries, keeping display formatting separate. The report table formatting fix does not fix filtering.

Native confirmation: Grade 7 scope returned only Harper, Frank and Alice (3), omitting Ben even though the all-records report displays him as Grade 7. There are 4 equivalent Grade 7 records. See [grade report](native/09-grade7-report.ax.txt) and [stored grades](native/full-restart.json).

### R13 — P1: Status totals overlap and the dashboard chart omits reprimand cases

Source: `src/utils/caseStatus.ts:14`, `src/reports/utils/reportCalculations.ts:217`, `src/pages/Dashboard.tsx:60`.

A resolved case with a Written Reprimand sanction counts as both Resolved and Reprimand. One record produced total 1 with category sum 2. The actual generated six-record report has category sum 7. The dashboard resolution chart contains only Pending/Resolved/Closed, excluding cases whose progress is Reprimand. If reprimand is intended as a separate sanction metric, label it explicitly and do not present it as an exclusive status distribution; otherwise make the statuses exclusive throughout catalog, reports and exports.

Native PDF confirmation: 9 total, 7 pending, 2 resolved, 1 reprimand, 0 closed (category sum 10). See [native PDF](native/native-summary.pdf).

### R14 — P1: Automatic report periods shift back one day in the school's timezone

Source: `src/reports/utils/reportCalculations.ts:69`.

Case dates are parsed as local midnight, then converted to UTC with `toISOString()`. In Asia/Manila, an October 13 case produces reporting period **October 12**. The generated PDF title/period and filename reproduce this even though every table row is dated October 13. Format date-only values without UTC conversion; calculate the period from the intended filtered dataset.

The native nine-record PDF starts its reporting period August 14, 2024 while its earliest case is August 15. See [rendered PDF](native/native-summary-preview.png).

### R15 — P1: Excel end-date filtering excludes manual cases on the selected final day

Source: `src/components/ExportExcelModal.tsx:175`, `src/pages/CaseCatalog.tsx:934`, `src/pages/CaseDistribution.tsx:138`.

Raw strings such as `2026-10-13T17:15` compare greater than end date `2026-10-13`. A browser check with one same-day timed incident and start/end set to October 13 disabled export with “No cases match.” Date-only imports and timed manual cases are therefore treated differently. Normalize day comparisons or use inclusive local end-of-day boundaries consistently. Distribution uses the same raw-string pattern.

### R16 — P2: The app rejects its own default Excel export

Source: `src/pages/CaseCatalog.tsx:1109`, `src-tauri/src/commands/import.rs:78`.

Actual export headers are on row 8 after branding and filter metadata. The importer requires the exact eight headers on the first row. Feeding the actual exported workbook into the real parser failed. Provide a distinct import-compatible export or detect/map headers. Default exports also flatten participant roles; even after removing the decorative header, they are not a lossless substitute for a database backup.

### R17 — P2: Manually created cases have invalid creation-history timestamps

Source: `src-tauri/src/db/repository.rs:136`.

The repository appends `T00:00:00.000Z` to `date_filed`, which the frontend already sends as a full ISO timestamp. The resulting double timestamp is invalid. Reproduced with the real insert path. Use the original valid timestamp or a generated UTC instant. Verify creation history rendering, ordering and export.

Native filing stored `2026-10-13T11:05:47.357ZT00:00:00.000Z` and displayed it as raw text in history. See [case detail](native/06-case-details-invalid-history.png).

### R18 — P2: Resolving/closing a case from the pending queue omits the audit entry

Source: `src/pages/PendingCases.tsx:278`, `src-tauri/src/db/repository.rs:219`.

The pending-page update command does not provide `updateLog`, so the repository preserves the previous history even though progress changed. Other detail-page updates do provide logs. Native resolution of case 9 changed Pending to Resolved, removed it from the queue, and retained exactly its two previous history entries. Record status transitions centrally in the backend so every entry point has a consistent audit trail. **Evidence: source and [native persistence](native/pending-resolution.json).**

### R19 — P1: Backup controls do not govern the actual backup policy

Source: `src/pages/Backup.tsx:32`, `src-tauri/src/main.rs:18`, `src-tauri/src/db/backup.rs:51`, `src-tauri/src/commands/mod.rs:612`.

The UI saves enable/frequency/retention to browser storage. Release startup unconditionally runs a once-per-day backup; Weekly/Monthly and disabling the setting do not govern it. Retention is only applied by `create_backup`, with a hardcoded 30 automatic backups, while the startup/pre-import helper does not prune. “On New Record” only covers the new-case modal, not all case-producing paths. A pre-import backup can be skipped because a same-day backup exists; its failures are ignored. Use one backend-owned policy and distinguish mandatory safety snapshots from scheduled backups. **Evidence: source; release branch compiles, scheduling was not exercised with a native release.**

### R20 — P1: Reset leaves confidential AI case history intact

Source: `src-tauri/src/commands/mod.rs:775`.

Reset deletes cases and OTP tokens but retains AI sessions/messages/generated reports, which can contain student details. Reproduced against a synthetic AI session. Define reset scope clearly, delete confidential derived data transactionally, and state how existing backups are handled. This matters when reseeding a pilot database or handing the computer to another operator.

### R21 — P2: Database failures give misleading or developer-oriented feedback

Source: `src/pages/CaseCatalog.tsx:1535`, `src/pages/Dashboard.tsx:163`, `src/pages/SummaryReports.tsx:98`.

The catalog shows “Backend unavailable. Open with npm run tauri -- dev to load cases.” for any load failure, including inside an installed application, while its counters become zero. Dashboard/reports log failures without a visible error and can show empty/stale results. The catalog message was reproduced by injecting a read error. Provide a staff-facing error, retry action and safe recovery guidance; do not treat a failed query as a valid zero-case report.

### R22 — P2: Setup and account recovery do not provide a complete staff workflow

Source: `src/pages/SignIn.tsx:108`, `:292`, `:334`, `src/pages/AccountSettings.tsx`.

First launch requires live Gmail SMTP success, but labels the credential simply “Password” without explaining the App Password expected by the backend. The test message goes to the sender, so successful setup does not verify that the recovery address actually receives mail. Once reset enters its code-verification step there is no resend/back button; an expired code or five invalid guesses requires restarting/reloading to request another. There is an `update_smtp_config` backend command but no staff UI calling it, so changing expired SMTP credentials is not available through settings. Complete these paths and document the initial Gmail setup. **Evidence: source and setup UI inspection; live delivery untested.**

### R23 — WITHDRAWN: Excel export dialog closure was observed too early

Source: `src/components/ExportExcelModal.tsx:283`, `:handleClose`.

The initial browser check observed the dialog immediately after the save call, before its exit animation completed. In the actual native app the workbook saves and the dialog closes normally. The earlier closure-state explanation was incorrect: the executing handler retains the pre-export render's closure. This is not a confirmed application bug. Future browser assertions must await the dialog's disappearance instead of sampling during its exit animation.

### R24 — P2: Keyboard and accessible-control behavior needs completion

Source: `src/components/FileNewCaseModal.tsx:687`, `src/pages/Backup.tsx:342`, `:366`, `:385`, `src/pages/AccountSettings.tsx`; detailed targets in `ui-results.json`.

Pressing Escape did not close the new-case dialog. Most custom dialogs lack dialog semantics, focus containment and focus return, unlike the updater dialog. New-case/sign-in visual labels often are not connected with `htmlFor`/`id`. Axe reported unnamed backup toggle/frequency/retention controls and an unlabeled security input, plus insufficient contrast in pending/detail/group status text. These reduce usability for keyboard users and staff with reduced vision. Also test Windows scaling and small displays: at 1024×600, Complete Setup is below the first viewport (the document does scroll; this is not proof of an unreachable button).

Native desktop follow-up: see [NATIVE_WALKTHROUGH.md](native/NATIVE_WALKTHROUGH.md). Actual Tauri/SQLite execution confirmed additional migration, participant and reporting failures while passing several core workflows. This follow-up uses a separate zero-record macOS test database and real IPC. Windows sign-off is still required.

### R25 — P2: Import instructions show a spreadsheet layout the importer rejects

Source: `src/components/ImportExcelModal.tsx` (sheet structure preview), `src-tauri/src/commands/import.rs:11`.

The native Import Cases dialog promises an exact format but previews only seven headers: Full Name, Date, Case, Sanction, Progress, Section, Adviser. The required Grade column between Progress and Section is absent. Staff copying this visible example will fail validation even though the downloaded template includes all eight columns. This was observed in the actual desktop UI; see [03-import-instructions.png](native/03-import-instructions.png). Generate the preview and parser header definition from one shared schema, and explicitly distinguish an import-compatible template from the decorated export.

### R26 — P2: Imported sanctions disappear from group details

Source: `src-tauri/src/models.rs:90`, `src/pages/GroupCaseDetails.tsx:207`, `:936`, `:1549`.

The importer builds student objects without their sanction, retaining it only on the case record. Group details use `student.sanction` with no fallback to the primary case sanction when students exist. Actual imported Dana/Evan cases show `Warning` in individual/pending details but `—` in the group view. The group PDF uses the same student-only field; that consequence is source verified, not a native group-PDF test. Use one consistent sanction model and preserve it during import/edit/render. See [group screenshot](native/07-group-missing-sanctions.png) and [stored case sanctions](native/full-restart.json).

### R27 — P2: Export checkboxes do not toggle when clicked directly

Source: `src/components/ExportExcelModal.tsx:74`, `:631`, `:641`, `:677`, `:689`.

Both the containing card's click handler and the checkbox's change handler toggle the same state. Stopping propagation on the change event does not stop the separate bubbling click. In the native app, clicking Attached Proofs directly left it unchecked; clicking its text/card selected it and switched export to ZIP. This was repeated after restart. Handle the toggle once with a properly labelled checkbox. See [direct-click state](native/12-checkbox-direct-click.ax.txt) and [card-click state](native/12-checkbox-card-click.ax.txt).

The chooser also omits Section although it is selected in the default eight columns and exists in the export schema. The interface says 8 of 17 even though the schema has 18 fields. Staff cannot independently select Section through the rendered choices. Keep chooser labels/counts and schema aligned.

### R28 — P2: Pending details label complainants as respondents

Source: `src/pages/PendingCases.tsx:554`.

The heading counts all student entries as “other respondents” without checking role. Native pending details displayed “Separate, Evan and 2 other respondents” while its table identified both extra entries as Complainant / Subject. The extra copies are R08; role mislabelling remains independently even with one legitimate complainant. Count actual respondent roles or use neutral “students involved” wording. See [native role display](native/11-pending-roles.png).

## Additional deployment gaps and limits

- **Office Excel compatibility is not yet certified.** The importer accepts `.xlsx` through the UI, requires exactly `Full Name, Date, Case, Sanction, Progress, Grade, Section, Adviser` in that order, reads only the first worksheet, and rejects more than 5,000 worksheet rows. It has no column mapping or sheet chooser. A representative anonymized copy of the office's workbook is needed to check header rows, merged cells, dates, names, grades, missing fields and row counts. Do not assume their manually maintained file already matches the template.
- **Storage is ordinary SQLite.** Cargo enables `rusqlite/bundled`, not SQLCipher. The release `PRAGMA key` is not evidence of encryption; SMTP/API credentials and case data are stored as plaintext database values. The earlier audit already documented this boundary. Establish Windows account/disk protection and an external backup policy; do not describe the app PIN as database encryption.
- **Security hardening remains:** PIN verification has no attempt lockout; CSP is disabled; file-saving commands can overwrite matching Downloads filenames. Current sign-in is a shared PIN, with no individual staff identity, role authorization or actor attribution. These are architectural/operational gaps, not demonstrated remote exploits.
- **Backup files remain on the same computer by default.** A local snapshot does not survive disk loss. A tested export to separate protected storage and an actual restore drill are still necessary.
- **Dependency findings require reachability triage and remediation.** The production scan includes React Router and transitive spreadsheet/PDF dependencies. Some advisories concern server/RSC features this desktop app does not use; package severity is not proof of exploitability here. Preserve the lockfile, upgrade selectively and rerun workflows; do not apply a blanket major-version audit fix. See [React Router's navigation advisory](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and the advisory URLs embedded in the audit JSON.
- **AI availability is not certified.** The configured model is a documented [Gemini 3.1 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), but real key permissions, billing/quota, streaming/tool execution and report accuracy were not tested. AI actions can send case data to an external service; confirm the school's intended use before enabling this optional workflow. Network calls need cancellation/timeouts and usable offline feedback.
- **Offline typography/icons need testing.** Material Symbols and other fonts load from Google Fonts, while core app assets are local. Confirm first-run offline appearance instead of relying on an existing font cache.
- **Scale testing remains.** Catalog pagination exists, but backend reads are unbounded and pending/group views render whole lists. The browser exercise used a small synthetic dataset. Run the expected case volume, maximum supported import, long narratives, many attachments, large/multipage PDF reports, ZIP exports and low-memory office hardware.
- **Automation coverage is too narrow for release sign-off.** CI builds on Windows but does not execute tests; there is no established frontend workflow suite. The new evidence demonstrates why seven passing repository tests cannot establish workflow completeness.

## Fix and acceptance order

1. Protect account setup/session/recovery and make database replacement reversible (R01–R04).
2. Make Excel migration and group operations preserve incident/participant identity and avoid duplicates/partial saves (R05–R08, R12).
3. Correct date/year/status/report/export behavior (R09–R18).
4. Make backup scheduling and reset scope match the UI; finish recovery/error/keyboard behavior and native UI discrepancies (R19–R22, R24–R28; R23 withdrawn).
5. Triage dependencies, add release checks and rehearse a fresh Windows installation with an anonymized school workbook.

On the target Windows machine, acceptance must include: non-admin installation and WebView2 availability; first setup and actual recovery-email delivery; wrong-PIN/OTP and resend behavior; Excel count reconciliation before/after migration; individual/group cases and status transitions; restart persistence; all scope/date filters; exported workbook/PDF and physical printer checks; attachment/ZIP verification; backup to separate storage; valid and corrupt restore scenarios on disposable data; reset cleanup; offline operation; screen scaling; signed updater/relaunch if enabled. Staff should complete an end-to-end scenario without developer assistance.

**Release sign-off condition:** all P1 items fixed and their reproductions green; P2 items verified or explicitly accepted with workable constraints; target-Windows acceptance completed; migration counts reconciled; recoverable backup demonstrated. No “bug-free” claim is justified by this audit.

## Re-running the evidence

Run from the repository root. Install audit browser tools outside the application dependency graph and use a separate Cargo target for the harness to avoid feature-artifact collisions with the app build.

```sh
npm ci
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo check --release --locked --manifest-path src-tauri/Cargo.toml
cp src-tauri/Cargo.lock docs/audits/2026-10-13/harness/Cargo.lock
cargo test --manifest-path docs/audits/2026-10-13/harness/Cargo.toml write_synthetic_browser_fixtures
npm install --prefix /tmp/lc-guidance-audit-browser playwright @axe-core/playwright
/tmp/lc-guidance-audit-browser/node_modules/.bin/playwright install chromium
npm run dev -- --host 127.0.0.1
```

In a second terminal:

```sh
node docs/audits/2026-10-13/ui-checks.mjs
cargo test --manifest-path docs/audits/2026-10-13/harness/Cargo.toml
TZ=Asia/Manila node docs/audits/2026-10-13/report-checks.mjs
npm audit --omit=dev --json
```

The harness and reporting commands intentionally exit unsuccessfully while the reported bugs exist. Browser output records observed failures and must be reviewed; its zero exit status is not a release pass. The workbook round-trip test requires the browser-generated export. Run tools with the intended Asia/Manila timezone and a current synthetic fixture date if adapting this audit to a later date.
