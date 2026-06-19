'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  buildContentPlan, planFromSnapshot, buildContentPlanFromTopics, DISTANCE_LABEL, PRIORITY_LABEL, SUPPORT_LABEL,
  type ContentPlan, type ContentTopic, type Priority,
} from '@/lib/journey/contentPlan';
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';   // v7.210: one source of truth

// ─── palette (matches the app's orbit-* dark theme) ─────────────────────────────
const COL = {
  cyan: 'var(--c-22d3ee)', purple: 'var(--c-a78bfa)', green: 'var(--c-34d399)', red: 'var(--c-f87171)',
  amber: 'var(--c-f59e0b)', orange: 'var(--c-fb923c)', txt: 'var(--c-dcdcf4)', txt2: 'var(--c-c8c8e8)',
  mut: 'var(--c-8080a0)', mut2: 'var(--c-6a6a90)', dim: 'var(--c-4a4a6a)', line: 'var(--c-1a1a30)', panel: 'var(--c-0d0d1e)',
};
const stateColor: Record<string, string> = { existing: COL.green, build: COL.orange, competitor: COL.purple };
const priColor: Record<Priority, string> = { P0: 'var(--c-f87171)', P1: 'var(--c-fbbf24)', P2: 'var(--c-22d3ee)' };
const distFill: Record<number, string> = { 1: COL.green, 2: 'var(--c-7dd3fc)', 3: COL.cyan, 4: COL.purple };
const laneLabel: Record<string, string> = { 'pre-product': 'Pre-product', product: 'Product' };
const kindLabel: Record<string, string> = { problem: 'Problem', core: 'Core', support: 'Support' };

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}
function actionLabel(t: ContentTopic): string {
  if (t.state === 'existing') return t.refresh ? 'Optimise / refresh' : 'Optimise';
  return t.state === 'competitor' ? 'Build (comp.)' : 'Build new';
}

// ─── distance meter ─────────────────────────────────────────────────────────────
function DistMeter({ d }: { d: number }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[4, 3, 2, 1].map((i: number) => (
          <span key={i} style={{ height: 6, width: 16, borderRadius: 2, background: i >= d ? distFill[d] : COL.line }} />
        ))}
      </div>
      <div style={{ fontSize: 9, color: COL.mut2, marginTop: 3 }}>{DISTANCE_LABEL[d]}</div>
    </div>
  );
}

// ─── filter / summary card ───────────────────────────────────────────────────────
function FCard({ active, onClick, label, icon, val, sub, color, children }: {
  active: boolean; onClick: () => void; label: string; icon?: string; val: string | number; sub: string; color: string; children?: any;
}) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: COL.panel, border: `1px solid ${active ? color : COL.line}`, borderRadius: 11,
      padding: '14px 16px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.12s',
    }}>
      {active && <i className="ti ti-check" style={{ position: 'absolute', top: 11, right: 12, fontSize: 12, color }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: COL.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <i className={`ti ${icon}`} style={{ color }} />}{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, margin: '5px 0 2px', color }}>{val}</div>
      <div style={{ fontSize: 11, color: COL.mut2 }}>{sub}</div>
      {children}
    </button>
  );
}

// ─── topic row ───────────────────────────────────────────────────────────────────
const ROW_COLS = '1fr 122px 86px 104px 96px 74px';
function Row({ t, onOpen }: { t: ContentTopic; onOpen: (t: ContentTopic) => void }) {
  const col = stateColor[t.state];
  const pri = priColor[t.priority];
  return (
    <div onClick={() => onOpen(t)} style={{
      display: 'grid', gridTemplateColumns: ROW_COLS, gap: 12, alignItems: 'center', padding: '12px 15px',
      background: COL.panel, border: `1px solid ${COL.line}`, borderRadius: 10, marginBottom: 7, cursor: 'pointer',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: COL.txt2, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {t.kind === 'core' && <span style={{ color: COL.purple }}>★</span>}{t.name}
          {t.quickWin && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-08081a)', background: COL.amber, borderRadius: 5, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ti ti-bolt" /> Quick win</span>}
          {t.refresh && <span style={{ fontSize: 9, fontWeight: 700, color: COL.amber, background: 'var(--ca-245-158-11-0_12)', borderRadius: 5, padding: '2px 7px' }}>Refresh</span>}
        </div>
        <div style={{ fontSize: 10, color: COL.mut2, marginTop: 3, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <span>{laneLabel[t.lane]} · {kindLabel[t.kind]}</span>
          <span><i className="ti ti-message-2" /> {t.promptCount}</span>
          <span>{t.kwCount} kw</span>
        </div>
      </div>
      <div className="ovHide"><DistMeter d={t.distance} /></div>
      <div className="ovHide"><span style={{ fontSize: 9.5, fontWeight: 700, color: pri, background: `${pri}1a`, border: `1px solid ${pri}55`, borderRadius: 5, padding: '3px 0', textAlign: 'center', display: 'block' }}>{t.priority}</span></div>
      <div><span style={{ fontSize: 9.5, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 5, padding: '3px 0', textAlign: 'center', display: 'block' }}>{actionLabel(t)}</span></div>
      <div><div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, textAlign: 'right', color: col }}>{fmtVol(t.totalVol)}</div><div style={{ fontSize: 9, color: COL.mut2, textAlign: 'right', fontFamily: 'monospace' }}>/mo</div></div>
      <div className="ovHide" style={{ textAlign: 'right' }}>
        {t.competitor
          ? <span style={{ fontSize: 9, fontWeight: 700, color: COL.purple, background: 'var(--ca-167-139-250-0_12)', borderRadius: 5, padding: '2px 7px' }}>{t.competitor.replace(/^www\./, '').split('.')[0]}</span>
          : <span style={{ fontSize: 9, fontWeight: 700, color: COL.green, background: 'var(--ca-52-211-153-0_1)', borderRadius: 5, padding: '2px 7px' }}>open</span>}
      </div>
    </div>
  );
}

// ─── drawer (full brief) ─────────────────────────────────────────────────────────
function Drawer({ topic, onClose }: { topic: ContentTopic | null; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const open = !!topic;
  const t = topic;
  const col = t ? stateColor[t.state] : COL.cyan;
  const lbl = (s: string) => <div style={{ fontSize: 9.5, letterSpacing: '0.08em', color: COL.dim, textTransform: 'uppercase', marginTop: 18 }}>{s}</div>;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--ca-4-4-12-0_55)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.18s', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 560, maxWidth: '94vw', background: 'var(--c-0b0b1c)', borderLeft: `1px solid ${COL.line}`, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.2s ease', zIndex: 50, overflowY: 'auto' }}>
        {t && (
          <>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--c-13132a)', position: 'sticky', top: 0, background: 'var(--c-0b0b1c)', zIndex: 2 }}>
              <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: COL.mut, fontSize: 18, cursor: 'pointer' }}><i className="ti ti-x" /></button>
              <div style={{ fontSize: 17, fontWeight: 700, color: COL.txt }}>{t.kind === 'core' ? '★ ' : ''}{t.name}</div>
              <div style={{ fontSize: 11, color: COL.mut2, marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'monospace' }}>
                <span>{fmtVol(t.totalVol)}/mo</span><span><i className="ti ti-message-2" /> {t.promptCount} prompts</span><span>{t.distanceLabel}</span><span>{laneLabel[t.lane]} · {kindLabel[t.kind]}</span>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 5, padding: '3px 8px' }}>{actionLabel(t)}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: priColor[t.priority], background: `${priColor[t.priority]}1a`, border: `1px solid ${priColor[t.priority]}55`, borderRadius: 5, padding: '3px 8px' }}>{t.priority} · {PRIORITY_LABEL[t.priority]}</span>
                {t.quickWin && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-08081a)', background: COL.amber, borderRadius: 5, padding: '3px 8px' }}><i className="ti ti-bolt" /> Quick win</span>}
              </div>
            </div>
            <div style={{ padding: '16px 20px 40px' }}>
              {lbl('Suggested article title')}
              <p style={{ fontSize: 14, fontWeight: 600, color: COL.txt, margin: '7px 0 0', lineHeight: 1.4 }}>{t.brief.title}</p>

              {lbl('Outline (H2s)')}
              <ol style={{ margin: '7px 0 0', paddingLeft: 18 }}>
                {t.brief.outline.map((h: string, i: number) => <li key={i} style={{ fontSize: 12.5, color: COL.txt2, margin: '5px 0', lineHeight: 1.4 }}>{h}</li>)}
              </ol>

              {lbl('Answer these (People Also Ask)')}
              {t.brief.faq.map((q: string, i: number) => <p key={i} style={{ fontSize: 12, color: COL.mut, margin: '6px 0 0', lineHeight: 1.5 }}>{q}</p>)}

              <div style={{ fontSize: 9.5, letterSpacing: '0.08em', color: COL.dim, textTransform: 'uppercase', marginTop: 18 }}>
                Target keywords <span style={{ textTransform: 'none', letterSpacing: 0, color: COL.mut2 }}>· reconciles with Keyword panel</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                {t.brief.keywords.map((k, i: number) => (
                  <span key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: 'var(--c-9a9ac0)', background: 'var(--ca-120-120-160-0_08)', border: '1px solid var(--c-1f1f3a)', borderRadius: 5, padding: '3px 8px' }}>
                    {k.keyword}<span style={{ color: COL.mut2, marginLeft: 7 }}>{fmtVol(k.searchVolume)}</span>
                  </span>
                ))}
              </div>

              {t.brief.links.length > 0 && (
                <>
                  {lbl('Internal links')}
                  {t.brief.links.map((l, i: number) => {
                    const lc = l.dir === 'from' ? COL.cyan : COL.purple;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: COL.mut, marginTop: 7 }}>
                        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', borderRadius: 4, padding: '2px 6px', color: lc, background: `${lc}1f` }}>link {l.dir}</span>
                        <i className={`ti ti-arrow-${l.dir === 'from' ? 'left' : 'right'}`} /> {l.name}
                        <span style={{ color: COL.dim, fontSize: 10 }}>· {l.why}</span>
                      </div>
                    );
                  })}
                </>
              )}

              {lbl(`SERP targets${t.refresh ? '  ·  refresh existing page' : ''}`)}
              <div style={{ marginTop: 6 }}>
                {t.brief.serp.map((s: string, i: number) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: COL.cyan, background: 'var(--ca-34-211-238-0_08)', border: '1px solid var(--ca-34-211-238-0_22)', borderRadius: 5, padding: '4px 9px', margin: '5px 5px 0 0' }}>
                    <i className="ti ti-target" /> {s}
                  </span>
                ))}
              </div>

              {lbl('Competitive insight')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7, background: t.competitor ? 'var(--ca-248-113-113-0_05)' : 'var(--ca-52-211-153-0_05)', border: `1px solid ${t.competitor ? 'var(--ca-248-113-113-0_2)' : 'var(--ca-52-211-153-0_2)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: t.competitor ? 'var(--c-cc8899)' : 'var(--c-77cc99)' }}>
                <i className={`ti ti-${t.competitor ? 'swords' : 'flag'}`} />
                <span>{t.competitor
                  ? <><b>{t.competitor.replace(/^www\./, '')}</b> ranks for this topic and you don&rsquo;t — beat their depth to capture it.</>
                  : 'Open field — no tracked competitor ranks here yet. First-mover advantage.'}</span>
              </div>

              {t.url ? (
                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, fontWeight: 600, color: col, border: `1px solid ${col}55`, borderRadius: 8, padding: '8px 13px', textDecoration: 'none' }}>
                  <i className="ti ti-external-link" /> Optimise existing page · {t.url}
                </a>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, fontWeight: 600, color: col, border: `1px solid ${col}55`, borderRadius: 8, padding: '8px 13px' }}>
                  <i className="ti ti-pencil-plus" /> Net-new build
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── shared explorer (used by Content panel AND Content Plan) ────────────────────
export function ContentExplorer({ plan, mode }: { plan: ContentPlan; mode: 'content' | 'plan' }) {
  const [sel, setSel] = useState<ContentTopic | null>(null);
  const [cFilter, setCFilter] = useState<'all' | 'existing' | 'build' | 'quickwin'>('all');
  const [pStatus, setPStatus] = useState<'all' | 'existing' | 'build'>('all');
  const [pPriority, setPPriority] = useState<'all' | Priority>('all');

  const sc = plan.scope;
  const T = plan.topics;

  const contentRows = useMemo(() => T.filter((t: ContentTopic) =>
    cFilter === 'all' ? true : cFilter === 'quickwin' ? t.quickWin : cFilter === 'existing' ? t.state === 'existing' : t.state !== 'existing'
  ).slice().sort((a, b) => b.totalVol - a.totalVol), [T, cFilter]);

  const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
  const planRows = useMemo(() => T.filter((t: ContentTopic) => {
    const s = pStatus === 'all' || (pStatus === 'existing' ? t.state === 'existing' : t.state !== 'existing');
    const p = pPriority === 'all' || t.priority === pPriority;
    return s && p;
  }).slice().sort((a, b) => (order[a.priority] - order[b.priority]) || (a.distance - b.distance) || (b.totalVol - a.totalVol)), [T, pStatus, pPriority]);

  const rows = mode === 'content' ? contentRows : planRows;
  const styleTag = <style>{`@media(max-width:860px){.ovHide{display:none!important}}`}</style>;

  return (
    <div>
      {styleTag}
      {mode === 'content' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '14px 0 16px' }}>
          <FCard active={cFilter === 'all'} onClick={() => setCFilter('all')} label="All topics" icon="ti-stack-2" val={sc.total} sub={`${fmtVol(sc.totalVol)}/mo total demand`} color="var(--c-c8c8e8)">
            <div style={{ height: 6, borderRadius: 3, background: COL.line, overflow: 'hidden', marginTop: 10, display: 'flex' }}>
              <div style={{ width: `${sc.totalVol ? (sc.existingVol / sc.totalVol) * 100 : 0}%`, background: COL.green }} />
              <div style={{ width: `${sc.totalVol ? (sc.buildVol / sc.totalVol) * 100 : 0}%`, background: COL.orange }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 5 }}>
              <span style={{ color: COL.green }}>{sc.existing} existing</span><span style={{ color: COL.orange }}>{sc.build} net-new</span>
            </div>
          </FCard>
          <FCard active={cFilter === 'existing'} onClick={() => setCFilter('existing')} label="Existing → optimise" icon="ti-refresh" val={sc.existing} sub={`${fmtVol(sc.existingVol)}/mo · pages you have`} color={COL.green} />
          <FCard active={cFilter === 'build'} onClick={() => setCFilter('build')} label="Net-new → build" icon="ti-pencil-plus" val={sc.build} sub={`${fmtVol(sc.buildVol)}/mo · pages to create`} color={COL.orange} />
          <FCard active={cFilter === 'quickwin'} onClick={() => setCFilter('quickwin')} label="Quick wins" icon="ti-bolt" val={sc.quickWins} sub={`${fmtVol(sc.quickWinVol)}/mo · fast ROI`} color={COL.amber} />
        </div>
      ) : (
        <>
          {/* scope row: total / existing / net-new (all carry volume) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '16px 0 14px' }}>
            <FCard active={pStatus === 'all'} onClick={() => setPStatus('all')} label="Total articles" icon="ti-files" val={sc.total} sub={`${fmtVol(sc.totalVol)}/mo combined demand`} color="var(--c-c8c8e8)" />
            <FCard active={pStatus === 'existing'} onClick={() => setPStatus('existing')} label="Existing → optimise" icon="ti-refresh" val={sc.existing} sub={`${fmtVol(sc.existingVol)}/mo`} color={COL.green} />
            <FCard active={pStatus === 'build'} onClick={() => setPStatus('build')} label="Net-new → build" icon="ti-pencil-plus" val={sc.build} sub={`${fmtVol(sc.buildVol)}/mo`} color={COL.orange} />
          </div>
          {/* priority filter cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '0 0 16px' }}>
            <FCard active={pPriority === 'all'} onClick={() => setPPriority('all')} label="All priorities" icon="ti-list" val={sc.total} sub={`${fmtVol(sc.totalVol)}/mo`} color="var(--c-c8c8e8)" />
            <FCard active={pPriority === 'P0'} onClick={() => setPPriority('P0')} label="P0 · Do first" val={sc.p0} sub={`${fmtVol(sc.p0Vol)}/mo`} color={priColor.P0} />
            <FCard active={pPriority === 'P1'} onClick={() => setPPriority('P1')} label="P1 · Next" val={sc.p1} sub={`${fmtVol(sc.p1Vol)}/mo`} color={priColor.P1} />
            <FCard active={pPriority === 'P2'} onClick={() => setPPriority('P2')} label="P2 · Later" val={sc.p2} sub={`${fmtVol(sc.p2Vol)}/mo`} color={priColor.P2} />
          </div>
        </>
      )}

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: COL.mut }}>
          <b style={{ color: COL.txt2 }}>{rows.length}</b> topics · <b style={{ color: COL.txt2 }}>{fmtVol(rows.reduce((s, t) => s + t.totalVol, 0))}/mo</b>
        </span>
        {mode === 'plan' && (pStatus !== 'all' || pPriority !== 'all') && (
          <button onClick={() => { setPStatus('all'); setPPriority('all'); }} style={{ fontSize: 11, color: COL.cyan, background: 'none', border: 'none', cursor: 'pointer' }}><i className="ti ti-x" /> Clear filters</button>
        )}
        <span style={{ fontSize: 11, color: COL.dim, marginLeft: 'auto' }}>Cards filter · click a row for the {mode === 'plan' ? 'writer brief' : 'detail'}</span>
      </div>

      {/* column header */}
      <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 12, padding: '0 15px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COL.dim }}>
        <div>{mode === 'plan' ? 'Article topic' : 'Topic'}</div>
        <div className="ovHide">Distance to conversion</div>
        <div className="ovHide">Priority</div>
        <div>Action</div>
        <div style={{ textAlign: 'right' }}>Volume</div>
        <div className="ovHide" style={{ textAlign: 'right' }}>Competitor</div>
      </div>

      {rows.length ? rows.map((t: ContentTopic) => <Row key={t.id} t={t} onOpen={setSel} />)
        : <p style={{ color: COL.dim, fontSize: 12, padding: 16 }}>No topics match this filter.</p>}

      <Drawer topic={sel} onClose={() => setSel(null)} />
    </div>
  );
}

// ─── Content Plan sub-nav section (default export) ───────────────────────────────
interface Props { projectId: string; kwVersion?: number; analysis: any; competitors: string[]; claudeAssigns?: Record<string, IntentType>; }   // v7.220: page-supplied intent map → reconciles topic count to the Cluster panel

export default function ContentPlanSection({ projectId, kwVersion, analysis, competitors = [], claudeAssigns = {} }: Props) {
  const [uploadedKeywords, setUploadedKeywords] = useState<any[]>([]);
  const [kwLoaded, setKwLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) { setKwLoaded(true); return; }
    let cancelled = false;
    setKwLoaded(false);
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => r.ok ? r.json() : { keywords: [] })
      .then((d: any) => { if (!cancelled) { setUploadedKeywords(d.keywords ?? []); setKwLoaded(true); } })
      .catch(() => { if (!cancelled) setKwLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);

  // v7.210: ONE PAGE PER CLUSTER — build the plan from the canonical cluster topics
  // (the same source the Cluster panel counts), so content-plan total reconciles to
  // the cluster count (Const III.5). Falls back to the demand-universe plan only when
  // no clusters exist yet.
  const clientDomain = (analysis?.semrushSnapshot?.domain as string) ?? '';
  const plan = useMemo(() => {
    const topics = buildCanonicalClusterTopics(analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns);
    if (topics.length > 0) return buildContentPlanFromTopics(topics);
    return planFromSnapshot(analysis, uploadedKeywords);
  }, [analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: COL.dim, marginBottom: 5 }}>Foundation · 05 · Content Plan</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: COL.txt, margin: 0 }}>Content Plan</h2>
        <p style={{ fontSize: 12, color: COL.mut, marginTop: 5, maxWidth: 760 }}>
          Prioritised, writer-ready briefs from the audience journey. P0 first &mdash; closest to conversion with real demand. Scope cards filter; click a row for the full brief.
        </p>
      </div>
      {!kwLoaded ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <i className="ti ti-loader-2" style={{ color: COL.cyan, fontSize: 18 }} />
          <p style={{ color: COL.mut2, fontSize: 12, marginTop: 10 }}>Loading content plan&hellip;</p>
        </div>
      ) : !plan ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🗺️</div>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            The Content Plan is built from the deep journey. Open the <b style={{ color: COL.cyan }}>Keyword</b> panel and run <b style={{ color: COL.cyan }}>Expand product data</b> &amp; <b style={{ color: COL.cyan }}>Build pre-product journey</b> to populate it &mdash; then every topic shows here as a prioritised, writer-ready brief.
          </p>
        </div>
      ) : (
        <ContentExplorer plan={plan} mode="plan" />
      )}
    </div>
  );
}
