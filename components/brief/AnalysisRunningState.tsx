'use client';

const STEPS = [
  { label: 'Querying Semrush',    detail: 'Domain overview · keyword footprint · competitor gap' },
  { label: 'Scanning SERPs',      detail: 'Live SERP snapshots · AI Overview detection · PAA clusters' },
  { label: 'Checking LLM Visibility', detail: 'Brand context · platform scores · topic authority' },
  { label: 'Running Claude Synthesis', detail: 'Personas · opportunity scoring · narrative generation' },
  { label: 'Building Brief',      detail: 'Storing results · generating PPT prompt' },
];

export default function AnalysisRunningState({ clientName }: { clientName: string }) {
  return (
    <div className="orbit-card p-10 flex flex-col items-center gap-8">
      {/* Animated orbit ring */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 border-orbit-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orbit-accent animate-spin" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-b-cyan-500 animate-spin" style={{ animationDuration: '1.8s', animationDirection: 'reverse' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-orbit-accent rounded-full animate-pulse" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-orbit-primary text-xl font-semibold">
          Analyzing {clientName}
        </h3>
        <p className="text-orbit-secondary text-sm mt-2 max-w-md">
          OrbitIQ is querying live data across Semrush, SerpAPI, and Profound,
          then running the Claude synthesis pipeline. This takes 2–4 minutes.
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-orbit-muted border border-orbit-border flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 bg-orbit-secondary rounded-full animate-pulse-slow" style={{ animationDelay: `${i * 0.4}s` }} />
            </div>
            <div>
              <p className="text-orbit-primary text-sm font-medium">{step.label}</p>
              <p className="text-orbit-tertiary text-xs">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
