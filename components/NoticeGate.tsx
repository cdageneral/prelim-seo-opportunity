'use client';

/**
 * components/NoticeGate.tsx — the user-facing side of admin notices (v7.461).
 *
 * Mounted once in the root layout, so a notice reaches the user on whatever page
 * they land on after signing in — dashboard, a project, or the usage dashboard.
 *
 * Behaviour (Wayne, 2026-08-15): every active notice the user has not closed is
 * shown; closing one records a real dismissal row for THAT user and it never
 * returns. Closing it for one person never silences it for anyone else. Notices
 * are shown one at a time, oldest first, with an "n of N" counter so the user
 * always knows how many remain rather than being surprised by a second dialog.
 *
 * Signed out (and while auth enforcement is off) the API returns an empty list,
 * so nothing renders at all — a close would have nowhere to be recorded, and a
 * banner that reappears forever is worse than no banner (Const I.5).
 *
 * Const IV.6 / V.5 — every colour here is an orbit-* token or an accent tint, so
 * the dialog is legible in both Warm Paper (light) and dark.
 */

import { useCallback, useEffect, useState } from 'react';

type Severity = 'info' | 'warning' | 'success';

interface Notice {
  id: string; title: string; body: string; severity: Severity; createdAt: string;
}

const SEVERITY: Record<Severity, { icon: string; ring: string; chip: string; label: string }> = {
  info:    { icon: 'ti-info-circle',      ring: 'border-orbit-accent/40', chip: 'bg-orbit-accent/12 text-orbit-accent-light border-orbit-accent/30', label: 'Notice' },
  warning: { icon: 'ti-alert-triangle',   ring: 'border-orbit-amber/40',  chip: 'bg-orbit-amber/12 text-orbit-amber border-orbit-amber/30',          label: 'Important' },
  success: { icon: 'ti-circle-check',     ring: 'border-orbit-green/40',  chip: 'bg-orbit-green/12 text-orbit-green border-orbit-green/30',          label: 'Update' },
};

export default function NoticeGate() {
  const [queue, setQueue]     = useState<Notice[]>([]);
  const [idx, setIdx]         = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/notices', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQueue(Array.isArray(data.notices) ? data.notices : []);
      } catch { /* a failed banner fetch never blocks the app */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const current = queue[idx];

  const dismiss = useCallback(async () => {
    if (!current || closing) return;
    setClosing(true);
    try {
      await fetch(`/api/notices/${current.id}/dismiss`, { method: 'POST' });
    } catch { /* still advance — a network blip must not trap the user behind a dialog */ }
    setClosing(false);
    setIdx(i => i + 1);
  }, [current, closing]);

  // Escape closes the notice exactly like the button (and records the dismissal).
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, dismiss]);

  if (!current) return null;

  const s = SEVERITY[current.severity] ?? SEVERITY.info;
  const posted = new Date(current.createdAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orbit-notice-title"
      data-testid="notice-gate"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    >
      <div className={`w-full max-w-lg rounded-2xl bg-orbit-card border ${s.ring} shadow-orbit-lg flex flex-col max-h-[85vh]`}>
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-orbit-border">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-orbit-muted flex items-center justify-center">
            <i className={`ti ${s.icon} text-xl text-orbit-primary`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-mono text-[9.5px] uppercase tracking-wider px-2 py-0.5 rounded border ${s.chip}`}>
                {s.label}
              </span>
              {queue.length > 1 && (
                <span className="font-mono text-[10px] text-orbit-secondary">{idx + 1} of {queue.length}</span>
              )}
            </div>
            <h2 id="orbit-notice-title" className="text-lg font-semibold text-orbit-primary leading-snug break-words">
              {current.title}
            </h2>
            <p className="font-mono text-[10px] text-orbit-secondary mt-1">Posted {posted}</p>
          </div>
        </div>

        {/* Const IV.1 — a long message scrolls inside the dialog, it never clips. */}
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-[13.5px] leading-relaxed text-orbit-secondary whitespace-pre-wrap break-words">
            {current.body}
          </p>
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-orbit-border flex items-center justify-between gap-3">
          <span className="text-[11px] text-orbit-secondary">
            {queue.length - idx > 1 ? `${queue.length - idx - 1} more after this` : 'This won’t show again'}
          </span>
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={closing}
            className="bg-orbit-accent hover:bg-orbit-accent-light disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {closing ? 'Closing…' : (queue.length - idx > 1 ? 'Got it — next' : 'Got it')}
          </button>
        </div>
      </div>
    </div>
  );
}
