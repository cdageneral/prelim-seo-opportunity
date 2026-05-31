'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MarketGapSection     from '@/components/brief/MarketGapSection';
import CompetitorGapSection from '@/components/brief/CompetitorGapSection';
import LLMVisibilitySection from '@/components/brief/LLMVisibilitySection';
import FootprintSection     from '@/components/brief/FootprintSection';
import OpportunitiesSection from '@/components/brief/OpportunitiesSection';
import PersonasSection      from '@/components/brief/PersonasSection';
import AnalysisRunningState from '@/components/brief/AnalysisRunningState';
import ReportsPanel         from '@/components/brief/ReportsPanel';
import CompetitorsPanel     from '@/components/brief/CompetitorsPanel';
import KeywordsPanel        from '@/components/brief/KeywordsPanel';
import ThemeClustersPanel   from '@/components/brief/ThemeClustersPanel';
import RefreshModal         from '@/components/brief/RefreshModal';
import GoogleSerpSection    from '@/components/brief/GoogleSerpSection';
import SerpFeaturesSection  from '@/components/brief/SerpFeaturesSection';

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
  id:          string;
  clientName:  string;
  websiteUrl:  string;
  industry:    string | null;
  status:      string;
  dataSource:  string;   // 'auto' | 'upload'
  analyses:    Analysis[];
  competitors: Competitor[];
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavSection =
  | 'overview' | 'keywords' | 'serp' | 'serpFeatures' | 'authority'
  | 'llm' | 'entity' | 'local' | 'urlTax' | 'techHygiene';

interface NavItem {
  id:    NavSection;
  num:   string;
  icon:  string;
  label: string;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',     num: '01', icon: 'ti-layout-dashboard', label: 'Executive Overview', group: '' },
  { id: 'keywords',     num: '02', icon: 'ti-search',           label: 'Keyword Landscape',  group: 'Search' },
  { id: 'serp',         num: '03', icon: 'ti-trophy',           label: 'Google SERP',        group: 'Search' },
  { id: 'serpFeatures', num: '04', icon: 'ti-star',             label: 'SERP Features',      group: 'Search' },
  { id: 'authority',    num: '05', icon: 'ti-shield',           label: 'Google Authority',   group: 'Search' },
  { id: 'llm',          num: '06', icon: 'ti-robot',            label: 'LLM Visibility',     group: 'AI Visibility' },
  { id: 'entity',       num: '07', icon: 'ti-target',           label: 'Entity Authority',   group: 'Entity & Local' },
  { id: 'local',        num: '08', icon: 'ti-map-pin',          label: 'Local Presence',     group: 'Entity & Local' },
  { id: 'urlTax',       num: '09', icon: 'ti-link',             label: 'URL Taxonomy',       group: 'Technical' },
  { id: 'techHygiene',  num: '10', icon: 'ti-tool',             label: 'Tech Hygiene',       group: 'Technical' },
];

const NAV_GROUPS = ['', 'Search', 'AI Visibility', 'Entity & Local', 'Technical'];

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

function parseCsvText(text: string): { keyword: string; searchVolume: number; position?: number }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const firstLine  = lines[0] ?? '';
  const delimiter  = firstLine.includes(';') ? ';' : ',';
  const headers    = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());

  return lines.slice(1).map(line => {
    const vals: Record<string, string> = {};
    line.split(delimiter).forEach((v, i) => { vals[headers[i] ?? i] = v.trim().replace(/"/g, ''); });

    // Semrush column aliases: Ph=Keyword, Nq=Volume, Po=Position
    const kw  = (vals['keyword'] || vals['ph'] || vals['phrase'] || '').toLowerCase().trim();
    const vol = parseInt(vals['search volume'] || vals['nq'] || vals['volume'] || vals['searches'] || '0') || 0;
    const posRaw = vals['position'] || vals['po'] || '';
    const pos    = posRaw ? parseInt(posRaw) : undefined;

    return { keyword: kw, searchVolume: vol, position: pos && !isNaN(pos) ? pos : undefined };
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
  const [showRefreshModal, setShowRefreshModal] = useState(false);

  const analysis   = project?.analyses?.[0] ?? null;
  const isRunning  = triggering;
  const hasResults = analysis?.status === 'completed';
  const navScores  = calcNavScores(analysis);

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

  async function triggerAnalysis(mode: 'full' | 'gaps' = 'full') {
    setTriggering(true);
    setAnalysisError(null);
    setTriggeredAt(new Date().toISOString());
    setShowRefreshModal(false);
    try {
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
      const res2  = await fetch('/api/synthesize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId: data1.analysisId }),
      });
      const data2 = await res2.json();
      if (!res2.ok) {
        setAnalysisError(data2?.error ?? 'AI synthesis failed. Check your Anthropic API key and try again.');
        return;
      }
      await fetchProject();
    } catch {
      setAnalysisError('Analysis failed due to a network error. Please check your connection and try again.');
    } finally {
      setTriggering(false);
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
        borderLeft: active   ? '2px solid #6C63FF'
                  : hovered  ? '2px solid rgba(108,99,255,0.45)'
                  :             '2px solid transparent',
        background: active   ? '#14141F'
                  : hovered  ? '#11111E'
                  :             'transparent',
        transition: 'background 0.12s, border-left-color 0.12s',
      } as React.CSSProperties,
      icon: {
        fontSize: '14px', width: '15px', flexShrink: 0,
        color: active  ? '#8B85FF'
             : hovered ? '#6A65C0'
             : hasData ? '#5858A0'
             :            '#484878',
        transition: 'color 0.12s',
      } as React.CSSProperties,
      label: {
        flex: 1, fontSize: '13px', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        color: active  ? '#E0E0FF'
             : hovered ? '#8080C0'
             : hasData ? '#7878B0'
             :            '#606090',
        transition: 'color 0.12s',
      } as React.CSSProperties,
      score: {
        fontSize: '11px', fontWeight: 500,
        fontVariantNumeric: 'tabular-nums' as const,
        color: active  ? '#6C63FF'
             : hovered ? '#6060B8'
             : hasData ? '#6060A0'
             :            '#484870',
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
          onRun={mode => triggerAnalysis(mode)}
        />
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
          <button
            onClick={() => setRenaming(true)}
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all"
          >
            Rename
          </button>
          <button
            onClick={() => {
              if (hasResults) {
                setShowRefreshModal(true);
              } else {
                triggerAnalysis('full');
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

      {/* ════ BODY ════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── SIDEBAR ── */}
        <aside
          className="flex-shrink-0 border-r border-orbit-border flex flex-col"
          style={{ width: '252px', background: '#0D0D16' }}
        >
          <div className="px-3 py-3 border-b border-orbit-border">
            <div className="text-orbit-primary text-[12px] font-semibold truncate">{domainDisplay}</div>
            {project.industry && (
              <div className="text-[11px] mt-0.5" style={{ color: '#5858A0' }}>{project.industry}</div>
            )}
            {scanDate && (
              <div className="text-[9px] mt-1.5" style={{ color: '#383858' }}>SCAN: {scanDate}</div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-1.5">
            {NAV_GROUPS.map(group => {
              const items = NAV_ITEMS.filter(i => i.group === group);
              return (
                <div key={group} className="mb-0.5">
                  {group && (
                    <div className="text-[10px] font-semibold tracking-[.08em] uppercase px-3 pt-3 pb-1" style={{ color: '#4A4A72' }}>
                      {group}
                    </div>
                  )}
                  {items.map(item => {
                    const score  = navScores[item.id];
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
                          <span style={{ fontSize: '10px', color: '#505078', width: '15px', flexShrink: 0 }}>
                            {item.num}
                          </span>
                          <i className={`ti ${item.icon}`} style={styles.icon} aria-hidden="true" />
                          <span style={styles.label}>{item.label}</span>
                          <span style={styles.score}>{score ?? '—'}</span>
                          <span style={{ width: '4px', height: '4px', borderRadius: '50%', flexShrink: 0, background: score != null ? '#22C55E' : '#1E1E30' }} />
                        </button>

                        {/* ── Keywords sub-nav ── */}
                        {item.id === 'keywords' && isActiveItem && hasResults && (
                          <div style={{ background: '#060610', borderTop: '1px solid #0E0E1E' }}>
                            {(['list', 'clusters'] as const).map(sv => {
                              const subActive = keywordsSubView === sv;
                              const subLabels = { list: 'Keyword list', clusters: 'Theme clusters' };
                              const subIcons  = { list: 'ti-list', clusters: 'ti-hierarchy-2' };
                              return (
                                <button
                                  key={sv}
                                  onClick={e => { e.stopPropagation(); setKeywordsSubView(sv); }}
                                  className="w-full flex items-center gap-1.5 text-left"
                                  style={{
                                    padding: '6px 12px 6px 32px',
                                    borderLeft: subActive ? '2px solid rgba(108,99,255,0.6)' : '2px solid transparent',
                                    background: subActive ? '#0F0F1C' : 'transparent',
                                  }}
                                >
                                  <i
                                    className={`ti ${subIcons[sv]}`}
                                    style={{ fontSize: '12px', color: subActive ? '#6C63FF' : '#545490', width: '14px', flexShrink: 0 }}
                                    aria-hidden="true"
                                  />
                                  <span style={{ fontSize: '12px', color: subActive ? '#A0A0D8' : '#6868A8' }}>
                                    {subLabels[sv]}
                                  </span>
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
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
              <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '.07em', color: '#22C55E' }}>SYS:OPERATIONAL</span>
            </div>
            <button
              className="w-full flex items-center gap-1.5 rounded-md text-[9px] transition-colors mt-1.5"
              style={{ background: '#111120', border: '1px solid #1C1C2E', color: '#383858', padding: '5px 9px' }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', border: '1px solid #3A3AAA', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>ORBIT MAP</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 overflow-hidden flex flex-col">

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

          {/* No results yet */}
          {!isRunning && !hasResults && (
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4">
              <CompetitorsPanel
                projectId={projectId}
                competitors={project.competitors ?? []}
                onChange={fetchProject}
              />

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
                onRun={() => triggerAnalysis('full')}
              />
            </div>
          )}

          {/* ── Keyword Landscape — list or clusters sub-view ── */}
          {hasResults && analysis && activeSection === 'keywords' && keywordsSubView === 'list' && (
            <KeywordsPanel
              projectId={projectId}
              analysis={analysis}
              competitors={competitorDomains}
            />
          )}
          {hasResults && analysis && activeSection === 'keywords' && keywordsSubView === 'clusters' && (
            <ThemeClustersPanel
              projectId={projectId}
              analysis={analysis}
              competitors={competitorDomains}
            />
          )}

          {/* ── Executive Overview — 2×2 grid ── */}
          {hasResults && analysis && activeSection === 'overview' && (
            <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">
              <CompetitorsPanel
                projectId={projectId}
                competitors={project.competitors ?? []}
                onChange={fetchProject}
              />
              <div className="grid grid-cols-2 gap-3">
                <MarketGapSection analysis={analysis} />
                <CompetitorGapSection
                  analysis={analysis}
                  manualDomains={competitorDomains}
                />
                <FootprintSection     analysis={analysis} />
                <LLMVisibilitySection analysis={analysis} />
              </div>
              <OpportunitiesSection analysis={analysis} />
              <PersonasSection      analysis={analysis} />
              <ReportsPanel
                analysisId={analysis.id}
                projectId={project.id}
                clientName={project.clientName}
              />
            </div>
          )}

          {/* ── Google SERP ── */}
          {hasResults && analysis && activeSection === 'serp' && (
            <GoogleSerpSection analysis={analysis} />
          )}

          {/* ── SERP Features ── */}
          {hasResults && analysis && activeSection === 'serpFeatures' && (
            <SerpFeaturesSection
              analysis={analysis}
              competitors={project.competitors}
              clientName={project.clientName}
              websiteUrl={project.websiteUrl}
            />
          )}

          {/* ── Coming soon sections ── */}
          {hasResults && analysis && activeSection !== 'overview' && activeSection !== 'keywords' && activeSection !== 'serp' && activeSection !== 'serpFeatures' && (
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
    background: selected ? '#14142C' : '#0F0F1E',
    border: `1.5px solid ${selected ? '#6C63FF' : '#1E1E35'}`,
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
            <i className="ti ti-antenna" style={{ fontSize: '18px', color: dataSource === 'auto' ? '#7B68EE' : '#404060' }} aria-hidden="true" />
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 500, background: '#2B0D0D', color: '#F87171' }}>~2,400 units</span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 4px' }}>Auto-discover</p>
          <p style={{ fontSize: '11px', color: '#707090', margin: '0 0 6px', lineHeight: 1.5 }}>
            Semrush crawls the client and all competitors automatically on run.
          </p>
          <p style={{ fontSize: '10px', color: '#404060', margin: 0 }}>Current behavior</p>
        </button>

        {/* Upload footprints */}
        <button style={cardStyle(dataSource === 'upload')} onClick={() => onSelectSource('upload')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <i className="ti ti-upload" style={{ fontSize: '18px', color: dataSource === 'upload' ? '#00C9B1' : '#404060' }} aria-hidden="true" />
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 500, background: '#0D2B1D', color: '#4ADE80' }}>0 units</span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 4px' }}>Upload footprints</p>
          <p style={{ fontSize: '11px', color: '#707090', margin: '0 0 6px', lineHeight: 1.5 }}>
            Import CSV keyword exports. Semrush skipped — saves ~2,000 units on creation.
          </p>
          <p style={{ fontSize: '10px', color: '#404060', margin: 0 }}>SerpAPI still runs for live SERP features</p>
        </button>

      </div>

      {/* Auto-discover info panel */}
      {dataSource === 'auto' && (
        <div style={{ background: '#0F0F1E', border: '0.5px solid #1E1E35', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <i className="ti ti-info-circle" style={{ fontSize: '13px', color: '#6C63FF' }} aria-hidden="true" />
            <span style={{ fontSize: '11px', color: '#8080B0', fontWeight: 500 }}>Semrush will fetch top 40 keywords for each domain</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <DomainPill domain={clientDomain} label="client" />
            {competitors.map(c => <DomainPill key={c.id} domain={c.domain} />)}
            {competitors.length === 0 && (
              <span style={{ fontSize: '10px', color: '#404060' }}>Add competitors above to include their footprints</span>
            )}
          </div>
        </div>
      )}

      {/* Upload zones */}
      {dataSource === 'upload' && (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '11px', color: '#707090', marginBottom: '10px' }}>
            Upload a CSV per domain. Required columns:{' '}
            <code style={{ color: '#8080C0', fontSize: '10px', background: '#1A1A30', padding: '1px 5px', borderRadius: '3px' }}>keyword, search_volume</code>
            {' '}· optional:{' '}
            <code style={{ color: '#8080C0', fontSize: '10px', background: '#1A1A30', padding: '1px 5px', borderRadius: '3px' }}>position</code>
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
              <p style={{ fontSize: '10px', color: '#404060', margin: '4px 0 0' }}>
                <i className="ti ti-info-circle" style={{ fontSize: '11px', marginRight: '4px' }} aria-hidden="true" />
                Add competitors above to include their keyword footprints in the upload
              </p>
            )}
          </div>
          {uploadError && (
            <p style={{ fontSize: '11px', color: '#F87171', marginTop: '8px' }}>{uploadError}</p>
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
        <span style={{ fontSize: '11px', color: '#C0C0D8' }}>{domain}</span>
        {label && (
          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '10px', background: '#2A2A5A', color: '#9090C0', marginLeft: '5px' }}>{label}</span>
        )}
      </div>

      {/* Drop zone */}
      <button
        onClick={onTrigger}
        disabled={uploading}
        style={{
          flex: 1, cursor: uploading ? 'wait' : 'pointer',
          background: uploaded ? '#071A10' : '#0F0F1E',
          border: `1.5px ${uploaded ? 'solid #22C55E' : 'dashed #2A2A4A'}`,
          borderRadius: '7px', padding: '10px 14px', textAlign: 'center',
          transition: 'border-color .15s',
        }}
      >
        {uploading ? (
          <span style={{ fontSize: '11px', color: '#707090' }}>Uploading…</span>
        ) : uploaded ? (
          <span style={{ fontSize: '11px', color: '#4ADE80', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <i className="ti ti-circle-check" style={{ fontSize: '13px' }} aria-hidden="true" /> Uploaded
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: '#505070', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
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
    <span style={{ fontSize: '10px', background: '#1A1A30', border: '0.5px solid #2A2A50', borderRadius: '5px', padding: '3px 8px', color: '#B0B0D0' }}>
      {domain}
      {label && <span style={{ color: '#6C63FF', marginLeft: '4px', fontSize: '9px' }}>{label}</span>}
    </span>
  );
}
