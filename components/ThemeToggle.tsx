'use client';

import { useEffect, useState } from 'react';

/**
 * ThemeToggle (v7.185) — dark/light switch for the global header.
 * Reads/writes the [data-theme] attribute on <html> and persists the choice to
 * localStorage ('orbitiq-theme'). The no-flash script in app/layout.tsx applies
 * the stored theme before first paint; this component keeps React state in sync.
 * Dark is the default.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Sync from the attribute the no-flash script already set (avoids hydration flash).
  useEffect(() => {
    const current =
      document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const apply = (next: 'dark' | 'light') => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('orbitiq-theme', next);
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  };

  const isLight = theme === 'light';

  return (
    <button
      onClick={() => apply(isLight ? 'dark' : 'light')}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={isLight}
      className="flex items-center gap-2 h-[30px] px-2.5 rounded-lg border border-orbit-border bg-orbit-muted hover:border-orbit-muted transition-colors"
    >
      <i
        className="ti ti-moon"
        aria-hidden="true"
        style={{ fontSize: 15, color: isLight ? 'var(--text-tertiary)' : 'var(--accent-light)' }}
      />
      <span
        style={{
          position: 'relative',
          width: 38,
          height: 20,
          borderRadius: 20,
          background: 'var(--accent-dim)',
          flexShrink: 0,
          display: 'inline-block',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--accent)',
            transform: isLight ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform .25s ease',
            display: 'block',
          }}
        />
      </span>
      <i
        className="ti ti-sun"
        aria-hidden="true"
        style={{ fontSize: 15, color: isLight ? 'var(--amber)' : 'var(--text-tertiary)' }}
      />
    </button>
  );
}
