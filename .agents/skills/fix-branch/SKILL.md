---
name: fix-branch
description: "Automatically create a new git bugfix branch with proper naming convention from a raw client bug report or message."
---

# Fix Branch Skill

Use this skill when the user provides a raw client bug report, email, message, or informal ticket description and wants to automatically create and check out a properly named git branch for the fix.

## 1. Parse & Distill the Client Report

Extract the essential context from the user's raw message:
- **Feature / Area**: Identify the primary UI component, page, or system affected (e.g., `dashboard`, `pdf-report`, `ai-categorization`, `case-catalog`, `history-drawer`).
- **Symptom / Defect**: Identify what is failing or misbehaving (e.g., `date-format`, `responsive-layout`, `crash-on-empty`, `duplicate-entry`, `export-error`).
- Strip out client chatter, pleasantries, email headers, and timestamps.

## 2. Generate Branch Name

Generate a branch name adhering strictly to this repository's established convention:
- **Prefix**: `fix/`
- **Pattern**: `fix/<feature-or-component>-<symptom-or-action>`
- **Formatting Rules**:
  - Lowercase alphanumeric characters and hyphens only (`[a-z0-9-]`).
  - Keep between 3 to 6 words for clean readability.
  - No consecutive hyphens, leading/trailing hyphens.
  - Clear and descriptive (matching past repo branches like `fix/dashboard-responsive-ai-categorization`, `fix/ai-response-format-and-date`).

*Examples:*
- Raw message: *"Hi team, when users download the case report PDF, the date timestamp is showing in UTC instead of local and cutting off the header"*
  -> `fix/pdf-report-date-format-header`
- Raw message: *"Dashboard stats cards are wrapping weirdly and overlapping on smaller screens"*
  -> `fix/dashboard-stat-card-responsive`
- Raw message: *"Client reported that clicking categorization on a case with empty notes throws an unhandled error"*
  -> `fix/ai-categorization-empty-notes-error`

## 3. Sync Repository & Create Branch

Execute the following git workflow:

1. **Check Status**:
   Run `git status --porcelain`.
   - If working tree is dirty, notify the user with the modified files and ask whether to stash (`git stash`) or commit before proceeding. Do NOT overwrite or discard uncommitted changes.

2. **Sync Base Branch**:
   - Target base branch is `main` (unless `development` or another branch is explicitly requested).
   - Switch to base: `git checkout main`
   - Pull latest: `git pull origin main`

3. **Create & Switch**:
   - Create and checkout the new branch:
     `git checkout -b fix/<generated-slug>`
   - Confirm branch creation.

## 4. Deliver Confirmation & Ticket Summary

After checking out the branch, present a clear, structured response:

- **Branch Created**: `fix/<generated-slug>` (current branch)
- **Base Branch**: `main` (synced with remote)
- **Ticket Breakdown**:
  - **Issue**: Short description of the client's problem.
  - **Likely Affected Areas**: Estimated files/directories in the codebase.
  - **Expected Outcome**: Clear definition of done for the bugfix.
- Offer to begin diagnosis or implementation (e.g., `/diagnosing-bugs` or `/tdd`).
