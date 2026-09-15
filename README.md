# Observations

A small classroom observation notebook for early-years teachers. Tap one student, choose a subject or topic, and write down what happened. Notes are timestamped automatically and kept in the teacher's own Google Sheet.

The app has three screens:

- **Today** shows the class list and who already has a note today. Tapping a student opens a note locked to that student.
- **All notes** filters by student, subject, or search term and groups a student's notes by subject for report-card writing.
- **Subjects** adds, renames, or removes the topics available in the note editor. Removing a topic does not rewrite historical notes.

Each note belongs to exactly one student and records `Date & time | Student | Subject | Note`. The current date and time are selected automatically but can be changed before saving.

Unfinished notes are saved on the device per student. Closing the composer keeps the draft, the student's card shows **Draft waiting**, and opening that student again restores it. **Clear** explicitly discards it; saving the note removes the local draft.

## Local setup

Requires Node.js 20.19+ or 22.12+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

The usual app origin is `http://localhost:5173`. Configure:

- `VITE_AUTH_BROKER_URL`: auth broker URL; defaults to `https://auth.teacher.dev`.
- `VITE_GOOGLE_TEMPLATE_ID`: spreadsheet ID from the new three-tab observation template.

## Local click-through without Google

```env
VITE_AUTH_BROKER_URL=http://localhost:8787
VITE_FAKE_GOOGLE=true
```

```sh
npm run mock-broker
npm run dev
```

The fake notebook includes sample kindergarten observations. Add `?emptyRoster` to the app URL to test first-time class-list entry. The mock broker control panel is at `http://localhost:8787/`.

## Create the spreadsheet template

`CreateTemplate.gs` builds the required template:

1. Create a standalone project at [script.google.com](https://script.google.com).
2. Replace `Code.gs` with `CreateTemplate.gs`.
3. Run `createObservationTemplate`.
4. Approve Google Sheets access and open the spreadsheet URL in the execution log.
5. Share the file view-only with copying enabled.
6. Put its spreadsheet ID in `VITE_GOOGLE_TEMPLATE_ID`.

The template contains only three tabs:

### Class Roster

```text
Name | Initials
```

Initials are optional; the app derives them when blank.

### Subjects

```text
Subject | Emoji
```

The template begins with seven kindergarten-friendly topics. Teachers can manage them in the app or directly in this tab.

### Notes

```text
Date & time | Student | Subject | Note
```

Date and time are stored as the literal local value `yyyy-mm-dd hh:mm`, so the time remains easy to read and sort in Sheets.

## Commands

```sh
npm run dev
npm run mock-broker
npm run check
npm run build
```

## Privacy

Sign-in and Drive authorization go through the auth broker. The broker stores the Google refresh token and returns short-lived access tokens; it never sees spreadsheet content. The browser talks directly to Google Sheets. The selected spreadsheet ID and unfinished drafts are remembered locally; drafts are removed when saved, cleared, or signed out.

Writes are serialized across tabs in the same browser. Google Sheets does not provide a cross-device conditional write for this use case, so the app assumes one teacher is actively editing a notebook from one device at a time.
