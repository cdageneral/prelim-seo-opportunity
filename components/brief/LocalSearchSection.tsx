'use client';

/**
 * LocalSearchSection — Local Search panel (#09), v7.177
 *
 * Activates on local-intent demand. Surfaces, from REAL data only:
 *   • Locations — client Google Business listings discovered via SerpAPI Maps
 *   • Map Pack — local 3-pack rank per local keyword (SerpAPI google + ll)
 *   • Reviews — real rating + review counts per location, vs nearby pack leaders
 *   • Local Keywords — local-intent universe with real Semrush volume + intent
 *   • Competition — Share of Local Voice across the client's packs
 *   • Opportunities — deterministic P0/P1/P2 fixes
 *
 * Local-keyword detection runs client-side immediately (no scan needed); the
 * map-pack / listing / review data come from the on-demand /local-scan stream.
 * Scan result is snapshot-first with a localStorage fallback so it survives tab
 * remounts (v7.157 pattern). Panel root is a BLOCK scroller (panel-scroll rule).
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { classifyLocalKeywords, localIntentCounts, buildClientRelevance, type LocalKeyword } from '@/lib/local/detect';
import {
  buildPackRollup, buildReviewRollup, buildShareOfLocalVoice,
  buildLocalOpportunities, buildLocalIndex,
  type LocalScan, type OppTier,
} from '@/lib/local/build';

interface Competitor { id: string; domain: string; name: string | null; }
interface Props {
  projectId:   string;
  analysis:    any;
  projectName: string;
  domain:      string;
  competitors: Competitor[];
  kwVersion?:  number;
}

type Tab = 'loc' | 'pack' | 'rev' | 'kw' | 'comp' | 'opp';

// ─── cache (snapshot-first → localStorage) ──────────────────────────────────────
const cacheKey = (a: any): string => `orbitiq-local-${a?.id ?? 'none'}`;
function readLocalScan(a: any): LocalScan | null {
  const fromSnap = (a?.semrushSnapshot as any)?._localScan ?? null;
  if (fromSnap) return fromSnap;
  if (typeof window === 'undefined' || !a?.id) return null;
  try { const c = window.localStorage.getItem(cacheKey(a)); return c ? JSON.parse(c) : null; } catch { return null; }
}

function fmtEta(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `~${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `~${m}m ${s}s`;
}
const fmt = (n: number) => (n ?? 0).toLocaleString();

const INTENT_LABEL: Record<string, string> = { 'near-me': 'near-me', 'geo-modifier': 'geo-mod', 'implicit-local': 'implicit' };
function intentClass(i: string): React.CSSProperties {
  if (i === 'near-me')      return { background: 'rgba(6,182,212,.13)',  color: '#46cce0', border: '1px solid rgba(6,182,212,.25)' };
  if (i === 'geo-modifier') return { background: 'rgba(108,99,255,.15)', color: '#a9a3ff', border: '1px solid rgba(108,99,255,.3)' };
  return { background: 'rgba(136,136,170,.12)', color: '#9a9ac0', border: '1px solid #2a2a3d' };
}
function rankChip(rank: number | null): React.CSSProperties {
  if (rank == null)      return { background: 'rgba(239,68,68,.13)', color: '#f08a8a', border: '1px solid rgba(239,68,68,.28)' };
  if (rank === 1)        return { background: 'rgba(34,197,94,.16)', color: '#5ee68f', border: '1px solid rgba(34,197,94,.3)' };
  return { background: 'rgba(245,158,11,.14)', color: '#f6c061', border: '1px solid rgba(245,158,11,.28)' };
}

export default function LocalSearchSection({ projectId, analysis, projectName, domain, competitors, kwVersion }: Props) {
  const [dbKeywords, setDbKeywords] = useState<any[]>([]);
  const [dbLoaded, setDbLoaded]     = useState(false);
  const [scan, setScan]             = useState<LocalScan | null>(() => readLocalScan(analysis));
  const [tab, setTab]               = useState<Tab>('kw');
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState<{ done: number; total: number; seed: string; startedAt: number } | null>(null);
  const [scanError, setScanError]   = useState<string | null>(null);
  const [plan, setPlan]             = useState<{ localTotal: number; willScan: number; locations: number; locationsUsed: number; estCalls: number } | null>(null);

  // hydrate scan on analysis change (snapshot → cache)
  useEffect(() => { setScan(readLocalScan(analysis)); }, [analysis?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // fetch uploaded keywords (for the client-side pool)
  const fetchDb = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/keywords`); const d = await r.json(); setDbKeywords(d.keywords ?? []); }
    catch { /* silent */ } finally { setDbLoaded(true); }
  }, [projectId, kwVersion]);
  useEffect(() => { fetchDb(); }, [fetchDb]);

  const competitorDomains = useMemo(() => (competitors ?? []).map(c => c.domain).filter(Boolean), [competitors]);

  // geo vocab from a prior scan's discovered locations (adapts detection)
  const geoVocab = useMemo(() => {
    const v: string[] = [];
    (scan?.locations ?? []).forEach(l => { if (l.city) v.push(l.city.toLowerCase()); });
    return v;
  }, [scan]);

  // client-relevance vocabulary (category names + brand) — keeps off-topic
  // footprint keywords out of the local universe (v7.178; mirrors v7.173 gate).
  const relevanceTokens = useMemo(
    () => buildClientRelevance(
      (analysis?.semrushSnapshot as any)?._categoryBreakdown?.categories ?? [],
      domain, competitorDomains,
    ),
    [analysis, domain, competitorDomains],
  );

  // client-side local keyword universe (real Semrush volume; no scan needed)
  const local: LocalKeyword[] = useMemo(() => {
    if (!analysis?.semrushSnapshot) return [];
    const pool = buildKwPool({
      semrushSnapshot:   analysis.semrushSnapshot,
      uploadedKeywords:  dbKeywords,
      clientDomain:      domain,
      competitorDomains,
      clientVolMin:      0,
      competitorVolMin:  0,
    });
    return classifyLocalKeywords(pool as any, { geoVocab, relevanceTokens });
  }, [analysis, dbKeywords, domain, competitorDomains, geoVocab, relevanceTokens]);

  const counts = useMemo(() => localIntentCounts(local), [local]);

  // rollups from a completed scan
  const roll = useMemo(() => {
    if (!scan) return null;
    const pack    = buildPackRollup(scan.keywords);
    const reviews = buildReviewRollup(scan.locations);
    const sov     = buildShareOfLocalVoice(scan.keywords);
    const opps    = buildLocalOpportunities(scan.keywords, scan.locations);
    const index   = buildLocalIndex(pack, reviews, scan.locations);
    return { pack, reviews, sov, opps, index };
  }, [scan]);

  const clientLocations = useMemo(() => (scan?.locations ?? []).filter(l => l.isClient), [scan]);

  // ── scan flow: dryRun → confirm → stream ────────────────────────────────────
  const requestPlan = useCallback(async () => {
    setScanError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/local-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: true }),
      });
      const d = await r.json();
      if (!r.ok) { setScanError(d?.error ?? `Could not estimate (${r.status})`); return; }
      setPlan(d.plan ?? null);
    } catch (e) { setScanError(String((e as any)?.message ?? e)); }
  }, [projectId]);

  const runScan = useCallback(async () => {
    setPlan(null); setScanError(null); setScanning(true);
    setProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/local-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!r.ok || !r.body) {
        let msg = `Scan failed (${r.status})`;
        try { const d = await r.json(); msg = d?.error ?? msg; } catch {}
        setScanError(msg); setScanning(false); setProgress(null); return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start') {
            setProgress(p => ({ done: 0, total: ev.total ?? 0, seed: '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'progress') {
            setProgress(p => ({ done: ev.done ?? p?.done ?? 0, total: ev.total ?? p?.total ?? 0, seed: ev.seed ?? ev.phase ?? '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'error') {
            setScanError(ev.error ?? 'Scan failed');
          } else if (ev.type === 'done' && ev.localScan) {
            setScan(ev.localScan);
            setTab('loc');
            try { window.localStorage.setItem(cacheKey(analysis), JSON.stringify(ev.localScan)); } catch {}
          }
        }
      }
    } catch (e) { setScanError(String((e as any)?.message ?? e)); }
    finally { setScanning(false); setProgress(null); }
  }, [projectId, analysis]);

  // ── progress UI ──
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const eta = progress && progress.total > 0 && progress.done > 0 && progress.done < progress.total
    ? fmtEta((progress.total - progress.done) * (((Date.now() - progress.startedAt) / 1000) / progress.done)) : '';

  const hasLocal = local.length > 0;
  const scanDate = scan?.builtAt ? new Date(scan.builtAt).toLocaleDateString() : null;

  // ── render ──
  return (
    <div className="overflow-y-auto flex-1 p-4 animate-fade-in" style={{ minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180 }}>

        {/* Header */}
        <div className="orbit-card p-5">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Local · 09</p>
              <h2 className="text-orbit-primary text-xl font-bold mt-1">Local Search</h2>
              <p className="text-orbit-secondary text-sm mt-1">Map Pack · Google Reviews · Locations · Local Competition · Opportunities</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {scanDate && <span className="badge-soft">Last local scan: {scanDate}</span>}
              {scan && <span className="badge-soft">{scan.scannedCount} kw · {scan.callsUsed} credits</span>}
              {!scanning && (
                <button onClick={() => (plan ? runScan() : requestPlan())} className="orbit-btn-sm">
                  {scan ? '↻ Re-run local scan' : '▸ Run local scan'}
                </button>
              )}
            </div>
          </div>

          {/* progress */}
          {scanning && (
            <div style={{ marginTop: 12, maxWidth: 480 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: '#9090b8' }}>
                  <i className="ti ti-loader-2" style={{ marginRight: 5, color: '#22d3ee' }} />
                  {(!progress || progress.total === 0) ? (progress?.seed || 'Starting — discovering listings…') : `Keyword ${progress.done} of ${progress.total}${progress.seed ? ` · ${progress.seed}` : ''}`}
                </span>
                <span style={{ fontSize: 11, color: '#6A6A90', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{progress && progress.total > 0 ? `${pct}%` : ''}{eta ? ` · ${eta}` : ''}</span>
              </div>
              <div style={{ height: 6, background: '#1A1A30', borderRadius: 3, overflow: 'hidden' }}>
                {progress && progress.total > 0
                  ? <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', transition: 'width 0.3s ease' }} />
                  : <div style={{ height: '100%', width: '35%', background: '#22d3ee', opacity: 0.6, animation: 'orbitiq-lindet 1.1s ease-in-out infinite' }} />}
              </div>
              <style>{`@keyframes orbitiq-lindet{0%{margin-left:-35%}100%{margin-left:100%}}`}</style>
            </div>
          )}

          {/* confirm plan */}
          {plan && !scanning && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(108,99,255,.3)', background: 'rgba(108,99,255,.06)', maxWidth: 560 }}>
              <div style={{ fontSize: 12.5, color: '#cfccff', fontWeight: 600 }}>Ready to scan local map packs</div>
              <div style={{ fontSize: 11.5, color: '#9090b8', marginTop: 5 }}>
                {plan.willScan} top local keyword{plan.willScan !== 1 ? 's' : ''} × {plan.locationsUsed} location{plan.locationsUsed !== 1 ? 's' : ''} · {plan.locations} listing{plan.locations !== 1 ? 's' : ''} found ·
                <b style={{ color: '#f6c061' }}> ~{plan.estCalls} SerpAPI credits</b>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={runScan} className="orbit-btn-sm">Confirm &amp; scan</button>
                <button onClick={() => setPlan(null)} className="orbit-btn-ghost">Cancel</button>
              </div>
            </div>
          )}
          {scanError && <div style={{ marginTop: 10, fontSize: 11.5, color: '#f08a8a' }}>{scanError}</div>}
        </div>

        {/* Detection banner / trigger */}
        {dbLoaded && (
          <div style={{ background: hasLocal ? 'linear-gradient(90deg,rgba(6,182,212,.12),transparent)' : '#13131d', border: `1px solid ${hasLocal ? 'rgba(6,182,212,.28)' : '#1E1E2E'}`, borderRadius: 11, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: hasLocal ? 'rgba(6,182,212,.18)' : '#1a1a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📍</div>
            <div style={{ flex: 1, fontSize: 12.5, color: '#c8c8e0' }}>
              {hasLocal
                ? <><b>Local intent detected — panel active.</b> <span className="text-orbit-secondary"> {fmt(counts.total)} of the keyword set carry local intent ({counts.nearMe} near-me · {counts.geo} geo-modifier · {counts.implicit} implicit-local), {fmt(counts.totalVolume)} searches/mo.</span></>
                : <><b>No local intent detected.</b> <span className="text-orbit-secondary"> This client's keywords show no near-me, geo-modifier, or implicit-local signals — the Local panel stays dormant for non-local businesses.</span></>}
            </div>
          </div>
        )}

        {hasLocal && (
          <>
            {/* HERO */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div className="orbit-card p-5" style={{ flex: '0 0 300px', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6C63FF" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${roll ? roll.index.score : 0} 100`} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <b style={{ fontSize: 27, fontWeight: 800, color: roll ? '#8B85FF' : '#555570' }}>{roll ? roll.index.score : '—'}</b>
                    <span style={{ fontSize: 9, color: '#8888AA', marginTop: 2, textAlign: 'center', lineHeight: 1.3 }}>Local Visibility<br />Index</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#8888AA', lineHeight: 1.55 }}>
                  {roll
                    ? <>Blend of map-pack presence (40%), rank quality (25%), reviews (20%) &amp; listing completeness (15%) across <b style={{ color: '#F0F0FF' }}>{clientLocations.length} location{clientLocations.length !== 1 ? 's' : ''}</b>.</>
                    : <>Run a local scan to compute the index from real map-pack, listing &amp; review data.</>}
                </div>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, minWidth: 360 }}>
                <Stat k="Locations" v={scan ? String(clientLocations.length) : '—'} d={scan ? `${clientLocations.filter(l => l.verified).length} verified` : 'after scan'} />
                <Stat k="Map-Pack Presence" v={roll ? `${roll.pack.presenceRate}%` : '—'} d={roll ? `${roll.pack.inPack} of ${roll.pack.withPack} packs` : 'after scan'} color="#5ee68f" bar={roll ? roll.pack.presenceRate : 0} />
                <Stat k="Avg Pack Rank" v={roll && roll.pack.avgRank > 0 ? String(roll.pack.avgRank) : '—'} d="when present (1–3)" color="#f6c061" />
                <Stat k="Avg Rating" v={roll && roll.reviews.avgRating > 0 ? `${roll.reviews.avgRating}★` : '—'} d={roll ? `${fmt(roll.reviews.totalReviews)} reviews` : 'after scan'} />
              </div>
            </div>

            {/* SUBNAV */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <TabBtn id="kw"   cur={tab} set={setTab} icon="🔎" label="Local Keywords" cnt={counts.total} />
              <TabBtn id="loc"  cur={tab} set={setTab} icon="📌" label="Locations" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="pack" cur={tab} set={setTab} icon="🗺️" label="Map Pack" cnt={scan ? scan.scannedCount : undefined} />
              <TabBtn id="rev"  cur={tab} set={setTab} icon="⭐" label="Reviews" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="comp" cur={tab} set={setTab} icon="🏆" label="Competition" cnt={roll ? roll.sov.length : undefined} />
              <TabBtn id="opp"  cur={tab} set={setTab} icon="🎯" label="Opportunities" cnt={roll ? roll.opps.opportunities.length : undefined} />
            </div>

            {/* ===== LOCAL KEYWORDS (no scan needed) ===== */}
            {tab === 'kw' && (
              <div className="orbit-card p-5">
                <div style={{ fontSize: 13, fontWeight: 700 }}>Local-intent keyword universe</div>
                <div style={{ fontSize: 11.5, color: '#8888AA', marginBottom: 12 }}>Detected deterministically — every row shows the literal term that classified it. Volume = real Semrush.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 14 }}>
                  <MiniStat k="LOCAL KEYWORDS" v={String(counts.total)} />
                  <MiniStat k="LOCAL VOLUME / MO" v={fmt(counts.totalVolume)} color="#a9a3ff" />
                  <MiniStat k="NEAR-ME" v={String(counts.nearMe)} color="#46cce0" />
                  <MiniStat k="GEO-MODIFIER" v={String(counts.geo)} color="#a9a3ff" />
                  <MiniStat k="IMPLICIT-LOCAL" v={String(counts.implicit)} />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="local-tbl">
                    <thead><tr><th>Keyword</th><th>Intent</th><th>Matched term</th><th style={{ textAlign: 'right' }}>Volume</th><th>Organic rank</th></tr></thead>
                    <tbody>
                      {local.slice(0, 60).map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.keyword}</td>
                          <td><span className="ipill" style={intentClass(l.intent)}>{INTENT_LABEL[l.intent]}</span></td>
                          <td style={{ color: '#8888AA' }}>"{l.matchedTerm}"</td>
                          <td style={{ textAlign: 'right' }}>{fmt(l.searchVolume)}</td>
                          <td>{l.position != null ? <span className="rchip" style={rankChip(l.position <= 3 ? 1 : 2)}>{l.position}</span> : <span style={{ color: '#555570' }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {local.length > 60 && <div style={{ fontSize: 11, color: '#8888AA', marginTop: 10 }}>Showing 60 of {local.length}.</div>}
              </div>
            )}

            {/* ===== other tabs require a scan ===== */}
            {tab !== 'kw' && !scan && <EmptyScan onRun={() => (plan ? runScan() : requestPlan())} scanning={scanning} />}

            {/* ===== LOCATIONS ===== */}
            {tab === 'loc' && scan && (
              <div className="orbit-card p-5">
                <div style={{ fontSize: 13, fontWeight: 700 }}>Business locations &amp; listing health</div>
                <div style={{ fontSize: 11.5, color: '#8888AA', marginBottom: 12 }}>Google Business listings discovered via Maps brand search ({fmt(scan.locations.length)} matched to "{projectName}").</div>
                {clientLocations.length === 0
                  ? <div style={{ fontSize: 12.5, color: '#f6c061' }}>No verified client listing matched the brand search. Confirm the business name matches the Google Business Profile, or add it manually.</div>
                  : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                      {clientLocations.map((l, i) => (
                        <div key={i} className="loc-card" style={{ borderColor: l.healthFlags.length ? 'rgba(245,158,11,.3)' : '#1E1E2E' }}>
                          <div className="loc-mk" style={l.healthFlags.length ? { background: 'rgba(245,158,11,.12)', borderColor: 'rgba(245,158,11,.3)' } : {}}>{l.healthFlags.length ? '⚠' : '📍'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{l.title}</div>
                            <div style={{ fontSize: 11, color: '#8888AA' }}>{l.address || 'no address'} · {l.verified ? <span style={{ color: '#5ee68f' }}>✓ Verified</span> : <span style={{ color: '#f6c061' }}>⚠ Incomplete</span>}</div>
                            <div style={{ marginTop: 6, fontSize: 12 }}>
                              {l.rating != null ? <><span style={{ color: '#f6c061' }}>★</span> <b>{l.rating}</b></> : <span style={{ color: '#555570' }}>no rating</span>}
                              <span style={{ color: '#8888AA' }}> · {fmt(l.reviews)} reviews{l.type ? ` · ${l.type}` : ''}</span>
                            </div>
                            {l.healthFlags.length > 0 && <div style={{ marginTop: 5, fontSize: 10.5, color: '#f6c061' }}>{l.healthFlags.join(' · ')}</div>}
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            )}

            {/* ===== MAP PACK ===== */}
            {tab === 'pack' && scan && roll && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MiniCard k="IN PACK (1–3)" v={String(roll.pack.inPack)} color="#5ee68f" bar={roll.pack.withPack ? Math.round(roll.pack.inPack / roll.pack.withPack * 100) : 0} />
                  <MiniCard k="RANK 1" v={String(roll.pack.rank1)} d="top of pack" />
                  <MiniCard k="NOT IN PACK" v={String(roll.pack.notInPack)} color="#f08a8a" d="competitors rank, you don't" />
                  <MiniCard k="PACKS FOUND" v={`${roll.pack.withPack}/${roll.pack.scanned}`} d="queries with a 3-pack" />
                </div>
                <div className="orbit-card p-5">
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Map-pack rank by keyword</div>
                  <div style={{ fontSize: 11.5, color: '#8888AA', marginBottom: 12 }}>Your position in Google's local 3-pack, checked from each location's GPS. Real SerpAPI local results.</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="local-tbl">
                      <thead><tr><th>Keyword</th><th>Intent</th><th style={{ textAlign: 'right' }}>Volume</th><th>Pack?</th><th>Your rank</th><th>Pack leader</th><th>Nearest</th></tr></thead>
                      <tbody>
                        {scan.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume).map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{s.keyword}</td>
                            <td><span className="ipill" style={intentClass(s.intent)}>{INTENT_LABEL[s.intent]}</span></td>
                            <td style={{ textAlign: 'right' }}>{fmt(s.searchVolume)}</td>
                            <td>{s.packPresent ? '✓' : <span style={{ color: '#555570' }}>—</span>}</td>
                            <td><span className="rchip" style={rankChip(s.clientBestRank)}>{s.clientBestRank ?? '—'}</span></td>
                            <td style={{ color: '#8888AA' }}>{s.pack.find(m => m.isClient && m.position === s.clientBestRank) ? 'You' : (s.packLeader || '—')}</td>
                            <td style={{ color: '#8888AA' }}>{s.bestLocationCity || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ===== REVIEWS ===== */}
            {tab === 'rev' && scan && roll && (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div className="orbit-card p-5" style={{ flex: '0 0 270px', display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
                      <svg viewBox="0 0 36 36" width="104" height="104" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f6c061" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.round((roll.reviews.avgRating / 5) * 100)} 100`} />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <b style={{ fontSize: 22, color: '#f6c061' }}>{roll.reviews.avgRating || '—'}</b>
                        <span style={{ fontSize: 9, color: '#8888AA', marginTop: 2, textAlign: 'center' }}>avg ★ across<br />{roll.reviews.locationCount} loc</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8888AA' }}>
                      <b style={{ color: '#F0F0FF', fontSize: 14 }}>{fmt(roll.reviews.totalReviews)}</b> total reviews<br />
                      range {roll.reviews.worstRating}–{roll.reviews.bestRating}★ across locations
                    </div>
                  </div>
                  <div className="orbit-card p-5" style={{ flex: 1, minWidth: 320 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Reviews by location</div>
                    <div style={{ fontSize: 11, color: '#8888AA', marginBottom: 10 }}>Real Google rating + review count. (Star distribution &amp; velocity require a per-review pull — not fabricated here.)</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="local-tbl">
                        <thead><tr><th>Location</th><th>Rating</th><th style={{ textAlign: 'right' }}>Reviews</th><th>Status</th></tr></thead>
                        <tbody>
                          {clientLocations.map((l, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{l.city || l.title}</td>
                              <td>{l.rating != null ? <><span style={{ color: '#f6c061' }}>★</span> {l.rating}</> : '—'}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(l.reviews)}</td>
                              <td>{l.rating != null && l.rating >= 4.5 ? <span className="ipill" style={{ background: 'rgba(34,197,94,.15)', color: '#5ee68f' }}>Strong</span> : l.rating != null && l.rating >= 4.0 ? <span className="ipill" style={{ background: 'rgba(245,158,11,.15)', color: '#f6c061' }}>OK</span> : <span className="ipill" style={{ background: 'rgba(239,68,68,.13)', color: '#f08a8a' }}>Weak</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ===== COMPETITION ===== */}
            {tab === 'comp' && scan && roll && (
              <div className="orbit-card p-5">
                <div style={{ fontSize: 13, fontWeight: 700 }}>Share of Local Voice</div>
                <div style={{ fontSize: 11.5, color: '#8888AA', marginBottom: 14 }}>Who appears most across your {roll.pack.withPack} local packs. Share = packs where each business holds a 3-pack slot.</div>
                {roll.sov.slice(0, 12).map((row, i) => (
                  <div key={i} className="lb-row" style={row.isClient ? { borderColor: '#3D3880', background: 'linear-gradient(90deg,rgba(108,99,255,.12),transparent)' } : {}}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#555570', width: 20 }}>{i + 1}</span>
                    <div style={{ flex: '0 0 180px', minWidth: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{row.isClient ? `${projectName} (You)` : row.name}</b>
                      <div style={{ fontSize: 10.5, color: '#8888AA' }}>{row.avgRating != null ? `${row.avgRating}★` : 'no rating'}{row.maxReviews ? ` · ${fmt(row.maxReviews)} rev` : ''}</div>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: '#0e0e18', flex: 1, overflow: 'hidden', minWidth: 80 }}>
                      <i style={{ display: 'block', height: '100%', width: `${row.sharePct}%`, background: row.isClient ? 'linear-gradient(90deg,#6C63FF,#06B6D4)' : '#5b5b7a' }} />
                    </div>
                    <span style={{ width: 46, textAlign: 'right', fontWeight: 700, fontSize: 12.5 }}>{row.sharePct}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* ===== OPPORTUNITIES ===== */}
            {tab === 'opp' && scan && roll && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MiniCard k="P0 — DO NOW" v={String(roll.opps.counts.P0)} color="#f08a8a" />
                  <MiniCard k="P1 — NEXT" v={String(roll.opps.counts.P1)} color="#f6c061" />
                  <MiniCard k="P2 — LATER" v={String(roll.opps.counts.P2)} color="#a9a3ff" />
                  <MiniCard k="VOLUME AT STAKE" v={fmt(roll.opps.volumeAtStake)} d="/mo in pack misses" />
                </div>
                <div className="orbit-card p-5">
                  {roll.opps.opportunities.length === 0
                    ? <div style={{ fontSize: 12.5, color: '#5ee68f' }}>No local gaps found in the scanned set — you hold the pack where it counts. 🎉</div>
                    : roll.opps.opportunities.map((o, i) => (
                        <div key={i} className="opp-row">
                          <span className={`tierbadge t-${o.tier}`}>{o.tier}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{o.title}</div>
                            <div style={{ fontSize: 11.5, color: '#8888AA' }}>{o.detail}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                              {o.volume > 0 && <span className="ochip">Volume <b>{fmt(o.volume)}/mo</b></span>}
                              {o.intent && <span className="ochip">Type <b>{INTENT_LABEL[o.intent]}</b></span>}
                              {o.location && <span className="ochip">Location <b>{o.location}</b></span>}
                              <span className="ochip">Lever <b>{o.kind === 'pack-miss' ? 'GBP + reviews' : o.kind === 'rank-improve' ? 'reviews' : o.kind === 'listing-health' ? 'verify + complete' : 'reviews'}</b></span>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: '#555570', textAlign: 'center', padding: '6px 0 24px' }}>
              Every figure traces to a real source row — SerpAPI (map pack, Maps listings, ratings) + Semrush (volume). Nothing modeled.
            </div>
          </>
        )}
      </div>

      {/* scoped styles */}
      <style>{`
        .badge-soft{font-size:10px;padding:3px 8px;border-radius:5px;background:#0F0F1E;border:1px solid #1E1E35;color:#7777a0}
        .orbit-btn-sm{font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid #3D3880;background:linear-gradient(180deg,rgba(108,99,255,.25),rgba(108,99,255,.12));color:#cfccff;cursor:pointer}
        .orbit-btn-sm:hover{border-color:#6C63FF}
        .orbit-btn-ghost{font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid #1E1E2E;background:#13131d;color:#8888AA;cursor:pointer}
        .local-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
        .local-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#555570;font-weight:600;padding:9px 10px;border-bottom:1px solid #1E1E2E}
        .local-tbl td{padding:10px;border-bottom:1px solid #15151f;vertical-align:middle}
        .local-tbl tr:hover td{background:#13131d}
        .ipill{font-size:9.5px;padding:2px 7px;border-radius:5px;font-weight:600;white-space:nowrap}
        .rchip{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:23px;border-radius:7px;font-weight:800;font-size:12px;padding:0 6px}
        .loc-card{background:#111118;border:1px solid #1E1E2E;border-radius:11px;padding:14px;display:flex;gap:12px;align-items:flex-start}
        .loc-mk{width:34px;height:34px;border-radius:9px;background:rgba(108,99,255,.14);border:1px solid rgba(108,99,255,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px}
        .lb-row{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;border:1px solid #1E1E2E;background:#111118;margin-bottom:8px}
        .opp-row{border:1px solid #1E1E2E;border-radius:12px;padding:15px;background:#111118;display:flex;gap:13px;margin-bottom:11px}
        .tierbadge{font-weight:800;font-size:11px;padding:4px 9px;border-radius:7px;height:fit-content;flex-shrink:0}
        .t-P0{background:rgba(239,68,68,.15);color:#f08a8a;border:1px solid rgba(239,68,68,.3)}
        .t-P1{background:rgba(245,158,11,.15);color:#f6c061;border:1px solid rgba(245,158,11,.3)}
        .t-P2{background:rgba(108,99,255,.14);color:#a9a3ff;border:1px solid rgba(108,99,255,.3)}
        .ochip{font-size:10.5px;padding:3px 9px;border-radius:6px;background:#0e0e18;border:1px solid #1E1E2E;color:#8888AA}
        .ochip b{color:#F0F0FF}
      `}</style>
    </div>
  );
}

// ─── small presentational helpers ───────────────────────────────────────────────

function TabBtn({ id, cur, set, icon, label, cnt }: { id: Tab; cur: Tab; set: (t: Tab) => void; icon: string; label: string; cnt?: number }) {
  const active = cur === id;
  return (
    <button onClick={() => set(id)} style={{
      fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 7,
      background: active ? 'linear-gradient(180deg,rgba(108,99,255,.22),rgba(108,99,255,.06))' : '#13131d',
      border: `1px solid ${active ? '#3D3880' : '#1E1E2E'}`, color: active ? '#fff' : '#8888AA',
    }}>
      <span style={{ fontSize: 13 }}>{icon}</span>{label}
      {cnt != null && <span style={{ fontSize: 10, background: '#0c0c15', border: '1px solid #1E1E2E', borderRadius: 10, padding: '1px 7px', color: '#8888AA' }}>{cnt}</span>}
    </button>
  );
}

function Stat({ k, v, d, color, bar }: { k: string; v: string; d?: string; color?: string; bar?: number }) {
  return (
    <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: 11, padding: 13 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: '#8888AA' }}>{k}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 5, lineHeight: 1, color: color || '#F0F0FF' }}>{v}</div>
      {d && <div style={{ fontSize: 11, color: '#8888AA', marginTop: 5 }}>{d}</div>}
      {bar != null && <div style={{ height: 6, borderRadius: 4, background: '#0e0e18', overflow: 'hidden', marginTop: 9 }}><i style={{ display: 'block', height: '100%', width: `${bar}%`, background: color || '#6C63FF' }} /></div>}
    </div>
  );
}

function MiniStat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: 11, padding: 12 }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8888AA' }}>{k}</div>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4, color: color || '#F0F0FF' }}>{v}</div>
    </div>
  );
}

function MiniCard({ k, v, d, color, bar }: { k: string; v: string; d?: string; color?: string; bar?: number }) {
  return (
    <div className="orbit-card" style={{ flex: 1, minWidth: 150, padding: 14 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8888AA' }}>{k}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color || '#F0F0FF' }}>{v}</div>
      {d && <div style={{ fontSize: 11, color: '#8888AA', marginTop: 3 }}>{d}</div>}
      {bar != null && <div style={{ height: 6, borderRadius: 4, background: '#0e0e18', overflow: 'hidden', marginTop: 9 }}><i style={{ display: 'block', height: '100%', width: `${bar}%`, background: color || '#6C63FF' }} /></div>}
    </div>
  );
}

function EmptyScan({ onRun, scanning }: { onRun: () => void; scanning: boolean }) {
  return (
    <div className="orbit-card p-5" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#F0F0FF' }}>Run a local scan to populate this view</div>
      <div style={{ fontSize: 12, color: '#8888AA', margin: '6px 0 14px' }}>Discovers your Google Business listings and checks your map-pack rank for the top local keywords — all real SerpAPI data.</div>
      {!scanning && <button onClick={onRun} className="orbit-btn-sm">▸ Run local scan</button>}
    </div>
  );
}
