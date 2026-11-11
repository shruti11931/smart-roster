# Smart Roster Management System

Monthly roster generator with coverage validation, conflict detection and backup suggestions.
React + Vite + TypeScript, Supabase (PostgreSQL), scheduling engine in pure TypeScript.

> Status: complete. Everything in the assignment brief is built, plus all ten optional features (see the table below).

**Live app:** _add your Vercel URL here_  |  **Demo video:** _add link_

## Setup
```bash
npm install
cp .env.example .env        # Supabase values are optional: without them the app runs on built-in sample data
npm run dev                 # http://localhost:5173
npm test                    # unit tests for the engine, validation, change handling and plan comparison
npm run build               # type-check + production build
npm run seed:sql            # regenerate supabase/seed.sql from src/data/seed.ts
```

### Supabase (shared database, optional)
1. Create a project, open the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
2. Put the project URL and anon key in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. The sidebar pill then reads "Supabase connected". People, brands, processes, staffing, holidays and leaves load from and save to the database. If the database is unreachable the app keeps working from browser storage and the pill says so. The roster itself is rebuilt from that configuration; manual cell edits stay in the browser.
4. The demo database policy is open read/write so the app works without logins. Tighten the row-level security policies before any real use.

### AI explanations (optional)
The Explain button always works with a built-in explanation. To have Claude write it instead:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy explain-conflict --no-verify-jwt
```
The key stays on the server. The function is given only the detected facts and told not to invent anything. If it fails or times out the built-in explanation is shown, and each explanation is labelled with which one you are reading.

### Deploy to Vercel
Import the GitHub repo, framework preset Vite, add the `VITE_` variables, deploy. No router, so no rewrite rules are needed.

### n8n notifications (optional)
Create a Webhook node, copy its production URL into `VITE_N8N_WEBHOOK_URL`, and enable CORS on that node. Editing a published roster then posts `{event, at, month, summary, errors}`; connect it to Slack or email in n8n.

## Requirements checklist
| Brief | Where |
|---|---|
| 30+ employees, pods, pod leads, brands, processes, shared and multi-process staffing | `src/data/seed.ts`: 34 people, 4 pods, 24 brands (19 single-resource), 42 processes |
| Add, edit, remove assignments without code changes | Setup page, everything re-checks at once |
| Working-day rules, minimum staff, day-specific minimums | Setup > Brands and processes > Rules |
| Brand calendar kept apart from employee schedule | `calendar.ts` decides required days; the roster grid holds each person's own days |
| Weekly offs, holidays, leaves, comp-offs, preferences | Generation engine + Setup |
| Monthly roster for any month | Month picker on Dashboard |
| Five views | Roster page: company, pod, brand, process, employee |
| Conflict detection before publishing | Conflicts page; publishing is blocked while errors exist |
| Manual edits validated | Click any roster cell: impact is shown and the edit is locked |
| Handling changes | Conflicts > Simulate a change: shows the gap, ranks covers, re-solves only the affected week |

| Optional feature | Status |
|---|---|
| Fair distribution of weekly offs | Done: Fairness first plan, fairness score, uneven-offs warning |
| Preference-based scheduling | Done: preferred off days, Preference first plan, warning when coverage wins |
| Automatic regeneration after leave changes | Done: leave, comp-off, holiday and setup changes re-check at once; the leave flow re-solves one week |
| Backup resource recommendations | Done: ranked covers with "Use ..." buttons |
| Comparison of alternative plans | Done: Compare page, four plans side by side |
| Approval workflow | Done: per-pod approval, publish gate. Roles are a switcher (operations manager or one pod's lead), not real accounts |
| Notifications when a published roster changes | Done through an n8n webhook when `VITE_N8N_WEBHOOK_URL` is set; otherwise an on-screen notice only |
| Export to CSV, Excel, Google Sheets | CSV and real .xlsx. Google Sheets: File > Import the downloaded file |
| AI explanations of conflicts | Done through a Supabase Edge Function calling Claude, with a built-in fallback |
| Add brands, pods, processes dynamically | Done in Setup |

## Structure
- `src/engine/` — pure TypeScript: calendars, coverage, generate, validate, suggest, resolve, fairness. No React or Supabase imports.
- `src/store.ts` — Zustand store (config, roster, strategy), persisted in localStorage; Holidays/Leaves changes regenerate the roster.
- `src/lib/analysis.ts` — turns config + roster into issues, per-day coverage, stats and CSV exports.
- `src/pages/` — Dashboard, Roster (company / pod / brand / process / employee views), Conflicts, Compare, Setup.
- `src/lib/` — analysis, plan comparison, Excel export, explanations, Supabase client, repository and sync, n8n notify.
- `src/components/` — `Grid` (colour-coded roster table with coverage rows), `IssueList`.
- `src/data/seed.ts` — sample data (single source of truth for both the app and `seed.sql`).
- `supabase/` — schema and seed.

## Sample-data assumptions
- 34 employees in 4 pods; 24 brands, 19 single-resource (79%); 42 processes; month = Nov 2026.
- Holiday dates are indicative sample data, not an official calendar.
- A holiday that falls on a Sunday is absorbed by the Sunday weekly off.
- A leave or comp-off day inside a Mon-Sun week counts as that week's rest day.
- Weeks with fewer than 4 days in the month (month edges) need no weekly off.
- One weekly off per Mon-Sun week implies at most 12 working days between rests; `maxConsecutive` is per employee.
- Backups cover one brand per day. A trained backup only counts when primaries fall short.
- Two conflicts are planted on purpose (Zest on Sun 15 Nov, Zenith on Sat 21 Nov). Live-demo change: `DEMO_LEAVE` in `seed.ts`.

## How to demo the change flow
1. Conflicts > Simulate a change > Load demo (Pixel Wear's only agent, no backup) > Show the gap: 4 new errors appear, each with ranked covers.
2. Click a cover under an error: that gap clears and the toast says so.
3. Dashboard > approve each pod > Publish is blocked until errors reach 0.
4. After publishing, any edit moves the roster back to draft and calls the n8n webhook (if `VITE_N8N_WEBHOOK_URL` is set; enable CORS on the n8n Webhook node).

## Months, rules and overlap checks
- **Month picker** (Dashboard): any month can be planned. Each month keeps its own roster, edits and approval state; holidays and leaves are matched by date.
- **Weeks** run Monday to Sunday. A week split across two months is judged in the month that holds its Sunday, so a trailing partial week is never flagged for a rest day that falls next month.
- **Process rules** (Setup > Brands and processes > Rules): operating calendar, normal staff needed, a different number on chosen weekdays, and a different number on specific dates.
- **Overlap rule**: nobody can staff two brands at once. Covering two brands on one day is an error (Double booked). Covering a brand while their own brand also needs them is a warning (Double duty). Suggested covers never include someone already covering another brand that day.
- **Assumption**: the roster works at day level (working, weekly off, leave, comp-off, holiday). Shifts within a day are not modelled, so "incompatible shifts" is treated as same-day overlapping responsibilities.
- Sample data includes two processes that need 2 staff every normal day (Lumio Customer Support, Orbit Abandoned Cart), each with 3 people so everyone can still rest.

## Behaviour notes
- Cell edits are locked (dot in the corner) and survive regeneration; the cell menu can unlock them.
- Setup changes (people, brands, staffing, holidays, leaves) re-check the roster at once.
- Roles are a switcher, not authentication: only the chosen pod's lead (or the operations manager) can approve that pod, and only the operations manager can publish.
- Supabase sync has been written against the schema but should be tried once on your own project before relying on it.

## Tell us how you think

**1. How did you model employees, brands, processes, pods and their relationships?**
A pod has a lead and contains employees and brands. A brand has one or more processes (Customer Support, Abandoned Cart, NDR...). Each process has an operating calendar and a minimum staff count, with optional overrides per weekday or date. An assignment links an employee to a process, as primary or as trained backup. That one link table covers every case in the brief: one person on every process of a brand, several people on different processes, several people on the same process, and people on several brands. A brand's operating calendar belongs to the process; a person's schedule is a separate grid of day cells (working, weekly off, leave, comp-off, holiday), so the two never get mixed up.

**2. How does your system generate a roster and decide it satisfies the constraints?**
Generation is deterministic and runs in layers. First the hard blocks are fixed: leaves, comp-offs, holidays, and days when all of a person's processes are closed. Then each Monday-to-Sunday week gets one weekly off per person, chosen day by day: a day is rejected if taking that person off would drop any of their processes below its minimum, and the remaining days are scored on preference, weekend fairness, spreading people out, keeping brand-mates apart, and avoiding long work runs. A separate validator then checks the finished roster from scratch and reports every error, warning and note. The validator is the judge, so manual edits and generated cells are held to the same rules.

**3. How did you handle single-resource brands versus brands with multiple employees?**
It falls out of the same rule rather than a special case. For a brand with one owner, taking that person off always breaks coverage on a required day, so their off lands on a day the brand is closed, or the system asks for a backup. In the sample data three single-owner brands run 365 days and each has a floater trained as backup. For brands with several people, the offs are staggered, preferably across different weekdays, so someone is always in. Processes that need two people (Lumio, Orbit, Zenith on weekends) are staffed with three so everyone can still rest.

**4. What happens when an employee who manages all processes for a brand is unavailable on a required day?**
The day shows a NO_COVERAGE error naming the brand, process, date and who is out. Next to it are ranked covers: trained backups and people from the same brand or pod first, people with a free day before people who would give up a weekly off, and never someone already covering another brand that day. Picking one records a one-day cover and the error clears. The operations manager makes that choice; the system never silently assigns it. If nobody is free the error stays and says so. You can try it under Conflicts > Simulate a change > Load demo.

**5. How does your system handle conflicting requirements or insufficient staffing?**
Mandatory rules and preferences are kept apart. Coverage, rest days and closed days are errors that block publishing. Preferred days off and fair distribution are warnings that coverage is allowed to override, and the message says what was overridden. When requirements cannot all be met, the roster is still produced, but every gap is listed with its date, brand, process and suggested fixes, and an Explain button gives a plain-language reason. Nothing is hidden to make the roster look valid.

**6. Which parts did you automate and which did you leave under human control? Why?**
Automated: placing weekly offs, applying leaves and holidays, checking coverage, spotting conflicts, ranking covers, re-solving an affected week, comparing plans. Left to people: choosing which cover to use, approving the roster by pod, publishing, overriding any cell, and deciding trade-offs such as taking a person's off to cover a client. Those decisions affect real people and client commitments, so the system recommends and explains, and a person confirms. Manual edits are locked so later regeneration never undoes them.

**7. If the company doubled its team and brand count, what would you change?**
The model needs no change, since it is data. The work would be performance and control. The engine already re-solves one week at a time, so I would make that the default path and cache per-day coverage instead of recomputing it. Beyond a few hundred people I would run generation on the server (or in a worker) rather than the browser and store rosters per version in the database, which the schema already has tables for. I would also replace the role switcher with real accounts and row-level security per pod, add pagination and search to the roster views, and move the greedy placement to a constraint solver for the hardest weeks while keeping the validator as the independent check.

**8. With one additional week, what would you improve first?**
Shift-level scheduling (morning, evening, night) with real incompatible-shift rules, since the roster is day-level today. Second, real authentication and an audit trail of who approved and who changed what. Third, saving manual edits and approval state in Supabase so a roster is shared across devices, and testing the n8n and Supabase paths end to end on a production setup.
