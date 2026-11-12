# Smart Roster Management System

A roster tool for an operations team that supports many D2C brands. It generates the monthly roster, checks that every brand and process is covered, flags what needs attention, and re-solves only the affected week when something changes.

**Live app:** https://smart-roster-iota.vercel.app/ · **Demo video:** https://lnkd.in/p/dx4RRhZ7 · **Approach note:** [docs/approach-note.md](docs/approach-note.md)

Built for the Datastraw tech internship assignment. 34 sample employees, 4 pods, 24 brands, 42 processes.

## Contents
[Features](#features) · [Quick start](#quick-start) · [Try it in 3 minutes](#try-it-in-3-minutes) · [How it works](#how-it-works) · [Requirements checklist](#requirements-checklist) · [Setup for deployment](#setup-for-deployment) · [Assumptions](#sample-data-and-assumptions) · [Limitations](#known-limitations) · [Tell us how you think](#tell-us-how-you-think)

## Features
- **Roster generation** for any month, with four plans: Balanced, Fairness first, Preference first, Min-risk.
- **Five views:** company, pod, brand, process and employee, with daily staffed counts per process.
- **Conflict detection** before publishing: no coverage, understaffed, missing weekly off, too many days in a row, double booking, working on a closed day, missed preferences, uneven offs. Errors block publishing; warnings do not.
- **Backup recommendations:** ranked "Use ..." covers for every gap.
- **Manual edits:** click a cell, the roster is re-checked at once, and the edit is locked so regeneration keeps it.
- **Change handling:** simulate a leave, see the gap, and re-solve only that week.
- **Compare plans** side by side, then adopt one.
- **Approval workflow:** pod leads approve, the operations manager publishes, any later edit returns it to draft.
- **Notifications** to an n8n webhook when a published roster changes.
- **Export** to CSV and Excel (.xlsx).
- **AI explanations** of conflicts through Groq, with a built-in fallback.
- **Dynamic setup:** add, edit and remove employees, pods, brands, processes, staffing, holidays and leaves. Nothing needs a code change.

## Quick start
```bash
npm install
cp .env.example .env.local   # every value is optional; without them the app runs on built-in sample data
npm run dev                  # http://localhost:5173
npm test                     # 44 tests: engine, validation, change handling, comparison, configuration edits
npm run build                # type-check and production build
```
`npm run dev` does not serve the `/api` function, so Explain shows the built-in explanation locally. To try the AI version locally, put `GROQ_API_KEY` in `.env.local` and run `npx vercel dev`.

## Try it in 3 minutes
1. **Dashboard:** the month at a glance, coverage %, a fairness score, and 2 planted errors. Switch the strategy and press **Generate roster**.
2. **Roster:** switch between Company, Pod, Brand, Process and Employee. In Brand view pick *Lumio* to see three processes with different needs.
3. **Conflicts:** Zest has no cover on Sun 15 Nov and Zenith is short on Sat 21 Nov. Press **Explain**, then a **Use ...** button to clear the gap.
4. **Simulate a change:** *Load demo* (Pixel Wear's only agent takes leave), **Show the gap** (4 new errors), then **Apply and re-solve week**.
5. **Compare:** four plans side by side, with a *Best overall* tag. **Use this plan** adopts one.
6. **Approval:** set *Acting as* to a pod lead and approve that pod. As the operations manager, publish once every pod has approved and errors are 0. Edit a cell afterwards to trigger the notification.
7. **Setup:** add an employee or a brand and watch the roster re-check at once.

## How it works
```
Setup data (Supabase or sample)  ->  Engine (pure TypeScript)  ->  Zustand store  ->  React pages
   employees, pods, brands,          1. hard blocks                 roster, status,     Dashboard, Roster,
   processes, assignments,           2. weekly-off placement        approvals, log      Conflicts, Compare,
   holidays, leaves                  3. independent validator                           Setup
```
1. **Hard blocks first:** leaves, comp-offs, holidays and days when all of a person's processes are closed.
2. **Weekly offs:** each Monday-to-Sunday week, every person gets one off. A day is rejected if it would drop any of their processes below its minimum. Remaining days are scored on preference, weekend fairness, spread, brand-mates and run length.
3. **Validator:** checks the finished roster from scratch. Generated cells and manual edits are held to the same rules.
4. **Backups** only count when primaries fall short, one brand per backup per day.
5. **Changes** re-solve only the affected weeks and keep locked cells.

The engine has no React or Supabase imports, so it is testable on its own and could move to a server.

## Requirements checklist
| Brief | Where |
|---|---|
| 30+ employees, pods, pod leads, brands, processes, shared and multi-process staffing | `src/data/seed.ts`: 34 people, 4 pods, 24 brands (19 with one owner), 42 processes |
| Add, edit, remove assignments without code changes | Setup page; everything re-checks at once |
| Working-day rules, minimum staff, day-specific minimums | Setup > Brands and processes > Rules |
| Brand calendar kept apart from employee schedule | `calendar.ts` decides required days; the roster grid holds each person's own days |
| Weekly offs, holidays, leaves, comp-offs, preferences | Generation engine and Setup |
| Monthly roster for any month | Month picker on Dashboard |
| Five views | Roster page |
| Conflict detection before publishing | Conflicts page; publishing is blocked while errors exist |
| Manual edits validated | Click any roster cell |
| Handling changes | Conflicts > Simulate a change |

| Optional feature | Status |
|---|---|
| Fair distribution of weekly offs | Done: Fairness first plan, fairness score, uneven-offs warning |
| Preference-based scheduling | Done: preferred off days, Preference first plan, warning when coverage wins |
| Automatic regeneration after leave changes | Done: leave, comp-off, holiday and setup changes re-check at once; the leave flow re-solves one week |
| Backup resource recommendations | Done: ranked covers with "Use ..." buttons |
| Comparison of alternative plans | Done: Compare page |
| Approval workflow | Done: per-pod approval and a publish gate. Roles are a switcher, not real accounts |
| Notifications when a published roster changes | Done through an n8n webhook when `VITE_N8N_WEBHOOK_URL` is set; otherwise an on-screen notice only |
| Export to CSV, Excel, Google Sheets | CSV and real .xlsx. For Google Sheets use File > Import on the downloaded file |
| AI explanations of conflicts | Done: a Vercel function calls Groq; a built-in explanation is the fallback |
| Add brands, pods, processes dynamically | Done in Setup |

## Setup for deployment
All variables are optional. Without them the app still runs on the sample data and saves to the browser.

| Variable | Where it is used | Get it from |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser | Supabase > Project Settings > API |
| `VITE_N8N_WEBHOOK_URL` | Browser | n8n Webhook node > Production URL |
| `GROQ_API_KEY` | Server only (`api/explain.ts`) | console.groq.com > API Keys |
| `GROQ_MODEL` | Server only, optional | Default `llama-3.3-70b-versatile` |

Never prefix the Groq key with `VITE_`: that would publish it in the browser bundle.

**Supabase.** Create a project, open the SQL editor, run `supabase/schema.sql` and then `supabase/seed.sql` (choose *Run without RLS* if asked; the script enables RLS itself with an open demo policy). The sidebar then shows *Supabase connected*. People, brands, processes, staffing, holidays and leaves load from and save to the database. If it is unreachable the app keeps working from browser storage and says so. Manual cell edits and approval state stay in the browser. The demo policy is open read/write; tighten it before any real use.

**AI explanations.** `api/explain.ts` is a Vercel serverless function. Set `GROQ_API_KEY` in Vercel and redeploy. The function receives only the detected facts and is told not to invent names or dates. If it fails, times out or has no key, the built-in explanation is shown. Each explanation is labelled *AI explanation* or *Standard explanation*.

**n8n.** Create a Webhook node: method `POST`, path `roster-changed`, Allowed Origins `*`. Publish the workflow and copy the **Production URL** (not the test URL). Editing a published roster then posts `{event, at, month, summary, errors}`. Connect an email or Slack node to it.

**Vercel.** Import the GitHub repo, framework preset *Vite*, add the variables above, deploy. There is no router, so no rewrite rules are needed.

## Structure
- `src/engine/`: pure TypeScript: calendars, coverage, generate, validate, suggest, resolve, fairness. No React or Supabase imports.
- `src/store.ts`: Zustand store (config, roster, strategy, approvals, log), persisted in localStorage.
- `src/lib/`: analysis, plan comparison, Excel export, explanations, Supabase client, repository and sync, n8n notify, configuration edits.
- `src/pages/`: Dashboard, Roster, Conflicts, Compare, Setup, Landing.
- `src/components/`: roster grid, issue list, cell menu, toasts.
- `src/data/seed.ts`: sample data, the single source for both the app and `seed.sql`.
- `api/explain.ts`: Groq explanation function (Vercel).
- `supabase/`: schema and seed. `docs/`: approach note, demo script, submission email.

## Sample data and assumptions
- 34 employees in 4 pods; 24 brands, 19 with one owner (79%); 42 processes; month = Nov 2026. Three single-owner brands run 365 days and each has a trained floater as backup.
- Holiday dates are indicative sample data, not an official calendar.
- A holiday that falls on a Sunday is absorbed by the Sunday weekly off.
- A leave or comp-off day inside a Mon-Sun week counts as that week's rest day.
- Weeks with fewer than 4 days in the month need no weekly off. A week split across two months is judged in the month that holds its Sunday.
- One weekly off per Mon-Sun week allows up to 12 working days between rests, so the default `maxConsecutive` is 12 and can be set per employee.
- Backups cover one brand per day and count only when primaries fall short.
- Two conflicts are planted on purpose (Zest on Sun 15 Nov, Zenith on Sat 21 Nov) so the detection is visible straight away. The demo leave is `DEMO_LEAVE` in `seed.ts`.
- Nobody can staff two brands at once: covering two brands on one day is an error; covering a brand while their own brand needs them is a warning. Suggested covers never include someone already covering another brand that day.

## Known limitations
- The roster works at day level (working, weekly off, leave, comp-off, holiday). Shifts within a day are not modelled, so "incompatible shifts" is covered only by the same-day overlap checks.
- Roles are a switcher, not authentication. A real deployment needs accounts and row-level security per pod.
- Supabase stores the configuration only. The roster is rebuilt from it; manual edits and approval state live in each browser.
- Google Sheets export is by importing the downloaded file.
- The n8n and Groq integrations need your own keys and were tested only against the free tiers.
- The layout is built for laptop screens; phones scroll sideways on the landing page and Dashboard.

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
