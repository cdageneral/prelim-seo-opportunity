'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LLMVisibilitySection from '@/components/brief/LLMVisibilitySection';
import ProfoundVisibilitySection from '@/components/brief/ProfoundVisibilitySection';
import AudienceSegmentsSection from '@/components/brief/AudienceSegmentsSection';
import JourneySection         from '@/components/brief/JourneySection';
import AnalysisRunningState from '@/components/brief/AnalysisRunningState';
import CompetitorsModal     from '@/components/brief/CompetitorsModal';
import KeywordsPanel        from '@/components/brief/KeywordsPanel';
import ThemeClustersPanel, { buildCanonicalClusterTopics, detectIntentSignal, type IntentType } from '@/components/brief/ThemeClustersPanel';
import RefreshModal         from '@/components/brief/RefreshModal';
import EditProjectModal     from '@/components/brief/EditProjectModal';
import GoogleSerpSection    from '@/components/brief/GoogleSerpSection';
import SerpFeaturesSection  from '@/components/brief/SerpFeaturesSection';
import ContentMapSection    from '@/components/brief/ContentMapSection';
import ContentPlanSection   from '@/components/brief/ContentPlanSection';
import ExecutiveSummarySection from '@/components/brief/ExecutiveSummarySection';
import ScopeSection          from '@/components/brief/ScopeSection';
import LocalSearchSection     from '@/components/brief/LocalSearchSection';
import ApiUsageSection        from '@/components/brief/ApiUsageSection';
import { getMarket } from '@/lib/utils/markets';

interface Competitor { id: string; domain: string; name: string | null; createdAt: string; }
interface Analysis {
  id:                  string;
  status:              string;
  triggeredAt:         string;
  completedAt:         string | null;
  marketCaptureRate:   number | null;
  totalCategoryVolume: number | null;
  clientOwnedVolume:   number | null;
  keywordFootprint:    number | null;
  aioAvailable:        number | null;
  aioAcquired:         number | null;
  topCompetitor:       string | null;
  semrushSnapshot:     any;
  serpApiSnapshot:     any;
  profoundSnapshot:    any;
  opportunities:       any[];
  personas:            any[];
}
interface Project {
  id:                       string;
  clientName:               string;
  websiteUrl:               string;
  industry:                 string | null;
  notes:                    string | null;
  status:                   string;
  dataSource:               string;   // 'auto' | 'upload'
  kwVolThresholdClient:     number;
  kwVolThresholdCompetitor: number;
  semrushDatabase?:         string;   // v7.99: per-project market
  brandTerms?:              string[] | null;        // v7.206: client brand vocabulary
  brandTermsUpdatedAt?:     string | null;
  excludedBrands?:          string[] | null;        // v7.208: competitor-brand blocklist
  excludedBrandsUpdatedAt?: string | null;
  analyses:                 Analysis[];
  competitors:              Competitor[];
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavSection =
  | 'overview' | 'viewScope' | 'keywords' | 'audienceSegments' | 'journeys' | 'content' | 'contentPlan'
  | 'serp' | 'serpFeatures'
  | 'llm' | 'aiEngines'
  | 'local'
  | 'authority' | 'entity'
  | 'urlTax' | 'techHygiene'
  | 'usage';

interface NavItem {
  id:    NavSection;
  num:   string;
  icon:  string;
  label: string;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',     num: '01', icon: 'ti-layout-dashboard', label: 'Executive Summary',      group: '' },
  { id: 'keywords',     num: '02', icon: 'ti-search',           label: 'Keyword Landscape',      group: 'Foundation' },
  { id: 'audienceSegments', num: '03', icon: 'ti-users',        label: 'Audience Segments',      group: 'Foundation' },
  { id: 'journeys',     num: '04', icon: 'ti-route',            label: 'Journeys',               group: 'Foundation' },
  { id: 'content',      num: '05', icon: 'ti-map-2',            label: 'Content Map',            group: 'Foundation' },
  { id: 'serp',         num: '06', icon: 'ti-trophy',           label: 'Google Ranks',           group: 'Google Platform' },
  { id: 'serpFeatures', num: '07', icon: 'ti-star',             label: 'SERP Features',          group: 'Google Platform' },
  // v7.319: LLM Visibility nav link hidden for now (Wayne, 2026-06-29). Item commented out so the
  // left-nav link is removed; the 'AI Answer Engines' item below (same group) and all data/rollups
  // are untouched. Reversible — uncomment to restore. The 'llm' section render block stays in place
  // but is simply unreachable while the link is hidden.
  // { id: 'llm',          num: '08', icon: 'ti-robot',            label: 'LLM Visibility',         group: 'LLM Visibility' },
  { id: 'aiEngines',    num: '09', icon: 'ti-chart-bar',        label: 'AI Answer Engines',      group: 'LLM Visibility' },
  { id: 'local',        num: '10', icon: 'ti-map-pin',          label: 'Local Search',           group: 'Local Search' },
  { id: 'authority',    num: '11', icon: 'ti-shield',           label: 'Google Rank Authority',  group: 'Page & Entity Authority' },
  { id: 'entity',       num: '12', icon: 'ti-target',           label: 'LLM Entity Authority',   group: 'Page & Entity Authority' },
  { id: 'urlTax',       num: '13', icon: 'ti-link',             label: 'URL Taxonomy',           group: 'Technical Authority' },
  { id: 'techHygiene',  num: '14', icon: 'ti-tool',             label: 'Tech Hygiene',           group: 'Technical Authority' },
  { id: 'usage',        num: '15', icon: 'ti-receipt',          label: 'API Usage',              group: 'Operations' },
];

const NAV_GROUPS = ['', 'Foundation', 'Google Platform', 'LLM Visibility', 'Local Search', 'Page & Entity Authority', 'Technical Authority', 'Operations'];

// ── Score calculator ──────────────────────────────────────────────────────────

function calcNavScores(analysis: Analysis | null): Partial<Record<NavSection, string>> {
  if (!analysis || analysis.status !== 'completed') return {};

  const captureRate  = analysis.marketCaptureRate;
  const semSnap      = analysis.semrushSnapshot ?? {};
  const posDist      = semSnap.positionDist ?? {};
  const totalKws     = Object.values(posDist as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
  const page1Kws     = ((posDist['1-3'] as number) ?? 0) + ((posDist['4-10'] as number) ?? 0);
  const serpScore    = totalKws > 0 ? (page1Kws / totalKws) * 100 : null;
  const aioAvail     = analysis.aioAvailable ?? 0;
  const aioAcq       = analysis.aioAcquired  ?? 0;
  const llmScore     = (analysis.profoundSnapshot as any)?.overallScore ?? null;

  // Combined SERP feature coverage rate (AIO + PAA + Video)
  const serpSnapForScore = analysis.serpApiSnapshot ?? {};
  const featSumForScore  = serpSnapForScore.serpFeatureSummary;
  const paaAvailScore    = featSumForScore?.withPAA          ?? 0;
  const paaAcqScore      = featSumForScore?.paaClientCited   ?? 0;
  const videoAvailScore  = featSumForScore?.withVideo         ?? 0;
  const videoAcqScore    = featSumForScore?.videoClientCited  ?? 0;
  const totalAvailScore  = aioAvail + paaAvailScore + videoAvailScore;
  const totalAcqScore    = aioAcq   + paaAcqScore   + videoAcqScore;
  const combinedSerpRate = totalAvailScore > 0 ? (totalAcqScore / totalAvailScore) * 100 : null;

  const scores: Partial<Record<NavSection, string>> = {};
  if (captureRate != null) {
    scores.overview  = (captureRate * 100).toFixed(1);
    scores.keywords  = (captureRate * 100).toFixed(1);
  }
  if (serpScore          != null) scores.serp         = serpScore.toFixed(1);
  if (combinedSerpRate   != null) scores.serpFeatures = combinedSerpRate.toFixed(1);
  if (llmScore           != null) scores.llm          = String(llmScore);
  return scores;
}

// ── CSV / XLSX parser (client-side) ──────────────────────────────────────────

// v7.295: quoted-field-aware splitter. A Semrush Positions export quotes any cell that
// contains the delimiter — notably "Trends" ("0.05,0.05,…") AND "SERP Features by Keyword"
// ("Local pack, Reviews, Video, …"). The old `line.split(',')` shattered those cells, which
// (a) silently misaligned every column to the right of "Trends" and (b) is why the SERP-Features
// column never parsed here. Splits on `delimiter` only when NOT inside double-quotes.
function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === delimiter && !inQuote) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(s => s.replace(/\r$/, '').trim().replace(/^"|"$/g, '').trim());
}

function parseCsvText(text: string): { keyword: string; searchVolume: number; position?: number; url?: string; serpFeatures?: string }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const firstLine  = lines[0] ?? '';
  const delimiter  = firstLine.includes(';') ? ';' : ',';
  const headers    = splitDelimitedLine(firstLine, delimiter).map(h => h.toLowerCase());

  return lines.slice(1).map(line => {
    const vals: Record<string, string> = {};
    splitDelimitedLine(line, delimiter).forEach((v, i) => { vals[headers[i] ?? i] = v; });

    // Semrush column aliases: Ph=Keyword, Nq=Volume, Po=Position, Ur=URL, Fl=SERP Features
    const kw  = (vals['keyword'] || vals['ph'] || vals['phrase'] || '').toLowerCase().trim();
    const vol = parseInt(vals['search volume'] || vals['nq'] || vals['volume'] || vals['searches'] || '0') || 0;
    const posRaw = vals['position'] || vals['po'] || '';
    const pos    = posRaw ? parseInt(posRaw) : undefined;
    // v7.253: real ranking/landing URL — the project-page upload parser dropped this
    // column (only KeywordsPanel's parser read it pre-v7.253), so CSV-only projects
    // never persisted a URL. Same header aliases as the KeywordsPanel parser + Semrush 'Ur'.
    // Real data only (Const I.1); blank stays unmapped (honest gap, I.5).
    const rawUrl = (vals['url'] || vals['ur'] || vals['ranking url'] || vals['landing page']
      || vals['page'] || vals['page url'] || vals['address'] || vals['current url'] || vals['target url'] || '').trim();
    const url    = rawUrl ? rawUrl : undefined;
    // v7.295: SERP-Features column — the SOURCE of Local Pack / Local Intent. This project-page
    // (Keyword Landscape) upload parser DROPPED this column entirely — only KeywordsPanel's
    // parser read it — so CSV-uploaded projects never persisted serp_features and the Local
    // Intent card stayed at the live-scan count (e.g. 2) even when the file carried dozens of
    // "Local pack" rows. Same header aliases as the KeywordsPanel parser + Semrush 'Fl'.
    // Real data only (Const I.1); blank stays unmapped (honest gap, I.5).
    const rawFeats = (vals['serp features by keyword'] || vals['serp features'] || vals['serp_features'] || vals['fl'] || '').trim();
    const serpFeatures = rawFeats ? rawFeats : undefined;

    return { keyword: kw, searchVolume: vol, position: pos && !isNaN(pos) ? pos : undefined, url, serpFeatures };
  }).filter(r => r.keyword && r.searchVolume > 0);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectBriefPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params.id as string;

  const [project,          setProject]          = useState<Project | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [triggering,       setTriggering]       = useState(false);
  const [triggeredAt,      setTriggeredAt]      = useState<string | undefined>(undefined);
  const [renaming,         setRenaming]         = useState(false);
  const [newName,          setNewName]          = useState('');
  const [analysisError,    setAnalysisError]    = useState<string | null>(null);
  const [activeSection,    setActiveSection]    = useState<NavSection>('overview');
  const [hoveredNav,       setHoveredNav]       = useState<NavSection | null>(null);
  const [keywordsSubView,  setKeywordsSubView]  = useState<'list' | 'clusters'>('list');

  // Data source state
  const [dataSource,       setDataSource]       = useState<'auto' | 'upload'>('auto');
  const [uploadedDomains,  setUploadedDomains]  = useState<Set<string>>(new Set());
  const [uploadingDomain,  setUploadingDomain]  = useState<string | null>(null);
  const [uploadError,      setUploadError]      = useState<string | null>(null);
  const fileInputRefs      = useRef<Record<string, HTMLInputElement | null>>({});

  // Refresh modal state
  const [showRefreshModal,  setShowRefreshModal]  = useState(false);
  // Edit project modal
  const [showEditProject,   setShowEditProject]   = useState(false);
  const [showCompetitors,   setShowCompetitors]   = useState(false);   // v7.101: global Competitors manager
  const [kwVersion,         setKwVersion]         = useState(0);      // v7.107: bumped when Competitors modal closes -> all panels refetch /keywords

  // ── v7.132: background SERP scan runner (lifted out of KeywordsPanel) ──────
  // The loop lives HERE, in the always-mounted project shell, so it keeps
  // running while Wayne navigates to other panels (tab open). Each batch is a
  // separate request because Vercel caps one function at ~300s; the server
  // saves every batch and excludes already-scanned keywords, so the loop just
  // keeps firing 75-keyword batches until coverage is full (or an error stops
  // it, after which Resume continues from where it left off).
  const [serpScan, setSerpScan] = useState<{
    running: boolean; done: number; total: number; error: string | null;
    results: any[]; confirm: { remaining: number } | null; checking: boolean; complete: boolean;
  }>({ running: false, done: 0, total: 0, error: null, results: [], confirm: null, checking: false, complete: false });
  const serpScanRef = useRef(false);   // guards against double-start across renders

  // v7.86: Semrush cost-estimate confirm + API warning alerts
  const [estimating,       setEstimating]       = useState(false);
  const [costEstimate,     setCostEstimate]     = useState<any | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);

  // Export state
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [pptLoading,  setPptLoading]  = useState(false);
  const [pptPrompt,   setPptPrompt]   = useState<string | null>(null);
  const [pptCopied,   setPptCopied]   = useState(false);

  // v7.138 FIX: the page used to display analyses[0] (newest row) unconditionally.
  // Every analyze run INSERTS a new row, so a failed/interrupted newer run (e.g. a
  // refresh that hit a network error) became analyses[0] with status!=='completed'
  // and MASKED the previously completed results — the project looked empty / fell
  // back to the pre-run screen even though the completed analysis was still in the
  // DB. Display now prefers the most recent COMPLETED analysis, falling back to the
  // newest row only when nothing has completed yet (true first run / in-progress).
  // `latestAnalysis` (newest row, any status) is kept for the resume/checkpoint
  // logic, which must target the interrupted run, not the last good one.
  const latestAnalysis = project?.analyses?.[0] ?? null;
  const analysis   = project?.analyses?.find((a: any) => a.status === 'completed') ?? latestAnalysis;
  const isRunning  = triggering;
  const hasResults = analysis?.status === 'completed';
  const navScores  = calcNavScores(analysis);

  // v7.206: client brand vocabulary. Injected once onto the analysis snapshot as
  // `_brandTerms` so every panel's buildKwPool picks it up via the snapshot fallback
  // (single source of truth — no per-panel threading). Also passed explicitly to
  // the Keyword panel for its CSV-upload / add-keyword branded detection.
  const brandTerms = useMemo<string[]>(
    () => (Array.isArray(project?.brandTerms) ? (project!.brandTerms as string[]) : []),
    [project],
  );
  // v7.208: competitor-brand blocklist. Injected onto the snapshot as `_excludedBrands`
  // the same way, so buildKwPool + filterUniverseExcludedBrands (Cluster, Keyword,
  // Journey, Content plan) all honour it from one source of truth.
  const excludedBrands = useMemo<string[]>(
    () => (Array.isArray(project?.excludedBrands) ? (project!.excludedBrands as string[]) : []),
    [project],
  );
  const analysisForPanels = useMemo(
    () => (analysis
      ? { ...analysis, semrushSnapshot: { ...((analysis as any).semrushSnapshot ?? {}), _brandTerms: brandTerms, _excludedBrands: excludedBrands } }
      : analysis),
    [analysis, brandTerms, excludedBrands],
  );

  // v7.211: build the CANONICAL cluster topics once at the page level and pass them to
  // the Journey, so "Topics in journey" reconciles to the cluster count (one node per
  // cluster). Done here (not inside Journey) because ThemeClustersPanel imports Journey,
  // so Journey can't import the builder back — the page is the cycle-free seam.
  const [pageKeywords, setPageKeywords] = useState<any[]>([]);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => (r.ok ? r.json() : { keywords: [] }))
      .then((d: any) => { if (!cancelled) setPageKeywords(d.keywords ?? []); })
      .catch(() => { if (!cancelled) setPageKeywords([]); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);
  // v7.220: lift the Claude intent-assignment pass to the PAGE so it runs regardless of
  // which tab is open and feeds every canonical view from one map (Const II.7). Before
  // this, only the Cluster panel ran the pass; the Journey/Content canonical builds used
  // an empty map and so under-counted (Journey showed 617 where the Cluster panel showed
  // 2514). Cache-first under the same key the Cluster panel uses, so they never diverge.
  const [pageClaudeAssigns, setPageClaudeAssigns] = useState<Record<string, IntentType>>({});
  useEffect(() => {
    if (!analysisForPanels) return;
    const analysisId = (analysisForPanels as any)?.id ?? 'unknown';
    const cacheKey   = `orbitiq-cluster-assigns-${analysisId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setPageClaudeAssigns(JSON.parse(cached)); return; }
    } catch { /* unavailable */ }
    const snap         = (analysisForPanels as any).semrushSnapshot ?? {};
    const clientDomain = (snap.domain as string) ?? '';
    const industry     = (analysisForPanels as any)?._industry ?? 'General';
    const pool: string[] = [];
    const seen = new Set<string>();
    for (const kw of [...(snap.topKeywords ?? []), ...(snap.gapKeywords ?? [])]) {
      const k = kw?.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) { pool.push(kw.keyword); seen.add(k); }
    }
    if (pool.length === 0) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/clusters`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: pool, industry, domain: clientDomain }),
    })
      .then((r: Response) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!d || cancelled) return;
        const assigns: Record<string, IntentType> = d.assignments ?? {};
        setPageClaudeAssigns(assigns);
        try { localStorage.setItem(cacheKey, JSON.stringify(assigns)); } catch { /* silent */ }
      })
      .catch(() => { /* silent — empty map just means no AI-assisted intents */ });
    return () => { cancelled = true; };
  }, [analysisForPanels, projectId]);

  const journeyCanonicalTopics = useMemo(() => {
    if (!analysisForPanels) return [];
    const clientDomain = ((analysisForPanels as any).semrushSnapshot?.domain as string) ?? '';
    const compDomains = (project?.competitors ?? []).map((c: any) => c.domain);
    try {
      return buildCanonicalClusterTopics(analysisForPanels, clientDomain, compDomains, pageKeywords, pageClaudeAssigns);
    } catch { return []; }
  }, [analysisForPanels, project, pageKeywords, pageClaudeAssigns]);

  const fetchProject = useCallback(async () => {
    const res  = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) { router.push('/dashboard'); return; }
    const data = await res.json();
    setProject(data.project);
    setNewName(data.project.clientName);
    // Initialise data source from saved project preference
    if (data.project.dataSource === 'upload' || data.project.dataSource === 'auto') {
      setDataSource(data.project.dataSource as 'auto' | 'upload');
    }
    setLoading(false);
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // v7.86: Semrush pulls are now UNCAPPED (full footprint). Before any
  // auto-discover run, fetch a cost estimate and require explicit confirmation
  // so unit spend is never a surprise.
  async function requestAnalysisWithEstimate(mode: 'full' | 'gaps' | 'data' = 'full') {
    setShowRefreshModal(false);
    setAnalysisError(null);
    // v7.112: data-only refresh never touches Semrush — skip the cost-estimate
    // modal entirely (there is nothing to bill or confirm).
    // Upload-based projects never hit Semrush; incomplete runs resume without Phase 1.
    // v7.138: resume detection targets the NEWEST row (the interrupted run), not the
    // displayed completed one.
    const incomplete = latestAnalysis && latestAnalysis.status !== 'completed' && latestAnalysis.semrushSnapshot;
    if (mode === 'data' || dataSource !== 'auto' || incomplete) {
      triggerAnalysis(mode);
      return;
    }
    setEstimating(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/semrush-estimate`);
      const data = await res.json();
      if (!res.ok) {
        setAnalysisError(data?.error ?? 'Could not estimate Semrush cost.');
        return;
      }
      setCostEstimate({ ...data, mode });
    } catch {
      setAnalysisError('Could not reach the Semrush estimate endpoint. Check your connection and try again.');
    } finally {
      setEstimating(false);
    }
  }

  async function triggerAnalysis(mode: 'full' | 'gaps' | 'data' = 'full') {
    setTriggering(true);
    setAnalysisError(null);
    setAnalysisWarnings([]);
    setCostEstimate(null);
    setTriggeredAt(new Date().toISOString());
    setShowRefreshModal(false);
    try {
      // ── v7.83: RESUME an interrupted run instead of starting over ──────────
      // If the latest analysis gathered its data (Phase 1) but synthesis never
      // completed (timeout / dropped connection), skip Phase 1 entirely and
      // re-run synthesis on the SAME analysis. Completed synthesis passes are
      // checkpointed server-side, so this resumes where it stopped — no
      // duplicate API spend.
      let analysisId: string;
      const incomplete = latestAnalysis
        && latestAnalysis.status !== 'completed'
        && latestAnalysis.semrushSnapshot;

      if (incomplete) {
        console.log('[OrbitIQ] Resuming interrupted synthesis for', latestAnalysis.id);
        analysisId = latestAnalysis.id;
      } else {
        const res1  = await fetch('/api/analyze', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ projectId, mode }),
        });
        const data1 = await res1.json();
        if (!res1.ok) {
          setAnalysisError(data1?.error ?? 'Data gathering failed. Check your API keys in Vercel → Settings → Environment Variables.');
          return;
        }
        analysisId = data1.analysisId;
        // v7.86: surface non-fatal API problems (failed fetches, partial data
        // from exhausted credits) as a visible amber alert
        if (data1.warnings?.length) setAnalysisWarnings(data1.warnings);
      }

      // ── Phase 2 with automatic resume-retry ────────────────────────────────
      // Synthesis is checkpointed server-side after each pass; if the request
      // dies (Vercel 300s limit, network blip) a retry resumes from the last
      // checkpoint instead of re-running completed passes.
      const MAX_ATTEMPTS = 3;
      let   lastErr      = '';
      let   done         = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
        try {
          const res2  = await fetch('/api/synthesize', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ analysisId }),
          });
          const data2 = await res2.json();
          if (res2.ok) { done = true; break; }
          lastErr = data2?.error ?? 'AI synthesis failed. Check your Anthropic API key and try again.';
        } catch {
          lastErr = 'Synthesis was interrupted (timeout or network drop).';
        }
        if (!done && attempt < MAX_ATTEMPTS) {
          console.log(`[OrbitIQ] Synthesis attempt ${attempt} failed — resuming from checkpoint (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      if (!done) {
        setAnalysisError(`${lastErr} Progress is saved — click Refresh Analysis to resume from where it stopped (completed steps are not re-run and no API credits are re-spent).`);
        await fetchProject();   // pick up any checkpointed partial results
        return;
      }
      await fetchProject();
    } catch {
      setAnalysisError('Analysis failed due to a network error. Progress is saved — click Refresh Analysis to resume from where it stopped.');
    } finally {
      setTriggering(false);
    }
  }

  // ── v7.132: background SERP scan — request (cost check) + auto-batch loop ──
  const SERP_SCAN_BATCH = 75;

  // Step 1: dry-run to learn how many keywords remain, then show the cost
  // confirm modal. 0 SerpAPI credits spent here.
  async function requestSerpScan() {
    if (serpScan.running || serpScan.checking) return;
    setSerpScan(s => ({ ...s, checking: true, error: null, complete: false }));
    try {
      const res  = await fetch(`/api/projects/${projectId}/serp-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ dryRun: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setSerpScan(s => ({ ...s, checking: false, error: data?.error ?? `Could not check remaining keywords (status ${res.status}).` }));
        return;
      }
      const remaining = Number(data.remaining) || 0;
      if (remaining === 0) {
        setSerpScan(s => ({ ...s, checking: false, confirm: null, complete: true, total: 0, done: 0 }));
        return;
      }
      setSerpScan(s => ({ ...s, checking: false, confirm: { remaining } }));
    } catch {
      setSerpScan(s => ({ ...s, checking: false, error: 'Could not check remaining keywords — network error.' }));
    }
  }

  // Step 2: the auto-batch loop. Confirms the modal, then fires 75-keyword
  // batches back-to-back until the server reports 0 remaining (or an error).
  // Accumulated results flow to the panels live; no reload needed.
  async function runSerpScan(knownTotal?: number) {
    if (serpScanRef.current) return;       // already looping
    serpScanRef.current = true;
    const total = knownTotal ?? serpScan.confirm?.remaining ?? 0;
    setSerpScan(s => ({ ...s, running: true, error: null, confirm: null, complete: false, done: 0, total }));
    let done = 0;
    try {
      for (;;) {
        const res  = await fetch(`/api/projects/${projectId}/serp-scan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ batchSize: SERP_SCAN_BATCH }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          setSerpScan(s => ({ ...s, running: false, error: data?.error ?? `The server returned an unexpected ${res.status} response (likely a timeout). Every completed batch is saved — click Resume to continue from where it stopped.` }));
          return;
        }
        const batch: any[] = data.results ?? [];
        done += data.scanned ?? 0;
        if (batch.length) {
          setSerpScan(s => {
            const lo = new Set(batch.map(r => (r.keyword ?? '').toLowerCase()));
            return { ...s, results: [...s.results.filter(k => !lo.has((k.keyword ?? '').toLowerCase())), ...batch], done };
          });
        } else {
          setSerpScan(s => ({ ...s, done }));
        }
        // Other panels read scanned data from the analysis snapshot or their own
        // /keywords fetch; bump kwVersion so they pick up the server-saved batch.
        setKwVersion(v => v + 1);
        if (!data.remaining || !data.scanned) break;
      }
      setSerpScan(s => ({ ...s, running: false, complete: true }));
    } catch (e: any) {
      setSerpScan(s => ({ ...s, running: false, error: `${String(e?.message ?? e)} — every completed batch is saved; click Resume to continue.` }));
    } finally {
      serpScanRef.current = false;
    }
  }

  // ── File upload handler ───────────────────────────────────────────────────

  async function handleFileUpload(file: File, domain: string) {
    setUploadingDomain(domain);
    setUploadError(null);
    try {
      const text     = await file.text();
      const keywords = parseCsvText(text);

      if (keywords.length === 0) {
        setUploadError(`No valid keywords found in ${file.name}. Expected columns: keyword, search_volume`);
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain, source: 'csv', keywords }),
      });

      if (!res.ok) {
        const d = await res.json();
        setUploadError(d?.error ?? 'Upload failed');
        return;
      }

      const { inserted } = await res.json();
      if (inserted === 0) {
        setUploadError(`All keywords in ${file.name} were already uploaded for this domain.`);
        return;
      }

      setUploadedDomains(prev => new Set([...Array.from(prev), domain]));
    } catch (err) {
      setUploadError('Upload failed — check file format and try again.');
    } finally {
      setUploadingDomain(null);
    }
  }

  // ── Rename / delete ───────────────────────────────────────────────────────

  async function saveRename() {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === project?.clientName) { setRenaming(false); return; }
    await fetch(`/api/projects/${projectId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientName: trimmed }),
    });
    setProject(p => p ? { ...p, clientName: trimmed } : p);
    setRenaming(false);
  }

  async function deleteProject() {
    if (!confirm(`Delete "${project?.clientName}"? This cannot be undone.`)) return;
    await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    router.push('/dashboard');
  }

  // ── Export functions ──────────────────────────────────────────────────────

  async function generatePDF() {
    if (!analysis) return;
    setPdfLoading(true);
    try {
      const res  = await fetch('/api/reports/pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId: analysis.id }),
      });
      const data = await res.json();
      if (res.ok && data.fileUrl) window.open(data.fileUrl, '_blank');
    } finally {
      setPdfLoading(false);
    }
  }

  async function generatePPTPrompt() {
    if (!analysis) return;
    setPptLoading(true);
    try {
      const res  = await fetch('/api/reports/ppt-prompt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId: analysis.id }),
      });
      const data = await res.json();
      if (res.ok && data.promptText) setPptPrompt(data.promptText);
    } finally {
      setPptLoading(false);
    }
  }

  function copyPptPrompt() {
    if (!pptPrompt) return;
    navigator.clipboard.writeText(pptPrompt);
    setPptCopied(true);
    setTimeout(() => setPptCopied(false), 2500);
  }

  if (loading) return (
    <div className="min-h-screen bg-orbit-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return null;

  const domainDisplay     = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '');
  const competitorDomains = (project.competitors ?? []).map(c => c.domain);

  const scanDate = analysis?.completedAt
    ? (() => {
        const d = new Date(analysis.completedAt);
        return `${d.toISOString().slice(0, 10)} · ${d.toISOString().slice(11, 16)} UTC`;
      })()
    : null;

  // ── Nav item style helper ─────────────────────────────────────────────────

  function navItemStyles(item: NavItem) {
    const active   = activeSection === item.id;
    const hovered  = hoveredNav === item.id && !active;
    const hasData  = navScores[item.id] != null;

    return {
      btn: {
        padding:    '7px 12px',
        borderLeft: active   ? '2px solid var(--c-6c63ff)'
                  : hovered  ? '2px solid var(--ca-108-99-255-0_45)'
                  :             '2px solid transparent',
        background: active   ? 'var(--c-14141f)'
                  : hovered  ? 'var(--c-11111e)'
                  :             'transparent',
        transition: 'background 0.12s, border-left-color 0.12s',
      } as React.CSSProperties,
      icon: {
        fontSize: '14px', width: '15px', flexShrink: 0,
        color: active  ? 'var(--c-8b85ff)'
             : hovered ? 'var(--c-6a65c0)'
             : hasData ? 'var(--c-5858a0)'
             :            'var(--c-484878)',
        transition: 'color 0.12s',
      } as React.CSSProperties,
      label: {
        flex: 1, fontSize: '13px', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        color: active  ? 'var(--c-e0e0ff)'
             : hovered ? 'var(--c-8080c0)'
             : hasData ? 'var(--c-7878b0)'
             :            'var(--c-606090)',
        transition: 'color 0.12s',
      } as React.CSSProperties,
      score: {
        fontSize: '11px', fontWeight: 500,
        fontVariantNumeric: 'tabular-nums' as const,
        color: active  ? 'var(--c-6c63ff)'
             : hovered ? 'var(--c-6060b8)'
             : hasData ? 'var(--c-6060a0)'
             :            'var(--c-484870)',
        transition: 'color 0.12s',
      } as React.CSSProperties,
    };
  }

  return (
    <div className="h-screen bg-orbit-bg flex flex-col overflow-hidden">

      {/* ── Rename modal ── */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRenaming(false)} />
          <div className="relative orbit-card orbit-glow w-full max-w-sm p-6 animate-fade-in">
            <h3 className="text-orbit-primary font-semibold mb-4">Rename Project</h3>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-full bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2.5 text-orbit-primary text-sm focus:outline-none focus:border-orbit-accent transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenaming(false)} className="flex-1 border border-orbit-border text-orbit-secondary text-sm py-2 rounded-lg hover:text-orbit-primary transition-colors">
                Cancel
              </button>
              <button onClick={saveRename} className="flex-1 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm py-2 rounded-lg transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Project modal ── */}
      {showEditProject && project && (
        <EditProjectModal
          projectId={projectId}
          clientName={project.clientName}
          websiteUrl={project.websiteUrl}
          industry={project.industry}
          notes={project.notes}
          dataSource={project.dataSource as 'auto' | 'upload'}
          semrushDatabase={(project as any).semrushDatabase ?? 'us'}
          onClose={() => setShowEditProject(false)}
          onSaved={fetchProject}
        />
      )}

      {/* ── Competitors manager (v7.101 — moved to global nav) ── */}
      {showCompetitors && project && (
        <CompetitorsModal
          projectId={projectId}
          competitors={project.competitors ?? []}
          kwVolThresholdClient={project.kwVolThresholdClient ?? 0}
          kwVolThresholdCompetitor={project.kwVolThresholdCompetitor ?? 0}
          brandTerms={project.brandTerms ?? []}
          brandTermsUpdatedAt={project.brandTermsUpdatedAt ?? null}
          excludedBrands={project.excludedBrands ?? []}
          excludedBrandsUpdatedAt={project.excludedBrandsUpdatedAt ?? null}
          onClose={() => { setShowCompetitors(false); setKwVersion(v => v + 1); }}
          onChanged={fetchProject}
        />
      )}

      {/* ── Refresh modal ── */}
      {showRefreshModal && analysis && (
        <RefreshModal
          clientName={project.clientName}
          lastAnalyzed={analysis.completedAt}
          keywordsCount={
            (analysis.semrushSnapshot?.topKeywords?.length ?? 0) +
            (analysis.semrushSnapshot?.gapKeywords?.length ?? 0)
          }
          onClose={() => setShowRefreshModal(false)}
          onRun={mode => requestAnalysisWithEstimate(mode)}
          clientThreshold={project.kwVolThresholdClient ?? 0}
          competitorThreshold={project.kwVolThresholdCompetitor ?? 0}
          onSaveThresholds={async (client, competitor) => {
            // v7.98: single source of truth — same PATCH as Edit Project, so the
            // estimate endpoint (which reads the project row) sees the new floors.
            await fetch(`/api/projects/${projectId}`, {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ kwVolThresholdClient: client, kwVolThresholdCompetitor: competitor }),
            });
            setProject(p => p ? { ...p, kwVolThresholdClient: client, kwVolThresholdCompetitor: competitor } : p);
          }}
        />
      )}

      {/* ── PPT Prompt modal ── */}
      {pptPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPptPrompt(null)} />
          <div className="relative orbit-card orbit-glow w-full max-w-2xl p-6 animate-fade-in flex flex-col gap-4 max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-orbit-accent text-sm font-semibold">Claude PPTX Skill Prompt — Ready to Paste</p>
                <p className="text-orbit-tertiary text-xs mt-0.5">
                  Type <code className="bg-orbit-muted px-1 py-0.5 rounded text-orbit-accent">/pptx</code> in Claude, then paste this prompt to generate the deck.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyPptPrompt}
                  className="flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors"
                  style={pptCopied ? { color: 'var(--c-4ade80)', borderColor: 'var(--ca-74-222-128-0_4)' } : { color: 'var(--c-8080b0)', borderColor: 'var(--c-2a2a4a)' }}
                >
                  {pptCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Prompt
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPptPrompt(null)}
                  className="text-orbit-secondary hover:text-orbit-primary border border-orbit-border px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            {/* Prompt text */}
            <pre className="flex-1 overflow-y-auto text-orbit-secondary text-xs leading-relaxed whitespace-pre-wrap font-mono bg-orbit-bg rounded-lg p-4 border border-orbit-border min-h-0">
              {pptPrompt}
            </pre>
          </div>
        </div>
      )}

      {/* ════ GLOBAL HEADER ════ */}
      <header className="flex-shrink-0 h-14 border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm flex items-center justify-between px-5 z-40">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-orbit-secondary hover:text-orbit-primary transition-colors flex items-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <span className="text-orbit-border text-sm select-none">/</span>
          <span className="text-sm font-bold gradient-text">OrbitIQ</span>
          <span className="text-orbit-border text-sm select-none">/</span>
          <span className="text-orbit-primary text-sm font-medium">{project.clientName}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* v7.185: global dark/light theme toggle */}
          <ThemeToggle />
          {/* v7.225: global Dashboard button — cross-project API usage */}
          <Link
            href="/usage"
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
          >
            <i className="ti ti-gauge" aria-hidden="true" />
            Dashboard
          </Link>
          <button
            onClick={() => setShowEditProject(true)}
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Edit Project
          </button>
          {/* ── Competitors manager (v7.101) ── */}
          <button
            onClick={() => setShowCompetitors(true)}
            className="text-xs border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            style={{ color: 'var(--c-f59e0b)', borderColor: 'var(--ca-245-158-11-0_35)' }}
            title="Manage competitors: add / edit / delete, upload keyword CSVs, clear files, set volume thresholds"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 10-3-3" />
            </svg>
            Competitors
            {(project.competitors?.length ?? 0) > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--ca-245-158-11-0_12)', border: '1px solid var(--ca-245-158-11-0_3)', borderRadius: '10px', padding: '1px 6px' }}>
                {project.competitors!.length}
              </span>
            )}
          </button>
          {/* ── Export buttons — visible once analysis is complete ── */}
          {hasResults && analysis && (
            <>
              <div className="w-px h-5 bg-orbit-border mx-1" />
              <button
                onClick={generatePDF}
                disabled={pdfLoading}
                title="Export PDF Brief"
                className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {pdfLoading ? 'Generating…' : 'PDF'}
              </button>
              <button
                onClick={generatePPTPrompt}
                disabled={pptLoading}
                title="Generate PowerPoint Prompt"
                className="text-xs text-orbit-accent hover:text-orbit-accent-light border border-orbit-accent/30 hover:border-orbit-accent/50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {pptLoading ? 'Generating…' : 'PPT Prompt'}
              </button>
              <div className="w-px h-5 bg-orbit-border mx-1" />
            </>
          )}

          <button
            onClick={() => {
              if (hasResults) {
                setShowRefreshModal(true);
              } else {
                requestAnalysisWithEstimate('full');
              }
            }}
            disabled={isRunning}
            className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRunning ? 'Running...' : hasResults ? 'Refresh Analysis' : 'Run Analysis'}
          </button>
          <button
            onClick={deleteProject}
            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-1.5 rounded-lg transition-all"
          >
            Delete
          </button>
        </div>
      </header>

      {/* ── v7.132: GLOBAL SERP SCAN BAR — visible on every panel ──────────────
          Lives in the always-mounted shell, so the auto-batch loop keeps running
          and stays visible while Wayne navigates between panels (tab open). */}
      {(serpScan.running || serpScan.error || serpScan.complete) && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b"
          style={{
            borderColor: 'var(--c-1a1a30)',
            background:  serpScan.error ? 'var(--ca-239-68-68-0_06)' : serpScan.complete ? 'var(--ca-52-211-153-0_06)' : 'var(--c-0a0a16)',
          }}
        >
          {serpScan.running ? (
            <svg className="animate-spin shrink-0" style={{ width: 13, height: 13, color: 'var(--c-8b85ff)' }} fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : serpScan.error ? (
            <span style={{ color: 'var(--c-f87171)', fontSize: 13 }}>⚠</span>
          ) : (
            <span style={{ color: 'var(--c-34d399)', fontSize: 13 }}>✓</span>
          )}

          <span className="text-[11px] font-medium" style={{ color: serpScan.error ? 'var(--c-f87171)' : serpScan.complete ? 'var(--c-34d399)' : 'var(--c-c4c0ff)' }}>
            {serpScan.error
              ? 'SERP scan paused'
              : serpScan.complete
                ? `SERP scan complete — ${serpScan.done.toLocaleString()} keyword${serpScan.done !== 1 ? 's' : ''} scanned`
                : `Scanning SERP features… ${serpScan.done.toLocaleString()} of ${serpScan.total.toLocaleString()}`}
          </span>

          {serpScan.running && (
            <>
              <div style={{ width: 140, height: 4, borderRadius: 2, background: 'var(--c-14142a)', overflow: 'hidden' }}>
                <div style={{
                  width: serpScan.total > 0 ? `${Math.min((serpScan.done / serpScan.total) * 100, 100)}%` : '0%',
                  height: '100%', background: 'var(--c-6c63ff)', borderRadius: 2, transition: 'width 0.4s ease',
                }} />
              </div>
              <span className="text-[10px]" style={{ color: 'var(--c-55557a)' }}>
                ~{Math.max(serpScan.total - serpScan.done, 0).toLocaleString()} credits left · keeps running while you browse — keep this tab open
              </span>
            </>
          )}

          {serpScan.error && (
            <>
              <span className="text-[10px]" style={{ color: 'var(--c-a36a6a)' }}>{serpScan.error}</span>
              <button
                onClick={() => runSerpScan(Math.max(serpScan.total - serpScan.done, 0) || undefined)}
                className="text-[10px] px-3 py-0.5 rounded-full border ml-1 transition-colors"
                style={{ borderColor: 'var(--ca-108-99-255-0_5)', color: 'var(--c-9b96ff)', background: 'var(--ca-108-99-255-0_08)' }}
              >
                Resume
              </button>
            </>
          )}

          {(serpScan.error || serpScan.complete) && (
            <button
              onClick={() => setSerpScan(s => ({ ...s, error: null, complete: false }))}
              className="ml-auto text-[10px] transition-colors"
              style={{ color: 'var(--c-55557a)' }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── v7.132: SERP scan cost-confirm modal ── */}
      {(serpScan.confirm || serpScan.checking) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--ca-0-0-0-0_65)' }}>
          <div className="rounded-xl p-6" style={{ background: 'var(--c-0d0d18)', border: '1px solid var(--c-2a2a45)', width: 420, maxWidth: '90vw' }}>
            {serpScan.checking ? (
              <div className="flex items-center gap-3">
                <svg className="animate-spin" style={{ width: 16, height: 16, color: 'var(--c-8b85ff)' }} fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--c-a0a0c8)' }}>Checking how many keywords remain…</span>
              </div>
            ) : serpScan.confirm && (
              <>
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--c-e8e8ff)' }}>Scan all remaining SERP features</p>
                <p className="text-xs mb-3" style={{ color: 'var(--c-7070a0)' }}>
                  This will scan every unscanned keyword automatically, in batches of {SERP_SCAN_BATCH}, until coverage is full. Each keyword uses 1 SerpAPI search credit. Already-scanned keywords are never re-scanned.
                </p>
                <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--c-0a0a14)', border: '1px solid var(--c-1e1e30)' }}>
                  <div className="flex justify-between text-xs py-0.5">
                    <span style={{ color: 'var(--c-a0a0c8)' }}>Keywords remaining</span>
                    <span style={{ color: 'var(--c-d0d0f0)' }}>{serpScan.confirm.remaining.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-2 mt-1.5" style={{ borderTop: '1px solid var(--c-1e1e30)' }}>
                    <span className="font-medium" style={{ color: 'var(--c-e8e8ff)' }}>Maximum cost</span>
                    <span className="font-medium" style={{ color: 'var(--c-f59e0b)' }}>up to {serpScan.confirm.remaining.toLocaleString()} SerpAPI credits</span>
                  </div>
                </div>
                <p className="text-[11px] mb-4" style={{ color: 'var(--c-55557a)' }}>
                  The scan keeps running while you browse other panels — just keep this tab open. If it stops early, every completed batch is saved and you can resume.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSerpScan(s => ({ ...s, confirm: null }))}
                    className="text-xs px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => runSerpScan(serpScan.confirm?.remaining)}
                    className="text-xs font-medium px-4 py-2 rounded-lg text-white transition-colors"
                    style={{ background: 'var(--c-6c63ff)' }}
                  >
                    Scan all {serpScan.confirm.remaining.toLocaleString()} · ~{serpScan.confirm.remaining.toLocaleString()} credits
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ BODY ════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── SIDEBAR ── */}
        <aside
          className="flex-shrink-0 border-r border-orbit-border flex flex-col"
          style={{ width: '252px', background: 'var(--c-0d0d16)' }}
        >
          <div className="px-3 py-3 border-b border-orbit-border">
            <div className="text-orbit-primary text-[12px] font-semibold truncate">{domainDisplay}</div>
            {project.industry && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--c-5858a0)' }}>{project.industry}</div>
            )}
            {scanDate && (
              <div className="text-[9px] mt-1.5" style={{ color: 'var(--c-383858)' }}>SCAN: {scanDate}</div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-1.5">
            {NAV_GROUPS.map(group => {
              const items = NAV_ITEMS.filter(i => i.group === group);
              return (
                <div key={group} className="mb-0.5">
                  {group && (
                    <div className="text-[10px] font-semibold tracking-[.08em] uppercase px-3 pt-3 pb-1" style={{ color: 'var(--c-4a4a72)' }}>
                      {group}
                    </div>
                  )}
                  {items.map(item => {
                    const styles = navItemStyles(item);
                    const isActiveItem = activeSection === item.id;
                    return (
                      <div key={item.id}>
                        <button
                          onClick={() => setActiveSection(item.id)}
                          onMouseEnter={() => setHoveredNav(item.id)}
                          onMouseLeave={() => setHoveredNav(null)}
                          className="w-full flex items-center gap-1.5 text-left"
                          style={styles.btn}
                        >
                          <span style={{ fontSize: '10px', color: 'var(--c-505078)', width: '15px', flexShrink: 0 }}>
                            {item.num}
                          </span>
                          <i className={`ti ${item.icon}`} style={styles.icon} aria-hidden="true" />
                          <span style={styles.label}>{item.label}</span>
                        </button>

                        {/* ── Executive Summary sub-nav (v7.267): Executive summary + View scope ── */}
                        {item.id === 'overview' && hasResults && (
                          <div style={{ background: 'var(--c-060610)', borderTop: '1px solid var(--c-0e0e1e)' }}>
                            {([['overview', 'Executive summary', 'ti-layout-dashboard'], ['viewScope', 'View scope', 'ti-clipboard-list']] as const).map(([sid, label, icon]) => {
                              const subActive = activeSection === sid;
                              return (
                                <button
                                  key={sid}
                                  onClick={e => { e.stopPropagation(); setActiveSection(sid as NavSection); }}
                                  className="w-full flex items-center gap-1.5 text-left"
                                  style={{
                                    padding: '6px 12px 6px 32px',
                                    borderLeft: subActive ? '2px solid var(--ca-108-99-255-0_6)' : '2px solid transparent',
                                    background: subActive ? 'var(--c-0f0f1c)' : 'transparent',
                                  }}
                                >
                                  <i className={`ti ${icon}`} style={{ fontSize: '12px', color: subActive ? 'var(--c-6c63ff)' : 'var(--c-545490)', width: '14px', flexShrink: 0 }} aria-hidden="true" />
                                  <span style={{ fontSize: '12px', color: subActive ? 'var(--c-a0a0d8)' : 'var(--c-6868a8)' }}>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Keywords sub-nav (v7.172: always expanded, not gated on active) ── */}
                        {item.id === 'keywords' && hasResults && (
                          <div style={{ background: 'var(--c-060610)', borderTop: '1px solid var(--c-0e0e1e)' }}>
                            {(['list', 'clusters'] as const).map(sv => {
                              // v7.172: only highlight a sub-item when the Keyword panel is the
                              // active section — otherwise the row stays expanded but unhighlighted.
                              const subActive = isActiveItem && keywordsSubView === sv;
                              const subLabels = { list: 'Keyword list', clusters: 'Theme clusters' };
                              const subIcons  = { list: 'ti-list', clusters: 'ti-hierarchy-2' };
                              return (
                                <button
                                  key={sv}
                                  onClick={e => { e.stopPropagation(); setActiveSection('keywords'); setKeywordsSubView(sv); }}
                                  className="w-full flex items-center gap-1.5 text-left"
                                  style={{
                                    padding: '6px 12px 6px 32px',
                                    borderLeft: subActive ? '2px solid var(--ca-108-99-255-0_6)' : '2px solid transparent',
                                    background: subActive ? 'var(--c-0f0f1c)' : 'transparent',
                                  }}
                                >
                                  <i
                                    className={`ti ${subIcons[sv]}`}
                                    style={{ fontSize: '12px', color: subActive ? 'var(--c-6c63ff)' : 'var(--c-545490)', width: '14px', flexShrink: 0 }}
                                    aria-hidden="true"
                                  />
                                  <span style={{ fontSize: '12px', color: subActive ? 'var(--c-a0a0d8)' : 'var(--c-6868a8)' }}>
                                    {subLabels[sv]}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Content sub-nav (v7.176): Content map + Content plan ── */}
                        {item.id === 'content' && hasResults && (
                          <div style={{ background: 'var(--c-060610)', borderTop: '1px solid var(--c-0e0e1e)' }}>
                            {([['content', 'Content map', 'ti-map-2'], ['contentPlan', 'Content plan', 'ti-list-check']] as const).map(([sid, label, icon]) => {
                              const subActive = activeSection === sid;
                              return (
                                <button
                                  key={sid}
                                  onClick={e => { e.stopPropagation(); setActiveSection(sid as NavSection); }}
                                  className="w-full flex items-center gap-1.5 text-left"
                                  style={{
                                    padding: '6px 12px 6px 32px',
                                    borderLeft: subActive ? '2px solid var(--ca-108-99-255-0_6)' : '2px solid transparent',
                                    background: subActive ? 'var(--c-0f0f1c)' : 'transparent',
                                  }}
                                >
                                  <i className={`ti ${icon}`} style={{ fontSize: '12px', color: subActive ? 'var(--c-6c63ff)' : 'var(--c-545490)', width: '14px', flexShrink: 0 }} aria-hidden="true" />
                                  <span style={{ fontSize: '12px', color: subActive ? 'var(--c-a0a0d8)' : 'var(--c-6868a8)' }}>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-orbit-border px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--c-22c55e)', flexShrink: 0 }} />
              <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '.07em', color: 'var(--c-22c55e)' }}>SYS:OPERATIONAL</span>
            </div>
            <button
              className="w-full flex items-center gap-1.5 rounded-md text-[9px] transition-colors mt-1.5"
              style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1c1c2e)', color: 'var(--c-383858)', padding: '5px 9px' }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', border: '1px solid var(--c-3a3aaa)', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>ORBIT MAP</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 overflow-hidden flex flex-col">

          {/* ── API warning banner (v7.86) — non-fatal data problems ── */}
          {analysisWarnings.length > 0 && (
            <div className="flex-shrink-0 m-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-amber-400 text-sm font-medium">Data warning{analysisWarnings.length > 1 ? 's' : ''} — analysis completed with issues</p>
                {analysisWarnings.map((w, i) => (
                  <p key={i} className="text-amber-300/80 text-xs mt-1">{w}</p>
                ))}
              </div>
              <button onClick={() => setAnalysisWarnings([])} className="text-amber-400/60 hover:text-amber-400 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Semrush cost-estimate confirm (v7.86) — uncapped pulls ── */}
          {(costEstimate || estimating) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--ca-0-0-0-0_65)' }}>
              <div className="rounded-xl p-6" style={{ background: 'var(--c-0d0d18)', border: '1px solid var(--c-2a2a45)', width: 440, maxWidth: '90vw' }}>
                {estimating ? (
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin" style={{ width: 16, height: 16, color: 'var(--c-8b85ff)' }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--c-a0a0c8)' }}>Estimating Semrush API unit cost…</span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--c-e8e8ff)' }}>
                      Confirm Semrush pull
                      {costEstimate.database && (
                        <span className="ml-2 text-[10px] font-normal px-2 py-0.5 rounded-full" style={{ background: 'var(--c-1a1a38)', color: 'var(--c-8b85ff)', border: '1px solid var(--c-2a2a4a)' }}>
                          {getMarket(costEstimate.database).flag} {getMarket(costEstimate.database).label} database
                        </span>
                      )}
                    </p>
                    <p className="text-xs mb-3" style={{ color: 'var(--c-7070a0)' }}>
                      Full-footprint analysis fetches every keyword Semrush has for each domain in this market. Semrush bills 10 API units per keyword row.
                    </p>
                    <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--c-0a0a14)', border: '1px solid var(--c-1e1e30)' }}>
                      <div className="flex justify-between text-xs py-0.5">
                        <span style={{ color: 'var(--c-a0a0c8)' }}>{costEstimate.client.domain} <span style={{ color: 'var(--c-8b85ff)' }}>client</span></span>
                        <span style={{ color: 'var(--c-d0d0f0)' }}>{costEstimate.client.keywords.toLocaleString()} keywords</span>
                      </div>
                      {costEstimate.competitors.map((c: any) => (
                        <div key={c.domain} className="flex justify-between text-xs py-0.5">
                          <span style={{ color: 'var(--c-7070a0)' }}>{c.domain}</span>
                          <span style={{ color: 'var(--c-9090b8)' }}>{c.keywords.toLocaleString()} keywords</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs pt-2 mt-1.5" style={{ borderTop: '1px solid var(--c-1e1e30)' }}>
                        <span className="font-medium" style={{ color: 'var(--c-e8e8ff)' }}>
                          {costEstimate.isCeiling ? 'Maximum cost' : 'Estimated cost'}
                        </span>
                        <span className="font-medium" style={{ color: 'var(--c-f59e0b)' }}>
                          {costEstimate.isCeiling ? 'up to ' : '~'}{costEstimate.totalUnits.toLocaleString()} API units ({costEstimate.totalRows.toLocaleString()} rows)
                        </span>
                      </div>
                      {costEstimate.isCeiling && (
                        <p className="text-[11px] pt-2" style={{ color: 'var(--c-4ade80)', margin: 0 }}>
                          Volume floor active{costEstimate.clientVolMin > 0 ? ` — client ≥ ${costEstimate.clientVolMin.toLocaleString()}/mo` : ''}{costEstimate.competitorVolMin > 0 ? ` — competitors ≥ ${costEstimate.competitorVolMin.toLocaleString()}/mo` : ''}. Keyword counts above are full footprints; rows below the floor are excluded inside the Semrush query and never billed, so actual cost will be lower.
                        </p>
                      )}
                    </div>
                    <p className="text-[11px] mb-4" style={{ color: 'var(--c-55557a)' }}>
                      If your unit balance runs out mid-pull, Semrush returns partial data and you&apos;ll see a warning banner. Check your balance under Subscription info → API units at semrush.com.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCostEstimate(null)}
                        className="text-xs px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => triggerAnalysis(costEstimate.mode)}
                        className="text-xs font-medium px-4 py-2 rounded-lg text-white transition-colors"
                        style={{ background: 'var(--c-6c63ff)' }}
                      >
                        Run analysis (~{costEstimate.totalUnits.toLocaleString()} units)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error banner */}
          {analysisError && (
            <div className="flex-shrink-0 m-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-400 text-sm font-medium">Analysis failed</p>
                <p className="text-red-300/80 text-xs mt-0.5">{analysisError}</p>
              </div>
              <button onClick={() => setAnalysisError(null)} className="text-red-400/60 hover:text-red-400 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Running */}
          {isRunning && (
            <div className="flex-shrink-0 p-4">
              <AnalysisRunningState
                clientName={project.clientName}
                triggeredAt={triggeredAt}
                hasError={!!analysisError}
              />
            </div>
          )}

          {/* No results yet. v7.234: after a full reset (no analysis) this pre-run
              data-source screen is the proper "start over" landing — pick Auto-discover
              or Upload footprints, then Run Analysis, and every panel rebuilds. */}
          {!isRunning && !hasResults && (
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">

              {/* ── Data Source Card ── */}
              <DataSourceCard
                clientDomain={domainDisplay}
                competitors={project.competitors ?? []}
                dataSource={dataSource}
                onSelectSource={setDataSource}
                uploadedDomains={uploadedDomains}
                uploadingDomain={uploadingDomain}
                uploadError={uploadError}
                fileInputRefs={fileInputRefs}
                onFileSelect={handleFileUpload}
                onRun={() => requestAnalysisWithEstimate('full')}
              />
            </div>
          )}

          {/* ── Keyword Landscape — list or clusters sub-view ── */}
          {hasResults && analysis && activeSection === 'keywords' && keywordsSubView === 'list' && (
            <KeywordsPanel
              kwVersion={kwVersion}
              onKeywordsChanged={() => setKwVersion(v => v + 1)}   // v7.108: client kw changes refresh all panels
              onCleared={() => {                                   // v7.234: full reset done → refetch the now-empty project; hasResults flips false so the pre-run data-source/Run screen shows
                setKwVersion(v => v + 1);
                fetchProject();
              }}
              projectId={projectId}
              analysis={analysisForPanels}
              competitors={competitorDomains}
              brandTerms={brandTerms}
              domain={domainDisplay}
              defaultClientThreshold={project.kwVolThresholdClient ?? 0}
              defaultCompetitorThreshold={project.kwVolThresholdCompetitor ?? 0}
              serpScanResults={serpScan.results}                 // v7.132: live results from the global background scan
              serpScanRunning={serpScan.running || serpScan.checking}
              serpScanProgress={serpScan.running ? { done: serpScan.done, total: serpScan.total } : null}
              onStartSerpScan={requestSerpScan}                  // v7.132: button delegates to the page-level auto-batch loop
              onOpenCompetitors={() => setShowCompetitors(true)}                 // v7.241: workflow button 2 → Competitors modal
              onDeepJourneyBuilt={() => { fetchProject(); setKwVersion(v => v + 1); }}  // v7.241: workflow buttons 3 & 4 → refetch analysis so new demand backfills everywhere
            />
          )}
          {hasResults && analysis && activeSection === 'keywords' && keywordsSubView === 'clusters' && (
            <ThemeClustersPanel
              kwVersion={kwVersion}
              projectId={projectId}
              analysis={analysisForPanels}
              competitors={competitorDomains}
              defaultClientThreshold={project.kwVolThresholdClient ?? 0}
              defaultCompetitorThreshold={project.kwVolThresholdCompetitor ?? 0}
              claudeAssigns={pageClaudeAssigns}
            />
          )}

          {/* ── Executive Summary — Layout B ── */}
          {hasResults && analysis && activeSection === 'overview' && (
            <ExecutiveSummarySection
              kwVersion={kwVersion}
              analysis={analysisForPanels}
              projectId={projectId}
              projectName={project.clientName}
              clientDomain={domainDisplay}
              manualDomains={competitorDomains}
              defaultClientThreshold={project.kwVolThresholdClient ?? 0}
              defaultCompetitorThreshold={project.kwVolThresholdCompetitor ?? 0}
              claudeAssigns={pageClaudeAssigns}
            />
          )}

          {/* ── View Scope (v7.267 sub-nav under Executive Summary) ── */}
          {hasResults && analysis && activeSection === 'viewScope' && (
            <ScopeSection
              kwVersion={kwVersion}
              projectId={projectId}
              analysis={analysisForPanels}
              competitors={competitorDomains}
              claudeAssigns={pageClaudeAssigns}
            />
          )}

          {/* ── Content Map ── */}
          {hasResults && analysis && activeSection === 'content' && (
            <ContentMapSection
              kwVersion={kwVersion}
              projectId={projectId}
              analysis={analysisForPanels}
              competitors={competitorDomains}
              claudeAssigns={pageClaudeAssigns}
            />
          )}

          {/* ── Content Plan (v7.176 sub-nav) ── */}
          {hasResults && analysis && activeSection === 'contentPlan' && (
            <ContentPlanSection
              kwVersion={kwVersion}
              projectId={projectId}
              analysis={analysisForPanels}
              competitors={competitorDomains}
              claudeAssigns={pageClaudeAssigns}
            />
          )}

          {/* ── Google SERP ── */}
          {hasResults && analysis && activeSection === 'serp' && (
            <GoogleSerpSection
              kwVersion={kwVersion}
              analysis={analysisForPanels}
              projectId={projectId}
              projectName={project.clientName}
              domain={domainDisplay}
              competitors={competitorDomains}
              defaultClientThreshold={project.kwVolThresholdClient ?? 0}
              defaultCompetitorThreshold={project.kwVolThresholdCompetitor ?? 0}
            />
          )}

          {/* ── SERP Features ── */}
          {hasResults && analysis && activeSection === 'serpFeatures' && (
            <SerpFeaturesSection
              kwVersion={kwVersion}
              analysis={analysisForPanels}
              competitors={project.competitors}
              clientName={project.clientName}
              websiteUrl={project.websiteUrl}
              projectId={project.id}
              externalScanned={serpScan.results}                 // v7.132: global background scan results merge in live
              serpScanRunning={serpScan.running || serpScan.checking}   // v7.287: SERP scan CTA moved into this panel
              serpScanProgress={serpScan.running ? { done: serpScan.done, total: serpScan.total } : null}
              onStartSerpScan={requestSerpScan}
            />
          )}

          {/* ── LLM Visibility ── */}
          {hasResults && analysis && activeSection === 'llm' && (
            <div className="overflow-y-auto flex-1 p-3 animate-fade-in">
              <LLMVisibilitySection analysis={analysisForPanels} />
            </div>
          )}

          {/* ── AI Answer Engines (Profound uploads) — v7.294 ──
               Upload-driven, so it renders independent of analysis results (like API Usage). */}
          {activeSection === 'aiEngines' && (
            <div className="overflow-y-auto flex-1 min-h-0 p-3 animate-fade-in">
              <ProfoundVisibilitySection projectId={projectId} clientName={project?.clientName} />
            </div>
          )}

          {/* ── Audience Segments ── */}
          {hasResults && analysis && activeSection === 'audienceSegments' && (
            <div className="overflow-y-auto flex-1 p-3 animate-fade-in">
              <AudienceSegmentsSection analysis={analysisForPanels} />
            </div>
          )}

          {/* ── Journeys ── */}
          {hasResults && analysis && activeSection === 'journeys' && (
            <div className="overflow-y-auto flex-1 p-3 animate-fade-in">
              <JourneySection
              kwVersion={kwVersion}
                projectId={projectId}
                analysis={analysisForPanels}
                competitors={competitorDomains}
                canonicalTopics={journeyCanonicalTopics}
                onDeepJourneyBuilt={() => { fetchProject(); setKwVersion(v => v + 1); }}
              />
            </div>
          )}

          {/* ── Local Search ── */}
          {hasResults && analysis && activeSection === 'local' && (
            <LocalSearchSection
              kwVersion={kwVersion}
              projectId={projectId}
              analysis={analysisForPanels}
              projectName={project.clientName}
              domain={domainDisplay}
              competitors={project.competitors}
            />
          )}

          {/* ── API Usage (v7.225) — independent of analysis: spend exists from the first call ── */}
          {activeSection === 'usage' && (
            <div className="overflow-y-auto flex-1 min-h-0 p-3 animate-fade-in">
              <ApiUsageSection projectId={projectId} />
            </div>
          )}

          {/* ── Coming soon sections ── */}
          {hasResults && analysis && activeSection !== 'overview' && activeSection !== 'viewScope' && activeSection !== 'keywords' && activeSection !== 'audienceSegments' && activeSection !== 'journeys' && activeSection !== 'content' && activeSection !== 'contentPlan' && activeSection !== 'serp' && activeSection !== 'serpFeatures' && activeSection !== 'llm' && activeSection !== 'aiEngines' && activeSection !== 'local' && activeSection !== 'usage' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-orbit-accent opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-orbit-secondary text-sm font-medium">Coming soon</p>
                <p className="text-orbit-tertiary text-xs mt-1">This section is under development</p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

// ── Data Source Card ──────────────────────────────────────────────────────────

interface DataSourceCardProps {
  clientDomain:    string;
  competitors:     { id: string; domain: string; name: string | null }[];
  dataSource:      'auto' | 'upload';
  onSelectSource:  (s: 'auto' | 'upload') => void;
  uploadedDomains: Set<string>;
  uploadingDomain: string | null;
  uploadError:     string | null;
  fileInputRefs:   React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onFileSelect:    (file: File, domain: string) => void;
  onRun:           () => void;
}

function DataSourceCard({
  clientDomain, competitors, dataSource, onSelectSource,
  uploadedDomains, uploadingDomain, uploadError, fileInputRefs, onFileSelect, onRun,
}: DataSourceCardProps) {
  // All domains that need uploads: client + each competitor
  const allDomains = [clientDomain, ...competitors.map(c => c.domain)];
  const allUploaded = dataSource === 'upload' && allDomains.every(d => uploadedDomains.has(d));
  const someUploaded = dataSource === 'upload' && uploadedDomains.size > 0;

  const cardStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'left', cursor: 'pointer',
    background: selected ? 'var(--c-14142c)' : 'var(--c-0f0f1e)',
    border: `1.5px solid ${selected ? 'var(--c-6c63ff)' : 'var(--c-1e1e35)'}`,
    borderRadius: '10px', padding: '16px',
    transition: 'border-color .15s, background .15s',
  });

  function triggerFileInput(domain: string) {
    fileInputRefs.current[domain]?.click();
  }

  return (
    <div className="orbit-card p-5">
      <p className="text-orbit-secondary text-xs mb-3 font-medium">How should OrbitIQ source keyword footprint data?</p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>

        {/* Auto-discover */}
        <button style={cardStyle(dataSource === 'auto')} onClick={() => onSelectSource('auto')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <i className="ti ti-antenna" style={{ fontSize: '18px', color: dataSource === 'auto' ? 'var(--c-7b68ee)' : 'var(--c-404060)' }} aria-hidden="true" />
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 500, background: 'var(--c-2b0d0d)', color: 'var(--c-f87171)' }}>cost shown before run</span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 4px' }}>Auto-discover</p>
          <p style={{ fontSize: '11px', color: 'var(--c-707090)', margin: '0 0 6px', lineHeight: 1.5 }}>
            Semrush crawls the client and all competitors automatically on run.
          </p>
          <p style={{ fontSize: '10px', color: 'var(--c-404060)', margin: 0 }}>Current behavior</p>
        </button>

        {/* Upload footprints */}
        <button style={cardStyle(dataSource === 'upload')} onClick={() => onSelectSource('upload')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <i className="ti ti-upload" style={{ fontSize: '18px', color: dataSource === 'upload' ? 'var(--c-00c9b1)' : 'var(--c-404060)' }} aria-hidden="true" />
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 500, background: 'var(--c-0d2b1d)', color: 'var(--c-4ade80)' }}>0 units</span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 4px' }}>Upload footprints</p>
          <p style={{ fontSize: '11px', color: 'var(--c-707090)', margin: '0 0 6px', lineHeight: 1.5 }}>
            Import CSV keyword exports. Semrush skipped — saves ~2,000 units on creation.
          </p>
          <p style={{ fontSize: '10px', color: 'var(--c-404060)', margin: 0 }}>SerpAPI still runs for live SERP features</p>
        </button>

      </div>

      {/* Auto-discover info panel */}
      {dataSource === 'auto' && (
        <div style={{ background: 'var(--c-0f0f1e)', border: '0.5px solid var(--c-1e1e35)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <i className="ti ti-info-circle" style={{ fontSize: '13px', color: 'var(--c-6c63ff)' }} aria-hidden="true" />
            <span style={{ fontSize: '11px', color: 'var(--c-8080b0)', fontWeight: 500 }}>Semrush will fetch the FULL keyword footprint for the client + up to 5 competitor domains (10 API units per keyword row — exact cost estimate shown before the run starts)</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <DomainPill domain={clientDomain} label="client" />
            {competitors.map(c => <DomainPill key={c.id} domain={c.domain} />)}
            {competitors.length === 0 && (
              <span style={{ fontSize: '10px', color: 'var(--c-404060)' }}>Add competitors above to include their footprints</span>
            )}
          </div>
        </div>
      )}

      {/* Upload zones */}
      {dataSource === 'upload' && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--c-707090)', marginBottom: '10px' }}>
            Upload a CSV per domain. Required columns:{' '}
            <code style={{ color: 'var(--c-8080c0)', fontSize: '10px', background: 'var(--c-1a1a30)', padding: '1px 5px', borderRadius: '3px' }}>keyword, search_volume</code>
            {' '}· optional:{' '}
            <code style={{ color: 'var(--c-8080c0)', fontSize: '10px', background: 'var(--c-1a1a30)', padding: '1px 5px', borderRadius: '3px' }}>position</code>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <UploadZone
              domain={clientDomain}
              label="client"
              uploaded={uploadedDomains.has(clientDomain)}
              uploading={uploadingDomain === clientDomain}
              onTrigger={() => triggerFileInput(clientDomain)}
              inputRef={el => { fileInputRefs.current[clientDomain] = el; }}
              onFileChange={f => onFileSelect(f, clientDomain)}
            />
            {competitors.map(c => (
              <UploadZone
                key={c.id}
                domain={c.domain}
                uploaded={uploadedDomains.has(c.domain)}
                uploading={uploadingDomain === c.domain}
                onTrigger={() => triggerFileInput(c.domain)}
                inputRef={el => { fileInputRefs.current[c.domain] = el; }}
                onFileChange={f => onFileSelect(f, c.domain)}
              />
            ))}
            {competitors.length === 0 && (
              <p style={{ fontSize: '10px', color: 'var(--c-404060)', margin: '4px 0 0' }}>
                <i className="ti ti-info-circle" style={{ fontSize: '11px', marginRight: '4px' }} aria-hidden="true" />
                Add competitors above to include their keyword footprints in the upload
              </p>
            )}
          </div>
          {uploadError && (
            <p style={{ fontSize: '11px', color: 'var(--c-f87171)', marginTop: '8px' }}>{uploadError}</p>
          )}
        </div>
      )}

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={dataSource === 'upload' && !someUploaded}
        className="w-full bg-orbit-accent hover:bg-orbit-accent-light text-white font-medium py-2.5 rounded-lg transition-colors text-sm disabled:opacity-40"
      >
        {dataSource === 'upload' && !someUploaded
          ? 'Upload at least one keyword file to continue'
          : 'Run Organic Intelligence Analysis'}
      </button>
    </div>
  );
}

// ── Upload zone sub-component ─────────────────────────────────────────────────

interface UploadZoneProps {
  domain:    string;
  label?:    string;
  uploaded:  boolean;
  uploading: boolean;
  onTrigger: () => void;
  inputRef:  (el: HTMLInputElement | null) => void;
  onFileChange: (file: File) => void;
}

function UploadZone({ domain, label, uploaded, uploading, onTrigger, inputRef, onFileChange }: UploadZoneProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Domain label */}
      <div style={{ width: '140px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', color: 'var(--c-c0c0d8)' }}>{domain}</span>
        {label && (
          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '10px', background: 'var(--c-2a2a5a)', color: 'var(--c-9090c0)', marginLeft: '5px' }}>{label}</span>
        )}
      </div>

      {/* Drop zone */}
      <button
        onClick={onTrigger}
        disabled={uploading}
        style={{
          flex: 1, cursor: uploading ? 'wait' : 'pointer',
          background: uploaded ? 'var(--c-071a10)' : 'var(--c-0f0f1e)',
          border: `1.5px ${uploaded ? 'solid var(--c-22c55e)' : 'dashed var(--c-2a2a4a)'}`,
          borderRadius: '7px', padding: '10px 14px', textAlign: 'center',
          transition: 'border-color .15s',
        }}
      >
        {uploading ? (
          <span style={{ fontSize: '11px', color: 'var(--c-707090)' }}>Uploading…</span>
        ) : uploaded ? (
          <span style={{ fontSize: '11px', color: 'var(--c-4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <i className="ti ti-circle-check" style={{ fontSize: '13px' }} aria-hidden="true" /> Uploaded
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--c-505070)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <i className="ti ti-file-text" style={{ fontSize: '13px' }} aria-hidden="true" /> Click to upload · CSV
          </span>
        )}
      </button>

      {/* Hidden file input */}
      <input
        type="file"
        accept=".csv,.txt"
        style={{ display: 'none' }}
        ref={inputRef}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFileChange(file);
          e.target.value = '';   // reset so same file can be re-selected
        }}
      />
    </div>
  );
}

// ── Domain pill helper ────────────────────────────────────────────────────────

function DomainPill({ domain, label }: { domain: string; label?: string }) {
  return (
    <span style={{ fontSize: '10px', background: 'var(--c-1a1a30)', border: '0.5px solid var(--c-2a2a50)', borderRadius: '5px', padding: '3px 8px', color: 'var(--c-b0b0d0)' }}>
      {domain}
      {label && <span style={{ color: 'var(--c-6c63ff)', marginLeft: '4px', fontSize: '9px' }}>{label}</span>}
    </span>
  );
}
