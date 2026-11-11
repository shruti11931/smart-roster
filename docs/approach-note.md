# Approach note: Smart Roster Management System

**Problem.** Plan a monthly roster for 30+ people across pods, brands and processes, where each brand has its own operating calendar and minimum staffing, and make sure no weekly off, leave or edit silently breaks client coverage.

**Solution.** A deterministic scheduling engine (pure TypeScript, no UI or database imports) wrapped in a React app. The engine fixes hard blocks first (leaves, comp-offs, holidays, closed days), then places one weekly off per Monday-to-Sunday week per person, rejecting any day that would break a process's minimum staffing and scoring the rest on preference, fairness, spread and run length. An independent validator checks the finished roster and reports errors (mandatory), warnings (preferences) and notes (backup in use). Manual edits and generated cells are judged by the same validator.

**Architecture.** `src/engine` (model, calendars, generation, validation, backup ranking, partial re-solve, fairness, diff) -> Zustand store (state, approval workflow, change log) -> React pages (Dashboard, Roster with 5 views, Conflicts, Compare, Setup). Supabase stores the data when configured; otherwise the app runs on built-in sample data in the browser. An optional Edge Function asks Claude to explain a conflict, with a rule-based fallback. An optional n8n webhook announces changes to a published roster.

**Key decisions.**
- Deterministic engine plus validator rather than an LLM: rosters must be reproducible and explainable. AI is used only to explain conflicts.
- Brand calendar and employee schedule are separate, so brands can differ without per-employee special cases.
- Coverage outranks preference; preference misses are shown as warnings, never hidden.
- A change re-solves only the affected week and keeps locked manual edits.
- The system recommends covers; a person chooses, approves and publishes.

**Assumptions** are listed in the README (Sunday holiday absorbed by Sunday off, leave counts as that week's rest day, indicative holiday dates, 12-day maximum run).
