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
import { buildKwPool, buildLocalPackKeywordSet, hasAnyLocalSignal } from '@/lib/utils/kwVolume';
import { buildCategoryModel } from '@/lib/category/categoryModel';
import { buildLocalServiceLines } from '@/lib/local/serviceLines';   // v7.298: mirror the Keyword panel's local-pack product lines
import { buildCategoryGuard } from '@/lib/category/categoryGuard';     // v7.298: competitor-brand guard (Const III.1a)
import { buildServiceCatalog, buildSeedsFromServiceTerms, DEFAULT_SERVICE_CAP, type ServiceSeed } from '@/lib/local/seeds';
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

// v7.284 — curated primary-service list. Wayne can delete a service and add one
// from the client's own service-category catalog. The picks PERSIST per project
// (localStorage) and are the set the next scan uses. `null` = follow the auto
// top-N (no manual edits yet); once edited we store an explicit ordered list of
// service terms (brand excluded — it is pinned). Real volumes only (Const I.1).
const servicesKey = (projectId: string): string => `orbitiq-local-services-${projectId}`;
function readCuratedServices(projectId: string): string[] | null {
  if (typeof window === 'undefined' || !projectId) return null;
  try {
    const c = window.localStorage.getItem(servicesKey(projectId));
    if (!c) return null;
    const v = JSON.parse(c);
    return Array.isArray(v?.services) ? v.services.map((s: any) => String(s)) : null;
  } catch { return null; }
}
function writeCuratedServices(projectId: string, services: string[] | null): void {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    if (services == null) window.localStorage.removeItem(servicesKey(projectId));
    else window.localStorage.setItem(servicesKey(projectId), JSON.stringify({ services }));
  } catch { /* ignore quota / disabled storage */ }
}

// v7.302 — optional manual Locations URL (a locations page, sitemap, or .kml), persisted per project.
const locUrlKey = (projectId: string): string => `orbitiq-local-locurl-${projectId}`;
function readLocationsUrl(projectId: string): string {
  if (typeof window === 'undefined' || !projectId) return '';
  try { return window.localStorage.getItem(locUrlKey(projectId)) || ''; } catch { return ''; }
}
function writeLocationsUrl(projectId: string, url: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    if (url) window.localStorage.setItem(locUrlKey(projectId), url);
    else window.localStorage.removeItem(locUrlKey(projectId));
  } catch { /* ignore quota / disabled storage */ }
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
  if (i === 'near-me')      return { background: 'var(--ca-6-182-212-0_13)',  color: 'var(--c-46cce0)', border: '1px solid var(--ca-6-182-212-0_25)' };
  if (i === 'geo-modifier') return { background: 'var(--ca-108-99-255-0_15)', color: 'var(--c-a9a3ff)', border: '1px solid var(--ca-108-99-255-0_3)' };
  return { background: 'var(--ca-136-136-170-0_12)', color: 'var(--c-9a9ac0)', border: '1px solid var(--c-2a2a3d)' };
}
function rankChip(rank: number | null): React.CSSProperties {
  if (rank == null)      return { background: 'var(--ca-239-68-68-0_13)', color: 'var(--c-f08a8a)', border: '1px solid var(--ca-239-68-68-0_28)' };
  if (rank === 1)        return { background: 'var(--ca-34-197-94-0_16)', color: 'var(--c-5ee68f)', border: '1px solid var(--ca-34-197-94-0_3)' };
  return { background: 'var(--ca-245-158-11-0_14)', color: 'var(--c-f6c061)', border: '1px solid var(--ca-245-158-11-0_28)' };
}

// Location status (v7.180): "Verified" once a real Google rating is captured;
// "Rating pending" for sitemap-discovered locations not yet seen in a scanned map
// pack (NOT a defect — address/phone are known, just no GBP rating yet); reserve
// "Incomplete" for a genuine gap (missing address, or rating with zero reviews).
function locStatus(l: { verified: boolean; rating: number | null; reviews: number; address: string }):
  { label: string; color: string; icon: string; hint: string } {
  if (l.verified) return { label: 'Verified', color: 'var(--c-5ee68f)', icon: '✓', hint: 'Real Google rating, reviews and address on file' };
  if (l.rating == null) return { label: 'Rating pending', color: 'var(--c-7aa7ff)', icon: '◷', hint: 'Discovered from the client sitemap — Google rating is captured when this location appears in a scanned map pack' };
  return { label: 'Incomplete', color: 'var(--c-f6c061)', icon: '⚠', hint: 'Listing is missing an address or has no reviews' };
}

export default function LocalSearchSection({ projectId, analysis, projectName, domain, competitors, kwVersion }: Props) {
  const [dbKeywords, setDbKeywords] = useState<any[]>([]);
  const [dbLoaded, setDbLoaded]     = useState(false);
  const [scan, setScan]             = useState<LocalScan | null>(() => readLocalScan(analysis));
  const [tab, setTab]               = useState<Tab>('kw');
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState<{ done: number; total: number; seed: string; startedAt: number } | null>(null);
  const [scanError, setScanError]   = useState<string | null>(null);
  const [plan, setPlan]             = useState<{ seeds?: number; seedList?: string[]; cells?: number; willScan?: number; locations?: number; locationsScannable?: number; locationsUsed?: number; potentialCells?: number; estCalls?: number; source?: string; model?: string; order?: string; firstCities?: string[]; keywords?: number; totalKeywords?: number } | null>(null);
  // per-run scan setup (Wayne sets these each scan)
  // v7.284 — curated primary-service terms (services only; brand pinned). null = follow auto.
  const [curated, setCurated]       = useState<string[] | null>(() => readCuratedServices(projectId));
  const [addPick, setAddPick]       = useState<string>('');   // current selection in the +Add picker
  const [locationsUrl, setLocationsUrl] = useState<string>(() => readLocationsUrl(projectId));   // v7.302 manual locations URL

  // hydrate scan on analysis change (snapshot → cache)
  useEffect(() => { setScan(readLocalScan(analysis)); }, [analysis?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // fetch uploaded keywords (for the client-side pool)
  const fetchDb = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/keywords`); const d = await r.json(); setDbKeywords(d.keywords ?? []); }
    catch { /* silent */ } finally { setDbLoaded(true); }
  }, [projectId, kwVersion]);
  useEffect(() => { fetchDb(); }, [fetchDb]);

  const competitorDomains = useMemo(() => (competitors ?? []).map(c => c.domain).filter(Boolean), [competitors]);

  // canonical keyword pool (same as KeywordsPanel) — used to read real service volumes
  const pool = useMemo(() => {
    if (!analysis?.semrushSnapshot) return [] as any[];
    return buildKwPool({
      semrushSnapshot:   analysis.semrushSnapshot,
      uploadedKeywords:  dbKeywords,
      clientDomain:      domain,
      competitorDomains,
      clientVolMin:      0,
      competitorVolMin:  0,
    }) as any[];
  }, [analysis, dbKeywords, domain, competitorDomains]);

  // v7.293 — source the Local services from the CANONICAL category model — the SAME
  // categories the Keyword panel shows (buildCategoryModel → buildCanonicalClusterTopics),
  // NOT the raw `_categoryBreakdown.categories`. The canonical model already applies the
  // competitor-brand guard (Const III.1a) AND merges near-duplicate categories, so the
  // service list reads one "Wealth Management" node instead of the raw breakdown's un-merged
  // variants ("wealth management", "wealth management services", "…investment advisory", …).
  // A category is a candidate when it is a PRODUCT/service category (parentType 'procedure' —
  // excludes brand, location/nav, and the pre-product demand/problem lanes) AND ≥1 of its
  // keywords triggers a Google Local Pack (the real local-pack keyword set: footprint `Fl`
  // roll-up + uploaded SERP-feature cells, Const II.7/II.8 — STORED membership, never
  // re-derived lexically). Volume is the EXACT TS roll-up of the category's own keyword
  // volumes (Const I.1/I.3 — first-topic-wins, no double count), the same demand the Keyword
  // panel shows. No local signal → [] (brand only + honest gap, Const I.5). Ranked desc.
  const categoryModel = useMemo(
    () => (analysis?.semrushSnapshot ? buildCategoryModel(analysis, domain, competitorDomains, dbKeywords) : null),
    [analysis, domain, competitorDomains, dbKeywords],
  );
  // v7.298/v7.299 — the local-pack PRODUCT lines (mirrors the Keyword panel, Const II.7), each
  // carrying its own local-pack keywords (client + gap). One source of truth — lib/local/serviceLines.
  const localLines = useMemo(() => {
    const snap = analysis?.semrushSnapshot as any;
    if (!categoryModel || !hasAnyLocalSignal(snap, dbKeywords)) return [];
    const lpKw = buildLocalPackKeywordSet(snap, dbKeywords);
    // fold the LIVE SerpAPI local_pack signal so the local set matches the Keyword panel's
    // isLocalIntent EXACTLY (it ORs serp local_pack with the uploaded-cell + roll-up signals).
    const saRows = (analysis?.serpApiSnapshot?.keywords ?? []) as any[];
    for (let i = 0; i < saRows.length; i++) {
      const feats = saRows[i]?.serpFeatures;
      if (Array.isArray(feats) && feats.indexOf('local_pack') >= 0) {
        const kw = String(saRows[i]?.keyword ?? '').toLowerCase().trim();
        if (kw) lpKw.add(kw);
      }
    }
    if (lpKw.size === 0) return [];
    const drop = buildCategoryGuard(snap, domain, competitorDomains).droppedCategoryNames(categoryModel.categories);
    return buildLocalServiceLines(categoryModel, lpKw, drop);
  }, [analysis, dbKeywords, categoryModel, domain, competitorDomains]);
  const localServiceCats = useMemo(
    () => localLines.map(l => ({ name: l.name, type: 'service', monthlyDemand: l.monthlyDemand })),
    [localLines],
  );

  // v7.286/v7.292 — is a real local signal present? Drives the panel notice + brand-only gap.
  const localPackActive = useMemo(() => hasAnyLocalSignal(analysis?.semrushSnapshot, dbKeywords), [analysis, dbKeywords]);

  // v7.293 — full (un-capped) catalog of candidate services from the LOCAL-PACK product
  // categories of the canonical model, sorted by REAL category demand desc (the same demand
  // the Keyword panel / Market Gap show, so the picker reconciles — Const II.7). Feeds both
  // the default auto selection and the "+ Add service" picker (so the dropdown shows ONLY
  // these local-pack product categories).
  const catalog = useMemo(
    () => buildServiceCatalog({ categories: localServiceCats, brand: projectName, clientDomain: domain, pool: pool as any }),
    [localServiceCats, projectName, domain, pool],
  );

  // The effective curated SERVICE terms (services only; brand is pinned separately).
  // null curation → auto default = the top AUTO_SERVICES by volume (Wayne: brand + top 7).
  const SERVICE_CAP = DEFAULT_SERVICE_CAP;                 // 10 total incl. the brand (max addable)
  const maxServices = Math.max(1, SERVICE_CAP - 1);        // up to 9 services + brand = 10 (cap)
  const AUTO_SERVICES = 7;                                 // v7.293 — default list = brand + top 7
  const effectiveServiceTerms = useMemo<string[]>(() => {
    if (curated != null) return curated.slice(0, maxServices);
    return catalog.slice(0, AUTO_SERVICES).map(s => s.term);
  }, [curated, catalog, maxServices]);

  // v7.300 — the scan set is EVERY local-intent keyword (client + gap) that maps to a PRODUCT /
  // service category (procedure type) by STORED membership (Const II.8) — i.e. only the product
  // categories ASSOCIATED WITH the local-map-pack keywords (Wayne). Not gated by the curated
  // service list; not limited to keywords that happen to carry a stored taxonomy path. The local
  // set ORs the uploaded-cell + footprint roll-up + live SerpAPI signals (matches the Keyword
  // panel's isLocalIntent). Keywords are grouped to their canonical product LINE for display only.
  const scanInfo = useMemo<{ keywords: string[]; lines: Array<{ name: string; count: number }> }>(() => {
    const snap = analysis?.semrushSnapshot as any;
    if (!categoryModel || !hasAnyLocalSignal(snap, dbKeywords)) return { keywords: [], lines: [] };
    const lpKw = buildLocalPackKeywordSet(snap, dbKeywords);
    const saRows = (analysis?.serpApiSnapshot?.keywords ?? []) as any[];
    for (let i = 0; i < saRows.length; i++) {
      const feats = saRows[i]?.serpFeatures;
      if (Array.isArray(feats) && feats.indexOf('local_pack') >= 0) {
        const kw = String(saRows[i]?.keyword ?? '').toLowerCase().trim();
        if (kw) lpKw.add(kw);
      }
    }
    if (lpKw.size === 0) return { keywords: [], lines: [] };
    const typeByName: Record<string, 'procedure' | 'brand' | 'location'> = {};
    for (let i = 0; i < categoryModel.categories.length; i++) {
      const c = categoryModel.categories[i];
      typeByName[c.name] = (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure';
    }
    const drop = buildCategoryGuard(snap, domain, competitorDomains).droppedCategoryNames(categoryModel.categories);
    const cfk = categoryModel.categoryForKeyword;
    const paths = categoryModel.keywordPaths;
    const parentOf = categoryModel.parentForCategory;
    const seen: Record<string, boolean> = {};
    const kws: string[] = [];
    const lineCount: Record<string, number> = {};
    Array.from(lpKw).forEach(kw => {
      const cat = cfk.get(kw);
      if (!cat || cat === 'Other' || drop.has(cat) || typeByName[cat] !== 'procedure') return;
      if (seen[kw]) return;
      seen[kw] = true;
      kws.push(kw);
      const path = paths.get(kw);
      const line = (path && path.length) ? path[0] : (parentOf.get(cat.toLowerCase()) || cat);
      lineCount[line] = (lineCount[line] || 0) + 1;
    });
    const lines = Object.keys(lineCount).map(name => ({ name, count: lineCount[name] })).sort((a, b) => b.count - a.count);
    return { keywords: kws, lines };
  }, [analysis, dbKeywords, categoryModel, domain, competitorDomains]);
  const scanKeywords = scanInfo.keywords;
  const scanCategoryCount = scanInfo.lines.length;

  // v7.183/v7.284 — the seeds shown + scanned: brand pinned first, then the curated
  // services, each with its real category demand. Same builder the scan uses → the table
  // and the scan reconcile (Const II.7).
  const seeds: ServiceSeed[] = useMemo(
    () => buildSeedsFromServiceTerms({
      serviceTerms: effectiveServiceTerms,
      brand:        projectName,
      clientDomain: domain,
      pool:         pool as any,
      categories:   localServiceCats,
      maxSeeds:     SERVICE_CAP,
    }),
    [effectiveServiceTerms, projectName, domain, pool, localServiceCats, SERVICE_CAP],
  );
  const hasSeeds = seeds.length > 0;
  const seedVolume = useMemo(() => seeds.reduce((s, x) => s + (x.volume || 0), 0), [seeds]);

  // remaining catalog services not already selected (for the +Add picker), vol-sorted
  const addable = useMemo(() => {
    const have: Record<string, boolean> = {};
    seeds.forEach(s => { have[s.term] = true; });
    return catalog.filter(c => !have[c.term]);
  }, [catalog, seeds]);
  const serviceCount = seeds.filter(s => s.kind === 'service').length;
  const atCap = serviceCount >= maxServices;

  // mutate the curated list (materialise current effective terms on first edit, then persist)
  const applyCurated = useCallback((next: string[]) => {
    setCurated(next);
    writeCuratedServices(projectId, next);
  }, [projectId]);
  const removeService = useCallback((term: string) => {
    applyCurated(effectiveServiceTerms.filter(t => t !== term));
  }, [applyCurated, effectiveServiceTerms]);
  const addService = useCallback((term: string) => {
    const t = String(term || '').trim();
    if (!t || effectiveServiceTerms.indexOf(t) >= 0 || effectiveServiceTerms.length >= maxServices) return;
    applyCurated(effectiveServiceTerms.concat([t]));
    setAddPick('');
  }, [applyCurated, effectiveServiceTerms, maxServices]);
  const resetServices = useCallback(() => { setCurated(null); writeCuratedServices(projectId, null); setAddPick(''); }, [projectId]);

  // reload curation when switching projects
  useEffect(() => { setCurated(readCuratedServices(projectId)); setAddPick(''); setLocationsUrl(readLocationsUrl(projectId)); }, [projectId]);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, keywords: scanKeywords, locationsUrl: locationsUrl.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setScanError(d?.error ?? `Could not estimate (${r.status})`); return; }
      setPlan(d.plan ?? null);
    } catch (e) { setScanError(String((e as any)?.message ?? e)); }
  }, [projectId, scanKeywords, locationsUrl]);

  const runScan = useCallback(async () => {
    setPlan(null); setScanError(null); setScanning(true);
    setProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/local-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: scanKeywords, locationsUrl: locationsUrl.trim() }),
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
            setTab('pack');
            try { window.localStorage.setItem(cacheKey(analysis), JSON.stringify(ev.localScan)); } catch {}
          }
        }
      }
    } catch (e) { setScanError(String((e as any)?.message ?? e)); }
    finally { setScanning(false); setProgress(null); }
  }, [projectId, analysis, scanKeywords, locationsUrl]);

  // ── progress UI ──
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const eta = progress && progress.total > 0 && progress.done > 0 && progress.done < progress.total
    ? fmtEta((progress.total - progress.done) * (((Date.now() - progress.startedAt) / 1000) / progress.done)) : '';

  const hasLocal = hasSeeds;
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
              {scanDate && <span className="badge-soft">Last scan: {scanDate}</span>}
              {scan && <span className="badge-soft">{fmt(scan.scannedCount)} keywords · {scan.callsUsed} credits</span>}
              {!scanning && (
                <button onClick={() => (plan ? runScan() : requestPlan())} className="orbit-btn-sm">
                  {scan ? '↻ Re-run scan' : '▸ Run local scan'}
                </button>
              )}
            </div>
          </div>

          {/* SCAN SETUP — visible, requires input before a scan */}
          {!scanning && hasLocal && (
            <div className="scan-setup">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-cfccff)', textTransform: 'uppercase', letterSpacing: '.08em' }}>⚙ Scan setup</span>
                <span style={{ fontSize: 10.5, color: 'var(--c-8888aa)' }}>Each tracked line's local-intent keywords are checked once in the Google map pack at your market locale. Cost = 1 SerpAPI credit per keyword.</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--c-c8c8e0)' }}>
                  <b style={{ color: 'var(--c-cfccff)' }}>{fmt(scanKeywords.length)}</b> local-intent keyword{scanKeywords.length !== 1 ? 's' : ''} across <b style={{ color: 'var(--c-cfccff)' }}>{scanCategoryCount}</b> product service categor{scanCategoryCount !== 1 ? 'ies' : 'y'} <span style={{ color: 'var(--c-6a6a90)' }}>(client + gap · only categories with local-map-pack keywords)</span>
                </div>
                <button onClick={() => requestPlan()} disabled={scanKeywords.length === 0} className="orbit-btn-sm" style={{ height: 32 }}>Estimate &amp; preview</button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', marginTop: 7 }}>
                Each keyword is checked once in Google's local 3-pack at your market locale — no city modifier, since the keyword already carries its local intent. Your map-pack rank per keyword shows in the Map Pack tab.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-cfccff)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>Locations URL <span style={{ color: 'var(--c-6a6a90)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input type="text" value={locationsUrl}
                  onChange={e => { setLocationsUrl(e.target.value); writeLocationsUrl(projectId, e.target.value.trim()); }}
                  placeholder="https://example.com/locations — a locations page, sitemap, or .kml"
                  style={{ flex: '1 1 340px', minWidth: 220, background: 'var(--c-13131d)', border: '1px solid var(--c-2a2a3d)', borderRadius: 7, padding: '6px 9px', color: 'var(--c-e2e2f6)', fontSize: 11.5 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-6a6a90)', marginTop: 4 }}>If your offices aren't auto-detected, paste your locations page (or sitemap/.kml) URL — we read the office list from it. Click <b>Estimate &amp; preview</b> to see how many were found.</div>
            </div>
          )}

          {/* progress */}
          {scanning && (
            <div style={{ marginTop: 12, maxWidth: 480 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--c-9090b8)' }}>
                  <i className="ti ti-loader-2" style={{ marginRight: 5, color: 'var(--c-22d3ee)' }} />
                  {(!progress || progress.total === 0) ? (progress?.seed || 'Starting — discovering locations…') : `Keyword ${progress.done} of ${progress.total}${progress.seed ? ` · ${progress.seed}` : ''}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--c-6a6a90)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{progress && progress.total > 0 ? `${pct}%` : ''}{eta ? ` · ${eta}` : ''}</span>
              </div>
              <div style={{ height: 6, background: 'var(--c-1a1a30)', borderRadius: 3, overflow: 'hidden' }}>
                {progress && progress.total > 0
                  ? <div style={{ height: '100%', width: `${pct}%`, background: 'var(--c-22d3ee)', transition: 'width 0.3s ease' }} />
                  : <div style={{ height: '100%', width: '35%', background: 'var(--c-22d3ee)', opacity: 0.6, animation: 'orbitiq-lindet 1.1s ease-in-out infinite' }} />}
              </div>
              <style>{`@keyframes orbitiq-lindet{0%{margin-left:-35%}100%{margin-left:100%}}`}</style>
            </div>
          )}

          {/* confirm plan */}
          {plan && !scanning && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--ca-108-99-255-0_3)', background: 'var(--ca-108-99-255-0_06)', maxWidth: 560 }}>
              <div style={{ fontSize: 12.5, color: 'var(--c-cfccff)', fontWeight: 600 }}>Ready to scan the local map pack</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-9090b8)', marginTop: 5 }}>
                <b style={{ color: 'var(--c-cfccff)' }}>{fmt(plan.keywords ?? 0)}</b> local-intent keyword{(plan.keywords ?? 0) !== 1 ? 's' : ''} = <b style={{ color: 'var(--c-cfccff)' }}>{fmt(plan.keywords ?? 0)}</b> map-pack check{(plan.keywords ?? 0) !== 1 ? 's' : ''} ·
                <b style={{ color: 'var(--c-f6c061)' }}> ~{fmt(plan.estCalls ?? 0)} SerpAPI credits</b>
              </div>
              {typeof plan.locations === 'number' && (
                <div style={{ fontSize: 10.5, color: (plan.locations ?? 0) > 0 ? 'var(--c-5ee68f)' : 'var(--c-f6c061)', marginTop: 4 }}>
                  {(plan.locations ?? 0) > 0
                    ? `📍 ${fmt(plan.locations ?? 0)} office location${(plan.locations ?? 0) !== 1 ? 's' : ''} found${locationsUrl.trim() ? ' from your Locations URL' : ''}`
                    : (locationsUrl.trim() ? '📍 No offices found at that URL — check it points to your locations page, sitemap, or .kml.' : '📍 No office locations auto-detected — add a Locations URL above if you have one.')}
                </div>
              )}
              {(plan.totalKeywords ?? 0) > (plan.keywords ?? 0) && (
                <div style={{ fontSize: 10.5, color: 'var(--c-f6c061)', marginTop: 4 }}>Scanning {fmt(plan.keywords ?? 0)} of {fmt(plan.totalKeywords ?? 0)} keywords this run (runtime safety cap).</div>
              )}
              {(plan.source === 'kml' || plan.source === 'sitemap-pages') && (
                <div style={{ fontSize: 10.5, color: 'var(--c-5ee68f)', marginTop: 4 }}>✓ Locations read free from the client's sitemap — no credits spent on discovery.</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={runScan} className="orbit-btn-sm">Confirm &amp; scan</button>
                <button onClick={() => setPlan(null)} className="orbit-btn-ghost">Cancel</button>
              </div>
            </div>
          )}
          {scanError && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--c-f08a8a)' }}>{scanError}</div>}
        </div>

        {/* Detection banner / trigger */}
        {dbLoaded && (
          <div style={{ background: hasLocal ? 'linear-gradient(90deg,var(--ca-6-182-212-0_12),transparent)' : 'var(--c-13131d)', border: `1px solid ${hasLocal ? 'var(--ca-6-182-212-0_28)' : 'var(--c-1e1e2e)'}`, borderRadius: 11, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: hasLocal ? 'var(--ca-6-182-212-0_18)' : 'var(--c-1a1a2a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📍</div>
            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--c-c8c8e0)' }}>
              {hasLocal
                ? <><b>Local panel active — {fmt(scanKeywords.length)} local-intent keyword{scanKeywords.length !== 1 ? 's' : ''} across {scanCategoryCount} product service categor{scanCategoryCount !== 1 ? 'ies' : 'y'}.</b> <span className="text-orbit-secondary"> Each keyword (client + gap) is checked in the Google map pack as-is — the keyword already triggers a local pack, so there's no city modifier{scan ? <> — last scan checked {fmt(scan.scannedCount)} keywords.</> : <>. Run a scan to see your map-pack rank per keyword.</>}</span></>
                : <><b>No local-intent keywords detected yet.</b> <span className="text-orbit-secondary"> Couldn't derive local-pack keywords from this client's categories — confirm the analysis ran with keyword + SERP-feature data.</span></>}
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
                    <circle cx="18" cy="18" r="15.9" fill="none" style={{stroke:'var(--c-1e1e2e)'}} strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" style={{stroke:'var(--c-6c63ff)'}} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${roll ? roll.index.score : 0} 100`} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <b style={{ fontSize: 27, fontWeight: 800, color: roll ? 'var(--c-8b85ff)' : 'var(--c-555570)' }}>{roll ? roll.index.score : '—'}</b>
                    <span style={{ fontSize: 9, color: 'var(--c-8888aa)', marginTop: 2, textAlign: 'center', lineHeight: 1.3 }}>Local Visibility<br />Index</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-8888aa)', lineHeight: 1.55 }}>
                  {roll
                    ? <>Blend of map-pack presence (40%), rank quality (25%), reviews (20%) &amp; listing completeness (15%) across <b style={{ color: 'var(--c-f0f0ff)' }}>{clientLocations.length} location{clientLocations.length !== 1 ? 's' : ''}</b>.</>
                    : <>Run a local scan to compute the index from real map-pack, listing &amp; review data.</>}
                </div>
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, minWidth: 360 }}>
                <Stat k="Locations" v={scan ? String(clientLocations.length) : '—'} d={scan ? `${clientLocations.filter(l => l.verified).length} verified` : 'after scan'} />
                <Stat k="Map-Pack Presence" v={roll ? `${roll.pack.presenceRate}%` : '—'} d={roll ? `${roll.pack.inPack} of ${roll.pack.withPack} packs` : 'after scan'} color="var(--c-5ee68f)" bar={roll ? roll.pack.presenceRate : 0} />
                <Stat k="Avg Pack Rank" v={roll && roll.pack.avgRank > 0 ? String(roll.pack.avgRank) : '—'} d="when present (1–3)" color="var(--c-f6c061)" />
                <Stat k="Avg Rating" v={roll && roll.reviews.avgRating > 0 ? `${roll.reviews.avgRating}★` : '—'} d={roll ? `${fmt(roll.reviews.totalReviews)} reviews` : 'after scan'} />
              </div>
            </div>

            {/* SUBNAV */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <TabBtn id="kw"   cur={tab} set={setTab} icon="🔎" label="Services" cnt={scanCategoryCount} />
              <TabBtn id="loc"  cur={tab} set={setTab} icon="📌" label="Locations" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="pack" cur={tab} set={setTab} icon="🗺️" label="Map Pack" cnt={scan ? scan.scannedCount : undefined} />
              <TabBtn id="rev"  cur={tab} set={setTab} icon="⭐" label="Reviews" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="comp" cur={tab} set={setTab} icon="🏆" label="Competition" cnt={roll ? roll.sov.length : undefined} />
              <TabBtn id="opp"  cur={tab} set={setTab} icon="🎯" label="Opportunities" cnt={roll ? roll.opps.opportunities.length : undefined} />
            </div>

            {/* ===== SERVICE CATEGORIES (the local-pack keyword scan set — no scan needed) ===== */}
            {tab === 'kw' && (
              <div className="orbit-card p-5">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Product service categories scanned</div>
                  <div style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>{scanCategoryCount} categor{scanCategoryCount !== 1 ? 'ies' : 'y'} · {fmt(scanKeywords.length)} local-pack keywords</div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>The <b style={{ color: 'var(--c-c8c8e0)' }}>product / service categories associated with your local-map-pack keywords</b> (the same 📍 Local pack categories the Keyword panel shows). EVERY local-intent keyword (client + gap) in these categories is checked as-is in the Google map pack — no city modifier, since the keyword already carries its local intent. See your rank per keyword in the Map Pack tab.</div>
                {localPackActive
                  ? <div style={{ fontSize: 11, color: 'var(--c-46cce0)', background: 'var(--ca-6-182-212-0_13)', border: '1px solid var(--ca-6-182-212-0_25)', borderRadius: 7, padding: '7px 10px', marginBottom: 12 }}>📍 Only categories that <b>trigger a Google local map pack</b> are scanned — the same 📍 Local pack segmentation the Keyword panel shows, from real Semrush + SerpAPI data.</div>
                  : <div style={{ fontSize: 11, color: 'var(--c-f6c061)', background: 'var(--ca-245-158-11-0_12)', border: '1px solid var(--ca-245-158-11-0_28)', borderRadius: 7, padding: '7px 10px', marginBottom: 12 }}>⚠ No local-pack signal in this data yet. Upload Semrush keywords with the <b>SERP Features</b> column (or re-run the analysis) to populate local categories.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
                  <MiniStat k="PRODUCT CATEGORIES" v={String(scanCategoryCount)} />
                  <MiniStat k="KEYWORDS TO SCAN" v={fmt(scanKeywords.length)} color="var(--c-46cce0)" />
                  <MiniStat k="MAP-PACK CHECKS" v={scan ? fmt(scan.scannedCount) : fmt(scanKeywords.length)} color="var(--c-a9a3ff)" />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="local-tbl">
                    <thead><tr><th>Product service category</th><th style={{ textAlign: 'right' }}>Local-pack keywords</th></tr></thead>
                    <tbody>
                      {scanInfo.lines.map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.name} <span className="ipill" style={{ background: 'var(--ca-6-182-212-0_13)', color: 'var(--c-46cce0)', border: '1px solid var(--ca-6-182-212-0_25)' }}>📍 local pack</span></td>
                          <td style={{ textAlign: 'right' }}>{fmt(l.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 10 }}>Click <b>Estimate &amp; preview</b> at the top, then run a scan to see your map-pack rank per keyword in the Map Pack tab.</div>
              </div>
            )}

            {/* ===== other tabs require a scan ===== */}
            {tab !== 'kw' && !scan && <EmptyScan onRun={() => (plan ? runScan() : requestPlan())} scanning={scanning} />}

            {/* ===== LOCATIONS ===== */}
            {tab === 'loc' && scan && (
              <div className="orbit-card p-5">
                <div style={{ fontSize: 13, fontWeight: 700 }}>Business locations &amp; listing health</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>
                  {scan.source && scan.source.indexOf('manual') === 0
                    ? <><b style={{ color: 'var(--c-5ee68f)' }}>{fmt(scan.locations.length)} locations</b> read from your Locations URL — address, phone &amp; map coordinates are read from each office page; Google ratings/reviews are pending until a map-pack scan or Google lookup.</>
                    : (scan.source === 'kml' || scan.source === 'sitemap-pages')
                    ? <><b style={{ color: 'var(--c-5ee68f)' }}>{fmt(scan.locations.length)} locations</b> discovered from the client's own sitemap{scan.source === 'kml' ? ' (locations.kml — with GPS, address &amp; phone)' : ' location pages'}. Ratings/reviews are backfilled from the live map-pack scan.</>
                    : <>Google Business listings discovered via Maps brand search ({fmt(scan.locations.length)} matched to "{projectName}").</>}
                </div>
                {clientLocations.length === 0
                  ? <div style={{ fontSize: 12.5, color: 'var(--c-f6c061)' }}>No client locations were discovered. Confirm the site exposes a sitemap/locations page, or that the business name matches the Google Business Profile.</div>
                  : <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                      {clientLocations.slice(0, 60).map((l, i) => (
                        <div key={i} className="loc-card" style={{ borderColor: l.healthFlags.length ? 'var(--ca-245-158-11-0_3)' : 'var(--c-1e1e2e)' }}>
                          <div className="loc-mk" style={l.healthFlags.length ? { background: 'var(--ca-245-158-11-0_12)', borderColor: 'var(--ca-245-158-11-0_3)' } : {}}>{l.healthFlags.length ? '⚠' : '📍'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{l.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>{l.address || 'no address'} · {(() => { const st = locStatus(l); return <span style={{ color: st.color }} title={st.hint}>{st.icon} {st.label}</span>; })()}</div>
                            <div style={{ marginTop: 6, fontSize: 12 }}>
                              {l.rating != null ? <><span style={{ color: 'var(--c-f6c061)' }}>★</span> <b>{l.rating}</b></> : <span style={{ color: 'var(--c-555570)' }}>rating pending scan</span>}
                              <span style={{ color: 'var(--c-8888aa)' }}> · {l.rating != null ? `${fmt(l.reviews)} reviews` : <span style={{ color: 'var(--c-555570)' }}>reviews pending</span>}{l.type ? ` · ${l.type}` : ''}</span>
                            </div>
                            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--c-8888aa)' }}>
                              {l.phone ? <span>{l.phone}</span> : null}
                              {l.pageUrl ? <> · <a href={l.pageUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-8b85ff)' }}>View page ↗</a></> : null}
                            </div>
                            {l.healthFlags.length > 0 && <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--c-f6c061)' }}>{l.healthFlags.join(' · ')}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {clientLocations.length > 60 && <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 10 }}>Showing 60 of {fmt(clientLocations.length)} locations.</div>}
                  </>}
              </div>
            )}

            {/* ===== MAP PACK ===== */}
            {tab === 'pack' && scan && roll && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MiniCard k="IN PACK (1–3)" v={String(roll.pack.inPack)} color="var(--c-5ee68f)" bar={roll.pack.withPack ? Math.round(roll.pack.inPack / roll.pack.withPack * 100) : 0} />
                  <MiniCard k="RANK 1" v={String(roll.pack.rank1)} d="top of pack" />
                  <MiniCard k="NOT IN PACK" v={String(roll.pack.notInPack)} color="var(--c-f08a8a)" d="competitors rank, you don't" />
                  <MiniCard k="PACKS FOUND" v={`${roll.pack.withPack}/${roll.pack.scanned}`} d="queries with a 3-pack" />
                </div>
                <div className="orbit-card p-5">
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Map-pack rank by keyword</div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>Your position in Google's local 3-pack for each real local-intent keyword (client + gap), checked at your market locale. Real SerpAPI local results — {fmt(scan.scannedCount)} keywords.</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="local-tbl">
                      <thead><tr><th>Keyword</th><th>Intent</th><th style={{ textAlign: 'right' }}>Volume</th><th>Pack?</th><th>Your rank</th><th>Pack leader</th></tr></thead>
                      <tbody>
                        {scan.keywords.slice().sort((a, b) => {
                          // gaps you're missing (no rank) first, then by real volume desc
                          const ra = a.clientBestRank == null ? 0 : 1;
                          const rb = b.clientBestRank == null ? 0 : 1;
                          if (ra !== rb) return ra - rb;
                          return (b.searchVolume || 0) - (a.searchVolume || 0);
                        }).slice(0, 400).map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{s.keyword}</td>
                            <td>{s.intent ? <span className="ipill" style={intentClass(s.intent)}>{INTENT_LABEL[s.intent] ?? s.intent}</span> : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                            <td style={{ textAlign: 'right' }}>{s.searchVolume > 0 ? fmt(s.searchVolume) : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                            <td>{s.packPresent ? '✓' : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                            <td><span className="rchip" style={rankChip(s.clientBestRank)}>{s.clientBestRank ?? '—'}</span></td>
                            <td style={{ color: 'var(--c-8888aa)' }}>{s.pack.find(m => m.isClient && m.position === s.clientBestRank) ? 'You' : (s.packLeader || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {scan.keywords.length > 400 && <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 10 }}>Showing 400 of {fmt(scan.keywords.length)} keywords.</div>}
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
                        <circle cx="18" cy="18" r="15.9" fill="none" style={{stroke:'var(--c-1e1e2e)'}} strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" style={{stroke:'var(--c-f6c061)'}} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.round((roll.reviews.avgRating / 5) * 100)} 100`} />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <b style={{ fontSize: 22, color: 'var(--c-f6c061)' }}>{roll.reviews.avgRating || '—'}</b>
                        <span style={{ fontSize: 9, color: 'var(--c-8888aa)', marginTop: 2, textAlign: 'center' }}>avg ★ across<br />{roll.reviews.locationCount} loc</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-8888aa)' }}>
                      <b style={{ color: 'var(--c-f0f0ff)', fontSize: 14 }}>{fmt(roll.reviews.totalReviews)}</b> total reviews<br />
                      range {roll.reviews.worstRating}–{roll.reviews.bestRating}★ across locations
                    </div>
                  </div>
                  <div className="orbit-card p-5" style={{ flex: 1, minWidth: 320 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Reviews by location</div>
                    <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginBottom: 10 }}>Real Google rating + review count. (Star distribution &amp; velocity require a per-review pull — not fabricated here.)</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="local-tbl">
                        <thead><tr><th>Location</th><th>Rating</th><th style={{ textAlign: 'right' }}>Reviews</th><th>Status</th></tr></thead>
                        <tbody>
                          {clientLocations.map((l, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{l.city || l.title}</td>
                              <td>{l.rating != null ? <><span style={{ color: 'var(--c-f6c061)' }}>★</span> {l.rating}</> : '—'}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(l.reviews)}</td>
                              <td>{l.rating != null && l.rating >= 4.5 ? <span className="ipill" style={{ background: 'var(--ca-34-197-94-0_15)', color: 'var(--c-5ee68f)' }}>Strong</span> : l.rating != null && l.rating >= 4.0 ? <span className="ipill" style={{ background: 'var(--ca-245-158-11-0_15)', color: 'var(--c-f6c061)' }}>OK</span> : <span className="ipill" style={{ background: 'var(--ca-239-68-68-0_13)', color: 'var(--c-f08a8a)' }}>Weak</span>}</td>
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
                <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 14 }}>Who appears most across your {roll.pack.withPack} local packs. Share = packs where each business holds a 3-pack slot.</div>
                {roll.sov.slice(0, 12).map((row, i) => (
                  <div key={i} className="lb-row" style={row.isClient ? { borderColor: 'var(--c-3d3880)', background: 'linear-gradient(90deg,var(--ca-108-99-255-0_12),transparent)' } : {}}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--c-555570)', width: 20 }}>{i + 1}</span>
                    <div style={{ flex: '0 0 180px', minWidth: 0 }}>
                      <b style={{ fontSize: 12.5 }}>{row.isClient ? `${projectName} (You)` : row.name}</b>
                      <div style={{ fontSize: 10.5, color: 'var(--c-8888aa)' }}>{row.avgRating != null ? `${row.avgRating}★` : 'no rating'}{row.maxReviews ? ` · ${fmt(row.maxReviews)} rev` : ''}</div>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--c-0e0e18)', flex: 1, overflow: 'hidden', minWidth: 80 }}>
                      <i style={{ display: 'block', height: '100%', width: `${row.sharePct}%`, background: row.isClient ? 'linear-gradient(90deg,var(--c-6c63ff),var(--c-06b6d4))' : 'var(--c-5b5b7a)' }} />
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
                  <MiniCard k="P0 — DO NOW" v={String(roll.opps.counts.P0)} color="var(--c-f08a8a)" />
                  <MiniCard k="P1 — NEXT" v={String(roll.opps.counts.P1)} color="var(--c-f6c061)" />
                  <MiniCard k="P2 — LATER" v={String(roll.opps.counts.P2)} color="var(--c-a9a3ff)" />
                  <MiniCard k="VOLUME AT STAKE" v={fmt(roll.opps.volumeAtStake)} d="/mo in pack misses" />
                </div>
                <div className="orbit-card p-5">
                  {roll.opps.opportunities.length === 0
                    ? <div style={{ fontSize: 12.5, color: 'var(--c-5ee68f)' }}>No local gaps found in the scanned set — you hold the pack where it counts. 🎉</div>
                    : roll.opps.opportunities.map((o, i) => (
                        <div key={i} className="opp-row">
                          <span className={`tierbadge t-${o.tier}`}>{o.tier}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{o.title}</div>
                              {o.location && <span className="locbadge" title={`Targets the ${o.location} location`}>📍 {o.location}</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)' }}>{o.detail}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                              {o.volume > 0 && <span className="ochip">Volume <b>{fmt(o.volume)}/mo</b></span>}
                              {o.intent && <span className="ochip">Type <b>{INTENT_LABEL[o.intent]}</b></span>}
                              <span className="ochip">Lever <b>{o.kind === 'pack-miss' ? 'GBP + reviews' : o.kind === 'rank-improve' ? 'reviews' : o.kind === 'listing-health' ? 'verify + complete' : 'reviews'}</b></span>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: 'var(--c-555570)', textAlign: 'center', padding: '6px 0 24px' }}>
              Every figure traces to a real source row — SerpAPI (map pack, Maps listings, ratings) + Semrush (volume). Nothing modeled.
            </div>
          </>
        )}
      </div>

      {/* scoped styles */}
      <style>{`
        .badge-soft{font-size:10px;padding:3px 8px;border-radius:5px;background:var(--c-0f0f1e);border:1px solid var(--c-1e1e35);color:var(--c-7777a0)}
        .orbit-btn-sm{font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--c-3d3880);background:linear-gradient(180deg,var(--ca-108-99-255-0_25),var(--ca-108-99-255-0_12));color:var(--c-cfccff);cursor:pointer}
        .orbit-btn-sm:hover{border-color:var(--c-6c63ff)}
        .orbit-btn-ghost{font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--c-1e1e2e);background:var(--c-13131d);color:var(--c-8888aa);cursor:pointer}
        .cap-ctl{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--c-7777a0);background:var(--c-0f0f1e);border:1px solid var(--c-1e1e35);border-radius:8px;padding:4px 8px}
        .cap-ctl input{width:46px;background:var(--c-07070e);border:1px solid var(--c-2a2a3d);border-radius:5px;color:var(--c-cfccff);font-size:12px;font-weight:700;padding:3px 5px;text-align:center}
        .scan-setup{margin-top:14px;padding:13px 15px;border-radius:11px;border:1px solid var(--ca-108-99-255-0_3);background:var(--ca-108-99-255-0_06)}
        .setup-field{display:flex;flex-direction:column;gap:5px}
        .setup-field label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--c-9090b8)}
        .setup-field input{width:58px;background:var(--c-07070e);border:1px solid var(--c-2a2a3d);border-radius:6px;color:var(--c-cfccff);font-size:13px;font-weight:700;padding:5px 6px;text-align:center}
        .setup-field select{background:var(--c-07070e);border:1px solid var(--c-2a2a3d);border-radius:6px;color:var(--c-cfccff);font-size:12px;font-weight:600;padding:6px 8px;cursor:pointer}
        .setup-all{font-size:10.5px;font-weight:600;padding:0 9px;border-radius:6px;border:1px solid var(--c-3d3880);background:var(--ca-108-99-255-0_14);color:var(--c-b7b2ff);cursor:pointer}
        .setup-all:hover{border-color:var(--c-6c63ff)}
        .svc-del{font-size:13px;line-height:1;padding:4px 7px;border-radius:6px;border:1px solid var(--ca-239-68-68-0_28);background:var(--ca-239-68-68-0_13);color:var(--c-f08a8a);cursor:pointer}
        .svc-del:hover{border-color:var(--c-f08a8a);background:var(--ca-239-68-68-0_3)}
        .svc-add-sel{flex:1;min-width:220px;background:var(--c-07070e);border:1px solid var(--c-2a2a3d);border-radius:6px;color:var(--c-cfccff);font-size:12.5px;font-weight:600;padding:7px 9px;cursor:pointer}
        .svc-add-sel:disabled{color:var(--c-6a6a90);cursor:not-allowed}
        .svc-add-btn{font-size:12px;font-weight:700;padding:7px 13px;border-radius:7px;border:1px solid var(--c-3d3880);background:var(--ca-108-99-255-0_16);color:var(--c-b7b2ff);cursor:pointer;white-space:nowrap}
        .svc-add-btn:hover:not(:disabled){border-color:var(--c-6c63ff)}
        .svc-add-btn:disabled{opacity:.45;cursor:not-allowed}
        .svc-reset{font-size:11px;font-weight:600;color:var(--c-8b85ff);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline}
        .local-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
        .local-tbl th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--c-555570);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--c-1e1e2e)}
        .local-tbl td{padding:10px;border-bottom:1px solid var(--c-15151f);vertical-align:middle}
        .local-tbl tr:hover td{background:var(--c-13131d)}
        .ipill{font-size:9.5px;padding:2px 7px;border-radius:5px;font-weight:600;white-space:nowrap}
        .rchip{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:23px;border-radius:7px;font-weight:800;font-size:12px;padding:0 6px}
        .loc-card{background:var(--c-111118);border:1px solid var(--c-1e1e2e);border-radius:11px;padding:14px;display:flex;gap:12px;align-items:flex-start}
        .loc-mk{width:34px;height:34px;border-radius:9px;background:var(--ca-108-99-255-0_14);border:1px solid var(--ca-108-99-255-0_3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px}
        .lb-row{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;border:1px solid var(--c-1e1e2e);background:var(--c-111118);margin-bottom:8px}
        .opp-row{border:1px solid var(--c-1e1e2e);border-radius:12px;padding:15px;background:var(--c-111118);display:flex;gap:13px;margin-bottom:11px}
        .locbadge{flex-shrink:0;white-space:nowrap;font-size:11px;font-weight:700;padding:3px 10px;border-radius:7px;background:var(--ca-108-99-255-0_16);color:var(--c-b7b2ff);border:1px solid var(--ca-108-99-255-0_35)}
        .tierbadge{font-weight:800;font-size:11px;padding:4px 9px;border-radius:7px;height:fit-content;flex-shrink:0}
        .t-P0{background:var(--ca-239-68-68-0_15);color:var(--c-f08a8a);border:1px solid var(--ca-239-68-68-0_3)}
        .t-P1{background:var(--ca-245-158-11-0_15);color:var(--c-f6c061);border:1px solid var(--ca-245-158-11-0_3)}
        .t-P2{background:var(--ca-108-99-255-0_14);color:var(--c-a9a3ff);border:1px solid var(--ca-108-99-255-0_3)}
        .ochip{font-size:10.5px;padding:3px 9px;border-radius:6px;background:var(--c-0e0e18);border:1px solid var(--c-1e1e2e);color:var(--c-8888aa)}
        .ochip b{color:var(--c-f0f0ff)}
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
      background: active ? 'linear-gradient(180deg,var(--ca-108-99-255-0_22),var(--ca-108-99-255-0_06))' : 'var(--c-13131d)',
      border: `1px solid ${active ? 'var(--c-3d3880)' : 'var(--c-1e1e2e)'}`, color: active ? 'var(--c-ffffff)' : 'var(--c-8888aa)',
    }}>
      <span style={{ fontSize: 13 }}>{icon}</span>{label}
      {cnt != null && <span style={{ fontSize: 10, background: 'var(--c-0c0c15)', border: '1px solid var(--c-1e1e2e)', borderRadius: 10, padding: '1px 7px', color: 'var(--c-8888aa)' }}>{cnt}</span>}
    </button>
  );
}

function Stat({ k, v, d, color, bar }: { k: string; v: string; d?: string; color?: string; bar?: number }) {
  return (
    <div style={{ background: 'var(--c-111118)', border: '1px solid var(--c-1e1e2e)', borderRadius: 11, padding: 13 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--c-8888aa)' }}>{k}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 5, lineHeight: 1, color: color || 'var(--c-f0f0ff)' }}>{v}</div>
      {d && <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 5 }}>{d}</div>}
      {bar != null && <div style={{ height: 6, borderRadius: 4, background: 'var(--c-0e0e18)', overflow: 'hidden', marginTop: 9 }}><i style={{ display: 'block', height: '100%', width: `${bar}%`, background: color || 'var(--c-6c63ff)' }} /></div>}
    </div>
  );
}

function MiniStat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: 'var(--c-111118)', border: '1px solid var(--c-1e1e2e)', borderRadius: 11, padding: 12 }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--c-8888aa)' }}>{k}</div>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4, color: color || 'var(--c-f0f0ff)' }}>{v}</div>
    </div>
  );
}

function MiniCard({ k, v, d, color, bar }: { k: string; v: string; d?: string; color?: string; bar?: number }) {
  return (
    <div className="orbit-card" style={{ flex: 1, minWidth: 150, padding: 14 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--c-8888aa)' }}>{k}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color || 'var(--c-f0f0ff)' }}>{v}</div>
      {d && <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 3 }}>{d}</div>}
      {bar != null && <div style={{ height: 6, borderRadius: 4, background: 'var(--c-0e0e18)', overflow: 'hidden', marginTop: 9 }}><i style={{ display: 'block', height: '100%', width: `${bar}%`, background: color || 'var(--c-6c63ff)' }} /></div>}
    </div>
  );
}

function EmptyScan({ onRun, scanning }: { onRun: () => void; scanning: boolean }) {
  return (
    <div className="orbit-card p-5" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-f0f0ff)' }}>Run a local scan to populate this view</div>
      <div style={{ fontSize: 12, color: 'var(--c-8888aa)', margin: '6px 0 14px' }}>Discovers your Google Business listings and checks your map-pack rank for the top local keywords — all real SerpAPI data.</div>
      {!scanning && <button onClick={onRun} className="orbit-btn-sm">▸ Run local scan</button>}
    </div>
  );
}
