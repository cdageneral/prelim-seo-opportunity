'use client';

/**
 * /admin  (v7.373, groups v7.418, hours v7.447) — Users, roles, groups,
 * per-project grants, the activity log, and the Hours Saved rate card.
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
  groups: { id: string; name: string }[];
}
interface Proj { id: string; name: string; url: string }
interface Group { id: string; name: string; createdAt: string; memberIds: string[]; projectIds: string[] }
interface Me { id: string; name: string; email: string; role: Role }
interface Ev {
  id: string; action: string; actorName: string | null; actorEmail: string | null;
  projectId: string | null; projectName: string | null;
  meta: Record<string, unknown> | null; ip: string | null; userAgent: string | null; createdAt: string;
}

type Tab = 'users' | 'groups' | 'add' | 'activity' | 'hours';

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
          {([['users', 'Users & Access'], ['groups', 'Groups'], ['add', 'Add User'], ['activity', 'Activity Log'], ['hours', 'Hours Saved']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`font-mono text-[12px] px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                tab === k ? 'text-orbit-accent border-orbit-accent' : 'text-orbit-secondary border-transparent hover:text-orbit-primary'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'users'    && <UsersTab loading={loading} users={users} projects={projects} projName={projName} reload={load} />}
        {tab === 'groups'   && <GroupsTab />}
        {tab === 'add'      && <AddUserTab projects={projects} onDone={() => { setTab('users'); load(); }} />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'hours'    && <HoursTab />}
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
            : (u.projectIds.length || (u.groups ?? []).length)
              ? <div className="flex flex-wrap gap-1 items-center">
                  {u.projectIds.slice(0, 3).map(id => <span key={id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-surface border border-orbit-border text-orbit-secondary">{projName(id)}</span>)}
                  {u.projectIds.length > 3 && <span className="font-mono text-[10px] text-orbit-tertiary">+{u.projectIds.length - 3}</span>}
                  {(u.groups ?? []).map(g => (
                    <span key={g.id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-accent/[0.08] border border-orbit-accent/30 text-orbit-accent-light inline-flex items-center gap-1">
                      <i className="ti ti-users text-[10px]" />{g.name}
                    </span>
                  ))}
                </div>
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


/* ─── Groups tab (v7.418) ───────────────────────────────────────────────── */
interface GroupUser { id: string; name: string; email: string; role: Role; status: AdminUser['status'] }

function GroupsTab() {
  const [groups, setGroups]     = useState<Group[]>([]);
  const [gUsers, setGUsers]     = useState<GroupUser[]>([]);
  const [gProjects, setGProjects] = useState<Proj[]>([]);
  const [loading, setLoading]   = useState(true);
  const [openId, setOpenId]     = useState<string | null>(null);
  const [newName, setNewName]   = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/groups', { cache: 'no-store' });
    const data = await res.json().catch(() => ({ groups: [], users: [], projects: [] }));
    setGroups(data.groups ?? []);
    setGUsers(data.users ?? []);
    setGProjects(data.projects ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const userName = (id: string) => gUsers.find(u => u.id === id)?.name ?? 'user';
  const projName = (id: string) => gProjects.find(p => p.id === id)?.name ?? 'project';

  async function createNew(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true); setError(null);
    const res = await fetch('/api/admin/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) { setError(data.error || 'Could not create group'); return; }
    setNewName('');
    await load();
    if (data.group?.id) setOpenId(data.group.id);
  }

  return (
    <div>
      <form onSubmit={createNew} className="flex flex-wrap items-center gap-2 mb-4">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New group name — e.g. TD Bank team"
          className="flex-1 min-w-[220px] bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent" />
        <button type="submit" disabled={creating || !newName.trim()}
          className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-60">
          {creating ? 'Creating…' : 'Create group'}
        </button>
      </form>
      {error && <div className="mb-4 text-[13px] text-orbit-red bg-orbit-red/10 border border-orbit-red/30 rounded-lg px-3 py-2">{error}</div>}
      <p className="text-[11px] text-orbit-tertiary mb-4">
        A group grants its projects to every member. Members keep their own role (editor/viewer) — a group changes <i>which</i> projects they see, not what they can do. Owners &amp; admins see everything regardless.
      </p>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-orbit-card rounded-lg animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="orbit-card text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-orbit-muted mx-auto flex items-center justify-center mb-3"><i className="ti ti-users text-xl text-orbit-secondary" /></div>
          <p className="text-orbit-secondary text-sm">No groups yet.</p>
          <p className="text-orbit-tertiary text-[12px] mt-1">Create one above, then add members and grant it projects.</p>
        </div>
      ) : (
        <div className="orbit-card overflow-hidden p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                {['Group', 'Members', 'Projects', 'Created', ''].map((h, i) => (
                  <th key={i} className="font-mono text-[9.5px] uppercase tracking-wider text-orbit-tertiary px-4 py-3 border-b border-orbit-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <GroupRow key={g.id} g={g} users={gUsers} projects={gProjects}
                  userName={userName} projName={projName}
                  open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} reload={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRow({ g, users, projects, userName, projName, open, onToggle, reload }:
  { g: Group; users: GroupUser[]; projects: Proj[]; userName: (id: string) => string; projName: (id: string) => string;
    open: boolean; onToggle: () => void; reload: () => void }) {
  return (
    <>
      <tr className="hover:bg-orbit-accent/[0.03]">
        <td className="px-4 py-3 border-b border-orbit-border">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-orbit-accent/15 text-orbit-accent-light flex items-center justify-center"><i className="ti ti-users text-[15px]" /></span>
            <div className="font-semibold text-orbit-primary">{g.name}</div>
          </div>
        </td>
        <td className="px-4 py-3 border-b border-orbit-border">
          {g.memberIds.length
            ? <div className="flex flex-wrap gap-1">{g.memberIds.slice(0, 3).map(id => <span key={id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-surface border border-orbit-border text-orbit-secondary">{userName(id)}</span>)}{g.memberIds.length > 3 && <span className="font-mono text-[10px] text-orbit-tertiary">+{g.memberIds.length - 3}</span>}</div>
            : <span className="font-mono text-[10px] text-orbit-tertiary">none</span>}
        </td>
        <td className="px-4 py-3 border-b border-orbit-border">
          {g.projectIds.length
            ? <div className="flex flex-wrap gap-1">{g.projectIds.slice(0, 3).map(id => <span key={id} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orbit-surface border border-orbit-border text-orbit-secondary">{projName(id)}</span>)}{g.projectIds.length > 3 && <span className="font-mono text-[10px] text-orbit-tertiary">+{g.projectIds.length - 3}</span>}</div>
            : <span className="font-mono text-[10px] text-orbit-tertiary">none</span>}
        </td>
        <td className="px-4 py-3 border-b border-orbit-border font-mono text-[11px] text-orbit-secondary">{timeAgo(g.createdAt)}</td>
        <td className="px-4 py-3 border-b border-orbit-border text-right">
          <button onClick={onToggle} className="font-mono text-[11px] text-orbit-accent hover:underline">{open ? 'Close' : 'Manage'}</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-orbit-surface/50 border-b border-orbit-border px-4 py-4">
            <GroupDrawer g={g} users={users} projects={projects} reload={reload} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

function GroupDrawer({ g, users, projects, reload, onClose }:
  { g: Group; users: GroupUser[]; projects: Proj[]; reload: () => void; onClose: () => void }) {
  const [name, setName]       = useState(g.name);
  const [members, setMembers] = useState<string[]>(g.memberIds);
  const [grants, setGrants]   = useState<string[]>(g.projectIds);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);

  const toggleMember  = (id: string) => setMembers(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);
  const toggleProject = (id: string) => setGrants(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/groups/${g.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || undefined, memberIds: members, projectIds: grants }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || 'Update failed'); return; }
    setMsg('Saved');
    reload();
  }

  async function remove() {
    if (!confirm(`Delete group “${g.name}”? Members keep their accounts and any direct project grants — they only lose access this group provided.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/groups/${g.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || 'Delete failed'); return; }
    onClose(); reload();
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-3">Group</h4>
        <label className="block text-[11px] text-orbit-tertiary mb-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-sm outline-none focus:border-orbit-accent" />
        <div className="flex flex-wrap gap-2 mt-4">
          <button disabled={busy} onClick={save}
            className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-[12px] font-medium px-4 py-2 rounded-lg disabled:opacity-60">Save changes</button>
          <button disabled={busy} onClick={remove}
            className="text-[12px] px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-red hover:border-orbit-red/40">Delete group</button>
        </div>
        {msg && <p className="text-[12px] text-orbit-secondary mt-3">{msg}</p>}
      </div>

      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-3">Members — {members.length} of {users.length}</h4>
        {users.length === 0 ? (
          <p className="text-[12px] text-orbit-tertiary">No users exist yet.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {users.map(u => {
              const on = members.includes(u.id);
              const seesAll = u.role === 'owner' || u.role === 'admin';
              return (
                <button key={u.id} onClick={() => toggleMember(u.id)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-orbit-bg text-left">
                  <span className={`w-8 h-5 rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-orbit-green' : 'bg-orbit-muted'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  <span className={`text-[12.5px] flex-1 min-w-0 truncate ${on ? 'text-orbit-primary' : 'text-orbit-secondary'}`}>{u.name}</span>
                  {seesAll && <span className="font-mono text-[9px] text-orbit-tertiary flex-shrink-0" title="Owners and admins already see every project">{u.role}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-3">Project access — {grants.length} of {projects.length}</h4>
        {projects.length === 0 ? (
          <p className="text-[12px] text-orbit-tertiary">No projects exist yet.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {projects.map(p => {
              const on = grants.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggleProject(p.id)}
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
        <p className="text-[11px] text-orbit-tertiary mt-2">Every member of this group can open these projects. Remember to Save.</p>
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
  if (a.startsWith('group.'))  return { icon: 'ti-users',    cls: 'bg-orbit-accent/12 text-orbit-accent-light' };
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
    case 'group.create':   return <>{who} created group{typeof e.meta?.groupName === 'string' ? <> <b className="text-orbit-primary font-semibold">{e.meta.groupName as string}</b></> : ''}</>;
    case 'group.update':   return <>{who} updated group{typeof e.meta?.groupName === 'string' ? <> <b className="text-orbit-primary font-semibold">{e.meta.groupName as string}</b></> : ''}</>;
    case 'group.delete':   return <>{who} deleted group{typeof e.meta?.groupName === 'string' ? <> <b className="text-orbit-primary font-semibold">{e.meta.groupName as string}</b></> : ''}</>;
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


// ─── Hours Saved (v7.447) ─────────────────────────────────────────────────────
// Wayne's delivery scope: what each activity costs a team in manual hours, and
// which stored dataset proves this project actually carries it. The HOURS are
// his business input and live here so they change without a release; the GATE
// list is code, because whether a deliverable exists is measured, not declared.

interface HActivity {
  key: string; label: string; hours: number; gateKey: string;
  group: 'base' | 'local'; sortOrder: number; active: boolean;
}
interface HGate { key: string; label: string; reads: string; proxy: boolean }

function HoursTab() {
  const [rows, setRows]       = useState<HActivity[]>([]);
  const [gates, setGates]     = useState<HGate[]>([]);
  const [scope, setScope]     = useState<{ base: number; local: number; total: number } | null>(null);
  const [updatedAt, setUpd]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [dirty, setDirty]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/hours', { cache: 'no-store' });
      const j = await r.json();
      setRows(j.activities ?? []); setGates(j.gates ?? []);
      setScope(j.scope ?? null);   setUpd(j.updatedAt ?? null);
      setDirty(false);
    } catch { setMsg('Couldn’t load the activity list.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const gateBy = new Map(gates.map(g => [g.key, g]));
  const edit = (i: number, patch: Partial<HActivity>) => {
    setRows(rs => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setDirty(true); setMsg(null);
  };
  const addRow = () => {
    const next = Math.max(0, ...rows.map(r => r.sortOrder)) + 10;
    setRows(rs => [...rs, { key: `activity_${next}`, label: 'New activity', hours: 0, gateKey: 'always', group: 'base', sortOrder: next, active: true }]);
    setDirty(true);
  };
  const removeRow = (i: number) => { setRows(rs => rs.filter((_, n) => n !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/hours', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: rows }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg(typeof j?.error === 'string' ? j.error : 'Save rejected — check the highlighted rows.'); return; }
      setRows(j.activities ?? []); setScope(j.scope ?? null); setUpd(j.updatedAt ?? null);
      setDirty(false); setMsg('Saved. Every project’s Hours Saved figure recomputes on the next dashboard load.');
    } catch { setMsg('Save failed.'); }
    finally { setSaving(false); }
  };

  const active = rows.filter(r => r.active);
  const liveScope = {
    base:  active.filter(r => r.group === 'base').reduce((s, r) => s + (Number(r.hours) || 0), 0),
    local: active.filter(r => r.group === 'local').reduce((s, r) => s + (Number(r.hours) || 0), 0),
  };

  if (loading) return <div className="orbit-card p-8 text-center text-orbit-secondary text-sm">Loading activities…</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-orbit-primary">Hours Saved — delivery scope</h2>
          <p className="text-orbit-secondary text-sm mt-1 max-w-3xl">
            The manual hours each activity would take a team. These figures are your input, not a measurement — what the
            app measures is the <strong className="text-orbit-primary">gate</strong>: the stored dataset that proves a
            project actually carries that deliverable. An activity is only credited to a project when its gate passes, so
            a project with no backlink scan is never credited for a backlink profile.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <button onClick={save} disabled={saving || !dirty}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-orbit-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          <span className="text-[11px] text-orbit-tertiary">
            {updatedAt ? `Last edited ${new Date(updatedAt).toLocaleString()}` : 'Built-in defaults — never edited'}
          </span>
        </div>
      </div>

      {msg && <div className="orbit-card p-3 mb-4 text-sm text-orbit-secondary border border-orbit-accent/30">{msg}</div>}

      <div className="orbit-card p-3 mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-orbit-secondary">
        <span>Core scope <strong className="text-orbit-primary tabular-nums">{liveScope.base.toLocaleString()}</strong> hrs</span>
        <span>Local scope <strong className="text-orbit-primary tabular-nums">{liveScope.local.toLocaleString()}</strong> hrs</span>
        <span>Full scope <strong className="text-orbit-primary tabular-nums">{(liveScope.base + liveScope.local).toLocaleString()}</strong> hrs</span>
        <span className="text-orbit-tertiary">No project is expected to reach the full scope.</span>
      </div>

      <div className="orbit-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-orbit-tertiary text-left border-b border-orbit-border">
              <th className="py-2 px-3 font-medium">Activity</th>
              <th className="py-2 px-3 font-medium text-right w-24">Hours</th>
              <th className="py-2 px-3 font-medium w-28">Group</th>
              <th className="py-2 px-3 font-medium">Evidence gate — what must exist</th>
              <th className="py-2 px-3 font-medium text-center w-20">Active</th>
              <th className="py-2 px-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const g = gateBy.get(r.gateKey);
              return (
                <tr key={r.key} className="border-b border-orbit-border/40 align-top">
                  <td className="py-2 px-3">
                    <input value={r.label} onChange={e => edit(i, { label: e.target.value })}
                      className="w-full bg-transparent border border-orbit-border rounded px-2 py-1 text-orbit-primary focus:border-orbit-accent outline-none" />
                    <span className="block font-mono text-[10px] text-orbit-tertiary mt-1">{r.key}</span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input type="number" min={0} value={r.hours}
                      onChange={e => edit(i, { hours: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      className="w-20 bg-transparent border border-orbit-border rounded px-2 py-1 text-right tabular-nums text-orbit-primary focus:border-orbit-accent outline-none" />
                  </td>
                  <td className="py-2 px-3">
                    <select value={r.group} onChange={e => edit(i, { group: e.target.value as 'base' | 'local' })}
                      className="w-full bg-orbit-bg border border-orbit-border rounded px-2 py-1 text-orbit-primary focus:border-orbit-accent outline-none">
                      <option value="base">Core</option>
                      <option value="local">Local</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <select value={r.gateKey} onChange={e => edit(i, { gateKey: e.target.value })}
                      className={`w-full bg-orbit-bg border rounded px-2 py-1 text-orbit-primary focus:border-orbit-accent outline-none ${g ? 'border-orbit-border' : 'border-orbit-red'}`}>
                      {!g && <option value={r.gateKey}>{r.gateKey} — NOT REGISTERED</option>}
                      {gates.map(gg => <option key={gg.key} value={gg.key}>{gg.label}</option>)}
                    </select>
                    <span className={`block text-[10px] mt-1 leading-snug ${g ? 'text-orbit-tertiary' : 'text-orbit-red'}`}>
                      {g ? g.reads : 'No gate by this name is registered — these hours are never credited to any project.'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input type="checkbox" checked={r.active} onChange={e => edit(i, { active: e.target.checked })} className="accent-current" />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button onClick={() => removeRow(i)} title="Remove this activity"
                      className="text-orbit-tertiary hover:text-orbit-red transition-colors">
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={addRow} className="mt-3 text-sm text-orbit-accent hover:underline">+ Add activity</button>
    </div>
  );
}
