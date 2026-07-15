'use client';

/**
 * /admin  (v7.373) — Users, roles, per-project grants, and the activity log.
 * Owner/admin only (middleware enforces when AUTH_ENFORCED is on). Styled with
 * orbit-* tokens for light/dark parity (Const IV.6); every list is a real DB read
 * with an honest empty state (Const I.1/I.5).
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

type Role = 'owner' | 'admin' | 'editor' | 'viewer';
interface AdminUser {
  id: string; name: string; email: string; role: Role;
  status: 'active' | 'pending' | 'suspended';
  createdAt: string; lastLoginAt: string | null; projectIds: string[];
}
interface Proj { id: string; name: string; url: string }
interface Me { id: string; name: string; email: string; role: Role }
interface Ev {
  id: string; action: string; actorName: string | null; actorEmail: string | null;
  projectId: string | null; projectName: string | null;
  meta: Record<string, unknown> | null; ip: string | null; userAgent: string | null; createdAt: string;
}

type Tab = 'users' | 'add' | 'activity';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, string> = {
    owner:  'bg-orbit-accent/15 text-orbit-accent-light border-orbit-accent/30',
    admin:  'bg-orbit-red/12 text-orbit-red border-orbit-red/30',
    editor: 'bg-orbit-cyan/12 text-orbit-cyan border-orbit-cyan/30',
    viewer: 'bg-orbit-muted text-orbit-secondary border-orbit-border',
  };
  return <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${map[role]}`}>{role}</span>;
}

function StatusDot({ status }: { status: AdminUser['status'] }) {
  const color = status === 'active' ? 'bg-orbit-green' : status === 'pending' ? 'bg-orbit-amber' : 'bg-orbit-tertiary';
  const label = status[0].toUpperCase() + status.slice(1);
  return <span className="inline-flex items-center gap-1.5 text-[12px] text-orbit-secondary"><span className={`w-1.5 h-1.5 rounded-full ${color}`} />{label}</span>;
}

export default function AdminPage() {
  const [tab, setTab]       = useState<Tab>('users');
  const [me, setMe]         = useState<Me | null>(null);
  const [users, setUsers]   = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [loading, setLoading]   = useState(true);
  const [denied, setDenied]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, usersRes] = await Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }),
      fetch('/api/admin/users', { cache: 'no-store' }),
    ]);
    const meData = await meRes.json().catch(() => ({}));
    setMe(meData.user ?? null);
    if (usersRes.status === 401 || usersRes.status === 403) { setDenied(true); setLoading(false); return; }
    const data = await usersRes.json().catch(() => ({ users: [], projects: [] }));
    setUsers(data.users ?? []);
    setProjects(data.projects ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const projName = (id: string) => projects.find(p => p.id === id)?.name ?? 'project';

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/sign-in';
  }

  if (denied) {
    return (
      <Shell me={me} onSignOut={signOut}>
        <div className="max-w-md mx-auto text-center py-24">
          <div className="w-14 h-14 rounded-2xl bg-orbit-muted mx-auto flex items-center justify-center mb-4">
            <i className="ti ti-lock text-2xl text-orbit-secondary" />
          </div>
          <h2 className="text-lg font-semibold">Admins only</h2>
          <p className="text-orbit-secondary text-sm mt-1">You need an owner or admin account to manage users.</p>
          <Link href="/dashboard" className="inline-block mt-5 text-sm text-orbit-accent hover:underline">← Back to dashboard</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell me={me} onSignOut={signOut}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Users &amp; Access</h1>
          <p className="text-orbit-secondary text-sm mt-1">
            Add people, set their role, grant projects, and see who’s logging in and what they touch.
          </p>
        </div>

        <div className="flex gap-1 border-b border-orbit-border mb-6">
          {([['users', 'Users & Access'], ['add', 'Add User'], ['activity', 'Activity Log']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`font-mono text-[12px] px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                tab === k ? 'text-orbit-accent border-orbit-accent' : 'text-orbit-secondary border-transparent hover:text-orbit-primary'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'users'    && <UsersTab loading={loading} users={users} projects={projects} projName={projName} reload={load} />}
        {tab === 'add'      && <AddUserTab projects={projects} onDone={() => { setTab('users'); load(); }} />}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </Shell>
  );
}

function Shell({ me, onSignOut, children }: { me: Me | null; onSignOut: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-orbit-bg text-orbit-primary">
      <nav className="border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold gradient-text">OrbitIQ</span>
            <span className="font-mono text-[10px] text-orbit-tertiary tracking-wider uppercase border border-orbit-border rounded px-2 py-0.5">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors">
              <i className="ti ti-layout-grid" /> Projects
            </Link>
            {me ? (
              <button onClick={onSignOut} title={`${me.name} · sign out`}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors">
                <span className="w-6 h-6 rounded-full bg-orbit-accent/20 text-orbit-accent-light text-[10px] font-mono font-bold flex items-center justify-center">
                  {me.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
                </span>
                Sign out
              </button>
            ) : (
              <Link href="/sign-in" className="text-sm text-orbit-accent hover:underline">Sign in</Link>
            )}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

/* ─── Users tab ─────────────────────────────────────────────────────────── */
function UsersTab({ loading, users, projects, projName, reload }:
  { loading: boolean; users: AdminUser[]; projects: Proj[]; projName: (id: string) => string; reload: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-orbit-card rounded-lg animate-pulse" />)}</div>;
  if (!users.length) return (
    <div className="orbit-card text-center py-16">
      <p className="text-orbit-secondary text-sm">No users yet. Create your owner account from the sign-in page, then add your team here.</p>
    </div>
  );

  return (
    <div className="orbit-card overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left">
            {['User', 'Role', 'Projects', 'Last login', 'Status', ''].map((h, i) => (
              <th key={i} className="font-mono text-[9.5px] uppercase tracking-wider text-orbit-tertiary px-4 py-3 border-b border-orbit-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <UserRow key={u.id} u={u} projects={projects} projName={projName}
              open={openId === u.id} onToggle={() => setOpenId(openId === u.id ? null : u.id)} reload={reload} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ u, projects, projName, open, onToggle, reload }:
  { u: AdminUser; projects: Proj[]; projName: (id: string) => string; open: boolean; onToggle: () => void; reload: () => void }) {
  const initials = u.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <tr className="hover:bg-orbit-accent/[0.03]">
        <td className="px-4 py-3 border-b border-orbit-border">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-orbit-accent/20 text-orbit-accent-light text-[11px] font-mono font-bold flex items-center justify-center">{initials}</span>
            <div><div className="font-semibold text-orbit-primary">{u.name}</div><div className="text-[10px] font-mono text-orbit-tertiary">{u.email}</div></div>
          </div>
        </td>
        <td className="px-4 py-3 border-b border-orbit-border"><RoleBadge role={u.role} /></td>
        <td className="px-4 py-3 border-b border-orbit-border">
          {u.role === 'owner' || u.role === 'admin'
            ? <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-surface border border-orbit-border text-orbit-secondary">All ({projects.length})</span>
            : u.projectIds.length
              ? <div className="flex flex-wrap gap-1">{u.projectIds.slice(0, 3).map(id => <span key={id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-surface border border-orbit-border text-orbit-secondary">{projName(id)}</span>)}{u.projectIds.length > 3 && <span className="font-mono text-[10px] text-orbit-tertiary">+{u.projectIds.length - 3}</span>}</div>
              : <span className="font-mono text-[10px] text-orbit-tertiary">none</span>}
        </td>
        <td className="px-4 py-3 border-b border-orbit-border font-mono text-[11px] text-orbit-secondary">{timeAgo(u.lastLoginAt)}</td>
        <td className="px-4 py-3 border-b border-orbit-border"><StatusDot status={u.status} /></td>
        <td className="px-4 py-3 border-b border-orbit-border text-right">
          <button onClick={onToggle} className="font-mono text-[11px] text-orbit-accent hover:underline">{open ? 'Close' : 'Manage'}</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-orbit-surface/50 border-b border-orbit-border px-4 py-4">
            <ManageDrawer u={u} projects={projects} reload={reload} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

function ManageDrawer({ u, projects, reload, onClose }:
  { u: AdminUser; projects: Proj[]; reload: () => void; onClose: () => void }) {
  const [role, setRole]     = useState<Role>(u.role);
  const [grants, setGrants] = useState<string[]>(u.projectIds);
  const [pw, setPw]         = useState('');
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);
  const seesAll = role === 'owner' || role === 'admin';

  async function patch(body: Record<string, unknown>, done?: string) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || 'Update failed'); return; }
    setMsg(done || 'Saved');
    reload();
  }
  const toggle = (id: string) => setGrants(g => g.includes(id) ? g.filter(x => x !== id) : [...g, id]);
  const showGrants = role === 'editor' || role === 'viewer';

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-3">Role &amp; account</h4>
        <label className="block text-[11px] text-orbit-tertiary mb-1">Role tier</label>
        <select value={role} onChange={e => setRole(e.target.value as Role)}
          className="bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-sm outline-none focus:border-orbit-accent">
          <option value="owner">Owner</option><option value="admin">Admin</option>
          <option value="editor">Editor</option><option value="viewer">Viewer</option>
        </select>

        <div className="mt-4">
          <label className="block text-[11px] text-orbit-tertiary mb-1">Reset password (optional)</label>
          <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="new temporary password (8+ chars)"
            className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-sm outline-none focus:border-orbit-accent" />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button disabled={busy} onClick={() => patch({ role, projectIds: showGrants ? grants : undefined, password: pw || undefined }, 'Saved')}
            className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-[12px] font-medium px-4 py-2 rounded-lg disabled:opacity-60">Save changes</button>
          {u.status !== 'suspended'
            ? <button disabled={busy} onClick={() => patch({ status: 'suspended' }, 'Suspended')} className="text-[12px] px-3 py-2 rounded-lg border border-orbit-red/40 text-orbit-red hover:bg-orbit-red/10">Suspend</button>
            : <button disabled={busy} onClick={() => patch({ status: 'active' }, 'Reactivated')} className="text-[12px] px-3 py-2 rounded-lg border border-orbit-green/40 text-orbit-green hover:bg-orbit-green/10">Reactivate</button>}
          <button disabled={busy} onClick={async () => {
              if (!confirm(`Remove ${u.name}? This deletes their account and grants.`)) return;
              const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { setMsg(data.error || 'Delete failed'); return; }
              onClose(); reload();
            }} className="text-[12px] px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-red hover:border-orbit-red/40">Remove</button>
        </div>
        {msg && <p className="text-[12px] text-orbit-secondary mt-3">{msg}</p>}
      </div>

      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-3">
          Project access {showGrants ? `— ${grants.length} of ${projects.length}` : ''}
        </h4>
        {seesAll ? (
          <p className="text-[12px] text-orbit-secondary bg-orbit-bg border border-orbit-border rounded-lg px-3 py-3">
            {role === 'owner' ? 'Owners' : 'Admins'} can open every project — per-project grants don’t apply.
          </p>
        ) : projects.length === 0 ? (
          <p className="text-[12px] text-orbit-tertiary">No projects exist yet.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {projects.map(p => {
              const on = grants.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-orbit-bg text-left">
                  <span className={`w-8 h-5 rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-orbit-green' : 'bg-orbit-muted'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  <span className={`text-[12.5px] ${on ? 'text-orbit-primary' : 'text-orbit-secondary'}`}>{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-orbit-tertiary mt-2">Changes apply on the user’s next page load. Remember to Save.</p>
      </div>
    </div>
  );
}

/* ─── Add user tab ──────────────────────────────────────────────────────── */
function AddUserTab({ projects, onDone }: { projects: Proj[]; onDone: () => void }) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState<Role>('editor');
  const [pw, setPw]       = useState('');
  const [grants, setGrants] = useState<string[]>([]);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGrants = role === 'editor' || role === 'viewer';
  const toggle = (id: string) => setGrants(g => g.includes(id) ? g.filter(x => x !== id) : [...g, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role, password: pw || undefined, projectIds: showGrants ? grants : [] }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Could not create user'); return; }
    onDone();
  }

  const roles: { key: Role; title: string; desc: string }[] = [
    { key: 'admin',  title: 'Admin',  desc: 'Manage users, roles, and every project. Sees the activity log. Trusted internal staff only.' },
    { key: 'editor', title: 'Editor', desc: 'Create and edit projects, run scans, build content plans — inside the projects you grant below.' },
    { key: 'viewer', title: 'Viewer', desc: 'Read-only. Good for a client who should see a dashboard but change nothing. Granted per project.' },
  ];

  return (
    <form onSubmit={submit} className="orbit-card max-w-2xl p-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Full name</span>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="Taylor Nguyen"
            className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Work email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="taylor@company.com"
            className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent" />
        </label>
      </div>

      <div className="mt-5">
        <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-2">Role tier</span>
        <div className="space-y-2">
          {roles.map(r => (
            <button type="button" key={r.key} onClick={() => setRole(r.key)}
              className={`w-full text-left flex gap-3 items-start border rounded-xl px-3.5 py-3 transition-colors ${role === r.key ? 'border-orbit-accent bg-orbit-accent/[0.06]' : 'border-orbit-border hover:border-orbit-accent/40'}`}>
              <span className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${role === r.key ? 'border-orbit-accent bg-orbit-accent' : 'border-orbit-muted'}`} />
              <span><span className="text-sm font-semibold text-orbit-primary">{r.title}</span><span className="block text-[12px] text-orbit-tertiary mt-0.5">{r.desc}</span></span>
            </button>
          ))}
        </div>
      </div>

      <label className="block mt-5">
        <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Temporary password</span>
        <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="8+ characters — share it with them; they can’t log in without one"
          className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent" />
        <span className="block text-[11px] text-orbit-tertiary mt-1">Leave blank to create the account as “pending” and set a password later.</span>
      </label>

      {showGrants && (
        <div className="mt-5">
          <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-2">Grant access to projects</span>
          {projects.length === 0
            ? <p className="text-[12px] text-orbit-tertiary">No projects exist yet — you can grant access after creating one.</p>
            : <div className="border border-orbit-border rounded-xl p-1.5 space-y-1">
                {projects.map(p => {
                  const on = grants.includes(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-orbit-bg text-left">
                      <span className={`w-8 h-5 rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-orbit-green' : 'bg-orbit-muted'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                      </span>
                      <span className={`text-[12.5px] ${on ? 'text-orbit-primary' : 'text-orbit-secondary'}`}>{p.name}</span>
                    </button>
                  );
                })}
              </div>}
        </div>
      )}

      {error && <div className="mt-4 text-[13px] text-orbit-red bg-orbit-red/10 border border-orbit-red/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-3 mt-6">
        <button type="submit" disabled={busy} className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
          {busy ? 'Creating…' : 'Create user'}
        </button>
        <button type="button" onClick={onDone} className="text-sm px-4 py-2.5 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary">Cancel</button>
      </div>
    </form>
  );
}

/* ─── Activity tab ──────────────────────────────────────────────────────── */
const FILTERS: { key: string; label: string; icon: string; tone: string }[] = [
  { key: 'all',            label: 'All events',      icon: 'ti-list',         tone: 'text-orbit-secondary' },
  { key: 'login',          label: 'Logins',          icon: 'ti-login',        tone: 'text-orbit-green' },
  { key: 'project.open',   label: 'Project access',  icon: 'ti-eye',          tone: 'text-orbit-cyan' },
  { key: 'project.create', label: 'Project created', icon: 'ti-sparkles',     tone: 'text-orbit-accent-light' },
  { key: 'project.edit',   label: 'Edits',           icon: 'ti-pencil',       tone: 'text-orbit-amber' },
];

function actionMeta(a: string): { icon: string; cls: string } {
  if (a === 'login')          return { icon: 'ti-login',    cls: 'bg-orbit-green/12 text-orbit-green' };
  if (a === 'logout')         return { icon: 'ti-logout',   cls: 'bg-orbit-muted text-orbit-secondary' };
  if (a === 'project.open')   return { icon: 'ti-eye',      cls: 'bg-orbit-cyan/12 text-orbit-cyan' };
  if (a === 'project.create') return { icon: 'ti-sparkles', cls: 'bg-orbit-accent/14 text-orbit-accent-light' };
  if (a === 'project.edit')   return { icon: 'ti-pencil',   cls: 'bg-orbit-amber/14 text-orbit-amber' };
  return { icon: 'ti-user-cog', cls: 'bg-orbit-accent/12 text-orbit-accent-light' };
}

function describe(e: Ev): React.ReactNode {
  const who = <b className="text-orbit-primary font-semibold">{e.actorName || e.actorEmail || 'Someone'}</b>;
  const proj = e.projectName ? <span className="text-orbit-cyan">{e.projectName}</span> : null;
  switch (e.action) {
    case 'login':          return <>{who} signed in{e.meta?.bootstrap ? ' · created the owner account' : ''}</>;
    case 'logout':         return <>{who} signed out</>;
    case 'project.open':   return <>{who} opened {proj}</>;
    case 'project.create': return <>{who} created project {proj}</>;
    case 'project.edit':   return <>{who} edited {proj}</>;
    case 'user.invite':    return <>{who} added a user{typeof e.meta?.targetEmail === 'string' ? <> · {e.meta.targetEmail as string}</> : ''}</>;
    case 'user.update':    return <>{who} updated a user{typeof e.meta?.targetEmail === 'string' ? <> · {e.meta.targetEmail as string}</> : ''}</>;
    case 'user.delete':    return <>{who} removed a user</>;
    default:               return <>{who} · {e.action}</>;
  }
}

function ActivityTab() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/activity?action=${encodeURIComponent(f)}&limit=250`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({ events: [] }));
    setEvents(data.events ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`font-mono text-[10.5px] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
              filter === f.key ? 'bg-orbit-accent/12 border-orbit-accent text-orbit-accent' : 'border-orbit-border text-orbit-secondary hover:text-orbit-primary'}`}>
            <i className={`ti ${f.icon}`} /> {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-1.5">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-orbit-card rounded-lg animate-pulse" />)}</div>
      ) : events.length === 0 ? (
        <div className="orbit-card text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-orbit-muted mx-auto flex items-center justify-center mb-3"><i className="ti ti-history text-xl text-orbit-secondary" /></div>
          <p className="text-orbit-secondary text-sm">No activity recorded yet.</p>
          <p className="text-orbit-tertiary text-[12px] mt-1">Logins and project actions will appear here as they happen.</p>
        </div>
      ) : (
        <div className="orbit-card p-0 overflow-hidden divide-y divide-orbit-border">
          {events.map(e => {
            const m = actionMeta(e.action);
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-orbit-accent/[0.03]">
                <span className="font-mono text-[10.5px] text-orbit-tertiary w-28 flex-shrink-0">{new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.cls}`}><i className={`ti ${m.icon} text-[13px]`} /></span>
                <span className="text-[13px] text-orbit-secondary flex-1 min-w-0 truncate">{describe(e)}</span>
                <span className="font-mono text-[10px] text-orbit-tertiary text-right hidden sm:block flex-shrink-0">
                  {e.ip || ''}{e.ip && e.userAgent ? ' · ' : ''}{shortUA(e.userAgent)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-orbit-tertiary mt-3">Real events, newest first. Only owners &amp; admins can see this log.</p>
    </div>
  );
}

function shortUA(ua: string | null): string {
  if (!ua) return '';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
  return [br, os].filter(Boolean).join(' · ');
}
