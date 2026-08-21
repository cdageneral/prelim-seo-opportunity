'use client';

/**
 * components/brief/InsightsSection.tsx — v7.471 · the Insights panel.
 *
 * Sub-view under Executive Summary. Renders the strongest cross-panel insights
 * the project's stored data proves:
 *
 *   1. Category thesis + detected patterns + competitor playbook + where to
 *      strike — GENERATED narrative, produced by /api/.../insights-panel POST
 *      through the v7.463 fail-closed number verifier and STORED (cached) on
 *      the project. Nothing renders that was not machine-verified against
 *      stored panel data (Const I.1). Regenerate on demand (IV.4).
 *   2. Source-vs-answer quadrant — deterministic view over the stored Profound
 *      export (lib/insightsPanel/build.buildQuadrant). Brands whose cited
 *      domain could not be matched are LISTED, never plotted at zero (I.5).
 *   3. Demand-coverage table — the Product Insights panel's own shared
 *      Content-Footprint-vs-Journey basis (II.6a: read, never re-derived).
 *   4. Market benchmarks (optional) — user-entered external scale rows
 *      (deposits etc.), displayed verbatim with their named source; the scale
 *      table renders ONLY when rows exist (honest gap otherwise, I.5).
 *
 * Const IV.1: scroll root is `flex-1 min-h-0 overflow-y-auto`.
 * Const IV.2: generation streams live step labels (step N of 5 + elapsed).
 * Const IV.6: colour tokens are the shipped panel vocabulary (theme-mapped).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Pattern { tag: 'PATTERN' | 'GOOD_NEWS' | 'RISK' | 'OPPORTUNITY'; title: string; body: string; }
interface PlaybookRow { brand: string; doingWell: string; vulnerable: string; keyStat: string; }
interface StrikeRow { title: string; body: string; impact: 'HIGH' | 'MEDIUM'; }
interface InsightsBlob {
  thesis: { headline: string; body: string; openPosition: string | null };
  patterns: Pattern[]; playbook: PlaybookRow[]; strike: StrikeRow[];
  sources: string[]; generatedAt: string; model: string; verified: number;
  analysisCompletedAt?: string | null;
}
interface QuadPoint { brand: string; isClient: boolean; visibilityPct: number; citations: number; domain: string; quadrant: string; }
interface Quadrant { points: QuadPoint[]; unmatched: Array<{ brand: string; isClient: boolean; visibilityPct: number }>; medians: { visibilityPct: number; citations: number }; basis: string; }
interface CovLine { product: string; journeyTopicsRequired: number | null; client: { covered: number | null; pct: number | null }; leader: { domain: string; isClient: boolean; covered: number | null; pct: number | null } | null; fieldAvgPct: number | null; brandsMeasured: number; gapSubCategories: string[]; }
interface Coverage { lines: CovLine[]; basis: string; }
interface BenchRow { brand: string; metric: string; value: string; rank?: number | null; source: string; }

interface Props { projectId: string; clientName?: string | null; }

const TAG_STYLES: Record<Pattern['tag'], { label: string; color: string; bg: string; border: string }> = {
  PATTERN:     { label: 'PATTERN',     color: 'var(--c-9b96ff)', bg: 'var(--ca-108-99-255-0_12)', border: 'var(--ca-108-99-255-0_25)' },
  GOOD_NEWS:   { label: 'GOOD NEWS',   color: 'var(--c-34d399)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
  RISK:        { label: 'RISK',        color: 'var(--c-f87171)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
  OPPORTUNITY: { label: 'OPPORTUNITY', color: 'var(--c-46cce0)', bg: 'transparent',               border: 'var(--c-2a2a40)' },
};

function squash(s: string): string { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

export default function InsightsSection({ projectId, clientName }: Props) {
  const [insights, setInsights] = useState<InsightsBlob | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<{ label: string; step: number; steps: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [benchOpen, setBenchOpen] = useState(false);
  const [benchDraft, setBenchDraft] = useState<BenchRow[]>([]);
  const [benchSaving, setBenchSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/insights-panel`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setInsights(j.insights ?? null);
      setUpdatedAt(j.updatedAt ?? null);
      setQuadrant(j.quadrant ?? null);
      setCoverage(j.coverage ?? null);
      const b = Array.isArray(j.benchmarks) ? j.benchmarks : [];
      setBenchmarks(b); setBenchDraft(b);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const generate = useCallback(async () => {
    setGenError(null);
    setGenStatus({ label: 'Starting', step: 1, steps: 5 });
    setElapsed(0);
    const t0 = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
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
          if (msg.type === 'status') setGenStatus({ label: msg.label, step: msg.step ?? 0, steps: msg.steps ?? 5 });
          else if (msg.type === 'error') setGenError(msg.error ?? 'Generation failed.');
          else if (msg.type === 'done') { setInsights(msg.insights ?? null); setUpdatedAt(msg.updatedAt ?? null); }
        }
      }
    } catch { setGenError('Generation failed — check the connection and try again.'); }
    finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setGenStatus(null);
    }
  }, [projectId]);

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

  const sectionLabel = (s: string) => (
    <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--c-55557a)', textTransform: 'uppercase', margin: '26px 0 10px' }}>{s}</div>
  );

  const basisLine = (s: string) => (
    <p style={{ fontSize: '10.5px', color: 'var(--c-55557a)', marginTop: '8px', lineHeight: 1.5 }}>{s}</p>
  );

  // ── quadrant geometry ──
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
              ✓ {insights.verified} numbers verified against stored data
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
          Overarching patterns this project's stored data proves — search rank, AI visibility, prompts, content, and the competitive field. Every number is machine-verified against the panels before anything is saved.
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
            <span style={{ fontSize: '11px', color: 'var(--c-6a6a90)', flexShrink: 0 }}>{elapsed}s elapsed</span>
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
            {/* ── 1 · thesis ── */}
            {insights ? (
              <div style={{ border: '1px solid var(--ca-108-99-255-0_25)', background: 'var(--ca-108-99-255-0_12)', borderRadius: '14px', padding: '22px 24px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.09em', color: 'var(--c-9b96ff)', textTransform: 'uppercase', marginBottom: '8px' }}>Category thesis</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--c-e8e8ff)', lineHeight: 1.35, maxWidth: '820px' }}>{insights.thesis.headline}</div>
                <p style={{ fontSize: '13px', color: 'var(--c-8a8aa8)', marginTop: '10px', maxWidth: '880px', lineHeight: 1.55 }}>{insights.thesis.body}</p>
                {insights.thesis.openPosition && (
                  <div style={{ display: 'inline-block', marginTop: '13px', padding: '8px 14px', borderRadius: '9px', border: '1px solid var(--c-2a2a40)', color: 'var(--c-34d399)', fontSize: '12.5px', fontWeight: 700 }}>
                    {insights.thesis.openPosition}
                  </div>
                )}
              </div>
            ) : !genStatus && (
              <div style={{ border: '1px dashed var(--c-2a2a40)', borderRadius: '14px', padding: '26px', textAlign: 'center' }}>
                <p style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--c-c8c8e8)' }}>No insights generated for {clientName ?? 'this project'} yet</p>
                <p style={{ fontSize: '12px', color: 'var(--c-6a6a90)', marginTop: '6px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Generate to have the insight engine read every stored panel — keywords, ranks, AI visibility, prompts, content coverage, sentiment — and write the verified cross-panel story. Takes about a minute; results are cached until you regenerate.
                </p>
              </div>
            )}

            {/* ── 2 · patterns ── */}
            {insights && insights.patterns.length > 0 && (
              <>
                {sectionLabel('Detected patterns')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                  {insights.patterns.map((p, i) => {
                    const t = TAG_STYLES[p.tag] ?? TAG_STYLES.PATTERN;
                    return (
                      <div key={i} style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', padding: '16px 18px' }}>
                        <span style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.07em', color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: '5px', padding: '2px 8px' }}>{t.label}</span>
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--c-e8e8ff)', margin: '9px 0 5px', lineHeight: 1.35 }}>{p.title}</div>
                        <p style={{ fontSize: '12.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.55 }}>{p.body}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 3 · competitor playbook ── */}
            {insights && insights.playbook.length > 0 && (
              <>
                {sectionLabel("Competitor playbook — what they've solved, where they're exposed")}
                <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(220px, 1fr) minmax(220px, 1fr) 150px', minWidth: '780px' }}>
                    {['Brand', 'Doing well', 'Vulnerable', 'Key stat'].map(h => (
                      <div key={h} style={{ padding: '9px 14px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--c-55557a)', textTransform: 'uppercase', background: 'var(--c-0a0a14)', borderBottom: '1px solid var(--c-1e1e34)' }}>{h}</div>
                    ))}
                    {insights.playbook.map((r, i) => {
                      const last = i === insights.playbook.length - 1;
                      const bb = last ? 'none' : '1px solid var(--c-1e1e34)';
                      return [
                        <div key={`b${i}`} style={{ padding: '11px 14px', fontSize: '12.5px', fontWeight: 800, color: 'var(--c-c8c8e8)', borderBottom: bb }}>{r.brand}</div>,
                        <div key={`w${i}`} style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)', borderBottom: bb, lineHeight: 1.5 }}><span style={{ color: 'var(--c-34d399)', fontWeight: 700 }}>▲ </span>{r.doingWell}</div>,
                        <div key={`v${i}`} style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)', borderBottom: bb, lineHeight: 1.5 }}><span style={{ color: 'var(--c-f87171)', fontWeight: 700 }}>▼ </span>{r.vulnerable}</div>,
                        <div key={`s${i}`} style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 800, color: 'var(--c-e8e8ff)', borderBottom: bb }}>{r.keyStat}</div>,
                      ];
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── 4 · source-vs-answer quadrant ── */}
            {sectionLabel('Source vs. answer — who gets cited, who gets named')}
            {quadrant ? (
              <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', padding: '16px 18px' }}>
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

            {/* ── 5 · demand coverage ── */}
            {sectionLabel('Demand coverage — good vs. great per product line')}
            {coverage ? (
              <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', padding: '4px 0', overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr>
                      {['Product line', 'Journey topics', `${clientName ?? 'Client'} covered`, '% of journey', 'Field avg %', 'Leader'].map(h => (
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

            {/* ── 6 · where to strike ── */}
            {insights && insights.strike.length > 0 && (
              <>
                {sectionLabel('Where to strike — ranked openings')}
                <div>
                  {insights.strike.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: '13px', alignItems: 'flex-start', background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '11px', padding: '13px 16px', marginBottom: '8px' }}>
                      <span style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '8px', background: 'var(--ca-108-99-255-0_25)', color: 'var(--c-c8c8e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>{i + 1}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--c-e8e8ff)' }}>{s.title}</div>
                        <p style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginTop: '3px', lineHeight: 1.5 }}>{s.body}</p>
                      </div>
                      <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 800, padding: '4px 9px', borderRadius: '6px', border: '1px solid var(--c-2a2a40)', color: s.impact === 'HIGH' ? 'var(--c-34d399)' : 'var(--c-f59e0b)' }}>
                        {s.impact === 'HIGH' ? 'HIGH IMPACT' : 'MEDIUM'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── 7 · market benchmarks (optional external scale data) ── */}
            {sectionLabel('Market scale vs. answer-layer position')}
            {benchmarks.length > 0 ? (
              <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '12px', padding: '4px 0', overflowX: 'auto' }}>
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

            {/* ── sources ── */}
            {insights && insights.sources.length > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--c-55557a)', marginTop: '22px' }}>
                SOURCES: {insights.sources.join(' | ')} · generated {new Date(insights.generatedAt).toLocaleString()} · every number verified against stored panel data before saving
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
