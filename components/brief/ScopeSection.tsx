'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  planFromSnapshot, buildContentPlanFromTopics, brandTermsOf, filterPlanByIds,
  type ContentPlan, type ContentTopic, type Priority,
} from '@/lib/journey/contentPlan';
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';
import { ContentExplorer } from '@/components/brief/ContentPlanSection';
// v7.353: audience-segment lens — the SAME topic→segment attribution the Journey panel
// uses, carried into the scope sheet as a filter + per-row segment tags (Const II.7).
import { readSegments, buildTopicSegmentMap, buildSegTags, filterPlanBySegment, SegmentFilterBar } from '@/components/brief/SegmentLens';

// palette — theme tokens only (Const IV.6 / V.5): every --c-* token has a light remap, so
// reusing them keeps the panel legible in BOTH themes. No hex literals anywhere in this file.
const COL = {
  cyan: 'var(--c-22d3ee)', purple: 'var(--c-a78bfa)', green: 'var(--c-34d399)',
  amber: 'var(--c-fbbf24)', orange: 'var(--c-fb923c)', pink: 'var(--c-f472b6)',
  txt: 'var(--c-dcdcf4)', txt2: 'var(--c-c8c8e8)', mut: 'var(--c-8080a0)', mut2: 'var(--c-6a6a90)',
  dim: 'var(--c-4a4a6a)', line: 'var(--c-2a2a45)', card: 'var(--c-0d0d1e)', ink: 'var(--c-08080f)',
};

function fmtVol(n: number): string {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── The six workstreams that feed one Scope spec sheet ───────────────────────────
type WsKey = 'content' | 'llmPrompts' | 'themes' | 'authority' | 'technical' | 'citations';
interface WsDef { key: WsKey; label: string; icon: string; color: string; source: string; blurb: string; }
const WORKSTREAMS: WsDef[] = [
  { key: 'content',    label: 'Content',     icon: 'ti-file-text',       color: COL.cyan,   source: 'Content Plan',    blurb: 'Existing pages to optimise and net-new pages to build.' },
  { key: 'llmPrompts', label: 'LLM Prompts', icon: 'ti-message-2-bolt',  color: COL.purple, source: 'LLM Visibility',  blurb: 'Answer-engine prompts to win across the assistants.' },
  { key: 'themes',     label: 'Themes',      icon: 'ti-layers-subtract', color: COL.green,  source: 'Theme Clusters',  blurb: 'Topic clusters to own as authority hubs.' },
  { key: 'authority',  label: 'Authority',   icon: 'ti-award',           color: COL.amber,  source: 'Authority',       blurb: 'Off-page and E-E-A-T plays to build trust.' },
  { key: 'technical',  label: 'Technical',   icon: 'ti-settings-bolt',   color: COL.orange, source: 'Site Audit',      blurb: 'Crawl, speed and structured-data fixes.' },
  { key: 'citations',  label: 'Citations',   icon: 'ti-quote',           color: COL.pink,   source: 'Citations',       blurb: 'Sources and references that earn machine trust.' },
];

// Multi-year horizon — auto-derived from priority (Wayne, v7.270). Quarter granularity.
const YEARS: { pri: Priority; year: string; sub: string }[] = [
  { pri: 'P0', year: 'Year 1', sub: 'P0 · Do first' },
  { pri: 'P1', year: 'Year 2', sub: 'P1 · Next' },
  { pri: 'P2', year: 'Year 3+', sub: 'P2 · Later' },
  { pri: 'P3', year: 'Year 4+', sub: 'P3 · Backlog' },   // v7.357: 4th tier
];
const priColor: Record<Priority, string> = { P0: 'var(--c-f87171)', P1: COL.amber, P2: COL.cyan, P3: 'var(--c-9090b8)' };

// Sequence a year's topics into four quarters. Order is a transparent, deterministic rule —
// existing pages (quick ROI) first, then closest-to-conversion, then highest demand — and the
// list is chunked evenly across Q1→Q4. This is a SUGGESTED schedule derived from priority
// (Const I.5a: a labeled derived view, not a data metric), never a fabricated number.
function quarterize(topics: ContentTopic[]): ContentTopic[][] {
  const sorted = topics.slice().sort((a, b) => {
    const ae = a.state === 'existing' ? 0 : 1, be = b.state === 'existing' ? 0 : 1;
    return (ae - be) || (a.distance - b.distance) || (b.totalVol - a.totalVol);
  });
  const q: ContentTopic[][] = [[], [], [], []];
  const per = Math.max(1, Math.ceil(sorted.length / 4));
  sorted.forEach((t, i) => { q[Math.min(3, Math.floor(i / per))].push(t); });
  return q;
}

// ─── Roadmap (multi-year, quarterly) view of the scoped content ───────────────────
export function ContentRoadmap({ plan }: { plan: ContentPlan }) {
  const byYear = useMemo(() => YEARS.map((y) => {
    const topics = plan.topics.filter((t) => t.priority === y.pri);
    return { ...y, topics, quarters: quarterize(topics), vol: topics.reduce((s, t) => s + t.totalVol, 0) };
  }), [plan]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 14px', padding: '9px 13px', borderRadius: 8, background: 'var(--ca-34-211-238-0_08)', border: '1px solid var(--ca-34-211-238-0_2)' }}>
        <i className="ti ti-calendar-stats" style={{ fontSize: 15, color: COL.amber, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: COL.txt2, lineHeight: 1.45 }}>
          Suggested rollout &mdash; the horizon is derived from each topic&rsquo;s <b style={{ color: COL.txt }}>priority</b> (P0 &rarr; Year&nbsp;1, P1 &rarr; Year&nbsp;2, P2 &rarr; Year&nbsp;3+) and sequenced into quarters by quick-win, distance to conversion, then demand. It&rsquo;s a planning schedule, not a measured metric &mdash; reshape it by changing priorities on the Content Plan.
        </span>
      </div>

      {byYear.map((y) => (
        <div key={y.pri} style={{ marginBottom: 18, border: `1px solid ${COL.line}`, borderRadius: 12, overflow: 'hidden', background: COL.card }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${COL.line}`, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: COL.txt }}>{y.year}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: priColor[y.pri] }}>{y.sub}</span>
            </div>
            <span style={{ fontSize: 11, color: COL.mut }}>{y.topics.length} article{y.topics.length !== 1 ? 's' : ''} &middot; {fmtVol(y.vol)}/mo</span>
          </div>

          {y.topics.length === 0 ? (
            <p style={{ fontSize: 11.5, color: COL.mut2, padding: '14px', margin: 0 }}>Nothing scoped at this priority yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1, background: COL.line }}>
              {y.quarters.map((q, qi) => {
                const qVol = q.reduce((s, t) => s + t.totalVol, 0);
                return (
                  <div key={qi} style={{ background: COL.card, padding: '11px 12px', minHeight: 70 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COL.txt2 }}>Q{qi + 1}</span>
                      <span style={{ fontSize: 9.5, color: COL.mut2 }}>{q.length ? `${q.length} · ${fmtVol(qVol)}/mo` : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {q.map((t) => (
                        <div key={t.id} title={t.name} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 7, background: 'var(--ca-34-211-238-0_08)', border: '1px solid var(--ca-34-211-238-0_2)' }}>
                          <i className={`ti ${t.state === 'existing' ? 'ti-refresh' : 'ti-pencil-plus'}`} style={{ fontSize: 11, color: t.state === 'existing' ? COL.green : COL.orange, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: COL.txt2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{t.name}</span>
                          <span style={{ fontSize: 9.5, color: COL.mut, flexShrink: 0 }}>{fmtVol(t.totalVol)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── "Ready to wire" state for the five workstreams whose source panels are still coming ──
export function WorkstreamPending({ ws }: { ws: WsDef }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 540, margin: '0 auto' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COL.card, border: `1px solid ${COL.line}` }}>
        <i className={`ti ${ws.icon}`} style={{ fontSize: 24, color: ws.color }} />
      </div>
      <p style={{ color: COL.txt2, fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No {ws.label} items in scope yet</p>
      <p style={{ color: COL.mut, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
        {ws.blurb} Once the <b style={{ color: ws.color }}>{ws.source}</b> panel ships its <b style={{ color: COL.txt2 }}>Add&nbsp;to&nbsp;Scope</b> control, those items gather here beside content &mdash; organised by the same priority buckets and rolled into the multi-year plan.
      </p>
    </div>
  );
}

// ─── View Scope sub-nav section (under Executive Summary) ─────────────────────────
interface Props { projectId: string; kwVersion?: number; analysis: any; competitors: string[]; claudeAssigns?: Record<string, IntentType>; }

export default function ScopeSection({ projectId, kwVersion, analysis, competitors = [], claudeAssigns = {} }: Props) {
  const [uploadedKeywords, setUploadedKeywords] = useState<any[]>([]);
  const [kwLoaded, setKwLoaded] = useState(false);
  const [scopeIds, setScopeIds] = useState<Set<string> | null>(null);
  const [wsData, setWsData] = useState<Record<string, string[]>>({});   // v7.270 other-workstream ids
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [activeWs, setActiveWs] = useState<WsKey>('content');
  const [view, setView] = useState<'sheet' | 'roadmap'>('sheet');

  // load uploaded keywords (same source the Content Plan / Cluster panels use)
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

  // load the saved Scope cart (always fresh — same no-store discipline as content-plan)
  const loadScope = () => {
    if (!projectId) { setScopeIds(new Set()); return () => {}; }
    let cancelled = false;
    setScopeIds(null);
    fetch(`/api/projects/${projectId}/scope`, { cache: 'no-store' })
      .then((r: Response) => r.ok ? r.json() : { selections: [], updatedAt: null, workstreams: {} })
      .then((d: any) => {
        if (cancelled) return;
        setScopeIds(new Set<string>(Array.isArray(d.selections) ? d.selections : []));
        setWsData(d.workstreams && typeof d.workstreams === 'object' ? d.workstreams : {});
        setUpdatedAt(d.updatedAt ?? null);
      })
      .catch(() => { if (!cancelled) setScopeIds(new Set<string>()); });
    return () => { cancelled = true; };
  };
  useEffect(loadScope, [projectId, kwVersion]);

  const clientDomain = (analysis?.semrushSnapshot?.domain as string) ?? '';

  // Const II.7: re-derive every topic from the canonical pool — never a stored copy of the
  // brief. The Scope panel is a view that filters that one plan to the scoped ids.
  // v7.353: canonical topics kept in hand so the segment lens can reuse the Journey
  // panel's topic→segment attribution over their real language.
  const canonTopics = useMemo(
    () => buildCanonicalClusterTopics(analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns),
    [analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns],
  );
  const plan = useMemo<ContentPlan | null>(() => {
    // v7.356: same brand vocabulary as every other panel (Const II.7).
    const brandTerms = brandTermsOf(clientDomain, analysis?.semrushSnapshot);
    // v7.358: same manual priority moves as every panel.
    const priorityOverrides = (analysis?.semrushSnapshot?._priorityOverrides as Record<string, Priority>) ?? {};
    if (canonTopics.length > 0) return buildContentPlanFromTopics(canonTopics, { brandTerms, priorityOverrides });
    return planFromSnapshot(analysis, uploadedKeywords, { brandTerms, priorityOverrides });
  }, [canonTopics, analysis, uploadedKeywords, clientDomain]);

  const scopedPlan = useMemo(
    () => (plan && scopeIds ? filterPlanByIds(plan, scopeIds) : null),
    [plan, scopeIds],
  );
  const contentCount = scopeIds ? scopeIds.size : 0;

  // v7.353: audience-segment lens — same attribution as the Journey panel (Const II.7).
  // Tags render on every scoped row; the chips narrow the sheet AND the multi-year
  // roadmap to one segment's view (its exclusive topics + Shared, Wayne 2026-07-06).
  const segments = useMemo(() => readSegments(analysis), [analysis]);
  const topicBucket = useMemo(() => buildTopicSegmentMap(canonTopics, segments), [canonTopics, segments]);
  const segTags = useMemo(() => buildSegTags(topicBucket, segments), [topicBucket, segments]);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);
  const viewScopedPlan = useMemo(
    () => (scopedPlan && activeSeg && topicBucket.size ? filterPlanBySegment(scopedPlan, topicBucket, activeSeg) : scopedPlan),
    [scopedPlan, activeSeg, topicBucket],
  );

  // per-workstream scoped counts. Content is real (scopeOf rollup); the others read the
  // length of their stored id namespace — 0 until their source panels ship.
  const wsCount = (k: WsKey): number => k === 'content' ? contentCount : (wsData[k]?.length ?? 0);
  const totalCount = WORKSTREAMS.reduce((s, w) => s + wsCount(w.key), 0);

  // remove a content topic from scope + persist (optimistic, reverts on failure).
  const removeFromScope = (id: string) => {
    const cur = scopeIds ?? new Set<string>();
    if (!cur.has(id)) return;
    const next = new Set(cur); next.delete(id);
    setScopeIds(next);
    setSavingIds((s: Set<string>) => { const n = new Set(s); n.add(id); return n; });
    fetch(`/api/projects/${projectId}/scope`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(next) }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then((d: any) => { setUpdatedAt(d.updatedAt ?? updatedAt); })
      .catch(() => setScopeIds((c: Set<string> | null) => { const n = new Set(c ?? []); n.add(id); return n; }))
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); n.delete(id); return n; }));
  };

  const activeDef = WORKSTREAMS.find((w) => w.key === activeWs)!;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: COL.dim, marginBottom: 5 }}>Executive Summary · Scope</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: COL.txt, margin: 0 }}>Scope spec sheet</h2>
          <button
            type="button"
            onClick={loadScope}
            title="Refresh scope"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'transparent', border: `1px solid ${COL.line}`, color: COL.mut, borderRadius: 8, padding: '5px 11px', fontSize: 11, fontWeight: 600 }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 13 }} /> Refresh
          </button>
        </div>
        <p style={{ fontSize: 12, color: COL.mut, marginTop: 5, maxWidth: 820 }}>
          Everything you&rsquo;ve pushed into scope across the six workstreams &mdash; <b style={{ color: COL.cyan }}>content</b>, <b style={{ color: COL.purple }}>LLM prompts</b>, <b style={{ color: COL.green }}>themes</b>, <b style={{ color: COL.amber }}>authority</b>, <b style={{ color: COL.orange }}>technical</b> and <b style={{ color: COL.pink }}>citations</b> &mdash; gathered into one running spec sheet, organised by priority and laid out as a multi-year plan.
          {totalCount > 0 && <span style={{ color: COL.txt2 }}> &nbsp;·&nbsp; {totalCount} item{totalCount !== 1 ? 's' : ''} in scope.</span>}
        </p>
        {totalCount > 0 && updatedAt && (
          <p style={{ fontSize: 10.5, color: COL.dim, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-clock" style={{ fontSize: 12 }} /> Scope last updated {fmtWhen(updatedAt)}
          </p>
        )}
      </div>

      {/* workstream selector — the six categories the sheet is organised into */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        {WORKSTREAMS.map((w) => {
          const n = wsCount(w.key);
          const active = activeWs === w.key;
          const ready = w.key === 'content';
          return (
            <button
              key={w.key}
              type="button"
              onClick={() => { setActiveWs(w.key); if (w.key !== 'content') setView('sheet'); }}
              title={w.blurb}
              style={{
                textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '12px 13px',
                background: active ? 'var(--ca-34-211-238-0_08)' : COL.card,
                border: `1px solid ${active ? w.color : COL.line}`,
                display: 'flex', flexDirection: 'column', gap: 7, minHeight: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: active ? COL.txt : COL.txt2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <i className={`ti ${w.icon}`} style={{ fontSize: 15, color: w.color }} /> {w.label}
                </span>
                {!ready && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', color: COL.mut2, border: `1px solid ${COL.line}`, borderRadius: 5, padding: '1px 5px' }}>SOON</span>}
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, color: n > 0 ? w.color : COL.dim, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 10, color: COL.mut2 }}>{ready ? `${fmtVol(scopedPlan?.scope.totalVol ?? 0)}/mo demand` : 'ready to wire'}</span>
            </button>
          );
        })}
      </div>

      {/* v7.353: segment lens — narrows the scoped sheet AND the multi-year roadmap to one
          audience segment's view (same attribution as the Audience Journeys panel; Shared
          shows under every segment). Chip counts are real row counts of the scoped plan. */}
      {activeWs === 'content' && contentCount > 0 && segments.length > 0 && topicBucket.size > 0 && (
        <SegmentFilterBar
          segments={segments}
          active={activeSeg}
          onChange={setActiveSeg}
          countOf={(id: string | null) => {
            if (!scopedPlan) return 0;
            if (id === null) return scopedPlan.topics.length;
            return filterPlanBySegment(scopedPlan, topicBucket, id).topics.length;
          }}
        />
      )}

      {/* sheet / roadmap toggle — content only (the other workstreams have no priority axis yet) */}
      {activeWs === 'content' && contentCount > 0 && (
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: COL.card, border: `1px solid ${COL.line}`, marginBottom: 4 }}>
          {(['sheet', 'roadmap'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 11.5, fontWeight: 700,
                background: view === v ? COL.cyan : 'transparent', color: view === v ? COL.ink : COL.mut, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className={`ti ${v === 'sheet' ? 'ti-list-details' : 'ti-calendar-stats'}`} style={{ fontSize: 13 }} />
              {v === 'sheet' ? 'Spec sheet' : 'Multi-year plan'}
            </button>
          ))}
        </div>
      )}

      {/* body */}
      {(!kwLoaded || scopeIds === null) ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <i className="ti ti-loader-2" style={{ color: COL.cyan, fontSize: 18 }} />
          <p style={{ color: COL.mut2, fontSize: 12, marginTop: 10 }}>Loading scope&hellip;</p>
        </div>
      ) : activeWs !== 'content' ? (
        <WorkstreamPending ws={activeDef} />
      ) : !plan ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🗺️</div>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            The content plan isn&rsquo;t built yet. Open the <b style={{ color: COL.cyan }}>Keyword</b> panel to populate it, then tick topics on the <b style={{ color: COL.cyan }}>Content Map</b> and use <b style={{ color: COL.cyan }}>Add to Scope</b> on the Content Plan.
          </p>
        </div>
      ) : contentCount === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🛒</div>
          <p style={{ color: COL.txt2, fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Your scope is empty</p>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            Go to the <b style={{ color: COL.cyan }}>Content Plan</b> panel and click <b style={{ color: COL.cyan }}>Add to Scope</b> to gather your existing &amp; net-new content assets into this spec sheet.
          </p>
        </div>
      ) : view === 'roadmap' ? (
        <ContentRoadmap plan={viewScopedPlan!} />
      ) : (
        <ContentExplorer plan={viewScopedPlan!} mode="plan"
          removable
          clientName={clientDomain || 'client'}
          savingIds={savingIds}
          topicSeg={segTags}
          onRemove={removeFromScope} />
      )}
    </div>
  );
}
