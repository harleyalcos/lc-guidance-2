# Organizing teacher testing for version 0.1.11

Give each tester the complete Teacher_Test_Pack_0.1.11.zip. Ask them to Extract All and read START_HERE.txt. The primary guide is a seven-page PDF containing 20 ordinary tasks and three optional tasks. The results form is printable; editable Word and plain-text versions are also supplied. Use a separate Windows x64 PC or disposable Windows user profile without live school records. If an existing installation shares data across profiles, use a separate PC or VM.

The installer in this package is the approximately 10.2 MB acceptance build from commit 7063f6b99b8f0438fa18d664507adb4f11a13d58. Its SHA256 is ae4778bcaa2b47d942a3f406aa1afef5ac7bfaee72c2285badf1fdd8e6bae385. It uses downloadBootstrapper, so a PC missing WebView2 needs internet for that prerequisite. The installer is not an updater-signed release artifact. Manual installation tests the application; it does not demonstrate a successful signed update.

## Teacher preparation

- Provide the ZIP and a Windows test PC. Optional equipment is a printer and a spreadsheet viewer for inspecting exports. Importing the supplied Excel files requires neither Excel nor a spreadsheet viewer.
- Ask teachers to create their own six-digit practice PIN. Do not collect their PINs or secrets on feedback forms.
- For task 22, configure a practice Gmail sender/app password and accessible recovery inbox through the app's Recovery email delivery settings. Send the test message, confirm receipt, and save with the current PIN. Use practice accounts; distribute any required credentials privately.
- For task 23, configure a valid AI key through Settings, test the connection, and save. Ask teachers to use only fictional records. A service outage must not be recorded as a successful response.
- Ask testers to return Worked / Problem / Not tried results and screenshots. If part of a task was not tried, keep that limitation in the results. Do not infer a pass from a teacher finishing the guide.

## Expected record counts

| Stage | Total | Pending | Resolved | Reprimand | Closed |
| --- | ---: | ---: | ---: | ---: | ---: |
| File 01 imported | 6 | 2 | 2 | 1 | 1 |
| File 02 imported | 8 | 4 | 2 | 1 | 1 |
| Files 03 and 04 reviewed and discarded | 8 | 4 | 2 | 1 | 1 |
| File 05 imported and task 9 completed | 10 | 6 | 2 | 1 | 1 |
| Lea filed | 11 | 7 | 2 | 1 | 1 |
| Marco and Nina filed with shared Owen | 13 | 9 | 2 | 1 | 1 |
| Paolo added | 14 | 10 | 2 | 1 | 1 |
| Status changes in task 14 completed | 14 | 7 | 3 | 2 | 2 |
| Backup/restore and deletion tasks finished | 14 | 7 | 3 | 2 | 2 |

File 04 deliberately contains three invalid rows. Correcting its impossible date to 10/03/2026 should produce one ready row and two remaining issues; teachers then discard it. File 05 stores two names within one Excel cell on separate lines and creates two linked respondent records. File 02 has independent incidents despite matching dates and case types. Grade 7 after task 9 has three records, two Pending and one Resolved. Count respondent records, not catalog group rows.

## Checks kept out of the teacher walkthrough

The full technical checklist remains in docs/release/QA_WALKTHROUGH.md. Before release, the maintainer must verify the remaining administrative and failure scenarios, especially full database export/import, reset of application data, import rollback, oversized/invalid attachments, recovery-code expiry, update download failure and signature rejection. These are separate from teachers trying everyday office work.

Database migration and reset can also be demonstrated to a designated staff member using only the disposable test database: export the current database with PIN verification; add a temporary marker; import the exported file and verify the marker is absent and saved cases, PIN, images and history return. Make a manual backup before reset; cancel Delete All Records once, then confirm with the practice PIN; verify cases and AI history are cleared, the app still accepts its saved PIN, and restoring the named backup returns the practice records. Record cancellation and successful recovery separately. Never perform this demonstration on the live office database.

## Arranging an actual update test

Teacher task 21 requires a separate PC still running the older production app, with fictional records, a linked group, an attachment, and a known backup. Installing the included 0.1.11 setup file on that PC first would remove the old-to-new update test.

At the preparation check on 15 October 2026, PR 57 is still open and draft, and the newest published release returned by GitHub is v0.1.10. Recheck those facts before release. The packaging correction must be in the approved release commit; the version in package.json, Cargo.toml, and tauri.conf.json must agree. Confirm the intended tag has not already been used. The existing release workflow publishes a release when a version tag is pushed; publication makes it discoverable by office installations. Do not use a production tag solely to demonstrate an update before accepting that publication.

Use a controlled signed candidate and its manifest for prepublication update testing. Keep the current updater trust key; verify the Windows manifest entry, download URL, signature, and small installer size. Do not disable signature checks. After feature acceptance and release authorization, push the approved new version tag through the existing pipeline and verify published latest.json, installer, and signature. Repeat teacher task 21 against the real endpoint on the older test installation, confirm the new version/data/PIN/images, and check no repeated update is offered. Then follow the office deployment procedure and keep a recoverable backup before updating the live PC.

The package itself does not publish a tag or update. A release decision requires acceptable teacher results, completed required optional-feature tests, and the maintainer's Windows/update checks. Untried features remain unverified.

## Fixture verification

All five new workbooks were parsed by the app's actual parse_import_file command and the valid rows were inserted using batch_import_cases into a fresh in-memory database. The check verified ready/duplicate/issue counts, date and numeric-grade normalization, independent incidents, the explicit linked group, ten resulting records, status counts, and the Grade 7 count. It passed on 15 October 2026. No live database was used. Document pages and workbook previews were rendered and inspected before packaging.
