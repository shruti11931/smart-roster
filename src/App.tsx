import { useEffect, useState } from 'react';
import { initSync } from './lib/sync';
import { monthLabel, type Page, useAnalysis } from './lib/analysis';
import Compare from './pages/Compare';
import Conflicts from './pages/Conflicts';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import RosterPage from './pages/Roster';
import Setup from './pages/Setup';
import Toasts from './components/Toasts';
import { useRoster } from './store';

const NAV: [Page, string][] = [
  ['dashboard', 'Dashboard'],
  ['roster', 'Roster'],
  ['conflicts', 'Conflicts'],
  ['compare', 'Compare'],
  ['setup', 'Setup'],
];

export default function App() {
  const [page, setPage] = useState<Page>('landing');
  const { config, roster, role, setRole, db } = useRoster();
  useEffect(() => { void initSync(); }, []);
  const an = useAnalysis(config, roster);

  if (page === 'landing') return <Landing go={setPage} />;

  return (
    <div className="app">
      <nav className="side-nav">
        <button className="brand" onClick={() => setPage('landing')}>
          Smart Roster<small>{monthLabel(config.month)}</small>
        </button>
        {NAV.map(([id, label]) => (
          <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>
            {label}
            {id === 'conflicts' && an.errors.length > 0 && <span className="badge">{an.errors.length}</span>}
          </button>
        ))}
        <div className="role-box">
          <span className={`pill ${db === 'connected' ? '' : db === 'error' ? 'bad' : 'off'}`}>
            <i />{db === 'connected' ? 'Supabase connected' : db === 'loading' ? 'Connecting…' : db === 'error' ? 'Supabase unreachable, saved in browser' : 'Saved in browser'}
          </span>
          <span>Acting as</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Acting as">
            <option value="ops">Operations manager</option>
            {config.pods.map((p) => (
              <option key={p.id} value={p.id}>
                Pod {p.name} lead{config.employees.find((e) => e.id === p.leadId) ? `: ${config.employees.find((e) => e.id === p.leadId)!.name}` : ''}
              </option>
            ))}
          </select>
        </div>
      </nav>
      <main>
        <div key={page} className="page">
          {page === 'dashboard' && <Dashboard go={setPage} />}
          {page === 'roster' && <RosterPage />}
          {page === 'conflicts' && <Conflicts />}
          {page === 'compare' && <Compare />}
          {page === 'setup' && <Setup />}
        </div>
      </main>
      <Toasts />
    </div>
  );
}
