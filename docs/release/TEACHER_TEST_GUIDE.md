# Guidance Office App Teacher Walkthrough

Version 0.1.11 | Practice records only

## Getting started

Please try these tasks as if you were working in the guidance office. Use only the fictional students provided. Follow tasks 1 to 20 in order and mark each one on the Results Form. You may take breaks between pages.

Use a separate Windows test PC. If this app already contains real school records, stop and ask the organizer for a test computer. You do not need programming knowledge or Microsoft Excel to import the supplied files.

When something goes wrong, note the task number, what you clicked, and what happened. Take a screenshot if you can. If the instructions are confusing, record that too. If a task fails, later student totals may differ; do not try to fix the numbers yourself.

### 1 Install and open the app

1. Right-click the downloaded ZIP file and choose Extract All. Open the extracted folder, then open Install.
2. Double-click the setup file. Follow the installer and open Laguna College Guidance Office Information System. Keep internet on during installation; Windows may need to download a required component.
3. If Windows blocks the installer, ask the organizer for help. If the app asks about an update during this first walkthrough, choose Remind Me Later.

**What should happen:** The app opens. On a fresh PC it shows First Launch Setup. Settings shows version 0.1.11 once you sign in.

### 2 Set up your PIN and sign in

1. Create your own six-digit practice PIN and enter it again. Leave optional email recovery unchecked for now. Finish setup and sign in.
2. Check that Dashboard has zero cases. Close the app, reopen it, try an incorrect PIN once, then sign in with the correct PIN.
3. In Settings, choose Change PIN. Enter your current PIN and a different six-digit PIN twice, then Save New PIN. Close and reopen the app. Try the old PIN once, then the new PIN. Keep the new PIN privately.

**What should happen:** An incorrect or old PIN is refused. The new PIN works, setup does not repeat, and there are still zero cases. Do not put your PIN on the results form.

## Import the ready made Excel files

The files are in Excel_Files. Choose them from inside the app; you do not need to open or change them in Excel. To start each import, open Case Catalog, click Import Excel, and choose the file.

### 3 Import the first six students

1. Choose 01_Start_Here.xlsx. Expect Ready to Import 6, Issues 0, and Duplicates 0.
2. Click Import All Ready Rows. Finish the success screen, then open Dashboard and select Period > All Records.

**What should happen:** Total 6: Pending 2, Resolved 2, Reprimand 1, Closed 1. In Case Catalog, open Ana Sample and Ben Sample. Their dates are 1 and 2 September 2026. Both are Grade 7. Ben is Resolved even though his sanction says Written Reprimand.

### 4 Import two more students

1. Import 02_Add_Two_Students.xlsx. Expect 2 ready and no issues or duplicates. Import and finish.
2. Open Grace Sample and Hugo Sample in Case Catalog.

**What should happen:** There are 8 cases. Grace and Hugo are separate incidents, even though their date and case type match. Dashboard shows Pending 4, Resolved 2, Reprimand 1, Closed 1.

### 5 Check that duplicates are caught

1. Choose 03_Check_Duplicates.xlsx. Expect Duplicates 6 and Ready to Import 0.
2. Open a duplicate to see which saved case it matches. Click Discard Session and confirm.

**What should happen:** The six students are not imported again. Dashboard stays at 8 cases.

### 6 See and correct an import mistake

1. Choose 04_Practice_Corrections.xlsx. It deliberately contains an impossible date, a missing name, and an unsupported status. Expect Issues 3 and Ready to Import 0.
2. Go to Dashboard, keeping the pending import if asked. Use Pending Imports to return. Click Fix Issues on the invalid-date row, type 10/03/2026 in its Date field, and save the correction.
3. Expect 1 ready row and 2 remaining issues. Do not import this file. Click Discard Session and confirm.

**What should happen:** Each problem is explained, the review can be resumed, and the corrected row becomes ready. Discarding leaves the saved total at 8.

## Find students and check the totals

### 7 Import students from one shared incident

1. Import 05_Linked_Students.xlsx. Expect 2 ready rows and no issues or duplicates. Import them and finish.
2. Open the linked entry for Iris Sample and Jasper Sample. Look at the group and each student's details.

**What should happen:** Iris is Grade 7 with Warning; Jasper is Grade 8 with Counseling. They belong to one incident, with two student case records. Total 10: Pending 6, Resolved 2, Reprimand 1, Closed 1. A group can occupy one catalog row while counting as two cases.

### 8 Search and use the filters

1. In Case Catalog, search Ana, clear the search, then search Tardiness. Try No Such Student and clear it.
2. Try the Pending and Resolved filters, then select All Statuses. Open Period and choose September 2026, then Done. Change the date sorting in both directions.
3. Clear the search and status/date filters; set Period to All Records.

**What should happen:** Ana's search opens the right student. The nonexistent name shows no matches. The September range contains the original six cases. Clearing filters brings back all 10; names and dates are readable.

### 9 Compare Dashboard and Reports

1. On Dashboard with All Records selected, check Total 10, Pending 6, Resolved 2, Reprimand 1, Closed 1. Open In-Depth or a case-type tile, choose a category, and open a listed case. Return to Dashboard.
2. Open Reports. Choose All Year Levels, all statuses, and clear the date range. Compare the report with Dashboard.
3. Choose Specific Grade > Grade 7. Then return to All Year Levels.

**What should happen:** The all-grade report agrees with Dashboard. Grade 7 has 3 cases: Ana and Iris Pending, Ben Resolved. Charts and case lists open correctly. If the report offers content checkboxes, turn on the totals or case list needed to see these values.

Before continuing, write the total of 10 on your results form. This is the reference point for the next tasks.

## File and edit everyday cases

Respondent means the student whose case is being recorded. A Complainant / Subject is another person involved in the same incident. Use the names below so everyone tests the same situation.

### 10 File one new case

1. Click File New Case. Try Continue without choosing a type; then select Tardiness.
2. Enter last name Practice, first name Lea, Grade 7, adviser Test Teacher, role Respondent, status Pending, and sanction Verbal Warning.
3. Continue to Proofs and Description. Add practice_note.png from Sample_Pictures and enter Teacher practice case. On Review, choose Edit fields, set Date of Incident to 4 October 2026, then Done. Check the details and click File case once.

**What should happen:** Required fields are explained. Lea is saved once, the date is correct, the picture opens, and the total becomes 11.

### 11 Edit details and change an attachment

1. Open Lea Practice, click Edit, change adviser to Practice Adviser and sanction to Counseling Follow-up. Add practice_photo.jpg.
2. Remove practice_note.png, confirming only that attachment's removal. Save and reopen the case. Open the remaining picture and look at Update History.
3. Edit the description again, then Cancel instead of saving.

**What should happen:** Saved changes and the JPG remain. The removed PNG is gone. History has a readable date and change. Cancel leaves the previous saved description unchanged. Total remains 11.

### 12 File a case involving several students

1. File a new Bullying case. Enter Marco Practice, Grade 7, Respondent, Warning. Use Add another student for Nina Practice, Grade 8, Respondent, Counseling, and Owen Practice, Grade 7, Complainant / Subject. Use adviser Test Teacher and Pending status.
2. On the next screen enter Case Title Practice Group and description Group practice case. In Review, use Edit fields to set 5 October 2026 as the incident date. Check the names and roles, then File case.

**What should happen:** Practice Group has two respondents and one shared complainant. Marco and Nina add two case records. Owen does not add a third. Total becomes 13.

### 13 Update the group and add a student

1. Open Practice Group and Edit. Change Owen's first name to Owen Updated and change the description to Group follow-up completed. Save.
2. Choose Add Student and add Paolo Practice, Grade 9, Respondent, Warning, Pending, adviser Test Teacher. Save and reopen the group and respondent details.

**What should happen:** There are three respondents and one Owen Updated. Shared notes appear consistently, the original students remain, and Paolo adds exactly one case. Total becomes 14.

## Follow up and produce office documents

### 14 Update pending cases and their status

1. Open Pending Cases and find Lea Practice. Use the resolve action and confirm it.
2. Open Marco Practice's individual details, Edit, choose Reprimand, and Save. Set Nina Practice to Closed in the same way.
3. Reopen the group, Pending Cases, Dashboard, and Reports. Clear date/status filters and use All Records or All Year Levels.

**What should happen:** Lea, Marco, and Nina leave the pending queue. Their new statuses and history are correct. Total 14: Pending 7, Resolved 3, Reprimand 2, Closed 2.

### 15 Save and print a summary report

1. In Reports select All Year Levels and all statuses, with no date restriction. Add your practice name under Prepared by and Test Principal under Noted by.
2. Try A4 and Letter paper sizes in the preview. Choose the one used by your school, click Export PDF, and open the saved file.
3. Click Open PDF to Print and press Ctrl+P in the PDF viewer. Print one page if a printer is available; otherwise cancel printing and mark that part Not tried.

**What should happen:** The PDF opens with the right names, dates, and totals from task 14. Every page is readable without cut-off text. Print preview works; an available printer produces a readable page.

### 16 Save an individual case and a group report

1. Open Lea Practice and click Export PDF. Open the saved PDF and compare her details, status, sanction, and attachment.
2. Open Practice Group and use its Export PDF action. Compare Marco, Nina, Paolo, and Owen Updated with the screen.

**What should happen:** Both files open and contain the correct students and roles. Sanctions match the screen, the group does not repeat Owen, and images and page endings are readable.

### 17 Export records back to Excel

1. In Case Catalog clear all filters and choose Export to Excel. Untick Section once, then tick it again. Leave the eight default columns selected and export.
2. Open the saved spreadsheet if Excel or another spreadsheet viewer is available. Otherwise ask the organizer to check the file. Verify the names, dates, statuses, and eight headings.
3. Choose Import Excel with this exported file. Expect 14 duplicates, no issues, and none ready. Discard Session. Export once more with Attached Proofs and Update History selected. Extract that ZIP and open the spreadsheet and Lea's picture.

**What should happen:** Each checkbox click changes its selection once. Both exports save successfully; the default export can be reviewed without creating new cases. The ZIP includes usable attachment and history files. Total stays 14.

## Protect records and finish the daily routine

These tasks use only your practice records. Restore returns the app to an earlier saved copy. Do not perform them on a computer holding real school records.

### 18 Make a backup and recover your work

1. In Settings open Backup & Recovery. Turn automatic backups on, select Weekly and keep 7, then select Daily. Click outside the retention box if needed to save. Click Backup Now. Write down the newest Manual backup's filename and time on the Results Form.
2. File a temporary Pending Tardiness case for Backup Marker, Grade 7, adviser Test Teacher, sanction Warning, description Temporary backup check. The total should become 15.
3. Return to Backup & Recovery and choose Restore beside the Manual backup you wrote down. Cancel once and check Backup Marker remains. Then restore that same backup using Proceed & Restore.
4. Reopen Lea, Practice Group, and Lea's picture. Close and reopen the app, then inspect the backup settings.

**What should happen:** The manual backup is listed. Cancel changes nothing. Restore removes Backup Marker and returns to 14 cases, with saved edits and pictures intact. Daily and keep 7 remain selected.

### 19 Cancel and confirm deletion of a practice case

1. File a separate Pending Tardiness case for Delete Marker, Grade 7, adviser Test Teacher, sanction Warning. Total becomes 15.
2. Use Delete Record only on Delete Marker. Cancel once and check it remains. Reopen Delete Record, enter the exact confirmation text shown, including its case number, and confirm.

**What should happen:** Cancel preserves the case. Confirm removes only Delete Marker, bringing the total back to 14. Lea and Practice Group remain. If you select the wrong student, cancel.

### 20 Try a normal end of day and reopening

1. Visit Dashboard, Pending Cases, Case Catalog, Reports, Guidance AI, and Settings. Collapse and expand the sidebar. Try Dark Mode, switch pages, and reopen the app to check the saved appearance. Try a smaller window and use Tab to move between controls.
2. Disconnect Wi-Fi briefly. Search for Lea and open a saved case and its picture. Reconnect afterwards. Do not request AI, email, or updates during the offline check.
3. Close and reopen the app again. Sign in and check Lea and Practice Group. On Dashboard select All Records.

**What should happen:** Screens, text, and buttons are usable. Local records and pictures work offline. Saved work survives reopening. Total is still 14, with Pending 7, Resolved 3, Reprimand 2, Closed 2.

The main walkthrough is complete. Fill in the Results Form. Tell us which task was difficult, even if it eventually worked.

## Optional checks arranged by the organizer

Mark these Not tried unless the organizer supplies the required setup. A missing published update, email account, AI setup, spreadsheet viewer, or printer is not proof that the feature passed.

### 21 Receive an update through the app

1. When the organizer says a test update is available, use the older version they provide on a separate test PC. Add practice records and a picture, make a backup, and note its version and case total.
2. Connect to the internet and choose Settings > Check for Updates. First choose Remind Me Later if offered and check your work remains. Check again, choose Install & Restart, and wait.
3. Sign in after restarting. Check the new version, saved records, group, picture, and PIN. Check for updates once more.

**What should happen:** The new version installs, saved work remains, and the same update is not offered again. If no update has been published, record No update available and mark Not tried. Installing the setup file manually does not complete this task.

### 22 Recover a forgotten PIN by email

1. Ask the organizer to configure practice recovery email delivery. Use Send test email, confirm the message arrives, and let the organizer finish saving the settings.
2. Close and reopen the app. Choose Forgot PIN, request a code, and enter the code received in that practice inbox. Set a new six-digit PIN and sign in.
3. Check your cases remain. In Settings, try viewing or editing the recovery address using the requested verification code, then cancel the edit.

**What should happen:** Messages arrive, the code enables a new PIN, and saved records remain. Codes, PINs, and email passwords do not go on the Results Form.

### 23 Use Guidance AI with practice data

1. Ask the organizer to configure Guidance AI for this test PC. Open Guidance AI and ask: How can I support a student who is often late to class?
2. Try its available case or report analysis using only the fictional records. Start another conversation, then return to the first. If file export is offered, save and open it.

**What should happen:** The app responds or explains an unavailable service clearly. Conversations reopen and exported files open. Review whether the wording is useful; an AI reply alone does not prove its advice is correct.

Return the Results Form and any problem screenshots to the organizer. Include the version shown in Settings. Tell us whether you would feel comfortable using the app each day and what would make it easier.
