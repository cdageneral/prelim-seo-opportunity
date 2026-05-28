'use client';

import { useEffect, useState } from 'react';

// Approximate total duration in seconds (median ~3 min).
// Progress caps at 98% until the poll confirms completion.
const TOTAL_DURATION = 180;

const STEPS = [
  {
    label:  'Querying Semrush',
    detail: 'Domain overview · keyword footprint · competitor gap',
    endPct: 20,
  },
  {
    label:  'Scanning SERPs',
    detail: 'Live SERP snapshots · AI Overview detection · PAA clusters',
    endPct: 40,
  },
  {
    label:  'Checking LLM Visibility',
    detail: 'Brand context · platform scores · topic authority',
    endPct: 55,
  },
  {
    label:  'Running Claude Synthesis',
    detail: 'Personas · opportunity scoring · narrative generation',
    endPct: 90,
  },
  {
    label:  'Building Brief',
    detail: 'Storing results · generating PPT prompt',
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

  // Progress percentage — smoothly fills to 98%, never shows 100% until done
  const progress = Math.min(98, Math.round((elapsed / TOTAL_DURATION) * 100));

  // Which step is active based on progress
  const currentStepIndex = Math.max(
    0,
    STEPS.findIndex(s => progress < s.endPct)
  );

  // Remaining / elapsed labels
  const remaining    = Math.max(0, TOTAL_DURATION - elapsed);
  const remMin       = Math.floor(remaining / 60);
  const remSec       = remaining % 60;
  const remainingLabel =
    remaining > 60  ? `~${remMin}m ${remSec}s remaining`
    : remaining > 0 ? `~${remaining}s remaining`
    : 'Finishing up…';

  const elMin       = Math.floor(elapsed / 60);
  const elSec       = elapsed % 60;
  const elapsedLabel = elMin > 0 ? `${elMin}m ${elSec}s` : `${elapsed}s`;

  const statusDot = hasError
    ? 'bg-red-500'
    : 'bg-emerald-400';

  return (
    <div className="orbit-card p-10 flex flex-col items-center gap-8">

      {/* Orbit ring */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 border-orbit-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orbit-accent animate-spin" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-b-cyan-500 animate-spin"
          style={{ animationDuration: '1.8s', animationDirection: 'reverse' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Green = running  |  Red = error */}
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${statusDot}`} />
        </div>
      </div>

      {/* Headline */}
      <div className="text-center">
        <h3 className="text-orbit-primary text-xl font-semibold">
          Analyzing {clientName}
        </h3>
        <p className="text-orbit-secondary text-sm mt-2 max-w-md">
          OrbitIQ is querying live data across Semrush, SerpAPI, and Profound,
          then running the Claude synthesis pipeline. This takes 2–4 minutes.
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

      {/* Step list */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {STEPS.map((step, i) => {
          const isDone   = i < currentStepIndex;
          const isActive = i === currentStepIndex;

          return (
            <div key={i} className="flex items-start gap-3">
              {/* Step indicator */}
              <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 ${
                isDone
                  ? 'bg-emerald-500/20 border-emerald-500/50'
                  : isActive
                    ? 'bg-orbit-accent/20 border-orbit-accent/60'
                    : 'bg-orbit-muted border-orbit-border'
              }`}>
                {isDone ? (
                  /* Checkmark */
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    isActive ? 'bg-orbit-accent animate-pulse' : 'bg-orbit-secondary/40'
                  }`} />
                )}
              </div>

              {/* Labels */}
              <div>
                <p className={`text-sm font-medium transition-colors ${
                  isDone   ? 'text-emerald-400'
                  : isActive ? 'text-orbit-primary'
                  : 'text-orbit-secondary/60'
                }`}>
                  {step.label}
                </p>
                <p className="text-orbit-tertiary text-xs">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
