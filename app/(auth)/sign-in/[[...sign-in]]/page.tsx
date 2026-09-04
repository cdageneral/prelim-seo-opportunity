'use client';

/**
 * /sign-in  (v7.373) — real email + password login, with first-owner bootstrap.
 *
 * On mount it asks /api/auth/me: if already signed in → go to ?next (or the
 * dashboard); if the app has no users yet → show the "Create owner account"
 * form; otherwise the login form. Styled with orbit-* theme tokens so it reads
 * in both light and dark (Const IV.6).
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

type Mode = 'loading' | 'login' | 'bootstrap';

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') || '/dashboard';

  const [mode, setMode]         = useState<Mode>('loading');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        if (data.user) { router.replace(nextPath); return; }
        setMode(data.needsBootstrap ? 'bootstrap' : 'login');
      } catch {
        if (alive) setMode('login');
      }
    })();
    return () => { alive = false; };
  }, [router, nextPath]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url  = mode === 'bootstrap' ? '/api/auth/bootstrap' : '/api/auth/login';
      const body = mode === 'bootstrap' ? { name, email, password } : { email, password };
      const res  = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); setBusy(false); return; }
      router.replace(nextPath);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  }

  const isBootstrap = mode === 'bootstrap';

  return (
    <div className="min-h-screen bg-orbit-bg text-orbit-primary flex flex-col">
      <div className="absolute top-4 right-4 z-10"><ThemeToggle /></div>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Brand panel */}
        <div
          className="hidden lg:flex flex-col justify-center px-14 py-16 lg:w-[55%] border-b lg:border-b-0 lg:border-r border-orbit-border relative overflow-hidden"
          style={{ background:
            'radial-gradient(700px 400px at 20% 10%, rgba(108,99,255,0.14), transparent 60%),' +
            'radial-gradient(600px 500px at 90% 90%, rgba(6,182,212,0.10), transparent 55%)' }}
        >
          <div className="text-4xl font-extrabold leading-tight max-w-md">
            See where you win the{' '}
            <span className="bg-gradient-to-r from-orbit-accent to-orbit-cyan bg-clip-text text-transparent">answer box.</span>
          </div>
          <p className="text-orbit-secondary mt-5 max-w-sm text-[15px]">
            SEO &amp; generative-engine visibility intelligence. Sign in to reach your projects, content plans, and authority scans.
          </p>
          <ul className="mt-8 space-y-3 max-w-sm">
            {[
              'Your projects, exactly the ones you’re granted',
              'Every login and project action is logged for the owner',
              'Invite a teammate in seconds; revoke access just as fast',
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-orbit-secondary">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orbit-green flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Form panel */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2 mb-8">
              <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-orbit-cyan to-orbit-accent" />
              <span className="text-lg font-bold gradient-text">OrbitIQ</span>
            </div>

            {mode === 'loading' ? (
              <div className="space-y-3">
                <div className="h-6 w-32 bg-orbit-muted rounded animate-pulse" />
                <div className="h-11 bg-orbit-muted rounded-lg animate-pulse" />
                <div className="h-11 bg-orbit-muted rounded-lg animate-pulse" />
              </div>
            ) : (
              <form onSubmit={submit}>
                <h1 className="text-xl font-bold">{isBootstrap ? 'Create your owner account' : 'Sign in'}</h1>
                <p className="text-orbit-secondary text-[13px] mt-1 mb-6">
                  {isBootstrap
                    ? 'First run — set up the account that will own OrbitIQ. You can add your team afterward.'
                    : 'Welcome back. Enter your credentials.'}
                </p>

                {isBootstrap && (
                  <label className="block mb-4">
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Full name</span>
                    <input
                      value={name} onChange={e => setName(e.target.value)} required autoComplete="name"
                      placeholder="Wayne Cichanski"
                      className="w-full bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent focus:ring-2 focus:ring-orbit-accent/20 transition"
                    />
                  </label>
                )}

                <label className="block mb-4">
                  <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Work email</span>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orbit-accent focus:ring-2 focus:ring-orbit-accent/20 transition"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-mono uppercase tracking-wider text-orbit-tertiary mb-1.5">Password</span>
                  {/* v7.485: reveal toggle. Masked by default; the eye is for the
                      person who cannot tell whether they mistyped it. */}
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      autoComplete={isBootstrap ? 'new-password' : 'current-password'}
                      placeholder={isBootstrap ? 'At least 8 characters' : '••••••••••'}
                      className="w-full bg-orbit-surface border border-orbit-border rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none focus:border-orbit-accent focus:ring-2 focus:ring-orbit-accent/20 transition"
                    />
                    <button
                      type="button" onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      title={showPw ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-orbit-tertiary hover:text-orbit-primary transition-colors"
                    >
                      <i className={showPw ? 'ti ti-eye-off text-[15px]' : 'ti ti-eye text-[15px]'} />
                    </button>
                  </div>
                </label>

                {error && (
                  <div className="mt-4 text-[13px] text-orbit-red bg-orbit-red/10 border border-orbit-red/30 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit" disabled={busy}
                  className="w-full mt-6 bg-orbit-accent hover:bg-orbit-accent-light disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-3 transition-colors"
                >
                  {busy ? 'Please wait…' : isBootstrap ? 'Create account →' : 'Sign in →'}
                </button>

                {!isBootstrap && (
                  <p className="text-[11px] text-orbit-tertiary mt-5">
                    New teammates are added by an admin — there is no open sign-up.
                    {' '}Forgot your password? Ask an owner or admin for a reset link — passwords
                    are stored one-way and cannot be looked up.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
