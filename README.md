# Observations

A small classroom observation notebook for early-years teachers. Tap one student, choose a category, and write down what happened. Notes are timestamped automatically and kept entirely on the teacher's device: there is no account, no server, and nothing leaves the browser.

The app has three screens:

- **Today** shows the class list and who already has a note today. Tapping a student opens a note locked to that student.
- **All notes** filters by student, category, or search term and groups a student's notes by category for report-card writing.
- **Categories** adds, renames, or removes the categories available in the note editor. Removing a category does not rewrite historical notes.

Each note belongs to exactly one student and records a date and time, student, category, and text. The current date and time are selected automatically but can be changed before saving.

Unfinished notes are saved per student. Closing the composer keeps the draft, the student's card shows **Draft waiting**, and opening that student again restores it. **Clear** explicitly discards it; saving the note removes the draft.

## First run

The only setup is **Add your roster**: paste one name per line (an optional class name can be set too) and start taking notes. More students can be added later from the Today screen. **Switch class** in the header lists every class on this device, starts a new one, or deletes the current one.

## Storage

Everything lives in the browser's `localStorage` under `observations-local.*`:

- `notebooks`: the list of classes (id and title).
- `current`: the class that opens on launch.
- `notebook:<id>`: one class, with its students, categories, and notes.
- `draft:<id>:<student>`: an unfinished note.

Clearing site data for the app's origin removes every class and note, so this is a single-device notebook.

## Local setup

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

`VITE_CF_BEACON_TOKEN` (optional) is the Cloudflare Web Analytics token. Set it for the Production environment in Vercel and redeploy; when unset, the beacon script is not loaded. The previous name, `VITE_CF_BEACON`, still works.

## Commands

```sh
npm run dev
npm run check
npm run build
```
