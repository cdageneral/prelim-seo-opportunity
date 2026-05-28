'use client';

import { useEffect, useState } from 'react';

// ─── Pipeline batch timing estimates (seconds) ────────────────────────────────
//
//  Batch 1 — Data Gathering   (Semrush + Profound in parallel, then 5 SerpAPI
//             keywords sequentially):  ~15–30s
//  Batch 2 — Claude Pass 1+2  (Haiku personas + Sonnet opportunities in
//             parallel):              ~20–40s
//  Batch 3 — Claude Pass 3+4  (Sonnet narrative + Sonnet PPT prompt in
//             parallel):              ~30–60s
//  Batch 4 — Saving Results   (DB write):  ~2–5s
//
//  Median total: ~75s  |  Worst case: ~150s  |  Cap shown: 240s
//
const TOTAL_DURATION = 180; // seconds — used for % estimate; caps at 98%

// Each batch: the % threshold at which it is considered "done"
// and the next batch becomes active.
const BATCHES = [
  {
    label:  'Batch 1 — Gathering SEO data',
    detail: 'Semrush · SerpAPI (5 keywords) · Profound running in parallel',
    endPct: 25,
  },
  {
    label:  'Batch 2 — AI: Personas & Opportunities',
    detail: 'Claude building audience personas + scoring growth opportunities',
    endPct: 55,
  },
  {
    label:  'Batch 3 — AI: Narrative & Presentation',
    detail: 'Claude writing CMO narrative + generating deck brief (running in parallel)',
    endPct: 90,
  },
  {
    label:  'Batch 4 — Saving results',
    detail: 'Writing analysis to database · finalizing brief',
    endPct: 98,
  },
];

interface Props {
  clientName:  string;
  triggeredAt?: string;   // ISO string from the analysis record
  hasError?:   boolean;   // true → show red dot instead of green
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

  // Progress percentage — fills to 98%, never 100% until poll confirms done
  const progress = Math.min(98, Math.round((elapsed / TOTAL_DURATION) * 100));

  // Active batch based on progress
  // When findIndex returns -1 (progress >= all endPct values), stay on the last
  // batch rather than wrapping back to 0.
  const _batchIdx = BATCHES.findIndex(b => progress < b.endPct);
  const activeBatchIndex = _batchIdx === -1 ? BATCHES.length - 1 : _batchIdx;

  // Time labels
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
          Running 4 pipeline batches — data gathering, then two rounds of parallel
          Claude AI synthesis. Usually completes in 2–3 minutes.
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
              {/* Batch indicator */}
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

              {/* Labels */}
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

              {/* Active spinner badge */}
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
