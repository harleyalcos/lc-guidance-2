# Guidance Office QA Walkthrough

Version 0.1.11 | Prepared 14 October 2026 | Audience QA testers and release maintainer

Use this walkthrough to decide whether the update is suitable for daily guidance-office work. Test the application features first, then separately prove that an older installed version discovers, downloads, verifies and installs a signed update while retaining its saved data. A successful manual installation alone does not prove the updater works.

The QA acceptance installer for source commit 7063f6b is 10,175,375 bytes, approximately 10.2 MB. Its SHA-256 is ae4778bcaa2b47d942a3f406aa1afef5ac7bfaee72c2285badf1fdd8e6bae385. This installer is for feature testing; its CI build does not include updater signatures. The tag release pipeline creates the signed installer and update manifest needed for the in-app update tests.

## How to use this walkthrough

1. The QA lead assigns a Windows tester and a release maintainer. Use a disposable Windows VM or a separate QA computer and Windows account. Record Windows version, account type, display scaling, installed app version, candidate version, build commit, installer size and checksum.
2. Use synthetic records for the general tests. Use an approved anonymized copy of the school workbook for the final compatibility test. Keep the original workbook and office database unchanged. Do not capture PINs, App Passwords, API keys or student information in public evidence.
3. Run QA 01 through QA 07, then the main case workflow QA 14 through QA 22. That creates the exact count checkpoints below. Run the supplementary tests using a VM snapshot or a database checkpoint; restore the checkpoint before returning to the main dataset.
4. For every test, record Pass, Fail, Blocked or Not applicable, the actual result, evidence path and defect ID. Missing internet, printer, email account, API access or staging infrastructure means Blocked for an enabled feature. Use Not applicable only for an optional feature the office will leave disabled, with the reason recorded.
5. Stop the release for any missing records, incorrect report totals, unintended deletion, broken sign-in, failed backup or restore, or a failed signed update. Preserve the failed state and evidence before retrying. Retest each fix and the related workflow.
6. Complete the unassisted office-day rehearsal and sign-off at the end. No test result in this document is prefilled as passed.

## Test order and environments

| Phase | Environment | Purpose |
| --- | --- | --- |
| Feature acceptance | Fresh QA Windows installation of 0.1.11 | Test screens, data validation, imports, cases, exports, recovery and usability |
| Upgrade rehearsal | Disposable Windows installation of the current office version, with synthetic data and a maintainer-provided QA update endpoint | Prove the signed update before exposing a production release |
| Production update smoke test | Authorized release window and a backed-up QA machine using the production endpoint | Verify the actual tag pipeline, published manifest and installed-version upgrade |
| Office pilot | Actual guidance-office PC and printer after QA approval | Reconcile the approved workbook and observe normal daily work |

Delete, reset, restore, database import, interrupted-save and permission-failure tests belong on the disposable QA installation. Restore a checkpoint after each destructive test. Do not uninstall or clear the live office app to simulate a fresh state.

## Files and count checkpoints

The QA kit includes five existing synthetic Excel fixtures and a small image. Extract the kit before choosing files in the app. Fixtures use the first worksheet and the eight required named columns: Full Name, Date, Case, Sanction, Progress, Grade, Section and Adviser.

| File | What it tests | Expected result on the stated dataset |
| --- | --- | --- |
| 01-clean-office-cases.xlsx | Three valid rows including a numeric grade | Empty database: 3 ready, 0 issues, 0 duplicates |
| 02-independent-same-day.xlsx | Dana and Evan have the same date and case type | After file 01: 2 ready; two independent incidents |
| 03-invalid-rows.xlsx | Impossible date, missing name, unsupported status | 3 issues; no rows ready until corrected |
| 04-copy-of-clean-cases.xlsx | Exact copy of file 01 | After file 01: 3 duplicates, 0 ready |
| 05-copy-independent-same-day.xlsx | Exact copy of file 02 | Review files 02 and 05 together: 2 ready and 2 duplicates |
| audit-proof.png | A small valid image | Preview opens and attachment persists after saving and restarting |

File 01 contains Audit Alice, Grade 7, Pending, Bullying, 15 August 2024; Audit Ben, numeric grade 7, Resolved, Tardiness, 10 March 2025; and Audit Cara, Grade 10, Pending, Family Problems, 1 October 2026. Ben has Written Reprimand as his sanction, but his status remains Resolved. File 02 contains Separate Dana, Grade 8, and Separate Evan, Grade 9, both Pending Tardiness cases on 2 October 2026. Names are stored in surname-comma-given-name form in the workbook.

Use these manual records for the main workflow. In separate name fields use surname QA and given name Alex, Morgan, Taylor, Jamie or Jordan respectively. Keep all supplemental tests on a separate checkpoint so they do not change the expected totals.

| Record | Grade | Role | Initial status | Initial sanction |
| --- | --- | --- | --- | --- |
| QA Alex | Grade 7 | Respondent in one individual incident | Pending | Verbal Warning |
| QA Morgan | Grade 7 | Respondent in one linked incident | Pending | Written Warning |
| QA Taylor | Grade 8 | Respondent in the same linked incident | Pending | Counseling |
| QA Jamie | Grade 7 | Shared complainant or subject in that incident | No separate case record | None |
| QA Jordan | Grade 9 | Respondent added later to that linked incident | Pending | Warning |

Select one complainant or subject role for Jamie and record it consistently. Morgan, Taylor and Jordan each have a respondent case record; Jamie does not add a fourth respondent record. Catalog groups and case-record counts are different: the linked incident can occupy one group row while contributing three respondent records.

| Checkpoint | Total case records | Pending | Resolved | Reprimand | Closed |
| --- | --- | --- | --- | --- | --- |
| A after file 01 | 3 | 2 | 1 | 0 | 0 |
| B after files 02 and 05 together | 5 | 4 | 1 | 0 | 0 |
| C after filing Alex | 6 | 5 | 1 | 0 | 0 |
| D after filing Morgan and Taylor | 8 | 7 | 1 | 0 | 0 |
| E after adding Jordan | 9 | 8 | 1 | 0 | 0 |
| F after resolving Taylor, reprimanding Morgan and closing Jordan | 9 | 5 | 2 | 1 | 1 |

Save snapshots or exported database checkpoints B and F, label their version and current QA PIN custodian, and keep them outside the app's own backup folder. Do not record the PIN itself in the test report.

## Installation and account access

### QA 01 Fresh Windows installation

1. On a clean QA Windows account or VM, record the OS and whether WebView2 already exists. Verify the candidate installer checksum and install it as a standard user.
2. Launch the app. Inspect title, logo, icons, initial window and Settings version after setup.
3. Repeat on a separate VM with WebView2 absent and internet available. Record any prerequisite or elevation prompts.
4. Where WebView2 is absent, repeat without internet. Record the dependency-download failure, then reconnect and retry.

Expected: the candidate is about 10.2 MB, not 227 MB. Setup opens on a fresh database and the version is 0.1.11. A missing WebView2 runtime requires internet for its initial installation; an already provisioned PC can run ordinary local features offline. A prerequisite failure must not be reported as a successful usable installation.

Evidence: installer properties and checksum, OS/account details, prerequisite prompts and app version screenshot.

### QA 02 First setup and validation

1. Leave PIN fields empty and try setup. Try fewer than six digits, nondigits and a mismatched confirmation.
2. Enter a private QA six-digit PIN and matching confirmation. Leave optional email configuration off and finish setup.
3. Sign in. Confirm the empty dashboard and catalog show zero records without an error.
4. Close and reopen the app. Verify it asks for sign-in rather than showing first setup again.

Expected: invalid input is explained and does not initialize an unusable account. Valid PIN-only setup works without email. Credentials persist across restart and cannot be overwritten by repeating first setup.

Evidence: validation screenshot without PIN values, empty dashboard and restart sign-in screen.

### QA 03 Incorrect PIN and lockout

1. Sign out. Try an incorrect six-digit PIN five times on the disposable QA account.
2. Attempt sign-in during the lockout, including with the correct PIN.
3. Wait at least one minute without restarting the app, then sign in with the correct PIN.

Expected: incorrect PINs do not grant access; after five failures the one-minute lockout is explained. Correct sign-in succeeds after the wait. Do not mark a restart experiment as proof that the timed lockout worked.

Evidence: error text and timestamps of lockout and successful retry.

### QA 04 Sign out and normal PIN change

1. Sign in, visit Case Catalog, then sign out. Try to return to a case using navigation history.
2. Sign in again. Open Settings, Change PIN. Try an incorrect current PIN and mismatched new PIN fields.
3. Change to another private QA PIN using the correct current PIN. Sign out and verify the old PIN fails and the new PIN succeeds.
4. Close and reopen. Verify the new PIN still works and saved records are unchanged.

Expected: protected content requires sign-in. Invalid changes do not alter credentials. A valid normal PIN change works without a recovery email and persists. Record only who holds the current QA PIN.

Evidence: sign-out screen, validation and successful restart, with secrets concealed.

## Excel onboarding and review

### QA 05 Import three clean records

1. Starting with zero records, open Case Catalog, Import Excel. Inspect the eight-column example and download the template.
2. Select 01-clean-office-cases.xlsx. Check Issues, Duplicates and Ready to Import.
3. Expect three ready rows. Import them, wait for success and inspect all three case details.
4. Compare names, incident dates, sanctions, statuses, sections and advisers with the source workbook.

Expected: checkpoint A is 3 total, 2 Pending and 1 Resolved. Ben appears as Grade 7. Ben's Written Reprimand sanction does not also count him under Reprimand status. Incident date and filing date are separate fields.

Evidence: review counts, import completion and all three saved records.

### QA 06 Reimport existing duplicates

1. Import 04-copy-of-clean-cases.xlsx after QA 05.
2. Expand a duplicate comparison and inspect the incoming row and stored record.
3. Confirm all three are duplicates and none are ready. Remove or discard these review rows.

Expected: no new records are inserted; total stays 3. A duplicate remains clearly distinguishable from a validation issue.

Evidence: duplicate comparison and unchanged catalog count.

### QA 07 Cross file duplicates and independent incidents

1. Select 02-independent-same-day.xlsx and 05-copy-independent-same-day.xlsx in the same import review.
2. Verify 2 ready, 2 duplicates and 0 issues. Import only the ready rows.
3. Open Dana and Evan and inspect the catalog grouping.
4. Discard remaining duplicate review rows and record checkpoint B.

Expected: exactly two new respondent records, total 5, Pending 4 and Resolved 1. Dana and Evan remain separate incidents even though their date and type match. Save checkpoint B for supplementary tests.

Evidence: cross-file review counts, two independent details and checkpoint B totals.

### QA 08 Invalid rows and inline correction

1. From a copy of checkpoint B, review 03-invalid-rows.xlsx. Inspect the impossible 30 February date, missing name and unsupported In Progress status.
2. Edit Frank's date to a valid date. Give the blank-name row a unique synthetic name. Change Gina's status to Pending.
3. Verify the corrected rows are revalidated and move to Ready only after all errors are fixed. Remove one corrected row and exercise the current-tab removal confirmation, first Cancel, then confirm.
4. Discard the whole review without importing and return to the catalog.

Expected: initial 3 issues and 0 ready. Errors identify the source worksheet row and field; edited data is revalidated. Review removal does not delete stored cases, and total remains 5 because nothing was committed.

Evidence: initial and corrected review, source row numbers, cancel behavior and unchanged total.

### QA 09 Resume and discard pending review

1. Load an import review but do not commit it. Navigate to Dashboard and use the Pending Imports button to return.
2. Close and reopen the app, sign in and check whether pending review resumes. Record the actual behavior.
3. Use the review's discard confirmation, cancel once, then confirm. Verify the pending-review indicator clears.
4. After a database restore later in QA 43, verify old pending review cannot be committed against the newly restored database without being cleared or freshly validated.

Expected: retained review is identifiable and can be resumed or discarded without insertion. Discard does not delete saved cases. Restart preservation and restore/session cleanup must behave consistently and must not create stale duplicate imports.

Evidence: pending-review indicator before and after discard; restored-state review behavior.

### QA 10 Headers worksheet selection and legacy Excel

1. In Excel, make copies of file 01. Reorder the eight named columns and test supported aliases such as Student Name, Grade Level, Case Type, Status and Advisor.
2. Place a title above the table so its header is on row 8. In a separate copy place an invalid data row at Excel row 9 and check the reported source row.
3. Save another copy as genuine Excel 97–2003 .xls, not just a renamed .xlsx, and import it.
4. Make a copy missing Section and try it. Also place valid data only on the second worksheet and try it.

Expected: supported named headers, reordered columns and row-8 headers parse correctly; valid file-01 rows are still duplicates. Missing required headers give a useful error. Only the first worksheet is imported. Headers must be within the first 25 used rows; testers should prepare the first worksheet accordingly. Source row 9 must be reported as row 9.

Evidence: each workbook variant, parser result and source-row screenshot. Keep checkpoint B unchanged.

### QA 11 Explicit linked names

1. On a disposable copy of checkpoint B, download the import template. In one Full Name cell enter `ImportQA, One`, press Alt+Enter in Excel, then enter `ImportQA, Two` on the next line of that same cell. Complete the date, case, status, Grade 7, section, adviser and one sanction shared by both respondents. Separate lines in the corresponding grade/sanction cells can instead supply each respondent's own value in the same order.
2. Review and import. Open the resulting incident and both respondents.
3. Compare with Dana and Evan's independent rows from QA 07. Restore checkpoint B afterwards.

Expected: line breaks explicitly create linked respondent records; unrelated adjacent rows do not. Each respondent appears once with the imported sanction. A comma separating surname and given name is not itself a multiple-student delimiter. An unclear preview or unexpected split is a defect to report.

Evidence: exact cell text, preview, created respondent count and group details.

### QA 12 Large invalid and interrupted imports

1. Use a disposable VM. Have the maintainer prepare 5,000 valid unique rows, plus a second file exceeding the limit. Keep the required header on the first row so title rows do not reduce capacity.
2. Time parse and commit for the valid file, note the PC specifications and verify exactly 5,000 additions. Review the oversized file.
3. Try a broken Excel file. Attempt a rapid repeat of the import action while a valid commit is busy.
4. In a separate VM snapshot, interrupt a large commit by closing the process under maintainer supervision. Reopen, compare the before/after counts, revalidate and retry.

Expected: the valid batch completes with an exact count; the oversized or broken file is rejected with guidance. Busy actions do not insert the batch twice. An interrupted transaction leaves either the complete committed batch or the previous state, with no partially saved batch. Record timings instead of assuming the QA PC matches the earlier CI speed.

Evidence: source row count, before/after counts, elapsed times, error and retry results. Do not run this on the main nine-record dataset.

### QA 13 School workbook compatibility

1. After synthetic tests pass, obtain an approved anonymized copy of the school's actual workbook. Record worksheet, header layout, used-row count, date formats, multiple-name conventions and source totals.
2. Prepare the first worksheet with the required named headers if needed. Split files exceeding the row limit; keep the originals.
3. Review every issue and duplicate before committing on a separate QA database. Reconcile inserted respondent records and linked incidents against a written source ledger.
4. Check samples from every grade, date range, status and sanction, including blank optional fields and names with punctuation. Reimport the same prepared files.

Expected: reconciled counts and representative fields agree with the source. All repeated rows become duplicates. Do not approve office onboarding from synthetic fixtures alone.

Evidence: approved source ledger, transformation notes, review results and sample comparison, stored in a protected location.

## Filing and maintaining cases

### QA 14 Individual filing and wizard validation

1. Return to checkpoint B. Select File New Case and try advancing without required information.
2. Enter QA Alex as a Grade 7 respondent, a Tardiness case, Pending status and Verbal Warning sanction. Use a past incident date, section QA-A, adviser QA Teacher and a recognizable synthetic description.
3. Attach audit-proof.png. Move Back and Next through the wizard, inspect Review and correct a value there.
4. File once and open the saved record. Record its ID and checkpoint C.

Expected: validation is clear, wizard navigation retains entered values, Review matches the saved case, and exactly one record is added. Checkpoint C is 6 total, 5 Pending and 1 Resolved. The history has a valid creation date and the image is viewable.

Evidence: Review, saved ID, case details, history and total.

### QA 15 Cancel unsaved work and retry a save

1. On a checkpoint copy, start another synthetic case. Close the wizard and test both keeping editing and confirming discard where offered.
2. Confirm that canceled or incomplete drafts have not added records.
3. File a new throwaway record while clicking the submit action rapidly. If a save fails in a maintainer-controlled failure scenario, retry the same attempted save.
4. Compare case IDs and counts, then restore the checkpoint.

Expected: cancellation choices are understandable. A completed attempt creates one record or one complete respondent group, never duplicates from rapid clicks or an identical retry. An error does not appear as a success.

Evidence: cancel dialog, exact before/after count, save error and retry IDs.

### QA 16 Individual editing and academic year boundary

1. Edit Alex's incident date to 30 June 2025 and save. In Export to Excel include the additional Year column, export Alex and inspect its academic-year value.
2. Change the date to 1 July 2025, save and export the Year column again. Keep Alex Pending and Grade 7 for the main count checkpoints. The catalog/dashboard Period selector offers calendar/date scopes; do not assume selecting calendar 2025 means academic year 2025–2026.
3. Edit section, adviser, description and sanction; verify other fields and original filing date remain appropriate.
4. Sign out, sign in and reopen the record.

Expected: 30 June belongs to 2024–2025 and 1 July to 2025–2026. Date edits recompute the academic year without changing the case ID or accidentally treating filing date as incident date. Saved fields and audit entries persist.

Evidence: both year assignments, saved field values and update history.

### QA 17 File a linked incident with shared participants

1. From checkpoint C, file a Bullying incident titled QA Linked Incident with Morgan, Grade 7, Written Warning, and Taylor, Grade 8, Counseling, as Pending respondents.
2. Add Jamie, Grade 7, once as a shared complainant or subject. Give the incident a past date, synthetic description and image.
3. Review names, roles and each respondent's sanction. File once and open group details and each respondent's individual details.

Expected: two new respondent records, checkpoint D total 8 and Pending 7. The group has two respondents and one shared participant. Shared participant presence does not add a third case record or multiply the group's displayed person count. Individual and group sanctions agree.

Evidence: Review, both respondent IDs, group roles/sanctions and count.

### QA 18 Edit a shared participant once

1. Open QA Linked Incident and use the group editing controls. Change Jamie's displayed name to QA Jamie Updated once and save.
2. Reopen group details and both respondent records. Edit a shared incident description through the group editor and compare siblings.
3. Restart the app and inspect the group again.

Expected: one shared Jamie Updated appears in the group and remains associated with each sibling. No original Jamie duplicate is created. Shared edits reach the intended linked records and history remains valid. Total remains 8.

Evidence: group before/after, sibling details and restart view.

### QA 19 Add a respondent to a linked incident

1. In QA Linked Incident, choose Add Student. Attempt an empty required form.
2. Add Jordan, Grade 9, as a Pending respondent with Warning sanction. Save and inspect all three respondent records.
3. Reopen the group and verify Jamie Updated is still shown once.

Expected: exactly one new respondent record, checkpoint E total 9 and Pending 8. Morgan and Taylor are retained; Jordan has the expected role and sanction; shared participants are not multiplied.

Evidence: validation, new ID, group participants and checkpoint E total.

### QA 20 Distinct people with identical names

1. On a disposable checkpoint copy, add two genuinely distinct synthetic participants with the same displayed name and different identifying fields such as section.
2. Edit only one of them, save and reopen the group and sibling records.
3. Restore the main checkpoint afterwards.

Expected: different participant identities remain distinguishable and an edit to one does not alter the other. Matching text alone must not silently merge distinct students. Record the fields the UI provides for distinguishing them.

Evidence: both participants before/after and the edited record.

### QA 21 Individual sanction consistency

1. In Morgan's individual details, change Written Warning to Counseling Follow-up and save.
2. Open group details and a group or case PDF. Compare Morgan's sanction with the individual view.
3. Clear Morgan's sanction and save; compare those views again. Restore Counseling Follow-up to keep a recognizable final state.

Expected: edits and clearing remain consistent across stored individual and group views and exported documents. Taylor's Counseling and Jordan's Warning remain unchanged. The shared participant and image are retained.

Evidence: individual, group and exported sanction values after edit and after clearing.

### QA 22 Status transitions and the pending queue

1. In Pending Cases, inspect Alex, Morgan, Taylor and Jordan and their involved-student roles. Confirm Jamie is not mislabeled as another respondent.
2. Resolve Taylor through the pending queue and inspect Taylor's Update History.
3. Set Morgan to Reprimand and Jordan to Closed through the available status controls. Cancel a confirmation once before confirming it.
4. Compare Pending Cases, catalog, Dashboard and Reports with all year/date filters cleared. Save checkpoint F.

Expected: checkpoint F is 9 total, 5 Pending, 2 Resolved, 1 Reprimand and 1 Closed. Transitions appear in history once; cancellation changes nothing. Ben is still Resolved despite his sanction wording. Every record contributes to exactly one status bucket.

Evidence: each transition and history, pending queue and checkpoint F totals.

### QA 23 Delete one disposable record

1. On a checkpoint copy, create a separate throwaway incident and record its ID. Open its catalog Delete Record action.
2. Cancel once, then try incorrect confirmation text. Finally enter the exact confirmation shown, including the case ID, and confirm deletion.
3. Inspect the catalog, pending queue and metrics. Restore the checkpoint afterwards.

Expected: Cancel and incorrect text delete nothing. Correct confirmation deletes only the intended record, updates counts and does not damage the linked QA incident. A normal Delete Record is permanent within the product; recovering it requires the backup/restore drill.

Evidence: confirmation, IDs, before/after counts and checkpoint recovery.

## Navigation catalog and pending work

### QA 24 Navigation and appearance

1. Visit Dashboard, Pending Cases, Case Catalog, Reports, Guidance AI and Settings. Collapse and expand the sidebar.
2. Turn Dark Mode on, navigate all screens, then close/reopen and inspect the saved preference. Repeat in light mode.
3. Disconnect internet while WebView2 is installed and reopen the local screens.

Expected: routes open without blank screens or lost saved records. Fonts, logos and icons remain visible offline. Dark/light controls and selected navigation are readable; the preference persists.

Evidence: each route, collapsed sidebar, both themes and offline view.

### QA 25 Search sorting and pagination

1. Search Case Catalog by a known respondent name and by Tardiness. Use a nonexistent term and clear it.
2. Sort by incident date and Date Filed in both directions. Compare with the source ledger.
3. On a separate larger dataset, move between pages including the final page. Change the search or filter while on a later page.

Expected: search matches the labeled fields, no-result state is clear, ordering matches the selected date field, and pagination has no missing/repeated groups or invalid empty later page after filtering. Interpret group-row counts separately from respondent-record totals.

Evidence: searches, sorted IDs/dates and first/final pages.

### QA 26 Status date and year scopes

1. On checkpoint F, apply each status filter and compare with the ledger. In the catalog/dashboard Period selector choose All Records, then calendar-year/month selections, and compare those date scopes with the source ledger. Check the academic-year boundary separately through the exported Year column in QA 16.
2. Select a narrow incident-date range, then reset all filters and compare the restored dataset.
3. On a separate checkpoint, add a record at 23:59 on the final selected day and one on the following day. Use a past date so future-date validation is not involved.

Expected: status/date/year results match the selected scope. The final day's timed record is included and the following day's record excluded. Filtering uses incident date, while Date Filed is a separate sort/export field. Reset returns the original scope.

Evidence: exact filter values, source IDs and filtered rows.

### QA 27 Empty pending queue and empty catalog

1. On a disposable empty database, visit Pending Cases, Case Catalog and Reports.
2. On a checkpoint copy, transition all Pending records to nonpending statuses and inspect the pending queue.
3. Use clear/reset-filter controls and restore checkpoint F.

Expected: empty states explain there are no matching or pending records without inventing errors or hiding navigation. Empty export/report behavior is understandable and never exports a stale previously visible dataset.

Evidence: empty screens and recovery to populated checkpoint.

## Dashboard and analysis

### QA 28 Exclusive dashboard totals

1. On checkpoint F with all filters cleared, compare cards and the resolution chart with the exact checkpoint table.
2. Check that Pending plus Resolved plus Reprimand plus Closed equals Total.
3. Navigate to another page and back, then restart and compare again.

Expected: 9 total, 5 Pending, 2 Resolved, 1 Reprimand and 1 Closed. Reprimand is present in the chart. Saved changes refresh the dashboard without manual file reload and numbers persist.

Evidence: cards, chart, ledger and restart comparison.

### QA 29 Dashboard periods and local dates

1. Record Windows timezone and local date. Exercise available period options and a custom date range.
2. Compare displayed start/end dates and monthly chart points with the filtered source incidents.
3. If practical, repeat near a Manila date boundary without changing the production PC clock. Use a controlled QA environment for any simulated-time test.

Expected: automatic ranges reflect the chosen records and local calendar, without a one-day date shift. Monthly bars and grade charts match incident dates and grade scope. Multi-type category charts may legitimately overlap; status totals must remain exclusive.

Evidence: timezone, exact range, chart values and source comparison.

### QA 30 In depth distribution

1. From Dashboard select In-Depth or a case-type tile. Select available domains/categories, grade filters and date ranges.
2. Search a category, open a matching case from the result list and use Back.
3. Test an empty category/grade combination and pagination on a larger dataset.

Expected: category counts and listed cases match the selected category rules and scope; drilldown opens the intended record. Empty combinations and navigation work. Do not demand that overlapping case-category counts sum to a unique-case total.

Evidence: selected category/grade/range, count, list and opened ID.

## Reports printing and Excel exports

### QA 31 Summary report accuracy

1. On checkpoint F, open Reports and choose All Grades, All statuses and the full incident-date range. Compare total and status counts with the ledger.
2. Select Grade 7, then each status and date filter. Verify Ben's numeric imported grade is included.
3. Choose an empty range and inspect its totals and export behavior.

Expected: all-grade totals match checkpoint F. Grade 7 contains Alice, Ben, Alex and Morgan: total 4, Pending 2, Resolved 1, Reprimand 1 and Closed 0, provided supplemental tests have not changed the main dataset. An empty scope has no stale records or dates from an earlier report.

Evidence: full and Grade 7 reports, filter values and independent counts.

### QA 32 Paper sizes and report signatures

1. Enter Prepared by and Noted by names/titles where provided. Preview A4, Letter, Folio/Long and Legal.
2. Export each supported paper size. Inspect every page for repeated headings, cut-off columns, missing footer text, blank pages and incorrect totals.
3. Reopen the report controls and record which signature settings persist.

Expected: selected paper size and entered signature text appear in the saved PDF with legible margins and no clipping. Any documented persistence is consistent. Record exact page count and size rather than judging only the on-screen preview.

Evidence: four PDFs and page-level inspection notes.

### QA 33 Exact PDF opening and physical printing

1. From Reports choose Open PDF to Print. Locate the saved file in Downloads and inspect it in the system PDF viewer.
2. Use Ctrl+P in that viewer. Select the office printer, matching paper size and one page. Print a real sample.
3. Cancel a second print attempt. Disconnect the printer and record how the viewer reports the failure.

Expected: the exact saved report opens, and the printed page matches the PDF and selected paper. Printing cancellation does not alter records. The Windows PDF association and real printer must work on the office PC; a preview alone is insufficient.

Evidence: saved PDF, viewer/printer settings and inspected printed page.

### QA 34 Dashboard individual and group PDFs

1. Export the Dashboard PDF with a known range and inspect its totals, dates, charts and labels.
2. Use the individual and group PDF/export controls available in case details. Include a case with an image and a group with different respondent sanctions.
3. Compare names, roles, descriptions, history where included, sanctions and images with the saved records.

Expected: each document reflects its displayed scope and current saved data, including Jamie's shared role and Morgan's current sanction. Images remain readable and multi-page output has no clipping or blank export caused by rendering timing.

Evidence: exported files, source-record IDs and page inspection.

### QA 35 Report end date and distinct filing date

1. On a disposable checkpoint, create a past timed incident at 23:59 on a chosen end date, with a different filing date.
2. Set that same date as the final report day. Export and compare the saved incident date and available Date Filed field.
3. Narrow to the preceding day, then restore checkpoint F.

Expected: the timed incident is included on its own day and excluded on the preceding day. Incident date, filing date and academic year are not conflated or shifted by timezone conversion.

Evidence: record dates, filter endpoints and PDFs/Excel values.

### QA 36 Export column controls

1. In Case Catalog choose Export to Excel. Click Default (8), then click the Section checkbox itself off and on.
2. Expect selected counts 8, 7 and 8. Exercise Select All and Clear All; inspect the 18 available fields.
3. Export a selected subset with Section and compare headers and values. Attempt export with no fields selected.

Expected: each click changes a checkbox once. Default has eight required import fields; all supported fields are selectable, including Section. Empty column selection cannot silently produce an unusable spreadsheet.

Evidence: column counts, selection screenshot and exported headers.

### QA 37 Export scopes and default round trip

1. On checkpoint F, export Default (8) for all records and open the result in Excel.
2. Compare respondent records and fields with the ledger. Repeat for grade, status, date and search scopes in the export dialog.
3. Reimport the saved all-record default workbook without changing it. Discard the review afterward.

Expected: default Full Name contains respondents, not shared complainants. Selected scopes match the exported rows. Reimport gives 9 duplicates, 0 issues and 0 ready on the unchanged main dataset, with total still 9. The branded header and incident times parse correctly.

Evidence: each scope, exported workbook, duplicate review and unchanged total.

### QA 38 ZIP export with proofs roles and history

1. Select Attached Proofs and Update History in the export options, plus the participant/role fields needed for review. Export.
2. Extract the ZIP in Windows Explorer. Open the main workbook, attachment files and history files.
3. Locate Alex and the linked incident, then compare exported sanctions, role text, proof count and audit entries with their saved records.

Expected: the ZIP includes the spreadsheet and the selected proof/history content; images open and belong to the correct case. Clear text labels distinguish roles. Excel alone is not a full database backup even when extra columns are selected.

Evidence: ZIP file tree, opened image/history and field comparison.

### QA 39 Repeated exports and canceled dialogs

1. Export the same PDF or workbook twice in quick succession after each completes. Compare their Downloads filenames and contents.
2. Cancel export dialogs and inspect counts/history. Test saving to an unwritable location only on the controlled failure VM in QA 57.

Expected: completed exports get distinct filenames instead of overwriting earlier files. Cancellation changes no case data. Save failure must be visible and must not report a nonexistent file as successfully saved.

Evidence: filenames, file sizes, contents and cancellation/error results.

## Backup restore migration and reset

### QA 40 Manual backup and history ordering

1. On checkpoint F, open Settings, Backup & Recovery and choose Backup Now.
2. Wait for completion, create a second manual backup and compare history order, type, timestamp and nonzero size.
3. Export Database to a separate protected location for recovery testing. Record its baseline count, known case IDs, attachment, PIN custodian and settings.

Expected: backups report completion accurately and the newest snapshot is first across manual, automatic and safety types. A complete database export is usable separately from same-computer backups.

Evidence: backup history and external database file properties/checksum where available.

### QA 41 Automatic backup policy and retention

1. On a disposable checkpoint, enable automatic backups, select On New Record and set retention to 2. Leave the input so the value is saved.
2. Create at least four distinct synthetic records, waiting for each backup to finish. Inspect the resulting automatic backup history.
3. Disable automatic backups and file one more record. Verify no new automatic snapshot is created; a manual backup must still work.
4. Restart and check the saved policy. Restore the checkpoint afterwards.

Expected: On New Record triggers for additions and respects retention. At most the configured number of automatic snapshots remain; manual and safety snapshots are not removed by automatic retention. Disabling the policy stops automatic creation without disabling manual backup.

Evidence: policy before/after restart, record times and backup types/counts.

### QA 42 Daily weekly and monthly schedules

1. Select Daily, Weekly and Monthly in turn, restart and verify the saved setting and the explanation that jobs run while the app is open.
2. For the schedule the office will use, perform a real due-period observation with the app open, then inspect the resulting snapshot and data.
3. Close the app during a due period and check what happens after reopening. Do not expect a closed desktop process to create backups.
4. Ask the maintainer for automated due-date/retention evidence for schedules that cannot elapse within the QA window. Do not change the office clock to speed up tests.

Expected: policy persistence and due-time behavior agree with the backend schedule. Record unobserved weekly/monthly timing as a coverage limitation, supported by engineering test evidence, not a fabricated manual Pass.

Evidence: selected schedule, actual observation timestamps, snapshot and engineering evidence reference.

### QA 43 Valid restore and cancellation

1. On the disposable QA app, create a backup of checkpoint F. Add a uniquely named marker record afterward so the live total becomes 10.
2. Choose Restore for the earlier nine-record snapshot. Cancel using the button, then repeat and cancel with Escape. Check that total stays 10 and focus returns to Restore.
3. Confirm a restore. Wait, sign in with the credentials belonging to the selected backup and compare the recovered database with checkpoint F.
4. Inspect the new safety snapshot, proofs, group roles, sanctions, history, settings and pending-review cleanup.

Expected: cancellation changes nothing. Successful restore first retains an independent safety snapshot of the ten-record live state, then restores the selected nine-record database and requires authentication again. Saved images and linked records recover together. Pending draft/import state from the discarded live database must not silently reapply itself.

Evidence: live marker, cancel count, safety snapshot, sign-in and recovered checkpoint comparison.

### QA 44 Export and import full database

1. Export checkpoint F's database. Prepare a second disposable installation with different QA credentials and one marker record.
2. Import the exported database through Settings, Database Migration, first canceling the selection/confirmation, then proceeding.
3. Sign in with the imported database's PIN, compare the nine records, images, histories, group data and configured settings, then restart.

Expected: cancellation leaves the second database intact. Valid import saves a separate safety snapshot before replacement and restores the complete database rather than just spreadsheet fields. Imported credentials apply; previous credentials must not be assumed. Restart preserves the imported state.

Evidence: both pre-import states, safety backup, imported record comparison and restart.

### QA 45 Invalid replacement and reset

1. On a disposable copy, try importing a maintainer-provided non-SQLite .db file and a corrupted copy of an exported database. Keep a verified recovery copy elsewhere.
2. Confirm the existing cases, sign-in, images and settings still work after each rejection. Test a controlled safety-backup write failure with the maintainer; replacement must not proceed without its safety backup.
3. Open Reset Application Data. Cancel once, try incorrect confirmation text, then enter the required RESET text and confirm on the disposable copy only.
4. Sign in with the retained credentials, inspect empty case/AI screens and retained backups, file one new record, then restore checkpoint F.

Expected: invalid replacement and failed safety backup leave the live database usable. Reset clears case records, proofs, histories, AI conversations/reports, pending import state and obsolete save receipts while retaining configured credentials/settings and existing backups. The UI warns that old backups may still contain prior data. Recovery from the separate checkpoint works.

Evidence: invalid-file errors, unchanged IDs, safety failure, reset confirmation and cleared/recovered data.

## Email recovery

These tests require a maintainer-approved QA Gmail sender, App Password and recovery inbox. Use synthetic data and secrets entered privately. If the office will enable recovery, all applicable tests in this section are required.

### QA 46 Recovery disabled and offline operation

1. On a fresh PIN-only QA installation, inspect Settings, Recovery Email and the visibility control.
2. Sign out and open Forgot PIN. Test Back to sign in without email configured.
3. Disconnect internet and sign in, file/search a synthetic case, generate a local report and create a manual backup.

Expected: recovery clearly shows Not configured rather than a fabricated masked address. Unavailable visibility controls are disabled. Forgot PIN explains the unavailable recovery path and allows returning to sign-in. Ordinary local work remains usable offline on a provisioned PC.

Evidence: disabled recovery state, Back navigation and completed offline tasks.

### QA 47 Configure and verify delivery

1. In Settings, Recovery email delivery, enter the QA Gmail sender, its 16-character App Password, QA recovery address and current QA PIN privately.
2. Test invalid sender/password/current PIN, then correct them. Send test email and verify it arrives at the displayed recovery inbox.
3. Confirm receipt and save. Change an address or password afterward and verify prior receipt confirmation cannot authorize saving untested delivery settings.
4. Restart and perform a fresh recovery-code request.

Expected: failed credentials/settings do not replace a working configuration. Save requires the correct current PIN and successful tested-recipient receipt confirmation for those settings. Delivery goes to the intended inbox, and saved settings persist.

Evidence: sanitized error/success messages and receipt timestamps/recipient; never capture the App Password.

### QA 48 Forgot PIN and successful reset

1. Sign out, choose Forgot PIN and request a code. Check the recovery inbox and enter a wrong code first.
2. Enter the correct code. Try short or mismatched new PINs, then save a valid private six-digit PIN.
3. Confirm the old PIN fails and the new PIN works. Reopen known cases and restart.

Expected: only a valid verified reset permits the PIN change. Invalid new values do not corrupt credentials. Reset does not delete case data; it revokes the previous authenticated session and the new PIN persists.

Evidence: sanitized reset stages, old/new sign-in outcomes and preserved case IDs.

### QA 49 Resend expiry and consumed codes

1. Request a code, wait for the resend control/server interval, then resend and record receipt times. Try the older code and then the newest one.
2. In a fresh attempt, wait more than ten minutes after code issuance before verifying it. Record actual times without changing the clock.
3. Complete a reset and attempt to reuse the consumed code. Also abandon a verified flow using Back or sign-out and try continuing it afterward.

Expected: old, expired, already consumed or revoked authorization does not permit another change. The current usable code and expiry are understandable, Resend and Back allow recovery from a stalled flow, and excessive repeat requests have a clear message.

Evidence: issuance/receipt/attempt times and rejection text with codes concealed.

### QA 50 Recovery address privacy and replacement

1. With recovery enabled, request recovery-email visibility verification in Settings. Try incorrect PIN or verification code, then complete the valid flow.
2. Inspect/edit the recovery address through the verified controls, cancel once, then save an approved QA address.
3. Wait for the access grant to expire or sign out and back in. Request a new verification code and retest access.
4. Confirm future reset codes arrive at the intended address using QA 48.

Expected: verification is purpose-specific and temporary; reset authorization must not unlock unrelated sensitive actions. Cancellation keeps the original address. New access can be requested after expiry, and the current saved address is the actual delivery target.

Evidence: sanitized visibility/edit states, recipient check and expiry/sign-out behavior.

## Guidance AI

AI is optional and requires a maintainer-approved Gemini key. Use synthetic data only; requests can send case context to Google's service. Do not mark AI as passed if the network or provider is unavailable.

### QA 51 No key and failed connection

1. Leave the API key empty and inspect Settings and Guidance AI. Attempt a connection test where enabled.
2. Save an invalid QA key, test connection and record the failure. Disconnect internet and try again.
3. Return to filing, catalog, reports and backups.

Expected: no-key/provider/network failures are explained and do not crash or block ordinary local work. A failed test is not presented as Connected. Invalid values do not leak in screenshots or UI error text.

Evidence: connection states, sanitized errors and successful return to local work.

### QA 52 Valid key and chat guidance

1. Enter the approved QA key privately, save and Test Connection. Restart and retest the saved configuration.
2. Open Guidance AI and ask how to file a case or create a report. Try the App Guide and Manual suggestions and a follow-up question.
3. Submit while a response is busy and inspect available busy/stop controls. Use New Chat afterward.

Expected: a valid provider response appears without duplicate submissions or an unresponsive interface. Advice matches the actual screens. New Chat starts a separate conversation and navigation remains usable. Provider/model availability must be recorded, not assumed.

Evidence: key-free connection state, chat transcript and new session.

### QA 53 AI reports and factual comparison

1. On checkpoint F, choose a Report Template or ask for a report of the selected synthetic cases. Inspect any requested preview before saving.
2. Compare case IDs, dates, grade counts and status totals with the deterministic Reports screen and ledger.
3. Export the AI report PDF and use Open PDF to Print where offered. Inspect every page and the system viewer.

Expected: generated factual claims match stored data and selected scope. Inaccurate claims are reported as defects and corrected before use; a counselor must review AI narrative and recommendations. PDF export/printing uses the saved report and does not alter cases.

Evidence: exact prompt, response, comparison ledger and PDF, all synthetic.

### QA 54 AI history deletion and reset

1. Open History and reload a saved conversation; create a second conversation and restart the app.
2. Delete one conversation, cancel first and then confirm. Verify the other remains and deleted messages cannot be reopened through History.
3. Exercise application reset on the disposable copy through QA 45 and check both AI conversations and generated report state.

Expected: saved history persists across restart, cancellation changes nothing, deletion affects the selected conversation, and application reset clears the related stored AI content. No stale AI report from an earlier database appears after replacement/reset.

Evidence: history list, loaded transcript, deletion result and reset state.

## Usability and failure handling

### QA 55 Keyboard dialogs and image controls

1. Use only Tab, Shift+Tab, Enter and Space to sign in, open filing, navigate required fields, choose roles/status and upload an image.
2. Open Restore, delete and discard dialogs. Verify initial focus, cycle through all controls, then cancel with Escape.
3. After cancel, check focus returns to the triggering control and Tab reaches its next neighbor. Check that background buttons cannot be activated while a modal is open.
4. Inspect visible field labels with Windows accessibility tools if available.

Expected: keyboard users can complete primary tasks, dialog focus stays inside the dialog, Escape cancels the action and focus returns correctly. Fields have useful names rather than unlabeled input positions.

Evidence: keyboard sequence, focus screenshots/video and accessibility labels.

### QA 56 Scaling long text and image validation

1. Test the office resolution and Windows scaling at 100, 125 and 150 percent where available. Inspect all screens in light and dark themes, including the bottom of the filing wizard and report filters.
2. On a checkpoint copy, use realistic long names/descriptions and synthetic names with accents, apostrophes and hyphens. Try required blanks and out-of-range/future dates.
3. Upload valid JPG, PNG, GIF and WEBP images. Try a nonimage, a damaged image and an image over 10 MB; test image preview and removal, canceling any confirmation once.
4. Save a valid case and inspect its history immediately and after restart.

Expected: primary actions remain visible/reachable without clipped dialogs. Valid text is preserved, invalid input has useful feedback, supported images are viewable, oversized/unsupported inputs are rejected, and a corrupt/unreadable image does not become an unusable silent attachment. Saved proof changes appear immediately in history and persist.

Evidence: each scaling/theme, boundary inputs, image outcomes and immediate history.

### QA 57 Controlled read write and connectivity failures

1. Ask the maintainer to prepare a disposable VM with controlled database-read failure, backup-folder write denial and export-save failure. Keep a working recovery snapshot outside the affected paths.
2. Trigger each operation once. Inspect error/Retry controls, disabled exports and metrics, then remove the fault and retry.
3. Test email, AI and update checks with network disconnected, then reconnect.

Expected: failed reads do not masquerade as a healthy empty database; metrics are unavailable and stale exports are prevented. Save/backup failures have actionable feedback, never a false success or partial replacement. Retry recovers without duplicate records. Local work remains available when only an external service is offline.

Evidence: fault setup, exact errors, before/after IDs and recovery. Ordinary testers must not edit Windows permissions or database internals on the office PC.

## In app updates and release pipeline

There is one production updater endpoint in the current app configuration. A production tag automatically publishes a release after the workflow succeeds, making it discoverable by office installations. Do not push a production version tag merely to experiment with QA. The release maintainer owns the controlled update environment described in the appendix.

### QA 58 Prepare and record the older installed state

1. On the separate upgrade QA VM, install the same version currently used by the office; record its actual version rather than assuming it.
2. Create synthetic individual and linked cases, a proof, differing sanctions/statuses and a manual backup. Record case IDs, all fields, totals, history, known PIN custodian and relevant settings. Export the database externally.
3. Save a VM snapshot before the update. Close the app and reopen to prove the baseline data already persists.

Expected: a reproducible older-version installation with a complete before-update ledger and a tested recovery copy. Do not preinstall the new candidate on this VM; doing so would bypass the updater test.

Evidence: old version, baseline ledger, image, backup and snapshot identifier.

### QA 59 Signed update discovery and defer

1. Have the maintainer publish the signed candidate and manifest to the isolated QA endpoint, and supply the older QA build configured to check that endpoint. Record the endpoint channel without tokens.
2. Launch the older app online and inspect automatic update notification. Also use Settings, Check for Updates.
3. Compare the announced target version and notes with the candidate. Choose Remind Me Later, continue ordinary local work, then manually check again.

Expected: the old app discovers the newer version, defer/dismiss does not install it, and manual recheck can show the candidate again. Record versions and channel so a staging result is not confused with production discovery.

Evidence: startup/manual notification, old and target versions, defer behavior and manifest reference.

### QA 60 Download install restart and preservation

1. From the update notification select Install & Restart once. Record download size, progress/busy state and any Windows installer prompt.
2. Allow installation to finish. If Windows closes the app as part of installation, reopen it; if Restart Application Now is shown, use it.
3. Verify Settings shows the new version, then sign in with the existing QA PIN and compare every baseline record, image, linked participant, sanction, status, history and setting.
4. File one new record, reopen a previous record, generate a report and create a backup. Close/reopen again and repeat the comparison.

Expected: the complete small installer is downloaded, not a 200+ MB offline-runtime bundle; the tested candidate is approximately 10.2 MB, with exact size recorded per release. Signature verification succeeds, the update completes without fresh setup, and saved data/PIN remain intact. The old app is replaced by the target version and daily work still functions.

Evidence: download/install steps, version after restart, before/after ledger, image and post-update report/backup.

### QA 61 Offline interrupted and failed update

1. Restore the old-version VM snapshot. Disconnect internet before Check for Updates and inspect its failure, then reconnect and retry.
2. Interrupt the staged download on a disposable VM before installation begins. Reopen the old app, verify its records and retry online.
3. Have the maintainer provide a staging-only missing download URL or incompatible/corrupt artifact and inspect the error. Use a separate snapshot for each case.

Expected: offline/download/install failure is visible and is not called Up to date or successful installation. The existing installation remains usable or recoverable, saved data is unchanged, and a valid retry completes. Do not force-kill a production installer to simulate failure.

Evidence: exact failure stage/message, version, record comparison and successful retry.

### QA 62 Reject invalid signatures and avoid repeat update

1. On the isolated QA channel only, have the maintainer replace the manifest signature with an invalid value or alter the signed artifact. Attempt the update from the old-version snapshot.
2. Confirm it is rejected, then restore the correct manifest/artifact and complete the normal update.
3. On the updated version, Check for Updates against that same target. Restart and repeat.

Expected: tampered or incorrectly signed artifacts never install. Corrected artifacts remain installable through the original trusted key. An equal-version release is not offered repeatedly as a newer update.

Evidence: rejected signature, retained old version, successful corrected version and no-repeat result. Never disable signature checks for this test.

### QA 63 Actual tag pipeline and production update smoke

1. After feature QA and staged update approval, the maintainer confirms the small-packaging correction is merged, all relevant CI checks pass, and app/package/Cargo versions agree. At preparation time this is PR 57; check its current status before release.
2. In the authorized release window, push one unique version tag from the approved source commit. For this candidate the intended version is v0.1.11; if already used, stop and have the maintainer choose/update a new version consistently. Do not move an existing release tag.
3. Watch the Release workflow. Verify its tests pass and the release is published, with a small x64 setup executable, its signature and latest.json. Compare manifest version, Windows platform entry, URL, signature and downloaded asset size.
4. On a backed-up QA PC still using the older production build, use the production updater and repeat QA 59 and QA 60. This proves the actual endpoint, published files and existing installed build work together.
5. Record final smoke evidence before permitting the live office PC to update. The production release may already be discoverable by other installations once published; schedule this step with the release owner.

Expected: a tag triggers the existing automatic publishing pipeline, the actual old app finds the new release, its trusted signature verifies, installation/restart preserves the baseline data, and subsequent checks show no newer update. CI/manual installation alone is not the evidence for this test.

Evidence: approved commit/tag, workflow URL, release URL, manifest/asset properties and complete production-channel upgrade record.

## Daily office rehearsal and sign off

### QA 64 Unassisted counselor walkthrough

1. Ask a guidance staff member who did not develop the app to sign in and locate a known student case without coaching.
2. Have them file one individual case with an image and one linked incident, edit an existing record, add a respondent and resolve a pending case.
3. Ask them to generate a grade/date report, export a filtered workbook, open/print a PDF and make a manual backup.
4. Observe navigation, terminology, missed validation, hesitation, error recovery and time needed per task. Record where help was required.

Expected: staff can complete the daily tasks accurately using the interface and guide. Difficult labels, inaccessible controls and repeated coaching are usability findings even when the backend saves correctly. QA should not sign off only from a developer-led demonstration.

Evidence: task times, unassisted completion, help points and staff feedback.

### QA 65 Two session and due backup rehearsal

1. On the QA office configuration, record the morning baseline, perform routine work for a representative session and compare a written ledger at lunch.
2. Close the app and restart the PC. Reopen, verify the latest saved edits/proofs/statuses and complete an afternoon session.
3. Leave the selected schedule running during a real due period and verify the next backup is recoverable. Record what is covered by observation and what relies on automated schedule tests.
4. Export an end-of-session database to separate protected storage and complete one restore drill on a disposable installation.

Expected: no gradual freezes, stale totals, missing attachments or lost last edits; saved data survives PC restart. The backup used for recovery really contains the expected latest committed state. Record observed session length and any interruptions.

Evidence: session ledger, morning/lunch/end counts, restart comparison, due backup and restore result.

### QA 66 Office acceptance and release decision

1. Review every result and defect. Count Pass, Fail, Blocked and Not applicable; resolve/retest every release-blocking defect.
2. Confirm actual Windows PC/scaling, approved workbook reconciliation, actual printer output, separate backup recovery and current-version signed update evidence.
3. If recovery email or AI will be enabled, require their tests to pass with the approved services; otherwise record them as disabled and the operational fallback.
4. Have the QA lead, release maintainer and guidance-office representative record the approved version/build, acceptance date, known limitations and owner of the PIN and backup routine.

Expected: release approval has traceable evidence rather than an assumption that all screens opening means all workflows work. No missing mandatory result, unresolved data loss, incorrect counts, broken update, failed recovery or unusable daily task is accepted. Optional disabled features are not represented as tested successes.

Evidence: signed result summary, retest references, approved artifact checksum and rollout decision.

## Release maintainer appendix

### Rehearse updates without publishing to the office

The normal release.yml runs on v-prefixed tags and publishes automatically. The current application has no built-in staging-channel selector. A draft release with no reachable update manifest does not make the existing installed app discover a candidate.

Prepare an isolated HTTPS manifest endpoint and signed Windows installers under maintainer control. Use a disposable VM, the same app identifier within that VM, the same trusted updater public key, and a QA-only endpoint override for BOTH the older baseline build and the target build. Keep the real production configuration and production signing key access controlled. Do not hand the private signing key to ordinary QA testers.

A QA-only Tauri config override has the following structure. Replace the placeholder with the real controlled HTTPS endpoint; the placeholder itself is not a working service.

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://YOUR_CONTROLLED_QA_HOST/latest.json"]
    }
  }
}
```

On Windows build the old source version and target source version in separate checkouts using `npm ci`, then `npm run tauri build -- --config PATH_TO_QA_OVERRIDE.json`. Each checkout must retain its own intended version. Supply signing credentials through the approved maintainer build environment. The candidate acceptance installer in this kit cannot substitute for the signed updater build.

Host the target setup executable and its generated signature securely. Create a manifest with the target version and a windows-x86_64 entry whose URL points to that executable and whose signature is the exact contents of the generated .sig file. Use the existing updater public key; a new key will not be trusted by older installed builds. Keep the old target and bad-signature variants accessible only through the QA endpoint when exercising QA 61 and QA 62.

If the maintainer cannot provide that staging setup, mark the prepublication signed-update rehearsal Blocked. Feature tests can still run. An approved production release followed by QA 63 is the available actual-channel proof; document that it happens after publication and may notify live installations. Do not silently count manual installer testing as signed-update testing.

Reference: https://v2.tauri.app/plugin/updater/ describes signed installer artifacts, manifests, endpoint configuration and update installation. https://v2.tauri.app/distribute/windows-installer/ describes the small downloadBootstrapper packaging and its WebView2 prerequisite behavior.

### Production tag checklist

Before pushing a tag, confirm the approved source is on the release branch, PR 57 or its successor is merged, version 0.1.11 is consistent across package.json and the Tauri/Cargo configuration, and the tag does not already exist. Confirm existing TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD secrets remain available and the updater public key still matches the deployed app. Review the workflow's releaseDraft false setting, the small downloadBootstrapper mode and the unchanged production endpoint.

The release owner performs the tag/push only after approval. If the workflow fails or latest.json is absent, stop rollout and fix the cause. Do not bypass tests or signature verification. After success, compare the published Windows artifact with the candidate size; small variations are possible, but another 200+ MB runtime bundle is a packaging failure to investigate.

On a clean maintainer checkout, inspect the approved source and tag availability first. These commands do not publish an update:

```text
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
git ls-remote --tags origin refs/tags/v0.1.11
```

Proceed only if the working tree is clean, the printed commit is the approved release source, the small-packaging correction is merged, all version files say 0.1.11, the remote tag check returns no existing tag, and the release owner has approved publication. The following commands DO publish through the automatic workflow:

```text
git tag -a v0.1.11 -m "Guidance Office 0.1.11"
git push origin v0.1.11
```

Then follow QA 63 in GitHub Actions and the backed-up older QA installation. If 0.1.11 has already been released, the maintainer must choose and consistently configure another version before using any corresponding tag commands.

### Defect report and retest rules

Use the accompanying QA_RESULTS.md for execution results. Each defect should include test ID, app version/build, Windows version/scaling, fixture or synthetic case ID, precise reproduction steps, expected result, actual result, frequency, severity and sanitized screenshots/video. Link the GitHub issue if one is filed.

Blocker means data loss/corruption, broken authentication, failed signed update, failed backup/restore or a daily workflow that cannot complete. Major means incorrect reports, duplicate/partial records, missing proofs/roles/sanctions or misleading success/errors. Minor means a nonblocking visual/wording issue. A usability issue can be a blocker if staff cannot complete a required task.

After a fix, retest the failed steps and adjacent workflow using a fresh checkpoint. Keep the original failure evidence and link the retest build. Do not change a Fail to Pass without new evidence. The guide supports release decisions; it does not guarantee every possible future bug has been eliminated.
