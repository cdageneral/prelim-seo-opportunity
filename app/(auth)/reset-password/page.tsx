'use client';

/**
 * /reset-password  (v7.485) — set a new password from a one-time admin link.
 *
 * Public by design: the whole point is that the person cannot sign in. The token
 * in the query string is the only credential, and every guard on it lives in
 * /api/auth/reset — this page just renders the three states it can be in
 * (checking / valid / dead link) and never decides validity itself.
 *
 * Styled with orbit-* theme tokens so it reads in both light and dark (Const IV.6),
 * matching /sign-in exactly (Const VII.3 — style continuity).
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

type Phase = 'checking' | 'ready' | 'dead' | 'done';

function ResetPasswordInner() {
  const router = useRouter();
  const token  = useSearchParams().get('token') ?? '';

  const [phase, setPhase]     = useState<Phase>('checking');
  const [who, setWho]         = useState<{ name: string; email: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Validate the link on mount so a dead link says so immediately, rather than
  // after the person has typed a password twice.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setPhase('dead'); setError('This link is missing its token.'); return; }
      try {
        const res  = await fetch('/api/auth/reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) { setError(data.error || 'This reset link is not valid.'); setPhase('dead'); return; }
        setWho(data.user ?? null);
        setPhase('ready');
      } catch {
        if (alive) { setError('Network error — please try the link again.'); setPhase('dead'); }
      }
    })();
    return () => { alive = false; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm)  { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const res  = await fetch('/api/auth/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not set the password.'); setBusy(false); return; }
      setPhase('done');
      setBusy(false);
      setTimeout(() => router.replace('/sign-in'), 2500);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-orbit-bg text-orbit-primary flex items-center justify-center px-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-orbit-tertiary mb-1">OrbitIQ</div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
        </div>

        <div className="bg-orbit-surface border border-orbit-border rounded-xl p-5">
          {phase === 'checking' && (
            <p className="text-[13px] text-orbit-secondary">Checking this link…</p>
          )}

          {phase === 'dead' && (
            <>
              <p className="text-[13px] text-orbit-red mb-3">{error}</p>
              <p className="text-[12px] text-orbit-tertiary mb-4">
                Reset links expire 30 minutes after they are created and can only be used once.
                Ask an owner or admin to create a fresh one.
              </p>
              <a href="/sign-in" className="font-mono text-[12px] text-orbit-accent hover:underline">Back to sign in</a>
            </>
          )}

          {phase === 'done' && (
            <>
              <p className="text-[13px] text-orbit-green mb-2">Password updated.</p>
              <p className="text-[12px] text-orbit-tertiary mb-4">
                Taking you to sign in — use your new password there.
              </p>
              <a href="/sign-in" className="font-mono text-[12px] text-orbit-accent hover:underline">Sign in now</a>
            </>
          )}

          {phase === 'ready' && (
            <form onSubmit={submit}>
              {who && (
                <p className="text-[12px] text-orbit-secondary mb-4">
                  Setting the password for <span className="font-mono text-orbit-primary">{who.email}</span>.
                </p>
              )}

              <label className="block mb-3">
                <span className="block text-[11px] text-orbit-tertiary mb-1">New password</span>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password} required
                    onChange={e => setPassword(e.target.value)} placeholder="at least 8 characters"
                    className="w-full bg-orbit-bg border border-orbit-border rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-orbit-accent" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    title={showPw ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-orbit-tertiary hover:text-orbit-primary">
                    <i className={showPw ? 'ti ti-eye-off text-[15px]' : 'ti ti-eye text-[15px]'} />
                  </button>
                </div>
              </label>

              <label className="block mb-4">
                <span className="block text-[11px] text-orbit-tertiary mb-1">Confirm password</span>
                <input
                  type={showPw ? 'text' : 'password'} value={confirm} required
                  onChange={e => setConfirm(e.target.value)} placeholder="type it again"
                  className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-sm outline-none focus:border-orbit-accent" />
              </label>

              {error && <p className="text-[12px] text-orbit-red mb-3">{error}</p>}

              <button type="submit" disabled={busy}
                className="w-full bg-orbit-accent hover:bg-orbit-accent-light text-white text-[13px] font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">
                {busy ? 'Saving…' : 'Set password'}
              </button>
              <p className="text-[11px] text-orbit-tertiary mt-3">
                This link works once. Setting a password signs out every other session on this account.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
