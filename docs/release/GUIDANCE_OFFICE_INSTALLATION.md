# Guidance office installation and acceptance — 0.1.11

Use the Windows acceptance installer from the release-checks workflow for a pilot. Complete the school acceptance steps below before tagging a production update. Acceptance builds disable updater signatures; the normal release workflow still requires the existing signing secrets and publishes the release automatically when a version tag is pushed.

## First installation

1. Install under the Windows account that guidance staff will use. The small installer uses the existing WebView2 runtime; internet is required to download it only if it is missing. Verify installation using a standard account, launch the app, and check the screen at the office's normal scaling. The updater downloads the full small installer; the WebView2 offline installer is not bundled into releases or updates.
2. Create a six-digit PIN and store it securely with the office's authorized custodian. Setup works without internet. Sign out and sign in again.
3. Email recovery is optional. To enable it, use a Gmail sender with Google 2-Step Verification and a **16-character App Password**. In Settings, enter the sender, App Password, recovery address and current PIN. Send a test, confirm receipt in the recovery inbox, then save. Test Forgot PIN with synthetic data before relying on recovery. Codes expire and are single-use; use Resend or Back if needed.
4. Gemini is optional. Leave the key empty until the school approves using it. AI requests can send the requested case context to Google's Gemini service. Ordinary filing, reports, Excel import and backups work without AI.

## Bring in the office's Excel records

Keep the original workbook unchanged and work with a copy. Download the import template from Case Catalog → Import Excel. The first worksheet must contain Full Name, Date, Case, Sanction, Progress, Grade, Section and Adviser. Named columns may be reordered; Grade Level/Year Level, Case Type/Category, Status/Progress Status, Name/Student Name and Advisor/Class Adviser aliases are accepted. Headers must occur within the first 25 used rows. Both .xlsx and .xls are supported; split files exceeding 5,000 worksheet rows.

Use one row per respondent incident. Adjacent rows with the same date/type are independent. Multiple names in one cell explicitly create a linked incident; don't put complainants in that respondent field. Enter complainants through the case/group participant controls. Numeric grades 7–12 become Grade 7–12. Use Pending, Resolved, Closed or Reprimand as status. Sanction is a separate field.

Review Issues, Duplicates and Ready to Import. Correct issues before importing; review cross-file duplicates. Compare imported counts and representative names, grades, dates, statuses and sanctions with the original workbook. An import batch either completes or leaves the database unchanged. Re-importing the same exported rows should report duplicates.

Excel exports contain the chosen spreadsheet fields; the default Full Name field lists respondents. They are not complete database backups: descriptions, attachments, shared participants, links and history require the appropriate export options or a database backup. Use Export Database for moving the complete app database.

## Daily use and recovery

File New Case → case type → students/roles and sanctions → description/proofs → Review → File. Linked respondent records save together. Use Pending Cases to resolve or close records, and check Update History. Reports count each case record once in one status; Grade scopes include numeric legacy grades. Date filters include the whole final day. **Open PDF to Print** saves the exact report in Downloads and opens the system PDF viewer; use Ctrl+P there and select the school printer/paper size.

Choose the backend backup schedule and retention in Settings → Backup & Recovery. Scheduled jobs run while the app is open; On New Record covers manual and Excel additions. Manual and mandatory pre-import/pre-restore safety backups remain until deleted. History shows the newest snapshot first. A restore/import validates the replacement and requires a successful separate safety backup before replacement; sign in again afterwards. Restoring a database also restores its PIN/settings.

Export Database regularly to a separate protected drive and test a restore using a disposable installation. Same-computer snapshots cannot recover a failed disk. Reset removes cases and AI conversations but keeps credentials and existing backups, which may retain older student data.

The app uses one shared PIN and ordinary SQLite, not encrypted database storage or individual staff accounts. Protect the Windows account, disk, backup media and exported files. The app PIN does not replace these protections.

## Office acceptance before live use

- Fresh installation, offline launch, setup, sign-in/out and restart on the actual Windows PC.
- Import a representative copy of the school's real workbook; reconcile counts and samples.
- File an individual and linked incident with an image; edit, add a student and resolve/close. Confirm history and attachments persist after restart.
- Generate Grade 7 and all-grade reports with a date range ending on a timed incident; compare totals and print one page on the office printer.
- Create a backup, export it to separate storage, and complete a restore drill in a disposable installation.
- If enabled, confirm real recovery delivery/reset and Gemini availability using synthetic records.

Record the installer version and acceptance results. These environment checks cannot be replaced by a successful compilation or synthetic database tests.
