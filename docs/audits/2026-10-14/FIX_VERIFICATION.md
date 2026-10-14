# Release fix verification — 2026-10-14

Version **0.1.11**, branch `codex/release-readiness-fixes`. All 27 confirmed findings from the [baseline audit](../2026-10-13/ROLLOUT_READINESS.md) have implementation fixes. R23 remains withdrawn. The app is a **Windows acceptance candidate**; unconditional office deployment sign-off still requires the actual office PC, workbook and external services described in the [installation guide](../../release/GUIDANCE_OFFICE_INSTALLATION.md).

## Validation

- **37 Rust tests pass** (7 existing + 30 release regressions), including authorization, OTP expiry/purpose/consumption, atomic saves/retries, import validation/duplicates, failed database replacement, backup scheduling/retention, reset and history. [Log](rust-tests.txt).
- **12 frontend regression tests pass** for exclusive metrics, Manila calendar dates, grade/date filters, report scope, participant identity and atomic retry receipts, plus dialog Tab containment, Escape, autofocus handling, label associations and return focus in a virtual DOM. [Log](frontend-tests.txt).
- TypeScript/production frontend build passes. [Build log](frontend-build.txt). Vite still warns about the large combined PDF/Excel bundle; this is not a failed build.
- Production npm dependency audit reports **zero known advisories**. [Result](production-dependency-audit.json). Five high advisories remain in the legacy Tailwind 3 development/build dependency graph; production-only audit is the CI gate. A Tailwind 4 migration is separate work, and untrusted build source should not be supplied to these tools.
- Windows Actions run [38443892907](https://github.com/harleyalcos/lc-guidance-2/actions/runs/38443892907) passed locked installation, frontend tests, production dependency audit, all Rust tests and the NSIS installer build on commit `8aff946`. [Machine-readable result](windows-checks.json). Later final UI/documentation changes must also pass the branch/PR checks.
- Native macOS debug walkthrough used an isolated identifier (`local.guidance.release.audit`), separate SQLite database and synthetic records. Setup UI validation and offline backend setup passed; the walkthrough used an offline-seeded synthetic PIN, not a human-completed live credential setup. No real SMTP, Gemini or student data was used.
- Original workspace database SHA-256 remains `03ea2f927ab72f8d116dd4ffe8282b9cb6963a538985f2775f98dd7322441478` before and after the tests.

## Baseline findings and fixes

| Finding | Implemented behavior | Evidence |
|---|---|---|
| R01 | Validate, stage, upgrade and integrity-check replacement; mandatory independent safety snapshot; atomic live copy preserves data on failure | Rust failure-injection tests; native valid restore |
| R02 | Initialized setup cannot replace credentials | Rust regression |
| R03 | Protected IPC commands require a backend session; sign-out/reload revokes it | Rust unauthorized read/write tests; native sign-in/restart/restore |
| R04 | Runtime OTP grants expire, have one purpose, are consumed and revoked at sign-out | Rust regressions |
| R05 | Same-day/type Excel rows remain independent; only explicit multiple names establish a group | Rust regression; native two independent records |
| R06 | Cross-file review and transactional commit reject duplicates; re-imported incident times survive | Rust regressions; [native two duplicates](cross-file-duplicates.txt), [seven export duplicates](roundtrip-export.txt) |
| R07 | All respondent/sibling writes and a fingerprinted retry receipt commit in one transaction | Rust rollback/retry regression; native filing/edit/add-student |
| R08 | Shared participants deduplicate with stable IDs; distinct same-named students remain separate | Rust + frontend regressions; [stored group edit](after-group-edit.json); final group has three respondents and one shared subject |
| R09 | July academic-year boundary accepts manual timestamps | Rust regression |
| R10 | Academic-year query matches the actual academic year, not a calendar-prefix OR | Rust regression |
| R11 | Editing incident date recomputes its academic year | Rust regression |
| R12 | Numeric grades normalize at import/storage/report boundaries | Rust + frontend regressions; [Grade 7 PDF](verified-grade-7-report.pdf) includes Ben |
| R13 | Case statuses are exclusive across catalog, dashboard and reports; Reprimand is in the chart | Frontend regression; native 7 = 5 pending + 2 resolved, with 0 reprimand |
| R14 | Automatic periods use local calendar components and filtered records | Frontend regression; native report and dashboard dates |
| R15 | End-date comparisons include timed incidents throughout that day | Frontend regression |
| R16 | Import locates/reorders named headers, including decorated exports; default export contains respondent names | Rust header/time regression; actual native export re-import gives 7 duplicates, 0 issues and 0 ready |
| R17 | Creation history is a valid timestamp without a second suffix | Rust regression; native group history |
| R18 | Backend centrally records status transitions, including pending queue actions | Rust regression; native queue resolution/history |
| R19 | Backend policy controls schedule/disable/retention; manual and safety snapshots are distinct; newest history is first | Rust regressions; [native backup history](final-backups.txt), manual backup + valid restore |
| R20 | Reset removes AI messages/sessions, cases, receipts and outstanding codes transactionally | Rust regression; UI explains retained backups |
| R21 | Staff-facing load errors and Retry; failures do not become valid zero/stale report exports | Source reviewed; catalog metrics show Unavailable on error and export is disabled |
| R22 | Offline PIN-only setup; explicit App Password guidance; recovery resend/back; tested-recipient confirmation; SMTP editor with current PIN | Backend/offline regressions and native setup/settings inspection; real delivery/reset still an office acceptance check |
| R24 | Modal semantics, Tab containment, Escape cancellation, label associations, upload keyboard controls and stronger pending contrast | Native dialog/keyboard tests including return focus after a full restart; virtual DOM regression tests; Windows scaling remains acceptance |
| R25 | Preview has all eight required headers and correctly aligned example cells | Native import dialog |
| R26 | Imported sanctions enter participant JSON; primary sanction stays aligned after edits and clearing; group rendering/PDF uses consistent data | Rust regressions; [native final group](final-group-proof-sanction.txt) |
| R27 | Checkbox click toggles once; Section and all 18 fields are available | Native direct-click 8 → 7 → 8 and Excel save |
| R28 | Pending heading says students involved and displays actual roles | Native pending queue |

## Completed native flow

Fresh empty app → required-PIN validation → synthetic account sign-in → 3 clean Excel rows imported → 2 independent rows plus duplicate copy reviewed (2 ready, 2 duplicates) → only the 2 unique rows inserted → manual group filed with 2 respondents and 1 shared subject → shared subject edited once across sibling records → one respondent resolved through the pending queue → Grade 7 PDF includes numeric-grade record with correct dates and totals → exact saved PDF opens in system viewer and its print dialog (canceled; printer was offline) → direct Section checkbox toggles correctly → Excel saved and re-imported (7 duplicates, no issues, no ready rows) → manual backup and valid restore → authentication required again → restart retains 7 records → image uploaded and retained after restart → individual sanction edit appears in group → additional respondent added without multiplying the shared subject. Final synthetic database has 8 records. [Final records](final-records.json).

After a full app restart, Escape canceled Restore and returned focus to its Restore button; the following Tab reached Delete. [Focus evidence](final-dialog-focus.txt), [Tab evidence](final-dialog-tab.txt). No restore was performed during this cancellation check.

The latest attachment-history refresh also fetches the saved case so its audit entry appears immediately. Image uploads accept JPG/PNG/GIF/WEBP up to 10 MB and report file-read failures. Local fonts/icons work without Google Fonts. Import operations use asynchronous command dispatch, indexed duplicate lookup and a hash map rather than a quadratic review scan; a 5,000-row parse and transactional commit passed (34 seconds in the busy macOS debug test environment, not a Windows production performance guarantee). Source worksheet row numbers are retained for correction.

## Limits before office deployment

The actual school workbook was not supplied; its first worksheet/header layout, names, dates, row counts and merging must be reconciled against a copy. Windows compilation/packaging passed, but installation, WebView2 runtime behavior, Windows UI scaling and office printing require the actual PC. Recovery email/Gemini provider availability and live credential flows were not tested; they remain optional and should be verified with synthetic records before enabling them.

Storage is ordinary SQLite with a shared PIN; it is not database encryption, individual staff identity or actor attribution. Establish Windows account/disk protection and a separate protected backup. The [office acceptance checklist](../../release/GUIDANCE_OFFICE_INSTALLATION.md) is the remaining release gate; it is not proof of a remaining reproducible application defect. No claim that every possible bug has been eliminated is made.
