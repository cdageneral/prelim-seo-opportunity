'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NewProjectModal from '@/components/dashboard/NewProjectModal';
import ProjectCard from '@/components/dashboard/ProjectCard';
import ProjectRow from '@/components/dashboard/ProjectRow';
import {
  filterProjects, sortProjects, readStoredView, writeStoredView,
  type ViewMode, type SortKey, type SortDir,
} from '@/lib/dashboard/projectList';

interface Project {
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  updatedAt:  string;
}

interface Me { name: string; role: string }

export default function DashboardPage() {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  // v7.373: auth-aware header (Admin link + sign-out). All optional — the app
  // works signed-out while AUTH_ENFORCED is off.
  const [me, setMe]           = useState<Me | null>(null);
  const [enforced, setEnforced] = useState(false);
  // v7.401: tile/list toggle + live search. `view` starts at 'tile' so the server
  // and first client render agree (no hydration mismatch), then the stored
  // preference is applied in an effect.
  const [view, setView]       = useState<ViewMode>('tile');
  const [query, setQuery]     = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  async function fetchProjects() {
    const res  = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }

  async function fetchMe() {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      setMe(data.user ?? null);
      setEnforced(Boolean(data.enforced));
    } catch { /* auth optional */ }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/sign-in';
  }

  useEffect(() => { fetchProjects(); fetchMe(); }, []);

  // v7.401: restore the remembered view after mount.
  useEffect(() => { setView(readStoredView()); }, []);

  function chooseView(next: ViewMode) {
    setView(next);
    writeStoredView(next);
  }

  /** Click a column header: same column flips direction, new column starts ascending. */
  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Tiles keep the server's order (most recently updated first); the list is sorted.
  const filtered = useMemo(() => filterProjects(projects, query), [projects, query]);
  const visible = useMemo(
    () => (view === 'list' ? sortProjects(filtered, sortKey, sortDir) : filtered),
    [filtered, view, sortKey, sortDir],
  );

  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const showAdmin = isAdmin || !enforced;

  async function handleDelete(id: string) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects(p => p.filter(x => x.id !== id));
  }

  async function handleRename(id: string, newName: string) {
    await fetch(`/api/projects/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientName: newName }),
    });
    setProjects(p => p.map(x => x.id === id ? { ...x, clientName: newName } : x));
  }

  return (
    <div className="min-h-screen bg-orbit-bg">
      {/* Nav */}
      <nav className="border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold gradient-text">OrbitIQ</span>
          <div className="flex items-center gap-3">
            {/* v7.185: global dark/light theme toggle */}
            <ThemeToggle />
          {/* v7.373: admin panel (users, roles, activity) — owner/admin, or during
              the pre-enforcement setup window */}
          {showAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors"
            >
              <i className="ti ti-users-group" aria-hidden="true" />
              Admin
            </Link>
          )}
          {/* v7.225: global Dashboard button — opens the cross-project API usage dashboard */}
          <Link
            href="/usage"
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors"
          >
            <i className="ti ti-gauge" aria-hidden="true" />
            Dashboard
          </Link>
          {me && (
            <button
              onClick={signOut}
              title={`${me.name} · sign out`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-orbit-accent/20 text-orbit-accent-light text-[10px] font-mono font-bold flex items-center justify-center">
                {me.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
              </span>
              Sign out
            </button>
          )}
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-orbit-primary">Client Projects</h2>
          <p className="text-orbit-secondary text-sm mt-1">
            Select a client to view or run their organic opportunity brief.
          </p>
        </div>

        {/* v7.401: search + view toggle */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem] max-w-md">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-orbit-tertiary pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-4.65a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
              placeholder="Search clients, domains, industries…"
              aria-label="Search projects"
              /* the trailing ✕ below is ours; suppress WebKit's native one so the
                 field never shows two clear buttons */
              className="w-full bg-orbit-surface border border-orbit-border rounded-lg pl-9 pr-9 py-2 text-sm text-orbit-primary placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-orbit-tertiary hover:text-orbit-primary hover:bg-orbit-muted transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="View mode"
            className="flex items-center gap-1 p-1 rounded-lg border border-orbit-border bg-orbit-surface"
          >
            <ViewButton
              active={view === 'tile'}
              onClick={() => chooseView('tile')}
              label="Tile view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" strokeWidth={2} />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" strokeWidth={2} />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" strokeWidth={2} />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" strokeWidth={2} />
              </svg>
              Tiles
            </ViewButton>
            <ViewButton
              active={view === 'list'}
              onClick={() => chooseView('list')}
              label="List view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              List
            </ViewButton>
          </div>

          {!loading && query && (
            <span className="text-orbit-secondary text-xs" aria-live="polite">
              {visible.length} of {projects.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="orbit-card h-40 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : visible.length === 0 ? (
          <NoMatches query={query} onClear={() => setQuery('')} />
        ) : view === 'list' ? (
          <div className="orbit-card overflow-hidden p-0">
            {/* Column headers — click to sort */}
            <div className="hidden md:grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_5.5rem_5rem_2rem] items-center gap-3 px-4 py-2 border-b border-orbit-border bg-orbit-muted/40">
              <SortHeader label="Client"   sortKey="name"     active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="Industry" sortKey="industry" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="Status"   sortKey="status"   active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="Updated"  sortKey="updated"  active={sortKey} dir={sortDir} onClick={toggleSort} />
              <span />
            </div>
            {visible.map(p => (
              <ProjectRow
                key={p.id}
                project={p}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
            {!query && (
              <button
                onClick={() => setShowNewModal(true)}
                className="orbit-card h-44 flex flex-col items-center justify-center gap-2 text-orbit-secondary hover:text-orbit-accent hover:border-orbit-accent-dim transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:border-orbit-accent transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium">Add Client</span>
              </button>
            )}
          </div>
        )}
      </main>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); fetchProjects(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-orbit-muted flex items-center justify-center">
        <svg className="w-8 h-8 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-orbit-primary font-semibold text-lg">No projects yet</h3>
        <p className="text-orbit-secondary text-sm mt-1">Add your first client to run an organic intelligence analysis.</p>
      </div>
      <button onClick={onNew} className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
        Add First Client
      </button>
    </div>
  );
}

/** v7.401: one segment of the tile/list toggle. */
function ViewButton({
  active, onClick, label, children,
}: {
  active:   boolean;
  onClick:  () => void;
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-orbit-accent text-white'
          : 'text-orbit-secondary hover:text-orbit-primary hover:bg-orbit-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** v7.401: a clickable list-view column header. */
function SortHeader({
  label, sortKey, active, dir, onClick,
}: {
  label:   string;
  sortKey: SortKey;
  active:  SortKey;
  dir:     SortDir;
  onClick: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-left transition-colors ${
        isActive ? 'text-orbit-primary' : 'text-orbit-secondary hover:text-orbit-primary'
      }`}
    >
      {label}
      <span aria-hidden="true" className={isActive ? 'opacity-100' : 'opacity-0'}>
        {dir === 'asc' ? '\u2191' : '\u2193'}
      </span>
    </button>
  );
}

/** v7.401: shown when a search filters everything out. */
function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-orbit-muted flex items-center justify-center">
        <svg className="w-7 h-7 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-orbit-primary font-medium text-sm">
        No clients match &ldquo;{query}&rdquo;
      </p>
      <button
        onClick={onClear}
        className="text-xs px-4 py-1.5 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors"
      >
        Clear search
      </button>
    </div>
  );
}
