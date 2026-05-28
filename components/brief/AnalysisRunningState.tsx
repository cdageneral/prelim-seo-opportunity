'use client';

import { useEffect, useState } from 'react';

// ─── Two-phase pipeline timing estimates ──────────────────────────────────────
//
//  Phase 1 — Data Gathering
//    Batch 1: Semrush + Profound (parallel) → SerpAPI (5 keywords sequential)
//    Typical: ~20–30s  |  Worst case: ~80s
//
//  Phase 2 — Claude Synthesis (auto-triggered by client when Phase 1 saves)
//    Batch 2: Pass 1 (haiku personas) + Pass 2 (haiku opportunities) in parallel
//    Batch 3: Pass 3 (sonnet narrative) + Pass 4 (haiku PPT prompt) in parallel
//    Batch 4: Save results to database
//    Typical: ~30–60s  |  Worst case: ~150s
//
//  Total typical: ~60–90s  |  Cap shown: 180s
//
const TOTAL_DURATION = 180; // seconds — caps progress display at 98%

const BATCHES = [
  {
    label:  'Phase 1 — Gathering SEO & AI data',
    detail: 'Semrush · Profound · SerpAPI (5 keywords) — all running now',
    endPct: 22,
  },
  {
    label:  'Phase 2 — AI: Personas & Opportunities',
    detail: 'Claude building audience personas + scoring growth opportunities in parallel',
    endPct: 55,
  },
  {
    label:  'Phase 2 — AI: Narrative & Presentation',
    detail: 'Claude writing CMO narrative + generating deck brief in parallel',
    endPct: 88,
  },
  {
    label:  'Saving results',
    detail: 'Writing analysis to database · finalizing brief',
    endPct: 98,
  },
];

interface Props {
  clientName:  string;
  triggeredAt?: string;
  hasError?:   boolean;
}

export default function AnalysisRunningState({ clientName, triggeredAt, hasError }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = triggeredAt ? new Date(triggeredAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [triggeredAt]);

  const progress = Math.min(98, Math.round((elapsed / TOTAL_DURATION) * 100));

  const _batchIdx = BATCHES.findIndex(b => progress < b.endPct);
  const activeBatchIndex = _batchIdx === -1 ? BATCHES.length - 1 : _batchIdx;

  const remaining      = Math.max(0, TOTAL_DURATION - elapsed);
  const remMin         = Math.floor(remaining / 60);
  const remSec         = remaining % 60;
  const remainingLabel =
    remaining > 60  ? `~${remMin}m ${remSec}s remaining`
    : remaining > 0 ? `~${remaining}s remaining`
    : 'Finishing up…';

  const elMin        = Math.floor(elapsed / 60);
  const elSec        = elapsed % 60;
  const elapsedLabel = elMin > 0 ? `${elMin}m ${elSec}s` : `${elapsed}s`;

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
          Two-phase pipeline — Phase 1 gathers SEO data, Phase 2 runs Claude AI synthesis.
          Usually completes in 1–2 minutes.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-orbit-accent text-sm font-bold tabular-nums">
            {progress}%
          </span>
          <span className="text-orbit-tertiary text-xs tabular-nums">
            {elapsed > 0 ? remainingLabel : 'Starting…'}
          </span>
        </div>
        <div className="w-full h-1.5 bg-orbit-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orbit-accent to-cyan-400 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-orbit-tertiary text-xs mt-1 text-right tabular-nums">
          Elapsed: {elapsedLabel}
        </p>
      </div>

      {/* Batch list */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        {BATCHES.map((batch, i) => {
          const isDone   = i < activeBatchIndex;
          const isActive = i === activeBatchIndex;

          return (
            <div key={i} className="flex items-start gap-3">
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
                  {batch.label}
                </p>
                <p className={`text-xs mt-0.5 transition-colors ${
                  isActive ? 'text-orbit-secondary' : 'text-orbit-tertiary/60'
                }`}>
                  {batch.detail}
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
    </div>
  );
}
