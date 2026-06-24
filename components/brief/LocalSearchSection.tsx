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
import { buildKwPool, isBrandedKeyword, buildCompetitorBrandTokens, buildExcludedBrandTokens, textHasCompetitorBrand } from '@/lib/utils/kwVolume';
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
  const [plan, setPlan]             = useState<{ seeds: number; seedList?: string[]; cells: number; willScan: number; locations: number; locationsScannable: number; locationsUsed: number; potentialCells: number; estCalls: number; source?: string; model?: string; order?: string; firstCities?: string[] } | null>(null);
  // per-run scan setup (Wayne sets these each scan)
  const [capLoc, setCapLoc]         = useState<number>(25);
  const [capSeeds, setCapSeeds]     = useState<number>(DEFAULT_SERVICE_CAP);
  const [locOrder, setLocOrder]     = useState<'market' | 'demand' | 'az'>('market');
  // v7.284 — curated primary-service terms (services only; brand pinned). null = follow auto.
  const [curated, setCurated]       = useState<string[] | null>(() => readCuratedServices(projectId));
  const [addPick, setAddPick]       = useState<string>('');   // current selection in the +Add picker

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

  // v7.284 — competitor-brand guard at THIS read site (Const III.1a). The service
  // catalog reads `_categoryBreakdown.categories`, which still contains competitor
  // brand categories (synthesis builds them from gap keywords) — so the guard, not
  // the synthesis output, is the enforcement layer. Drop brand-type categories that
  // aren't the client's own, and any category whose NAME carries a competitor /
  // blocklisted brand token; keep the client's own brand. Mirrors ThemeClustersPanel.
  const guardedCategories = useMemo(() => {
    const snap = analysis?.semrushSnapshot as any;
    const cats: Array<{ name?: string; type?: string }> = snap?._categoryBreakdown?.categories ?? [];
    if (cats.length === 0) return [] as Array<{ name?: string; type?: string }>;
    const brandTerms: string[] = Array.isArray(snap?._brandTerms) ? snap._brandTerms : [];
    const compTokens = buildCompetitorBrandTokens(snap, domain, competitorDomains);
    const exclTokens = buildExcludedBrandTokens(snap);
    const isClientBrandName = (name: string) => isBrandedKeyword(name, domain, [], brandTerms);
    return cats.filter(c => {
      const name = String(c?.name ?? '');
      if (!name) return false;
      if ((c?.type === 'brand') && !isClientBrandName(name)) return false;           // foreign brand category
      const foreignBrand = textHasCompetitorBrand(name, compTokens) || textHasCompetitorBrand(name, exclTokens);
      if (foreignBrand && !isClientBrandName(name)) return false;                     // name carries a competitor brand
      return true;
    });
  }, [analysis, domain, competitorDomains]);

  // v7.284 — full (un-capped) catalog of candidate services from the GUARDED
  // categories, sorted highest real Semrush volume → lowest. This feeds both the
  // default auto selection and the "+ Add service" picker.
  const catalog = useMemo(
    () => buildServiceCatalog({ categories: guardedCategories, brand: projectName, clientDomain: domain, pool: pool as any }),
    [guardedCategories, projectName, domain, pool],
  );

  // The effective curated SERVICE terms (services only; brand is pinned separately).
  // null curation → auto default = the top (cap-1) services by volume.
  const SERVICE_CAP = DEFAULT_SERVICE_CAP;                 // 10 total incl. the brand
  const maxServices = Math.max(1, SERVICE_CAP - 1);        // 9 services + brand = 10
  const effectiveServiceTerms = useMemo<string[]>(() => {
    if (curated != null) return curated.slice(0, maxServices);
    return catalog.slice(0, maxServices).map(s => s.term);
  }, [curated, catalog, maxServices]);

  // v7.183/v7.284 — the seeds shown + scanned: brand pinned first, then the curated
  // services, each with its real pool volume. Same builder the scan uses → the table
  // and the scan reconcile (Const II.7).
  const seeds: ServiceSeed[] = useMemo(
    () => buildSeedsFromServiceTerms({
      serviceTerms: effectiveServiceTerms,
      brand:        projectName,
      clientDomain: domain,
      pool:         pool as any,
      maxSeeds:     SERVICE_CAP,
    }),
    [effectiveServiceTerms, projectName, domain, pool, SERVICE_CAP],
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
  useEffect(() => { setCurated(readCuratedServices(projectId)); setAddPick(''); }, [projectId]);

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
        body: JSON.stringify({ dryRun: true, maxLocations: capLoc, maxSeeds: capSeeds, locationOrder: locOrder, services: effectiveServiceTerms }),
      });
      const d = await r.json();
      if (!r.ok) { setScanError(d?.error ?? `Could not estimate (${r.status})`); return; }
      setPlan(d.plan ?? null);
    } catch (e) { setScanError(String((e as any)?.message ?? e)); }
  }, [projectId, capLoc, capSeeds, locOrder, effectiveServiceTerms]);

  const runScan = useCallback(async () => {
    setPlan(null); setScanError(null); setScanning(true);
    setProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/local-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxLocations: capLoc, maxSeeds: capSeeds, locationOrder: locOrder, services: effectiveServiceTerms }),
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
  }, [projectId, analysis, capLoc, capSeeds, locOrder, effectiveServiceTerms]);

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
              {scan && <span className="badge-soft">{fmt(scan.scannedCount)} cells · {scan.callsUsed} credits</span>}
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
                <span style={{ fontSize: 10.5, color: 'var(--c-8888aa)' }}>Set how much to scan, then Run. Cost = services × locations map-pack checks.</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
                <div className="setup-field">
                  <label>Services <span style={{ color: 'var(--c-6a6a90)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(brand + service categories · edit in Services tab)</span></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" min={1} max={SERVICE_CAP} value={capSeeds}
                      onChange={e => setCapSeeds(Math.max(1, Math.min(SERVICE_CAP, parseInt(e.target.value, 10) || 1)))} />
                    <button className="setup-all" onClick={() => setCapSeeds(Math.max(1, Math.min(SERVICE_CAP, seeds.length)))}>All ({seeds.length})</button>
                  </div>
                </div>
                <div className="setup-field">
                  <label>Locations</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" min={1} max={200} value={capLoc}
                      onChange={e => setCapLoc(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))} />
                    <button className="setup-all" onClick={() => setCapLoc(200)}>All</button>
                  </div>
                </div>
                <div className="setup-field">
                  <label>Location priority</label>
                  <select value={locOrder} onChange={e => setLocOrder(e.target.value as any)}>
                    <option value="market">Largest markets first</option>
                    <option value="demand">Highest demand first</option>
                    <option value="az">A → Z (city)</option>
                  </select>
                </div>
                <button onClick={() => requestPlan()} className="orbit-btn-sm" style={{ height: 32 }}>Estimate &amp; preview</button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', marginTop: 7 }}>
                A capped run scans the top locations by your chosen priority. "Largest markets" uses metro size; "Highest demand" uses real Semrush volume per city. Lowest-competition ranking needs scan data, so it appears in results, not here.
              </div>
            </div>
          )}

          {/* progress */}
          {scanning && (
            <div style={{ marginTop: 12, maxWidth: 480 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--c-9090b8)' }}>
                  <i className="ti ti-loader-2" style={{ marginRight: 5, color: 'var(--c-22d3ee)' }} />
                  {(!progress || progress.total === 0) ? (progress?.seed || 'Starting — discovering locations…') : `Cell ${progress.done} of ${progress.total}${progress.seed ? ` · ${progress.seed}` : ''}`}
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
              <div style={{ fontSize: 12.5, color: 'var(--c-cfccff)', fontWeight: 600 }}>Ready to scan the map-pack grid</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-9090b8)', marginTop: 5 }}>
                <b style={{ color: 'var(--c-cfccff)' }}>{plan.seeds}</b> service{plan.seeds !== 1 ? 's' : ''} × <b style={{ color: 'var(--c-cfccff)' }}>{plan.locationsUsed}</b> of {plan.locationsScannable} location{plan.locationsScannable !== 1 ? 's' : ''} = <b style={{ color: 'var(--c-cfccff)' }}>{fmt(plan.cells)}</b> map-pack checks ·
                <b style={{ color: 'var(--c-f6c061)' }}> ~{fmt(plan.estCalls)} SerpAPI credits</b>
              </div>
              {plan.seedList && plan.seedList.length > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--c-9090b8)', marginTop: 4 }}>Services: {plan.seedList.join(' · ')}</div>
              )}
              {plan.locationsUsed < plan.locationsScannable && (
                <div style={{ fontSize: 10.5, color: 'var(--c-f6c061)', marginTop: 4 }}>Scanning the top {plan.locationsUsed} of {plan.locationsScannable} locations by <b>{plan.order === 'demand' ? 'highest demand' : plan.order === 'az' ? 'A–Z' : 'largest market'}</b> — set Locations to All to cover every one (higher cost).</div>
              )}
              {plan.firstCities && plan.firstCities.length > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--c-9090b8)', marginTop: 4 }}>First up: {plan.firstCities.join(' · ')}{plan.locationsUsed > plan.firstCities.length ? ' …' : ''}</div>
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
                ? <><b>Local panel active — {seeds.length} service{seeds.length !== 1 ? 's' : ''} tracked.</b> <span className="text-orbit-secondary"> Each service is checked in the Google map pack as "{`{service} {city}`}" from every location's GPS{scan ? <> — last grid scanned {fmt(scan.scannedCount)} service×city cells across {fmt(scan.locationsScanned ?? 0)} locations.</> : <>. Run a scan to map your rank city by city.</>}</span></>
                : <><b>No services detected yet.</b> <span className="text-orbit-secondary"> Couldn't derive service seeds from this client's categories/keywords — confirm the analysis ran with keyword data.</span></>}
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
              <TabBtn id="kw"   cur={tab} set={setTab} icon="🔎" label="Services" cnt={seeds.length} />
              <TabBtn id="loc"  cur={tab} set={setTab} icon="📌" label="Locations" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="pack" cur={tab} set={setTab} icon="🗺️" label="Map Pack" cnt={scan ? scan.scannedCount : undefined} />
              <TabBtn id="rev"  cur={tab} set={setTab} icon="⭐" label="Reviews" cnt={scan ? clientLocations.length : undefined} />
              <TabBtn id="comp" cur={tab} set={setTab} icon="🏆" label="Competition" cnt={roll ? roll.sov.length : undefined} />
              <TabBtn id="opp"  cur={tab} set={setTab} icon="🎯" label="Opportunities" cnt={roll ? roll.opps.opportunities.length : undefined} />
            </div>

            {/* ===== SERVICES (the grid seeds — no scan needed) ===== */}
            {tab === 'kw' && (
              <div className="orbit-card p-5">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Services tracked per location</div>
                  <div style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>
                    {serviceCount} of {maxServices} services{curated != null && <> · <button onClick={resetServices} className="svc-reset">↺ Reset to auto</button></>}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>Your brand + up to {maxServices} service categories, derived from the client's own footprint and ranked by real Semrush volume. Delete any you don't want, or add one with <b style={{ color: 'var(--c-c8c8e0)' }}>+ Add service</b>. Each is scanned in the Google map pack as <b style={{ color: 'var(--c-c8c8e0)' }}>"{`{service} {city}`}"</b> from every location's GPS. Volume = the base service term's real Semrush volume.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
                  <MiniStat k="SERVICES" v={String(seeds.length)} />
                  <MiniStat k="LOCATIONS" v={scan ? fmt(scan.locations.length) : '—'} color="var(--c-46cce0)" />
                  <MiniStat k="GRID CELLS" v={scan ? fmt(scan.scannedCount) : `${seeds.length} × locations`} color="var(--c-a9a3ff)" />
                  <MiniStat k="SERVICE VOL / MO" v={fmt(seedVolume)} color="var(--c-a9a3ff)" />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="local-tbl">
                    <thead><tr><th>Service</th><th>Type</th><th style={{ textAlign: 'right' }}>Base volume / mo</th><th>Scanned as</th><th style={{ width: 44 }} aria-label="actions" /></tr></thead>
                    <tbody>
                      {seeds.map((s, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{s.term}</td>
                          <td>{s.kind === 'brand'
                            ? <span className="ipill" style={{ background: 'var(--ca-108-99-255-0_15)', color: 'var(--c-a9a3ff)', border: '1px solid var(--ca-108-99-255-0_3)' }}>brand</span>
                            : <span className="ipill" style={{ background: 'var(--ca-34-197-94-0_14)', color: 'var(--c-5ee68f)', border: '1px solid var(--ca-34-197-94-0_28)' }}>service</span>}</td>
                          <td style={{ textAlign: 'right' }}>{s.volume > 0 ? fmt(s.volume) : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                          <td style={{ color: 'var(--c-8888aa)' }}>"{s.term} {`{city}`}"</td>
                          <td style={{ textAlign: 'right' }}>
                            {s.kind === 'service'
                              ? <button className="svc-del" title={`Remove "${s.term}" from the scan`} aria-label={`Remove ${s.term}`} onClick={() => removeService(s.term)}>🗑</button>
                              : <span title="Brand is always tracked" style={{ color: 'var(--c-555570)', fontSize: 12 }}>📌</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* +Add service picker — remaining service categories, highest real volume first */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                  <select className="svc-add-sel" value={addPick} onChange={e => setAddPick(e.target.value)} disabled={atCap || addable.length === 0}>
                    <option value="">{atCap ? `At limit (${maxServices} services)` : addable.length === 0 ? 'No more service categories' : '+ Add a service category…'}</option>
                    {addable.map((c, i) => (
                      <option key={i} value={c.term}>{c.term}{c.volume > 0 ? `  ·  ${fmt(c.volume)}/mo` : ''}</option>
                    ))}
                  </select>
                  <button className="svc-add-btn" disabled={!addPick || atCap} onClick={() => addService(addPick)}>＋ Add service</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 10 }}>Edits persist for this project. Then set the <b>Locations</b> cap at the top and run a scan to see map-pack rank per city in the Map Pack tab.</div>
              </div>
            )}

            {/* ===== other tabs require a scan ===== */}
            {tab !== 'kw' && !scan && <EmptyScan onRun={() => (plan ? runScan() : requestPlan())} scanning={scanning} />}

            {/* ===== LOCATIONS ===== */}
            {tab === 'loc' && scan && (
              <div className="orbit-card p-5">
                <div style={{ fontSize: 13, fontWeight: 700 }}>Business locations &amp; listing health</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>
                  {scan.source === 'kml' || scan.source === 'sitemap-pages'
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
                              <span style={{ color: 'var(--c-8888aa)' }}> · {fmt(l.reviews)} reviews{l.type ? ` · ${l.type}` : ''}</span>
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
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Map-pack rank by service × location</div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginBottom: 12 }}>Your position in Google's local 3-pack for each service in each city, checked from that location's GPS. Real SerpAPI local results — {fmt(scan.scannedCount)} cells across {fmt(scan.locationsScanned ?? 0)} locations.</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="local-tbl">
                      <thead><tr><th>Service</th><th>City</th><th style={{ textAlign: 'right' }}>Base vol</th><th>Pack?</th><th>Your rank</th><th>Pack leader</th></tr></thead>
                      <tbody>
                        {scan.keywords.slice().sort((a, b) => {
                          // group by service (seed) then put your gaps (no rank) first within a service
                          const sa = (a.seed || a.keyword), sb = (b.seed || b.keyword);
                          if (sa !== sb) return sa < sb ? -1 : 1;
                          const ra = a.clientBestRank == null ? 99 : a.clientBestRank;
                          const rb = b.clientBestRank == null ? 99 : b.clientBestRank;
                          return rb - ra;
                        }).slice(0, 400).map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{s.seed || s.keyword}</td>
                            <td style={{ color: 'var(--c-c8c8e0)' }}>{s.city || s.bestLocationCity || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{s.searchVolume > 0 ? fmt(s.searchVolume) : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                            <td>{s.packPresent ? '✓' : <span style={{ color: 'var(--c-555570)' }}>—</span>}</td>
                            <td><span className="rchip" style={rankChip(s.clientBestRank)}>{s.clientBestRank ?? '—'}</span></td>
                            <td style={{ color: 'var(--c-8888aa)' }}>{s.pack.find(m => m.isClient && m.position === s.clientBestRank) ? 'You' : (s.packLeader || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {scan.keywords.length > 400 && <div style={{ fontSize: 11, color: 'var(--c-8888aa)', marginTop: 10 }}>Showing 400 of {fmt(scan.keywords.length)} cells.</div>}
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
