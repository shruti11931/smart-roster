-- Smart Roster Management System: schema (PostgreSQL / Supabase)
-- Run this first, then seed.sql. Text ids keep the sample data readable and reproducible.

drop table if exists covers, change_log, roster_entries, roster_versions, leaves, holidays,
  assignments, coverage_rules, processes, brands, employees, pods cascade;

create table pods (
  id text primary key,
  name text not null,
  lead_employee_id text            -- FK added after employees exist
);

create table employees (
  id text primary key,
  name text not null,
  pod_id text references pods(id) on delete set null,
  role text not null default 'agent' check (role in ('lead','agent','floater')),
  preferred_off_days int[] not null default '{}',   -- 0 = Sunday ... 6 = Saturday (soft preference)
  max_consecutive int not null default 12 check (max_consecutive between 1 and 30)
);
alter table pods add constraint pods_lead_fk foreign key (lead_employee_id) references employees(id) on delete set null;

create table brands (
  id text primary key,
  name text not null,
  pod_id text references pods(id) on delete set null
);

create table processes (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  name text not null,
  calendar_type text not null check (calendar_type in ('ALL_DAYS','EXCL_HOLIDAYS','EXCL_SUN_HOLIDAYS')),
  min_staff int not null default 1 check (min_staff >= 0)
);

-- Day-specific minimum staff: a weekday (0-6) or an exact date overrides processes.min_staff.
create table coverage_rules (
  id bigint generated always as identity primary key,
  process_id text not null references processes(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  on_date date,
  min_staff int not null check (min_staff >= 0),
  check ((day_of_week is not null) <> (on_date is not null))
);

-- Employee <-> process. is_backup = trained cover that only counts when primaries fall short.
create table assignments (
  employee_id text not null references employees(id) on delete cascade,
  process_id text not null references processes(id) on delete cascade,
  is_backup boolean not null default false,
  primary key (employee_id, process_id)
);

create table holidays (
  date date primary key,
  name text not null
);

create table leaves (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type text not null check (type in ('leave','comp_off')),
  check (end_date >= start_date)
);

-- One-day cover: this person works this process on this date (chosen from the backup suggestions).
create table covers (
  process_id text not null references processes(id) on delete cascade,
  date date not null,
  employee_id text not null references employees(id) on delete cascade,
  primary key (process_id, date, employee_id)
);

create table roster_versions (
  id bigint generated always as identity primary key,
  month text not null,                       -- 'YYYY-MM'
  status text not null default 'draft' check (status in ('draft','pod_lead_approved','published')),
  strategy text not null default 'balanced',
  created_at timestamptz not null default now()
);

create table roster_entries (
  version_id bigint not null references roster_versions(id) on delete cascade,
  employee_id text not null references employees(id) on delete cascade,
  date date not null,
  status text not null check (status in ('work','weekly_off','leave','comp_off','holiday')),
  locked boolean not null default false,     -- manual edits are never overwritten by regeneration
  source text not null default 'generated',
  primary key (version_id, employee_id, date)
);

create table change_log (
  id bigint generated always as identity primary key,
  version_id bigint references roster_versions(id) on delete cascade,
  actor text not null default 'system',
  change text not null,
  impact_summary text,
  created_at timestamptz not null default now()
);

create index on employees (pod_id);
create index on brands (pod_id);
create index on processes (brand_id);
create index on assignments (process_id);
create index on leaves (employee_id, start_date, end_date);
create index on roster_entries (employee_id, date);
create index on roster_entries (date);

-- DEMO ONLY: open policies so the public demo works with the anon key.
-- For production, replace these with per-role policies (pod lead, ops manager).
do $$
declare t text;
begin
  foreach t in array array['pods','employees','brands','processes','coverage_rules','assignments',
                           'holidays','leaves','covers','roster_versions','roster_entries','change_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "demo full access" on %I for all using (true) with check (true)', t);
  end loop;
end $$;
