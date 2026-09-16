'use client';

/**
 * components/brief/InsightsSection.tsx — the Insights panel.
 *
 * v7.471: sub-view under Executive Summary — generated cross-panel narrative
 *   through the shared Seer core with the v7.463 fail-closed number gate, plus
 *   the deterministic quadrant and coverage table.
 * v7.487/v7.488: generation survives a dropped stream (job row + poll).
 * v7.496 (Wayne, 2026-09-15): rebuilt as a DECISION panel for a CEO/CMO:
 *   1. The situation — what is happening to the brand (generated, written
 *      against the computed standing; the standing-claim gate rejects any
 *      strength/weakness claim the data contradicts).
 *   2. Standing — the brand vs field average vs best-in-class on traditional
 *      search AND AI visibility, overall and per product line. Deterministic
 *      (lib/insightsPanel/decision), renders whether or not a narrative exists.
 *   3. What is holding the brand back — the binding constraints, with mechanism.
 *   4. Where to invest and what it is worth — the engine's order + the modeled
 *      scenario bars (the one approved CTR curve, labeled, Const I.5a).
 *   5. Path to market leader — what best-in-class holds, the gap, the modeled
 *      gain at parity, the constraints.
 *   6. Key opportunities. 7. Competitor playbook (doing well / vulnerable / key
 *      stat) with each rival's measured play. 8. Local markets — demand by city
 *      with the brand's hold, the strongest rival and map-pack standing.
 *   9. Market shifts (AI Overviews, AI answers) — as measured today; no time
 *      series is stored, and the panel says so.
 *   Supporting data (quadrant, coverage table, market benchmarks) is collapsed
 *   below. A blob stored by the v7.471 engine still renders (legacy block) with
 *   a prompt to regenerate.
 *
 * Const IV.1: scroll root is `flex-1 min-h-0 overflow-y-auto`.
 * Const IV.2: generation streams live step labels (step N of 5 + elapsed).
 * Const IV.6: colour tokens are the shipped panel vocabulary (theme-mapped).
 *
 *   v7.497 — the decision block is READ from the stored blob (`insights.computed`,
 *   saved with the narrative it was verified against) instead of rebuilt on
 *   every open; a provenance line under the standing tables says when it was
 *   computed and flags a newer scan. The plays list is bounded (playsBasis).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ── v7.471 legacy blob shape (still stored on projects generated before v7.496) ──
interface Pattern { tag: string; title: string; body: string; }
interface PlaybookRow { brand: string; doingWell: string; vulnerable: string; keyStat: string; }
interface StrikeRow { title: string; body: string; impact: 'HIGH' | 'MEDIUM'; }
// ── v7.496 blob shape ──
interface HoldingBack { title: string; body: string; lines: string[]; evidence: string; }
interface Opportunity { title: string; body: string; sizing: string; impact: 'HIGH' | 'MEDIUM'; }
interface InvestMove { move: string; why: string; modeledGain: string; }
interface InsightsBlob {
  schema?: string;
  // v7.496
  situation?: { headline: string; body: string };
  holdingBack?: HoldingBack[];
  opportunities?: Opportunity[];
  invest?: { order: InvestMove[]; caveat: string | null };
  leaderPath?: { whatLeaderLooksLike: string; gap: string; incrementalGain: string; constraints: string[] };
  localMarkets?: { summary: string; markets: Array<{ city: string; finding: string }> } | null;
  shifts?: Array<{ title: string; body: string }>;
  // v7.471
  thesis?: { headline: string; body: string; openPosition: string | null };
  patterns?: Pattern[]; strike?: StrikeRow[];
  // both
  playbook: PlaybookRow[];
  sources: string[]; generatedAt: string; model: string; verified: number;
  analysisCompletedAt?: string | null;
}
interface QuadPoint { brand: string; isClient: boolean; visibilityPct: number; citations: number; domain: string; quadrant: string; }
interface Quadrant { points: QuadPoint[]; unmatched: Array<{ brand: string; isClient: boolean; visibilityPct: number }>; medians: { visibilityPct: number; citations: number }; basis: string; }
interface CovLine { product: string; journeyTopicsRequired: number | null; client: { covered: number | null; pct: number | null }; leader: { domain: string; isClient: boolean; covered: number | null; pct: number | null } | null; fieldAvgPct: number | null; brandsMeasured: number; gapSubCategories: string[]; }
interface Coverage { lines: CovLine[]; basis: string; }
interface BenchRow { brand: string; metric: string; value: string; rank?: number | null; source: string; }

// ── v7.496 decision inputs (lib/insightsPanel/decision — the panel READS them) ──
type StandingWord = 'leads' | 'above' | 'below' | 'last' | 'unmeasured';
interface StandingRow { key: string; metric: string; unit: 'pct' | 'pos' | 'count' | 'volume'; basis: 'measured' | 'modeled'; client: number | null; fieldAvg: number | null; best: { domain: string; value: number } | null; clientRank: number | null; of: number; standing: StandingWord; brands: Array<{ domain: string; value: number; isClient: boolean }>; brandsShown?: number; note: string; }
interface LineStanding { product: string; demandMonthly: number; kwCount: number; client: { p1Vol: number; p1Share: number; rank: number | null; bands: [number, number, number, number] }; standing: StandingWord; fieldAvgP1Vol: number | null; best: { domain: string; p1Vol: number; isClient: boolean } | null; brandsOnLadder: number; ladderTop: Array<{ domain: string; p1Vol: number; p1Kw: number; kind: string }>; ai: { probeMentionRate: number | null; probeMentions: number | null; probeTotal: number | null; answerShare: number | null; citedLeader: { domain: string; count: number; isClient: boolean } | null; clientCited: number | null }; serp: { aioAvail: number; aioAcq: number; aioRate: number; paaAvail: number; paaAcq: number; paaRate: number } | null; }
interface Scenario { key: string; label: string; basis: 'modeled' | 'measured'; keywords: number; volumeMonthly: number; clicksMonthlyFloor: number | null; clicksMonthlyCeiling: number | null; floorTarget: string; ceilingTarget: string; perLine: Array<{ product: string; keywords: number; volumeMonthly: number; clicksMonthlyFloor: number | null; clicksMonthlyCeiling: number | null }>; note: string; }
interface CompetitorPlay { domain: string; kind: string; landscape: { p1Vol: number; p1Kw: number; top3Vol: number; top3Kw: number; measuredKw: number; rank: number | null }; linesWon: Array<{ product: string; rank: number; p1Vol: number; p1Kw: number }>; linesAbsent: string[]; queryMix: Array<{ type: string; kw: number; volume: number }>; pageTypes: Array<{ type: string; urls: number }> | null; outrankedByClient: { kw: number; volume: number }; outranksClient: { kw: number; volume: number }; local: { packAppearances: number; packShare: number; avgRating: number | null; maxReviews: number } | null; ai: { namedPct: number | null; citations: number | null } | null; }
interface LocalMarket { city: string; demandMonthly: number; kwCount: number; client: { p1Kw: number; p1Vol: number; bestPos: number | null; rankedKw: number }; topRival: { domain: string; p1Vol: number; p1Kw: number } | null; pack: { cells: number; withPack: number; clientBestRank: number | null; clientInPack: number; leaders: string[]; clientReviews: number | null; leaderReviews: number | null } | null; }
interface Decision {
  clientDomain: string;
  standing: { search: StandingRow[]; ai: StandingRow[]; lines: LineStanding[]; basis: string };
  scenarios: { currentClicksMonthly: number; leaderClicksMonthly: number | null; leaderDomain: string | null; moves: Scenario[]; ctrSource: string; basis: string };
  plays: CompetitorPlay[];
  playsBasis?: { measured: number; withPage1: number; tracked: number; shown: number; rule: string };   // v7.497 — the plays list is bounded; this says what it is a cut of
  local: { markets: LocalMarket[]; nearMe: { kwCount: number; demandMonthly: number; clientP1Kw: number; clientP1Vol: number }; geoTotal: { kwCount: number; demandMonthly: number; cities: number }; scan: { locations: number; scannedCells: number; withPack: number; clientInPack: number; clientRank1: number; builtAt: string | null } | null; packLeaders: Array<{ name: string; appearances: number; sharePct: number; avgRating: number | null; maxReviews: number; isClient: boolean }>; basis: string } | null;
  shifts: { serp: { scanned: number; withAIO: number; aioClientCited: number; withPAA: number; paaClientCited: number; aioVolumeMonthly: number; aioUncitedVolumeMonthly: number } | null; aiAnswers: { probeMentions: number; probeTotal: number; linesScanned: number; linesWithClientShare: number } | null; history: null; historyNote: string };
}
// v7.497 — where the decision block came from. `stored` = saved with the narrative at generation
// (the block the claim gate checked); `live` = rebuilt on this open because the blob carries none.
interface DecisionBasis { source: 'stored' | 'live'; builtAt: string | null; analysisId: string | null; analysisTriggeredAt: string | null; latestAnalysisId: string | null; stale: boolean; }
/** v7.497 — the block a stored blob carries, read the same way GET reads it (lib/insightsPanel/computed). */
function computedOf(blob: any): { decision: Decision; coverage: Coverage | null; basis: DecisionBasis } | null {
  const c = blob?.computed;
  const d = c?.decision;
  if (!c || !d || !d.standing || !d.scenarios || !Array.isArray(d.plays)) return null;
  return {
    decision: d as Decision, coverage: (c.coverage ?? null) as Coverage | null,
    basis: { source: 'stored', builtAt: typeof c.builtAt === 'string' ? c.builtAt : null, analysisId: c.analysisId ?? null, analysisTriggeredAt: c.analysisTriggeredAt ?? null, latestAnalysisId: c.analysisId ?? null, stale: false },
  };
}

interface Props { projectId: string; clientName?: string | null; pollMs?: number; }   // pollMs: v7.488 — test seam only; the app never passes it

const TAG_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PATTERN:     { label: 'PATTERN',     color: 'var(--c-9b96ff)', bg: 'var(--ca-108-99-255-0_12)', border: 'var(--ca-108-99-255-0_25)' },
  GOOD_NEWS:   { label: 'GOOD NEWS',   color: 'var(--c-34d399)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
  RISK:        { label: 'RISK',        color: 'var(--c-f87171)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
  OPPORTUNITY: { label: 'OPPORTUNITY', color: 'var(--c-46cce0)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
};
// v7.496 standing chips — theme-mapped tokens already legible on the panel surfaces in both themes
const STANDING_STYLE: Record<StandingWord, { label: string; color: string; border: string; dashed?: boolean }> = {
  leads:      { label: 'LEADS',        color: 'var(--c-34d399)', border: 'var(--c-34d399)' },
  above:      { label: 'ABOVE FIELD',  color: 'var(--c-46cce0)', border: 'var(--c-46cce0)' },
  below:      { label: 'BELOW FIELD',  color: 'var(--c-f59e0b)', border: 'var(--c-f59e0b)' },
  last:       { label: 'LAST',         color: 'var(--c-f87171)', border: 'var(--c-f87171)' },
  unmeasured: { label: 'UNMEASURED',   color: 'var(--c-8080a8)', border: 'var(--c-2a2a40)', dashed: true },
};

function squash(s: string): string { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function fmtVol(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1_000) return (n / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString();
}
function fmtStanding(r: StandingRow, v: number | null): string {
  if (v == null) return '—';
  if (r.unit === 'pct') return `${v}%`;
  if (r.unit === 'pos') return v.toFixed(1);
  if (r.unit === 'volume') return `${fmtVol(v)}/mo`;
  return v.toLocaleString();
}
function rootOf(domain: string): string { return String(domain ?? '').split('.')[0] ?? ''; }

export default function InsightsSection({ projectId, clientName, pollMs }: Props) {
  const [insights, setInsights] = useState<InsightsBlob | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);   // v7.496
  const [decisionBasis, setDecisionBasis] = useState<DecisionBasis | null>(null);   // v7.497
  const [supportOpen, setSupportOpen] = useState(false);              // v7.496 — supporting data, collapsed by default
  const [allMarkets, setAllMarkets] = useState(false);
  const [benchmarks, setBenchmarks] = useState<BenchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<{ label: string; step: number; steps: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // v7.487 — upper bound for this run, streamed by the route so the wait states a
  // real ceiling instead of counting up forever (Const IV.2).
  const [budgetSec, setBudgetSec] = useState<number | null>(null);
  const [benchOpen, setBenchOpen] = useState(false);
  const [benchDraft, setBenchDraft] = useState<BenchRow[]>([]);
  const [benchSaving, setBenchSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);   // v7.488 — the poll loop stops when the panel unmounts

  // v7.488 — one elapsed ticker, anchored on the run's real start so a reload
  // mid-run shows the true elapsed time, not the seconds since the reload.
  const startTicker = useCallback((startedAtMs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)));
    timerRef.current = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000))), 1000);
  }, []);
  const stopTicker = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setGenStatus(null);
  }, []);

  // v7.488 — follow a run through its stored job row until it ends. This is the
  // path the panel takes when its stream is gone (cut connection, closed tab,
  // reload) or when a click found a run already in flight. GET ?job=1 is the
  // cheap poll: explicit columns, no census rebuild. Ends on done/error, or in
  // words if the server stops reporting (the route marks such a job as dead).
  // v7.497 — a freshly generated blob carries the decision block it was verified against;
  // the panel switches to it the moment the run ends (no reload, no live rebuild).
  const adoptComputed = useCallback((blob: any) => {
    const c = computedOf(blob);
    if (!c) return;
    setDecision(c.decision); setCoverage(c.coverage); setDecisionBasis(c.basis);
  }, []);

  const followJob = useCallback(async (): Promise<void> => {
    const POLL_MS = pollMs ?? 4000;
    const MAX_MISSES = 8;   // ~32 s of failed polls in a row before giving up in words
    let misses = 0;
    for (;;) {
      if (!mountedRef.current) return;
      await new Promise(r => setTimeout(r, POLL_MS));
      if (!mountedRef.current) return;
      let j: any = null; let reached = false;
      try {
        const r = await fetch(`/api/projects/${projectId}/insights-panel?job=1`, { cache: 'no-store' });
        if (r.ok) { j = await r.json(); reached = true; }
      } catch { /* transient — counted below */ }
      if (!reached) {
        // A blip while polling is not a failed run — retry, but not forever.
        if (++misses >= MAX_MISSES) { setGenError('Lost contact with the server while following the run. The run may still finish on its own — reload this panel in a minute to check.'); return; }
        continue;
      }
      misses = 0;
      const job = j?.job ?? null;
      if (!job) { setGenError('The run could not be found on the server. Nothing was saved. Try again.'); return; }
      if (job.status === 'running') {
        setGenStatus({ label: job.label ?? 'Working', step: job.step ?? 0, steps: job.steps ?? 5 });
        if (typeof job.budgetMs === 'number') setBudgetSec(Math.round(job.budgetMs / 1000));
        continue;
      }
      if (job.status === 'done') { setInsights(j.insights ?? null); setUpdatedAt(j.updatedAt ?? null); adoptComputed(j.insights); return; }
      setGenError(job.error ?? 'Generation failed.');
      return;
    }
  }, [projectId, pollMs]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/insights-panel`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setInsights(j.insights ?? null);
      setUpdatedAt(j.updatedAt ?? null);
      setQuadrant(j.quadrant ?? null);
      setCoverage(j.coverage ?? null);
      setDecision(j.decision ?? null);   // v7.496 — deterministic decision inputs
      setDecisionBasis(j.decisionBasis ?? null);   // v7.497 — stored with the narrative, or rebuilt live
      const b = Array.isArray(j.benchmarks) ? j.benchmarks : [];
      setBenchmarks(b); setBenchDraft(b);
      // v7.488 — a run in flight survives a reload: show its live step and follow it.
      const job = j.job ?? null;
      if (job && job.status === 'running' && typeof job.updatedAt === 'string' && Date.now() - Date.parse(job.updatedAt) < 90_000) {
        setGenError(null);
        setGenStatus({ label: job.label ?? 'Working', step: job.step ?? 0, steps: job.steps ?? 5 });
        if (typeof job.budgetMs === 'number') setBudgetSec(Math.round(job.budgetMs / 1000));
        startTicker(Date.parse(job.startedAt) || Date.now());
        followJob().finally(stopTicker);
      }
    } finally { setLoading(false); }
  }, [projectId, startTicker, stopTicker, followJob]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; if (timerRef.current) clearInterval(timerRef.current); }; }, []);


  const generate = useCallback(async () => {
    setGenError(null);
    setGenStatus({ label: 'Starting', step: 1, steps: 5 });
    setBudgetSec(null);
    startTicker(Date.now());
    // v7.488 — the stream is the fast path; the job row is the truth. Whether the
    // stream ends cleanly without a terminal frame (v7.487's silent kill) or
    // throws mid-read (v7.487's "check the connection" — the connection really
    // was cut, at ~5 min, while the server finished the run), the panel does the
    // same thing: it follows the stored job to its end instead of guessing.
    let sawTerminal = false;
    let streamGone: string | null = null;
    try {
      const r = await fetch(`/api/projects/${projectId}/insights-panel`, { method: 'POST' });
      if (!r.ok || !r.body) { setGenError('Generation failed to start — try again.'); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: any; try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === 'status') {
            setGenStatus({ label: msg.label, step: msg.step ?? 0, steps: msg.steps ?? 5 });
            if (typeof msg.budgetMs === 'number') setBudgetSec(Math.round(msg.budgetMs / 1000));
          }
          else if (msg.type === 'ping') { /* heartbeat — the ticker already shows elapsed */ }
          else if (msg.type === 'attached') {
            // A run was already in flight (double click, second tab, reload+click):
            // no second run was started — follow the existing one.
            const job = msg.job ?? {};
            setGenStatus({ label: job.label ?? 'Working', step: job.step ?? 0, steps: job.steps ?? 5 });
            if (typeof job.budgetMs === 'number') setBudgetSec(Math.round(job.budgetMs / 1000));
            if (typeof job.startedAt === 'string') startTicker(Date.parse(job.startedAt) || Date.now());
            sawTerminal = true;   // the stream's job is done; the poll takes over
            await followJob();
          }
          else if (msg.type === 'error') { sawTerminal = true; setGenError(msg.error ?? 'Generation failed.'); }
          else if (msg.type === 'done') { sawTerminal = true; setInsights(msg.insights ?? null); setUpdatedAt(msg.updatedAt ?? null); adoptComputed(msg.insights); }
        }
      }
    } catch (e: any) {
      streamGone = (e && (e.name || e.message)) ? `${e.name ?? 'Error'}: ${e.message ?? ''}`.trim() : 'stream error';
    }
    try {
      if (!sawTerminal) {
        // The stream is gone but the run is (very likely) still going. Say so —
        // in words the user can act on — and follow the job to its real end.
        setGenStatus({ label: streamGone ? `Live connection dropped (${streamGone}) — following the run on the server` : 'Live connection ended — following the run on the server', step: 3, steps: 5 });
        await followJob();
      }
    } finally {
      stopTicker();
    }
  }, [projectId, startTicker, stopTicker, followJob]);

  const saveBenchmarks = useCallback(async () => {
    setBenchSaving(true);
    try {
      const rows = benchDraft.filter(r => r.brand.trim() && r.metric.trim() && r.value.trim() && r.source.trim());
      const r = await fetch(`/api/projects/${projectId}/insights-panel`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchmarks: rows }),
      });
      if (r.ok) { const j = await r.json(); const b = Array.isArray(j.benchmarks) ? j.benchmarks : []; setBenchmarks(b); setBenchDraft(b); }
    } finally { setBenchSaving(false); }
  }, [projectId, benchDraft]);

  // scale table: join benchmark rows to quadrant visibility by squashed brand (deterministic display join)
  const visFor = useCallback((brand: string): number | null => {
    if (!quadrant) return null;
    const bq = squash(brand);
    if (bq.length < 3) return null;
    const hit = quadrant.points.find(p => {
      const pq = squash(p.brand);
      return pq === bq || pq.includes(bq) || bq.includes(pq);
    });
    return hit ? hit.visibilityPct : null;
  }, [quadrant]);

  const sectionLabel = (s: string, sub?: string) => (
    <div style={{ margin: '28px 0 10px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--c-55557a)', textTransform: 'uppercase' }}>{s}</div>
      {sub && <div style={{ fontSize: '11.5px', color: 'var(--c-6a6a90)', marginTop: '3px' }}>{sub}</div>}
    </div>
  );

  const basisLine = (s: string) => (
    <p style={{ fontSize: '10.5px', color: 'var(--c-55557a)', marginTop: '8px', lineHeight: 1.5 }}>{s}</p>
  );

  const chip = (w: StandingWord, extra?: string) => {
    const st = STANDING_STYLE[w];
    return (
      <span style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.06em', color: st.color, border: `1px ${st.dashed ? 'dashed' : 'solid'} ${st.border}`, borderRadius: '5px', padding: '2px 7px', whiteSpace: 'nowrap' }}>
        {extra ? `${extra} · ` : ''}{st.label}
      </span>
    );
  };

  const card: React.CSSProperties = { background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', padding: '16px 18px' };
  const isNew = !!(insights && insights.situation);
  const isLegacy = !!(insights && !insights.situation && insights.thesis);
  const displayName = clientName ?? decision?.clientDomain ?? 'Client';

  // ── standing table (one block per dimension) ──
  const standingTable = (rows: StandingRow[], title: string) => (
    <div style={card}>
      <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--c-e8e8ff)', marginBottom: '10px' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.4fr) 1fr 1fr 1.3fr auto', gap: '6px 12px', alignItems: 'center', fontSize: '12px' }}>
        {['Measure', displayName, 'Field avg', 'Best-in-class', 'Standing'].map(h => (
          <div key={h} style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', paddingBottom: '4px', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</div>
        ))}
        {rows.map(r => [
          <div key={r.key + 'm'} style={{ color: 'var(--c-c8c8e8)', fontWeight: 700, lineHeight: 1.3 }}>
            {r.metric}
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: r.basis === 'modeled' ? 'var(--c-f59e0b)' : 'var(--c-6a6a90)' }}>{r.basis === 'modeled' ? 'modeled estimate' : 'measured'}</span>
          </div>,
          <div key={r.key + 'c'} style={{ fontSize: '15px', fontWeight: 800, color: 'var(--c-e8e8ff)', fontVariantNumeric: 'tabular-nums' }}>{fmtStanding(r, r.client)}</div>,
          <div key={r.key + 'f'} style={{ color: 'var(--c-8a8aa8)', fontVariantNumeric: 'tabular-nums' }}>{r.fieldAvg != null ? fmtStanding(r, r.fieldAvg) : '—'}{r.of > 1 && r.fieldAvg != null ? <span style={{ display: 'block', fontSize: '10px', color: 'var(--c-6a6a90)' }}>{r.of - (r.client != null ? 1 : 0)} other brands</span> : null}</div>,
          <div key={r.key + 'b'} style={{ color: 'var(--c-8a8aa8)', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
            {r.best ? <><span style={{ fontWeight: 700, color: r.best.domain === decision?.clientDomain ? 'var(--c-9b96ff)' : 'var(--c-c8c8e8)' }}>{fmtStanding(r, r.best.value)}</span><span style={{ display: 'block', fontSize: '10.5px', color: 'var(--c-6a6a90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.best.domain === decision?.clientDomain ? 'you' : r.best.domain}</span></> : '—'}
          </div>,
          <div key={r.key + 's'} style={{ textAlign: 'right' }}>{chip(r.standing, r.clientRank != null && r.of > 1 ? `${r.clientRank} of ${r.of}` : undefined)}</div>,
        ])}
      </div>
    </div>
  );

  // ── local market bars ──
  const marketRows = decision?.local ? (allMarkets ? decision.local.markets : decision.local.markets.slice(0, 12)) : [];
  const maxMarket = marketRows.length ? Math.max(...marketRows.map(m => m.demandMonthly), 1) : 1;

  // ── scenario bars ──
  const moves = decision?.scenarios.moves ?? [];
  const maxMove = moves.length ? Math.max(...moves.map(m => m.clicksMonthlyCeiling ?? 0), decision?.scenarios.currentClicksMonthly ?? 0, 1) : 1;

  // ── competitor play lookup for the playbook rows ──
  const playFor = (brand: string): CompetitorPlay | null => {
    if (!decision) return null;
    const b = squash(brand); if (b.length < 3) return null;
    return decision.plays.find(p => { const r = squash(rootOf(p.domain)); return r.length >= 3 && (b.includes(r) || r.includes(b)); }) ?? null;
  };

  // ── quadrant geometry (supporting data) ──
  const QW = 700, QH = 400, QP = 46;
  const qMaxVis = quadrant ? Math.max(...quadrant.points.map(p => p.visibilityPct), 1) : 1;
  const qMaxCitL = quadrant ? Math.max(...quadrant.points.map(p => Math.log10(p.citations + 1)), 0.001) : 1;
  const qx = (c: number) => QP + (Math.log10(c + 1) / qMaxCitL) * (QW - QP * 2);
  const qy = (v: number) => (QH - QP) - (v / qMaxVis) * (QH - QP * 2);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" data-panel="insights">
      <div style={{ padding: '18px 22px 60px', maxWidth: '1240px' }}>

        {/* ── header (IV.4 / IV.5) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '2px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>Insights</h2>
          <span style={{ fontSize: '11px', color: 'var(--c-6a6a90)' }}>
            {updatedAt ? `Last generated ${new Date(updatedAt).toLocaleString()}` : 'Not generated yet'}
          </span>
          {insights && (
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--c-34d399)', border: '1px solid var(--c-2a2a40)', borderRadius: '999px', padding: '3px 10px' }}>
              ✓ {insights.verified} numbers verified{isNew ? ' · standing claims checked' : ''}
            </span>
          )}
          <button
            onClick={generate}
            disabled={!!genStatus}
            style={{
              marginLeft: 'auto', fontSize: '12px', fontWeight: 700, padding: '7px 14px', borderRadius: '8px',
              border: '1px solid var(--ca-108-99-255-0_45)', background: 'var(--ca-108-99-255-0_12)',
              color: 'var(--c-9b96ff)', cursor: genStatus ? 'default' : 'pointer', opacity: genStatus ? 0.6 : 1,
            }}
          >
            {genStatus ? 'Generating…' : insights ? 'Regenerate insights' : 'Generate insights'}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginBottom: '14px' }}>
          What is happening to the brand, what is holding it back, where to invest and what it is worth, what competitors do that works, and which local markets matter. Standing and scenarios are computed from the panels; the narrative is written against them and every number and every standing claim is machine-checked before anything is saved.
        </p>

        {/* ── generation progress (IV.2: step + label + elapsed) ── */}
        {genStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--ca-108-99-255-0_25)', background: 'var(--c-111120)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--c-c8c8e8)' }}>
                Step {genStatus.step} of {genStatus.steps} · {genStatus.label}
              </div>
              <div style={{ height: '4px', background: 'var(--c-2a2a40)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((genStatus.step / genStatus.steps) * 100)}%`, background: 'var(--c-6c63ff)', borderRadius: '2px', transition: 'width .4s' }} />
              </div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--c-6a6a90)', flexShrink: 0 }}>
              {elapsed}s elapsed{budgetSec ? ` · up to ${Math.round(budgetSec / 60)}m` : ''}
            </span>
          </div>
        )}
        {genError && (
          <div style={{ border: '1px solid var(--ca-245-158-11-0_25)', background: 'var(--ca-245-158-11-0_10)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', fontSize: '12.5px', color: 'var(--c-f59e0b)' }}>
            {genError}
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: '12.5px', color: 'var(--c-6a6a90)' }}>Loading stored insights…</p>
        ) : (
          <>
            {/* ── 1 · the situation ── */}
            {isNew && insights?.situation ? (
              <div style={{ border: '1px solid var(--ca-108-99-255-0_25)', background: 'var(--ca-108-99-255-0_12)', borderRadius: '14px', padding: '22px 24px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--c-9b96ff)', textTransform: 'uppercase', marginBottom: '8px' }}>The situation</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35, maxWidth: '860px' }}>{insights.situation.headline}</div>
                <p style={{ fontSize: '13px', color: 'var(--c-8a8aa8)', marginTop: '10px', maxWidth: '900px', lineHeight: 1.55 }}>{insights.situation.body}</p>
              </div>
            ) : isLegacy && insights?.thesis ? (
              <div style={{ border: '1px solid var(--ca-108-99-255-0_25)', background: 'var(--ca-108-99-255-0_12)', borderRadius: '14px', padding: '22px 24px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--c-9b96ff)', textTransform: 'uppercase', marginBottom: '8px' }}>Category thesis · previous engine</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35, maxWidth: '820px' }}>{insights.thesis.headline}</div>
                <p style={{ fontSize: '13px', color: 'var(--c-8a8aa8)', marginTop: '10px', maxWidth: '880px', lineHeight: 1.55 }}>{insights.thesis.body}</p>
                <p style={{ fontSize: '11.5px', color: 'var(--c-f59e0b)', marginTop: '12px', fontWeight: 700 }}>These insights were generated before the decision engine and its standing check. Regenerate to get the situation, constraints, investment order, leader path and local markets.</p>
              </div>
            ) : !genStatus && (
              <div style={{ border: '1px dashed var(--c-2a2a40)', borderRadius: '14px', padding: '26px', textAlign: 'center' }}>
                <p style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--c-c8c8e8)' }}>No insights generated for {displayName} yet</p>
                <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)', marginTop: '6px', maxWidth: '620px', marginLeft: 'auto', marginRight: 'auto' }}>
                  The standing tables and scenario bars below are computed from the panels now. Generate to have the strategy engine read them with every stored panel and write the situation, what is holding the brand back, where to invest, the path to market leader, the competitor playbook and the local-market read. Takes one to several minutes; every number and standing claim is verified, and a draft that fails is re-queried. Results are cached until you regenerate.
                </p>
              </div>
            )}

            {/* ── 2 · standing — search & AI ── */}
            {sectionLabel(`Standing — ${displayName} vs the field`, 'Field average and best-in-class on the same keywords and the same measures · traditional search and AI visibility')}
            {decision ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '12px' }}>
                  {standingTable(decision.standing.search, 'Traditional search')}
                  {standingTable(decision.standing.ai, 'AI visibility')}
                </div>
                {decision.standing.lines.length > 0 && (
                  <div style={{ ...card, marginTop: '12px', padding: '4px 0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {['Product line', 'Demand /mo', `${displayName} page-1 vol`, 'Rank', 'Field avg', 'Best-in-class', 'AI answers naming you', 'AI Overviews citing you'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--c-1e1e34)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {decision.standing.lines.map((l, i) => {
                          const bb = i === decision.standing.lines.length - 1 ? 'none' : '1px solid var(--c-1e1e34)';
                          const word: StandingWord = l.standing;   // one word, computed once (lib/insightsPanel/decision)
                          const p1pct = l.demandMonthly > 0 ? Math.round((l.client.p1Vol / l.demandMonthly) * 100) : 0;
                          return (
                            <tr key={i}>
                              <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--c-c8c8e8)', borderBottom: bb }}>{l.product}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--c-8a8aa8)', borderBottom: bb, fontVariantNumeric: 'tabular-nums' }}>{fmtVol(l.demandMonthly)}<span style={{ color: 'var(--c-55557a)' }}> · {l.kwCount.toLocaleString()} kw</span></td>
                              <td style={{ padding: '9px 12px', borderBottom: bb, minWidth: '150px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1, height: '6px', background: 'var(--c-2a2a40)', borderRadius: '3px', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, p1pct)}%`, height: '100%', background: 'var(--c-6c63ff)' }} /></div>
                                  <span style={{ fontWeight: 800, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtVol(l.client.p1Vol)} <span style={{ fontWeight: 600, color: 'var(--c-6a6a90)' }}>({p1pct}%)</span></span>
                                </div>
                              </td>
                              <td style={{ padding: '9px 12px', borderBottom: bb }}>{chip(word, l.client.rank != null ? `${l.client.rank} of ${l.brandsOnLadder}` : word === 'last' ? 'no page-1 hold' : undefined)}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--c-8a8aa8)', borderBottom: bb, fontVariantNumeric: 'tabular-nums' }}>{l.fieldAvgP1Vol != null ? fmtVol(l.fieldAvgP1Vol) : '—'}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--c-8a8aa8)', borderBottom: bb, fontVariantNumeric: 'tabular-nums' }}>{l.best ? <>{l.best.isClient ? <span style={{ color: 'var(--c-9b96ff)', fontWeight: 700 }}>you</span> : l.best.domain} · {fmtVol(l.best.p1Vol)}</> : '—'}</td>
                              <td style={{ padding: '9px 12px', color: 'var(--c-8a8aa8)', borderBottom: bb, fontVariantNumeric: 'tabular-nums' }}>
                                {l.ai.answerShare != null ? `${Math.round(l.ai.answerShare * 100)}% of scanned answers` : l.ai.probeMentionRate != null ? `${Math.round(l.ai.probeMentionRate * 100)}% of probes` : <span style={{ color: 'var(--c-6a6a90)' }}>unmeasured</span>}
                                {l.ai.citedLeader && !l.ai.citedLeader.isClient ? <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--c-6a6a90)' }}>most cited: {l.ai.citedLeader.domain} ({l.ai.citedLeader.count})</span> : null}
                              </td>
                              <td style={{ padding: '9px 12px', color: 'var(--c-8a8aa8)', borderBottom: bb, fontVariantNumeric: 'tabular-nums' }}>{l.serp && l.serp.aioAvail > 0 ? `${l.serp.aioAcq} of ${l.serp.aioAvail} (${l.serp.aioRate}%)` : <span style={{ color: 'var(--c-6a6a90)' }}>{l.serp ? 'no AIO on scanned terms' : 'not scanned'}</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {basisLine(decision.standing.basis)}
                {decisionBasis && (
                  <p style={{ fontSize: '11px', color: decisionBasis.stale ? 'var(--c-f59e0b)' : 'var(--c-6a6a90)', marginTop: '6px', lineHeight: 1.5 }} data-testid="decision-basis">
                    {decisionBasis.source === 'stored'
                      ? <>Standing, scenarios, plays and local markets were computed {decisionBasis.builtAt ? new Date(decisionBasis.builtAt).toLocaleString() : 'at generation'} from the scan of {decisionBasis.analysisTriggeredAt ? new Date(decisionBasis.analysisTriggeredAt).toLocaleDateString() : 'that time'} and stored with these insights.{decisionBasis.stale ? <b> A newer scan exists — regenerate insights to recompute on it.</b> : null}</>
                      : <>Standing, scenarios, plays and local markets were computed now from the current scan{decisionBasis.analysisTriggeredAt ? ` (${new Date(decisionBasis.analysisTriggeredAt).toLocaleDateString()})` : ''}; generating insights stores them with the narrative.</>}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>Standing cannot be computed until an analysis with a keyword snapshot is stored for this project.</p>
            )}

            {/* ── 3 · what is holding the brand back ── */}
            {isNew && insights?.holdingBack && insights.holdingBack.length > 0 && (
              <>
                {sectionLabel('What is holding the brand back', 'The binding constraints, with the mechanism behind each')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '12px' }}>
                  {insights.holdingBack.map((h, i) => (
                    <div key={i} style={{ ...card, borderTop: '3px solid var(--c-f59e0b)' }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35 }}>{h.title}</div>
                      {h.lines.length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                          {h.lines.map((l, j) => <span key={j} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)', borderRadius: '5px', padding: '2px 7px' }}>{l}</span>)}
                        </div>
                      )}
                      <p style={{ fontSize: '12.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.55, marginTop: '8px' }}>{h.body}</p>
                      <p style={{ fontSize: '11px', color: 'var(--c-6a6a90)', marginTop: '8px', lineHeight: 1.5, borderTop: '1px solid var(--c-1e1e34)', paddingTop: '7px' }}><span style={{ fontWeight: 800, letterSpacing: '0.06em' }}>EVIDENCE</span> · {h.evidence}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── 4 · where to invest & what it is worth ── */}
            {(decision || (isNew && insights?.invest)) && sectionLabel('Where to invest — and what each move is worth', `Modeled incremental clicks per month on the ${decision?.scenarios.ctrSource ?? 'CTR'} curve over real volumes and positions · floor → ceiling · multiply by 12 for annual`)}
            {(decision || (isNew && insights?.invest)) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: '12px', alignItems: 'start' }}>
                {isNew && insights?.invest ? (
                  <div style={card}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--c-9b96ff)', textTransform: 'uppercase', marginBottom: '10px' }}>Investment order</div>
                    {insights.invest.order.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '9px 0', borderTop: i ? '1px solid var(--c-1e1e34)' : 'none' }}>
                        <span style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '8px', background: 'var(--ca-108-99-255-0_25)', color: 'var(--c-c8c8e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{m.move}</div>
                          <p style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginTop: '3px', lineHeight: 1.5 }}>{m.why}</p>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-46cce0)', marginTop: '5px' }}>{m.modeledGain}</div>
                        </div>
                      </div>
                    ))}
                    {insights.invest.caveat && <p style={{ fontSize: '11px', color: 'var(--c-6a6a90)', marginTop: '8px', lineHeight: 1.5 }}>Caveat: {insights.invest.caveat}</p>}
                  </div>
                ) : (
                  <div style={{ ...card, borderStyle: 'dashed' }}>
                    <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>The investment order is written by the engine from the scenarios on the right — generate insights to fill it.</p>
                  </div>
                )}
                {decision && (
                  <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--c-f59e0b)', textTransform: 'uppercase' }}>Scenarios · modeled estimate</div>
                      <div style={{ fontSize: '11px', color: 'var(--c-6a6a90)' }}>today: <b style={{ color: 'var(--c-c8c8e8)' }}>{fmtVol(decision.scenarios.currentClicksMonthly)}</b> modeled clicks/mo{decision.scenarios.leaderClicksMonthly != null && decision.scenarios.leaderDomain !== decision.clientDomain ? <> · leader {decision.scenarios.leaderDomain}: <b style={{ color: 'var(--c-c8c8e8)' }}>{fmtVol(decision.scenarios.leaderClicksMonthly)}</b></> : null}</div>
                    </div>
                    {moves.map(m => {
                      const floor = m.clicksMonthlyFloor ?? 0; const ceil = m.clicksMonthlyCeiling ?? 0;
                      return (
                        <div key={m.key} style={{ marginBottom: '11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--c-c8c8e8)', fontWeight: 700, lineHeight: 1.3 }}>{m.label}</span>
                            <span style={{ color: 'var(--c-e8e8ff)', fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              {m.basis === 'modeled' ? <>{fmtVol(floor)} <span style={{ color: 'var(--c-6a6a90)', fontWeight: 600 }}>→ {fmtVol(ceil)}/mo</span></> : <>{fmtVol(m.volumeMonthly)}<span style={{ color: 'var(--c-6a6a90)', fontWeight: 600 }}> vol/mo</span></>}
                            </span>
                          </div>
                          {m.basis === 'modeled' ? (
                            <div style={{ position: 'relative', height: '8px', background: 'var(--c-2a2a40)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (ceil / maxMove) * 100)}%`, background: 'var(--ca-108-99-255-0_25)' }} />
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (floor / maxMove) * 100)}%`, background: 'var(--c-6c63ff)' }} />
                            </div>
                          ) : (
                            <div style={{ height: '8px', background: 'var(--c-2a2a40)', borderRadius: '4px', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, m.volumeMonthly > 0 ? 100 : 0)}%`, height: '100%', background: 'var(--c-f59e0b)', opacity: .55 }} /></div>
                          )}
                          <div style={{ fontSize: '10.5px', color: 'var(--c-6a6a90)', marginTop: '3px' }}>
                            {m.keywords.toLocaleString()} keywords · {fmtVol(m.volumeMonthly)} searches/mo{m.basis === 'modeled' ? ` · to ${m.floorTarget} → ${m.ceilingTarget}` : ' · measured volume only, no click model'}
                            {m.perLine.length > 0 && m.basis === 'modeled' ? ` · top line: ${m.perLine[0].product} ${fmtVol(m.perLine[0].clicksMonthlyFloor)}` : ''}
                          </div>
                        </div>
                      );
                    })}
                    {basisLine(decision.scenarios.basis)}
                  </div>
                )}
              </div>
            )}

            {/* ── 5 · path to market leader ── */}
            {isNew && insights?.leaderPath && (
              <>
                {sectionLabel('Path to market leader', 'What best-in-class holds today, the gap, and the modeled gain at parity')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                  <div style={card}><div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', marginBottom: '6px' }}>What the leader holds</div><p style={{ fontSize: '12.5px', color: 'var(--c-c8c8e8)', lineHeight: 1.55 }}>{insights.leaderPath.whatLeaderLooksLike}</p></div>
                  <div style={card}><div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', marginBottom: '6px' }}>The gap</div><p style={{ fontSize: '12.5px', color: 'var(--c-c8c8e8)', lineHeight: 1.55 }}>{insights.leaderPath.gap}</p></div>
                  <div style={{ ...card, borderTop: '3px solid var(--c-46cce0)' }}><div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-46cce0)', textTransform: 'uppercase', marginBottom: '6px' }}>Gain at leader parity · modeled</div><p style={{ fontSize: '12.5px', color: 'var(--c-c8c8e8)', lineHeight: 1.55, fontWeight: 700 }}>{insights.leaderPath.incrementalGain}</p></div>
                </div>
                {insights.leaderPath.constraints.length > 0 && (
                  <div style={{ ...card, marginTop: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', marginBottom: '6px' }}>What has to change</div>
                    <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--c-c8c8e8)', lineHeight: 1.6 }}>
                      {insights.leaderPath.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ol>
                  </div>
                )}
              </>
            )}

            {/* ── 6 · key opportunities ── */}
            {isNew && insights?.opportunities && insights.opportunities.length > 0 && (
              <>
                {sectionLabel('Key opportunities', 'Where demand is high, the leader is beatable or absent, and the brand is already close')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '12px' }}>
                  {insights.opportunities.map((o, i) => (
                    <div key={i} style={{ ...card, borderTop: `3px solid ${o.impact === 'HIGH' ? 'var(--c-34d399)' : 'var(--c-46cce0)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35 }}>{o.title}</div>
                        <span style={{ flexShrink: 0, fontSize: '9.5px', fontWeight: 800, padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--c-2a2a40)', color: o.impact === 'HIGH' ? 'var(--c-34d399)' : 'var(--c-46cce0)' }}>{o.impact === 'HIGH' ? 'HIGH IMPACT' : 'MEDIUM'}</span>
                      </div>
                      <p style={{ fontSize: '12.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.55, marginTop: '8px' }}>{o.body}</p>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-c8c8e8)', marginTop: '8px', borderTop: '1px solid var(--c-1e1e34)', paddingTop: '7px' }}>{o.sizing}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── 7 · competitor playbook ── */}
            {insights && insights.playbook.length > 0 && (
              <>
                {sectionLabel("Competitor playbook — what they've solved, where they're exposed", 'Each row carries the rival\'s measured play beneath the engine\'s read')}
                <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(220px, 1fr) minmax(220px, 1fr) 150px', minWidth: '820px' }}>
                    {['Brand · measured play', 'Doing well', 'Vulnerable', 'Key stat'].map(h => (
                      <div key={h} style={{ padding: '9px 14px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', background: 'var(--c-0a0a14)', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</div>
                    ))}
                    {insights.playbook.map((r, i) => {
                      const last = i === insights.playbook.length - 1;
                      const bb = last ? 'none' : '1px solid var(--c-1e1e34)';
                      const pl = playFor(r.brand);
                      return [
                        <div key={`b${i}`} style={{ padding: '11px 14px', borderBottom: bb }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--c-c8c8e8)' }}>{r.brand}</div>
                          {pl && (
                            <div style={{ fontSize: '10.5px', color: 'var(--c-6a6a90)', marginTop: '5px', lineHeight: 1.5 }}>
                              {pl.landscape.rank != null ? `#${pl.landscape.rank} page-1 volume · ${fmtVol(pl.landscape.p1Vol)}/mo` : `${fmtVol(pl.landscape.p1Vol)}/mo page 1`}
                              {pl.linesWon.length > 0 ? <><br />wins: {pl.linesWon.slice(0, 2).map(l => `${l.product} (#${l.rank})`).join(', ')}</> : null}
                              {pl.queryMix.length > 0 ? <><br />mix: {pl.queryMix.slice(0, 2).map(q => `${q.type} ${fmtVol(q.volume)}`).join(' · ')}</> : null}
                              {pl.pageTypes && pl.pageTypes.length > 0 ? <><br />pages: {pl.pageTypes.slice(0, 2).map(p => `${p.type} ×${p.urls}`).join(', ')}</> : null}
                              {pl.local ? <><br />map pack: {pl.local.packShare}% of scanned packs · {pl.local.maxReviews.toLocaleString()} reviews</> : null}
                            </div>
                          )}
                        </div>,
                        <div key={`w${i}`} style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)', borderBottom: bb, lineHeight: 1.5 }}><span style={{ color: 'var(--c-34d399)', fontWeight: 700 }}>▲ </span>{r.doingWell}</div>,
                        <div key={`v${i}`} style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)', borderBottom: bb, lineHeight: 1.5 }}><span style={{ color: 'var(--c-f87171)', fontWeight: 700 }}>▼ </span>{r.vulnerable}</div>,
                        <div key={`s${i}`} style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 800, color: 'var(--c-e8e8ff)', borderBottom: bb }}>{r.keyStat}</div>,
                      ];
                    })}
                  </div>
                </div>
                {decision?.playsBasis && basisLine(decision.playsBasis.rule)}
              </>
            )}

            {/* ── 8 · local markets ── */}
            {decision?.local && (
              <>
                {sectionLabel('Local markets — where the demand is', `Demand by city from ${decision.local.geoTotal.kwCount.toLocaleString()} city-modified keywords (${fmtVol(decision.local.geoTotal.demandMonthly)}/mo across ${decision.local.geoTotal.cities} cities) · near-me demand ${fmtVol(decision.local.nearMe.demandMonthly)}/mo (${displayName} page 1 on ${decision.local.nearMe.clientP1Kw} of ${decision.local.nearMe.kwCount})`)}
                {isNew && insights?.localMarkets && (
                  <div style={{ ...card, marginBottom: '12px', borderLeft: '3px solid var(--c-6c63ff)' }}>
                    <p style={{ fontSize: '13px', color: 'var(--c-c8c8e8)', lineHeight: 1.55 }}>{insights.localMarkets.summary}</p>
                    {insights.localMarkets.markets.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px 16px', marginTop: '10px' }}>
                        {insights.localMarkets.markets.map((m, i) => (
                          <div key={i} style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', lineHeight: 1.5 }}><span style={{ fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{m.city}</span> — {m.finding}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {marketRows.length > 0 ? (
                  <div style={card}>
                    <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(200px, 1fr) 120px 150px 190px', gap: '6px 12px', alignItems: 'center', fontSize: '12px' }}>
                      {['City', 'Demand /mo', `${displayName} pg-1`, 'Map pack', 'Strongest rival'].map(h => (
                        <div key={h} style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', paddingBottom: '4px', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</div>
                      ))}
                      {marketRows.map(m => [
                        <div key={m.city + 'c'} style={{ fontWeight: 700, color: 'var(--c-c8c8e8)', textTransform: 'capitalize' }}>{m.city}</div>,
                        <div key={m.city + 'd'} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '7px', background: 'var(--c-2a2a40)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ width: `${(m.demandMonthly / maxMarket) * 100}%`, height: '100%', background: 'var(--c-8a8aa8)', opacity: .6 }} />
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(m.client.p1Vol / maxMarket) * 100}%`, background: 'var(--c-6c63ff)' }} />
                          </div>
                          <span style={{ fontWeight: 800, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtVol(m.demandMonthly)}</span>
                        </div>,
                        <div key={m.city + 'p'} style={{ color: 'var(--c-8a8aa8)', fontVariantNumeric: 'tabular-nums' }}>{m.kwCount ? <>{m.client.p1Kw} of {m.kwCount}{m.client.bestPos != null ? <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--c-6a6a90)' }}>best pos {m.client.bestPos}</span> : <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--c-f59e0b)' }}>not ranked</span>}</> : <span style={{ color: 'var(--c-6a6a90)' }}>no city keywords</span>}</div>,
                        <div key={m.city + 'k'} style={{ fontSize: '11.5px' }}>
                          {m.pack ? (m.pack.withPack === 0 ? <span style={{ color: 'var(--c-6a6a90)' }}>no pack shown</span> : m.pack.clientBestRank != null ? <span style={{ color: m.pack.clientBestRank === 1 ? 'var(--c-34d399)' : 'var(--c-46cce0)', fontWeight: 800 }}>in pack · best #{m.pack.clientBestRank}<span style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: 'var(--c-6a6a90)' }}>{m.pack.clientInPack} of {m.pack.withPack} packs</span></span> : <span style={{ color: 'var(--c-f87171)', fontWeight: 800 }}>absent<span style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: 'var(--c-6a6a90)' }}>{m.pack.withPack} packs · leader {m.pack.leaders[0] ?? '—'}{m.pack.leaderReviews != null ? ` (${m.pack.leaderReviews.toLocaleString()} reviews)` : ''}</span></span>) : <span style={{ color: 'var(--c-6a6a90)' }}>not scanned</span>}
                        </div>,
                        <div key={m.city + 'r'} style={{ fontSize: '11.5px', color: 'var(--c-8a8aa8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.topRival ? <>{m.topRival.domain} <span style={{ color: 'var(--c-6a6a90)' }}>· {fmtVol(m.topRival.p1Vol)} pg-1</span></> : '—'}</div>,
                      ])}
                    </div>
                    {decision.local.markets.length > 12 && (
                      <button onClick={() => setAllMarkets(a => !a)} style={{ marginTop: '10px', fontSize: '11.5px', fontWeight: 700, color: 'var(--c-8a8aa8)', background: 'none', border: '1px solid var(--c-2a2a40)', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer' }}>
                        {allMarkets ? 'Show top 12' : `Show all ${decision.local.markets.length} cities`}
                      </button>
                    )}
                    {decision.local.packLeaders.length > 0 && (
                      <p style={{ fontSize: '11px', color: 'var(--c-6a6a90)', marginTop: '10px', lineHeight: 1.5 }}>
                        Map-pack leaders across scanned packs: {decision.local.packLeaders.slice(0, 5).map(l => `${l.isClient ? 'you' : l.name} ${l.sharePct}%${l.maxReviews ? ` (${l.maxReviews.toLocaleString()} reviews)` : ''}`).join(' · ')}
                        {decision.local.scan ? ` · scan: ${decision.local.scan.locations} locations, ${decision.local.scan.scannedCells} cells, ${displayName} in ${decision.local.scan.clientInPack} of ${decision.local.scan.withPack} packs (#1 in ${decision.local.scan.clientRank1})` : ''}
                      </p>
                    )}
                    {basisLine(decision.local.basis)}
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>No city-modified keywords in the landscape and no Local scan stored — local demand is unmeasured for this project.</p>
                )}
              </>
            )}

            {/* ── 9 · market shifts ── */}
            {decision && (decision.shifts.serp || decision.shifts.aiAnswers || (isNew && insights?.shifts?.length)) && (
              <>
                {sectionLabel('Market shifts — as measured today', decision.shifts.historyNote)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                  {decision.shifts.serp && (
                    <div style={card}>
                      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', marginBottom: '6px' }}>AI Overviews on scanned SERPs</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{decision.shifts.serp.withAIO} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-8a8aa8)' }}>of {decision.shifts.serp.scanned} scanned keywords show one</span></div>
                      <div style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginTop: '4px' }}>{displayName} cited in <b style={{ color: decision.shifts.serp.aioClientCited ? 'var(--c-34d399)' : 'var(--c-f87171)' }}>{decision.shifts.serp.aioClientCited}</b> · {fmtVol(decision.shifts.serp.aioUncitedVolumeMonthly)}/mo of AIO demand without you · PAA on {decision.shifts.serp.withPAA}, cited in {decision.shifts.serp.paaClientCited}</div>
                    </div>
                  )}
                  {decision.shifts.aiAnswers && (
                    <div style={card}>
                      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', marginBottom: '6px' }}>AI answers naming {displayName}</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{decision.shifts.aiAnswers.probeMentions} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-8a8aa8)' }}>of {decision.shifts.aiAnswers.probeTotal} probes</span></div>
                      <div style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginTop: '4px' }}>{decision.shifts.aiAnswers.linesScanned} product lines scanned · {displayName} holds any answer share in {decision.shifts.aiAnswers.linesWithClientShare}</div>
                    </div>
                  )}
                  {isNew && insights?.shifts?.map((s, i) => (
                    <div key={i} style={{ ...card, borderTop: '3px solid var(--c-9b96ff)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35 }}>{s.title}</div>
                      <p style={{ fontSize: '12.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.55, marginTop: '6px' }}>{s.body}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── legacy v7.471 blocks (stored before v7.496) ── */}
            {isLegacy && insights?.patterns && insights.patterns.length > 0 && (
              <>
                {sectionLabel('Detected patterns · previous engine')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                  {insights.patterns.map((p, i) => {
                    const t = TAG_STYLES[p.tag] ?? TAG_STYLES.PATTERN;
                    return (
                      <div key={i} style={card}>
                        <span style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.07em', color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: '5px', padding: '2px 8px' }}>{t.label}</span>
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--c-e8e8ff)', margin: '9px 0 5px', lineHeight: 1.35 }}>{p.title}</div>
                        <p style={{ fontSize: '12.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.55 }}>{p.body}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {isLegacy && insights?.strike && insights.strike.length > 0 && (
              <>
                {sectionLabel('Where to strike · previous engine')}
                {insights.strike.map((s, i) => (
                  <div key={i} style={{ ...card, display: 'flex', gap: '13px', alignItems: 'flex-start', padding: '13px 16px', marginBottom: '8px' }}>
                    <span style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '8px', background: 'var(--ca-108-99-255-0_25)', color: 'var(--c-c8c8e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>{i + 1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{s.title}</div>
                      <p style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginTop: '3px', lineHeight: 1.5 }}>{s.body}</p>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 800, padding: '4px 9px', borderRadius: '6px', border: '1px solid var(--c-2a2a40)', color: s.impact === 'HIGH' ? 'var(--c-34d399)' : 'var(--c-f59e0b)' }}>{s.impact === 'HIGH' ? 'HIGH IMPACT' : 'MEDIUM'}</span>
                  </div>
                ))}
              </>
            )}

            {/* ── supporting data (collapsed) ── */}
            <div style={{ marginTop: '30px', borderTop: '1px solid var(--c-1e1e34)', paddingTop: '14px' }}>
              <button onClick={() => setSupportOpen(o => !o)} aria-expanded={supportOpen} style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-8a8aa8)', background: 'none', border: '1px solid var(--c-2a2a40)', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer' }}>
                {supportOpen ? '▾' : '▸'} Supporting data — named vs cited, demand coverage, market benchmarks
              </button>
            </div>
            {supportOpen && (
              <>
                {sectionLabel('Source vs. answer — who gets cited, who gets named')}
                {quadrant ? (
                  <div style={card}>
                    <div style={{ overflowX: 'auto' }}>
                      <svg viewBox={`0 0 ${QW} ${QH}`} style={{ width: '100%', maxWidth: '860px', minWidth: '560px', display: 'block', margin: '0 auto' }} role="img" aria-label="Source versus answer quadrant">
                        <line x1={QP} y1={qy(quadrant.medians.visibilityPct)} x2={QW - QP} y2={qy(quadrant.medians.visibilityPct)} stroke="var(--c-2a2a40)" strokeDasharray="4 4" />
                        <line x1={qx(quadrant.medians.citations)} y1={QP} x2={qx(quadrant.medians.citations)} y2={QH - QP} stroke="var(--c-2a2a40)" strokeDasharray="4 4" />
                        <text x={QP} y={QP - 14} fontSize="10" fontWeight="700" fill="var(--c-55557a)">NAMED, NOT CITED</text>
                        <text x={QW - QP} y={QP - 14} fontSize="10" fontWeight="700" fill="var(--c-34d399)" textAnchor="end">THE ANSWER + THE SOURCE</text>
                        <text x={QP} y={QH - QP + 26} fontSize="10" fontWeight="700" fill="var(--c-f87171)">INVISIBLE</text>
                        <text x={QW - QP} y={QH - QP + 26} fontSize="10" fontWeight="700" fill="var(--c-55557a)" textAnchor="end">CITED, NEVER NAMED</text>
                        <text x={QW / 2} y={QH - 6} fontSize="9.5" fill="var(--c-55557a)" textAnchor="middle">AI-answer citations of the brand's domain (log scale) →</text>
                        <text x={12} y={QH / 2} fontSize="9.5" fill="var(--c-55557a)" textAnchor="middle" transform={`rotate(-90 12 ${QH / 2})`}>% of prompts naming the brand →</text>
                        {quadrant.points.map((p, i) => (
                          <g key={i}>
                            <circle cx={qx(p.citations)} cy={qy(p.visibilityPct)} r={p.isClient ? 7 : 5}
                              fill={p.isClient ? 'var(--c-6c63ff)' : 'var(--c-8a8aa8)'}
                              stroke={p.isClient ? 'var(--c-9b96ff)' : 'none'} strokeWidth={p.isClient ? 2 : 0} />
                            <text x={qx(p.citations) + 9} y={qy(p.visibilityPct) + 4} fontSize="10.5"
                              fontWeight={p.isClient ? 800 : 600}
                              fill={p.isClient ? 'var(--c-9b96ff)' : 'var(--c-8a8aa8)'}>{p.brand}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                    {quadrant.unmatched.length > 0 && (
                      <p style={{ fontSize: '11px', color: 'var(--c-6a6a90)', marginTop: '8px' }}>
                        Not plotted (no matchable cited domain in the stored export — citations unmeasured, not zero):{' '}
                        {quadrant.unmatched.map(u => `${u.brand} (${u.visibilityPct.toFixed(1)}% named)`).join(' · ')}
                      </p>
                    )}
                    {basisLine(quadrant.basis)}
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>
                    No Profound export is stored for this project, so the quadrant cannot be measured. Upload the export in AI Answer Engines — this section fills in automatically.
                  </p>
                )}

                {sectionLabel('Demand coverage — good vs. great per product line')}
                {coverage ? (
                  <div style={{ ...card, padding: '4px 0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          {['Product line', 'Journey topics', `${displayName} covered`, '% of journey', 'Field avg %', 'Leader'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.lines.map((l, i) => {
                          const bb = i === coverage.lines.length - 1 ? 'none' : '1px solid var(--c-1e1e34)';
                          return (
                            <tr key={i}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--c-c8c8e8)', borderBottom: bb }}>{l.product}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>{l.journeyTopicsRequired ?? '—'}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>{l.client.covered ?? 'not measured'}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 800, color: l.client.pct != null && l.fieldAvgPct != null ? (l.client.pct >= l.fieldAvgPct ? 'var(--c-34d399)' : 'var(--c-f59e0b)') : 'var(--c-8a8aa8)', borderBottom: bb }}>{l.client.pct != null ? `${l.client.pct}%` : '—'}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>{l.fieldAvgPct != null ? `${l.fieldAvgPct}% · ${l.brandsMeasured} brands` : '—'}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>
                                {l.leader ? <>{l.leader.isClient ? <span style={{ color: 'var(--c-9b96ff)', fontWeight: 700 }}>{l.leader.domain}</span> : l.leader.domain}{l.leader.pct != null ? ` · ${l.leader.pct}%` : ''}</> : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ padding: '0 14px 10px' }}>{basisLine(coverage.basis)}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>
                    No canonical journey topics are stored for this project yet, so per-line coverage cannot be measured. Run an analysis first.
                  </p>
                )}

                {sectionLabel('Market scale vs. answer-layer position')}
                {benchmarks.length > 0 ? (
                  <div style={{ ...card, padding: '4px 0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          {['Brand', 'Metric', 'Value', 'Rank', 'AI visibility (named)', 'Source'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {benchmarks.map((b, i) => {
                          const vis = visFor(b.brand);
                          const bb = i === benchmarks.length - 1 ? 'none' : '1px solid var(--c-1e1e34)';
                          return (
                            <tr key={i}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--c-c8c8e8)', borderBottom: bb }}>{b.brand}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>{b.metric}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--c-c8c8e8)', borderBottom: bb }}>{b.value}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--c-8a8aa8)', borderBottom: bb }}>{b.rank ?? '—'}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: vis != null ? 'var(--c-9b96ff)' : 'var(--c-6a6a90)', borderBottom: bb }}>{vis != null ? `${vis.toFixed(1)}%` : 'not measured'}</td>
                              <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--c-6a6a90)', borderBottom: bb }}>{b.source}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ padding: '0 14px 10px' }}>{basisLine('Scale values are user-entered external benchmarks, shown verbatim with their named source — OrbitIQ does not compute on them. AI visibility joins the stored Profound coverage % by brand name.')}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)' }}>
                    No market benchmarks entered. Scale data (e.g. deposits, market share) lives outside OrbitIQ's measured sources — add rows with their source below and this table renders the scale-vs-visibility comparison.
                  </p>
                )}
                <button onClick={() => setBenchOpen(o => !o)} style={{ marginTop: '10px', fontSize: '11.5px', fontWeight: 700, color: 'var(--c-8a8aa8)', background: 'none', border: '1px solid var(--c-2a2a40)', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer' }}>
                  {benchOpen ? 'Close benchmark editor' : benchmarks.length ? 'Edit market benchmarks' : 'Add market benchmarks'}
                </button>
                {benchOpen && (
                  <div style={{ marginTop: '10px', border: '1px solid var(--c-1e1e34)', borderRadius: '11px', padding: '14px 16px', background: 'var(--c-0a0a14)' }}>
                    {benchDraft.map((r, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr 0.5fr 1.6fr auto', gap: '8px', marginBottom: '8px' }}>
                        {(['brand', 'metric', 'value', 'rank', 'source'] as const).map(f => (
                          <input
                            key={f}
                            value={f === 'rank' ? (r.rank ?? '') : (r[f] as string)}
                            placeholder={f === 'brand' ? 'Brand' : f === 'metric' ? 'Metric (e.g. Deposits Q2 2026)' : f === 'value' ? 'Value (e.g. $484.3B)' : f === 'rank' ? 'Rank' : 'Source (e.g. Q2 2026 earnings release)'}
                            onChange={e => setBenchDraft(d => d.map((row, j) => j !== i ? row : { ...row, [f]: f === 'rank' ? (e.target.value ? Number(e.target.value) : null) : e.target.value }))}
                            style={{ fontSize: '12px', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--c-2a2a40)', background: 'var(--c-111120)', color: 'var(--c-c8c8e8)' }}
                          />
                        ))}
                        <button onClick={() => setBenchDraft(d => d.filter((_, j) => j !== i))} aria-label="Remove row" style={{ fontSize: '12px', color: 'var(--c-f87171)', background: 'none', border: '1px solid var(--c-2a2a40)', borderRadius: '7px', padding: '0 10px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button onClick={() => setBenchDraft(d => [...d, { brand: '', metric: '', value: '', rank: null, source: '' }])} style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-8a8aa8)', background: 'none', border: '1px solid var(--c-2a2a40)', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer' }}>+ Add row</button>
                      <button onClick={saveBenchmarks} disabled={benchSaving} style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-9b96ff)', background: 'var(--ca-108-99-255-0_12)', border: '1px solid var(--ca-108-99-255-0_45)', borderRadius: '7px', padding: '5px 14px', cursor: 'pointer', opacity: benchSaving ? 0.6 : 1 }}>{benchSaving ? 'Saving…' : 'Save benchmarks'}</button>
                      <span style={{ fontSize: '11px', color: 'var(--c-55557a)', alignSelf: 'center' }}>Every row needs a named source — rows without one are not saved.</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── sources ── */}
            {insights && insights.sources.length > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--c-55557a)', marginTop: '22px' }}>
                SOURCES: {insights.sources.join(' | ')} · generated {new Date(insights.generatedAt).toLocaleString()} · every number verified against stored panel data before saving{isNew ? ' · every standing claim checked against the computed standing' : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
