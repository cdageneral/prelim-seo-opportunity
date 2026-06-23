'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  planFromSnapshot, buildContentPlanFromTopics, filterPlanByIds,
  type ContentPlan, type ContentTopic,
} from '@/lib/journey/contentPlan';
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';
import { ContentExplorer } from '@/components/brief/ContentPlanSection';

// palette (matches the app's orbit-* dark theme — same tokens ContentPlanSection uses)
const COL = {
  cyan: 'var(--c-22d3ee)', purple: 'var(--c-a78bfa)', green: 'var(--c-34d399)',
  txt: 'var(--c-dcdcf4)', txt2: 'var(--c-c8c8e8)', mut: 'var(--c-8080a0)', mut2: 'var(--c-6a6a90)',
  dim: 'var(--c-4a4a6a)',
};

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── View Scope sub-nav section (under Executive Summary) ─────────────────────────
interface Props { projectId: string; kwVersion?: number; analysis: any; competitors: string[]; claudeAssigns?: Record<string, IntentType>; }

export default function ScopeSection({ projectId, kwVersion, analysis, competitors = [], claudeAssigns = {} }: Props) {
  const [uploadedKeywords, setUploadedKeywords] = useState<any[]>([]);
  const [kwLoaded, setKwLoaded] = useState(false);
  // the scoped topic ids (the running cart). null = still loading from the project DB.
  const [scopeIds, setScopeIds] = useState<Set<string> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

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
      .then((r: Response) => r.ok ? r.json() : { selections: [], updatedAt: null })
      .then((d: any) => {
        if (cancelled) return;
        setScopeIds(new Set<string>(Array.isArray(d.selections) ? d.selections : []));
        setUpdatedAt(d.updatedAt ?? null);
      })
      .catch(() => { if (!cancelled) setScopeIds(new Set<string>()); });
    return () => { cancelled = true; };
  };
  useEffect(loadScope, [projectId, kwVersion]);

  const clientDomain = (analysis?.semrushSnapshot?.domain as string) ?? '';

  // Const II.7: re-derive every topic from the canonical pool — never a stored copy of the
  // brief. The Scope panel is a view that filters that one plan to the scoped ids.
  const plan = useMemo<ContentPlan | null>(() => {
    const topics = buildCanonicalClusterTopics(analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns);
    if (topics.length > 0) return buildContentPlanFromTopics(topics);
    return planFromSnapshot(analysis, uploadedKeywords);
  }, [analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns]);

  const scopedPlan = useMemo(
    () => (plan && scopeIds ? filterPlanByIds(plan, scopeIds) : null),
    [plan, scopeIds],
  );
  const scopeCount = scopeIds ? scopeIds.size : 0;

  // remove a topic from scope + persist (optimistic, reverts on failure) — mirrors the
  // Content Plan's removeSelection.
  const removeFromScope = (id: string) => {
    const cur = scopeIds ?? new Set<string>();
    if (!cur.has(id)) return;
    const next = new Set(cur); next.delete(id);
    setScopeIds(next);   // optimistic
    setSavingIds((s: Set<string>) => { const n = new Set(s); n.add(id); return n; });
    fetch(`/api/projects/${projectId}/scope`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(next) }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then((d: any) => { setUpdatedAt(d.updatedAt ?? updatedAt); })
      .catch(() => setScopeIds((c: Set<string> | null) => { const n = new Set(c ?? []); n.add(id); return n; }))
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); n.delete(id); return n; }));
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: COL.dim, marginBottom: 5 }}>Executive Summary · Scope</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: COL.txt, margin: 0 }}>Scope spec sheet</h2>
          {/* refresh CTA — re-pulls the saved cart (Const IV.4) */}
          <button
            type="button"
            onClick={loadScope}
            title="Refresh scope"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--c-2a2a45)', color: COL.mut, borderRadius: 8, padding: '5px 11px', fontSize: 11, fontWeight: 600 }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 13 }} /> Refresh
          </button>
        </div>
        <p style={{ fontSize: 12, color: COL.mut, marginTop: 5, maxWidth: 760 }}>
          Everything you&rsquo;ve added to scope from the <b style={{ color: COL.cyan }}>Content Plan</b> &mdash; existing pages to optimise and net-new pages to build, gathered into one running spec sheet ready to hand to the Brief Agent. Click a row for the full brief; use the &times; to drop a topic from scope.
          {scopeCount > 0 && <span style={{ color: COL.txt2 }}> &nbsp;·&nbsp; {scopeCount} topic{scopeCount !== 1 ? 's' : ''} in scope.</span>}
        </p>
        {/* last-updated label (Const IV.5) */}
        {scopeCount > 0 && updatedAt && (
          <p style={{ fontSize: 10.5, color: COL.dim, marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-clock" style={{ fontSize: 12 }} /> Scope last updated {fmtWhen(updatedAt)}
          </p>
        )}
      </div>

      {(!kwLoaded || scopeIds === null) ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <i className="ti ti-loader-2" style={{ color: COL.cyan, fontSize: 18 }} />
          <p style={{ color: COL.mut2, fontSize: 12, marginTop: 10 }}>Loading scope&hellip;</p>
        </div>
      ) : !plan ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🗺️</div>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            The content plan isn&rsquo;t built yet. Open the <b style={{ color: COL.cyan }}>Keyword</b> panel to populate it, then tick topics on the <b style={{ color: COL.cyan }}>Content Map</b> and use <b style={{ color: COL.cyan }}>Add to Scope</b> on the Content Plan.
          </p>
        </div>
      ) : scopeCount === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🛒</div>
          <p style={{ color: COL.txt2, fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Your scope is empty</p>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            Go to the <b style={{ color: COL.cyan }}>Content Plan</b> panel and click <b style={{ color: COL.cyan }}>Add to Scope</b> to gather your existing &amp; net-new content assets into this spec sheet.
          </p>
        </div>
      ) : (
        <ContentExplorer plan={scopedPlan!} mode="plan"
          removable
          savingIds={savingIds}
          onRemove={removeFromScope} />
      )}
    </div>
  );
}
