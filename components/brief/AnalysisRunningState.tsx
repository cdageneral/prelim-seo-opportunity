'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Two-phase pipeline (v7.343 — REAL progress, Const IV.2) ──────────────────
//
//  Phase 1 — Data Gathering (Semrush/upload + Profound + SerpAPI)   ~20–80s
//  Phase 2 — Claude synthesis. The LONG step is keyword categorization:
//    every keyword is classified in 25-keyword batches (8k keywords ≈ 328
//    batches ≈ 15–25 min). The server checkpoints after every wave and the
//    page auto-resumes across the platform's 5-minute function windows, so
//    long runs are safe to walk away from.
//
//  When the server checkpoint is available this screen shows the REAL batch
//  count ("batch 210 of 328") and an ETA computed from the actual observed
//  batch rate — never a fake time-based percentage (the old screen showed
//  "98% · Saving results" while the engine was mid-categorization). Until the
//  first checkpoint arrives it honestly shows elapsed time only (Const I.5).

interface Progress { done: number; total: number; stage: string }

interface Props {
  clientName:   string;
  triggeredAt?: string;
  hasError?:    boolean;
  // v7.343: real server-checkpoint progress (null until the first poll lands)
  progress?:        Progress | null;
  onCancelAndClear?: () => void;
}

const STEPS = [
  { key: 'gathering',    label: 'Phase 1 — Gathering SEO & AI data',       detail: 'Semrush / uploaded footprints · Profound · SerpAPI' },
  { key: 'categorizing', label: 'Phase 2 — Categorizing every keyword',    detail: 'The long step: 25-keyword batches, checkpointed continuously' },
  { key: 'insights',     label: 'Phase 2 — AI visibility & opportunities', detail: 'LLM probe · opportunity scoring · audience segments' },
  { key: 'finalizing',   label: 'Finalizing brief',                        detail: 'CMO narrative · deck brief · saving to database' },
];

export default function AnalysisRunningState({ clientName, triggeredAt, hasError, progress, onCancelAndClear }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling]       = useState(false);
  // Observed batch rate for a REAL ETA: remember the first progress sample.
  const firstSample = useRef<{ t: number; done: number } | null>(null);

  useEffect(() => {
    const startMs = triggeredAt ? new Date(triggeredAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [triggeredAt]);

  useEffect(() => {
    if (progress && progress.total > 0 && firstSample.current === null) {
      firstSample.current = { t: Date.now(), done: progress.done };
    }
  }, [progress]);

  const hasReal = !!(progress && progress.total > 0 && progress.stage !== 'gathering');

  // Real percentage: categorization spans 5→85% of the bar; later stages fill the rest.
  let pct: number | null = null;
  let progressLine = '';
  if (hasReal) {
    const p = progress!;
    if (p.stage === 'categorizing') {
      pct = 5 + Math.round((p.done / p.total) * 80);
      progressLine = `Categorizing keywords — batch ${p.done.toLocaleString()} of ${p.total.toLocaleString()}`;
    } else if (p.stage === 'insights') {
      pct = 88;
      progressLine = 'Categorization done — building AI visibility & opportunities';
    } else {
      pct = 94;
      progressLine = 'Finalizing brief';
    }
  }

  // Real ETA from the observed batch rate (only once we have two samples of signal).
  let etaLabel = '';
  if (hasReal && progress!.stage === 'categorizing' && firstSample.current) {
    const dBatches = progress!.done - firstSample.current.done;
    const dSecs    = (Date.now() - firstSample.current.t) / 1000;
    if (dBatches >= 5 && dSecs > 20) {
      const rate = dBatches / dSecs;                          // batches per second (observed)
      const rem  = Math.max(0, progress!.total - progress!.done) / Math.max(rate, 0.001);
      const m = Math.round(rem / 60);
      etaLabel = m >= 2 ? `~${m} min remaining (observed rate)` : '~1 min remaining';
    }
  }

  const elMin        = Math.floor(elapsed / 60);
  const elSec        = elapsed % 60;
  const elapsedLabel = elMin > 0 ? `${elMin}m ${elSec}s` : `${elapsed}s`;

  const activeKey = hasReal ? progress!.stage : (elapsed < 60 ? 'gathering' : 'categorizing');
  const activeIdx = Math.max(0, STEPS.findIndex(s => s.key === activeKey));

  const statusDot = hasError ? 'bg-red-500' : 'bg-emerald-400';

  return (
    <div className="orbit-card p-10 flex flex-col items-center gap-8">

      {/* Orbit spinner */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 border-orbit-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orbit-accent animate-spin" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-b-cyan-500 animate-spin"
          style={{ animationDuration: '1.8s', animationDirection: 'reverse' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${statusDot}`} />
        </div>
      </div>

      {/* Headline */}
      <div className="text-center">
        <h3 className="text-orbit-primary text-xl font-semibold">
          Analyzing {clientName}
        </h3>
        <p className="text-orbit-secondary text-sm mt-2 max-w-md">
          Small uploads finish in 1–2 minutes. Large uploads (5,000+ keywords) take 15–25 minutes —
          progress is saved continuously and the run resumes itself, so it&apos;s safe to leave this open.
        </p>
      </div>

      {/* Progress bar — REAL when the checkpoint is available, elapsed-only before that */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-orbit-accent text-sm font-bold tabular-nums">
            {pct !== null ? `${pct}%` : 'Working…'}
          </span>
          <span className="text-orbit-tertiary text-xs tabular-nums">
            {etaLabel || (pct === null ? 'Progress appears once the first batches save' : '')}
          </span>
        </div>
        <div className="w-full h-1.5 bg-orbit-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orbit-accent to-cyan-400 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct ?? 4}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-orbit-secondary text-xs tabular-nums">{progressLine}</p>
          <p className="text-orbit-tertiary text-xs tabular-nums">Elapsed: {elapsedLabel}</p>
        </div>
      </div>

      {/* Step list — driven by the REAL stage when available */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        {STEPS.map((step, i) => {
          const isDone   = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ${
                isDone
                  ? 'bg-emerald-500/20 border-emerald-500/60'
                  : isActive
                    ? 'bg-orbit-accent/20 border-orbit-accent'
                    : 'bg-orbit-muted border-orbit-border'
              }`}>
                {isDone ? (
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-orbit-accent animate-pulse" />
                ) : (
                  <span className="text-orbit-tertiary text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold transition-colors ${
                  isDone   ? 'text-emerald-400'
                  : isActive ? 'text-orbit-primary'
                  : 'text-orbit-secondary/50'
                }`}>
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 transition-colors ${
                  isActive ? 'text-orbit-secondary' : 'text-orbit-tertiary/60'
                }`}>
                  {step.key === 'categorizing' && isActive && hasReal && progress!.stage === 'categorizing'
                    ? `Batch ${progress!.done.toLocaleString()} of ${progress!.total.toLocaleString()} — checkpointed continuously`
                    : step.detail}
                </p>
              </div>
              {isActive && (
                <div className="shrink-0 mt-0.5">
                  <div className="w-4 h-4 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* v7.343: cancel & clear uploaded CSVs — two-step confirm, destructive styling */}
      {onCancelAndClear && (
        <div className="w-full max-w-sm border-t border-orbit-border pt-4 flex flex-col items-center gap-2">
          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="text-xs text-orbit-tertiary hover:text-red-400 transition-colors underline underline-offset-2"
            >
              Cancel &amp; clear uploaded files…
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-red-400 text-center">
                This stops the run and deletes ALL uploaded keyword files for this project
                (client + competitor CSVs). Project settings, brand terms, and the saved
                category tree are kept. This cannot be undone.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setCancelling(true); onCancelAndClear(); }}
                  disabled={cancelling}
                  className="text-xs px-3 py-1.5 rounded-md bg-red-500/15 border border-red-500/50 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Clearing…' : 'Yes — stop & delete uploads'}
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  disabled={cancelling}
                  className="text-xs px-3 py-1.5 rounded-md border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors"
                >
                  Keep running
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
