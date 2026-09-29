'use client';

/**
 * components/GlobalNavLinks.tsx — v7.528
 *
 * The one set of top-nav buttons every operator page shares, in one order:
 *   Projects (Orbit) · Scout · Admin · Dashboard · Sign out
 *
 * Wayne, 2026-09-29: "i need the global nav to have both admin and dashboard
 * visible between the two" — the usage Dashboard carried only a Projects
 * button and Admin carried no Scout button, so moving between Orbit and Scout
 * meant a round trip through Projects. Visibility follows the same rules the
 * project dashboard (v7.373/v7.513) and the Scout page (v7.524) already apply:
 *   • Projects  — accounts with Orbit access
 *   • Scout     — accounts with Scout access
 *   • Admin     — owner/admin (the access route's `isAdmin`, which is also true
 *                 in the pre-enforcement setup window)
 *   • Dashboard — admins and anyone with Orbit
 * The page's own button is omitted (`current`), and the sign-out button is
 * rendered only when the page has not already got one (`signOut`).
 *
 * Reads /api/scout/access once. Until it answers — or if it fails — nothing is
 * shown but what the caller renders itself, so a page never loses a button it
 * had before this component existed.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

export type NavPage = 'projects' | 'scout' | 'admin' | 'usage';

interface Access { orbit: boolean; scout: boolean; isAdmin: boolean; user: { name: string } | null }

const BTN = 'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors';

export default function GlobalNavLinks({ current, signOut }: { current: NavPage; signOut?: boolean }) {
  const [access, setAccess] = useState<Access | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/scout/access', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setAccess({ orbit: j.orbit !== false, scout: j.scout === true, isAdmin: j.isAdmin === true, user: j.user ?? null });
      } catch { /* nav stays as the page rendered it */ }
    })();
    return () => { alive = false; };
  }, []);

  async function onSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/sign-in';
  }

  if (!access) return null;
  return (
    <>
      {current !== 'projects' && access.orbit && (
        <Link href="/dashboard" data-nav="projects" className={BTN}><i className="ti ti-layout-grid" aria-hidden="true" />Projects</Link>
      )}
      {current !== 'scout' && access.scout && (
        <Link href="/scout" data-nav="scout" className={BTN}><i className="ti ti-radar-2" aria-hidden="true" />Scout</Link>
      )}
      {current !== 'admin' && access.isAdmin && (
        <Link href="/admin" data-nav="admin" className={BTN}><i className="ti ti-users-group" aria-hidden="true" />Admin</Link>
      )}
      {current !== 'usage' && (access.isAdmin || access.orbit) && (
        <Link href="/usage" data-nav="usage" className={BTN}><i className="ti ti-gauge" aria-hidden="true" />Dashboard</Link>
      )}
      {signOut && access.user && (
        <button onClick={onSignOut} data-nav="signout" title={`${access.user.name} · sign out`}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors">
          <span className="w-6 h-6 rounded-full bg-orbit-accent/20 text-orbit-accent-light text-[10px] font-mono font-bold flex items-center justify-center">
            {access.user.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
          </span>
          Sign out
        </button>
      )}
    </>
  );
}
