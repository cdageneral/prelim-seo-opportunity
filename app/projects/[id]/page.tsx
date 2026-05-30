'use client';

import { useEffect, useState, useCallback } from 'react';
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
import KeywordsModal        from '@/components/brief/KeywordsModal';

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
  const aioRate      = aioAvail > 0 ? (aioAcq / aioAvail) * 100 : null;
  const llmScore     = (analysis.profoundSnapshot as any)?.overallScore ?? null;

  const scores: Partial<Record<NavSection, string>> = {};
  if (captureRate != null) {
    scores.overview  = (captureRate * 100).toFixed(1);
    scores.keywords  = (captureRate * 100).toFixed(1);
  }
  if (serpScore    != null) scores.serp         = serpScore.toFixed(1);
  if (aioRate      != null) scores.serpFeatures = aioRate.toFixed(1);
  if (llmScore     != null) scores.llm          = String(llmScore);
  return scores;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectBriefPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params.id as string;

  const [project,       setProject]       = useState<Project | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [triggering,    setTriggering]    = useState(false);
  const [triggeredAt,   setTriggeredAt]   = useState<string | undefined>(undefined);
  const [renaming,      setRenaming]      = useState(false);
  const [newName,       setNewName]       = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [showKeywords,  setShowKeywords]  = useState(false);

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
    setLoading(false);
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  async function triggerAnalysis() {
    setTriggering(true);
    setAnalysisError(null);
    setTriggeredAt(new Date().toISOString());
    try {
      const res1  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
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

  function handleNavClick(item: NavItem) {
    if (item.id === 'keywords') {
      if (hasResults) setShowKeywords(true);
      return;
    }
    setActiveSection(item.id);
  }

  if (loading) return (
    <div className="min-h-screen bg-orbit-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return null;

  const domainDisplay = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '');

  const scanDate = analysis?.completedAt
    ? (() => {
        const d = new Date(analysis.completedAt);
        const date = d.toISOString().slice(0, 10);
        const time = d.toISOString().slice(11, 16);
        return `${date} · ${time} UTC`;
      })()
    : null;

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

      {/* ── Keywords modal ── */}
      {showKeywords && analysis && (
        <KeywordsModal analysis={analysis} onClose={() => setShowKeywords(false)} />
      )}

      {/* ════ GLOBAL HEADER ════ */}
      <header className="flex-shrink-0 h-14 border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm flex items-center justify-between px-5 z-40">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-orbit-secondary hover:text-orbit-primary transition-colors flex items-center"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <span className="text-orbit-border text-sm select-none">/</span>
          <span className="text-sm font-bold gradient-text">OrbitIQ</span>
          <span className="text-orbit-border text-sm select-none">/</span>
          <span className="text-orbit-primary text-sm font-medium">{project.clientName}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRenaming(true)}
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all"
          >
            Rename
          </button>
          <button
            onClick={triggerAnalysis}
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
          style={{ width: '214px', background: '#0D0D16' }}
        >
          {/* Client identity */}
          <div className="px-3 py-3 border-b border-orbit-border">
            <div className="text-orbit-primary text-[11px] font-semibold truncate">{domainDisplay}</div>
            {project.industry && (
              <div className="text-orbit-tertiary text-[10px] mt-0.5">{project.industry}</div>
            )}
            {scanDate && (
              <div className="text-[9px] mt-1.5" style={{ color: '#242438' }}>SCAN: {scanDate}</div>
            )}
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-1.5">
            {NAV_GROUPS.map(group => {
              const items = NAV_ITEMS.filter(i => i.group === group);
              return (
                <div key={group} className="mb-0.5">
                  {group && (
                    <div
                      className="text-[8px] font-semibold tracking-[.1em] uppercase px-3 pt-2 pb-1"
                      style={{ color: '#242438' }}
                    >
                      {group}
                    </div>
                  )}
                  {items.map(item => {
                    const score   = navScores[item.id];
                    const hasData = score != null;
                    const active  = activeSection === item.id && item.id !== 'keywords';
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item)}
                        className="w-full flex items-center gap-1.5 px-3 text-left transition-colors"
                        style={{
                          padding:    '5px 12px',
                          borderLeft: active ? '2px solid #6C63FF' : '2px solid transparent',
                          background: active ? '#14141F' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#111122'; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <span style={{ fontSize: '9px', color: '#2C2C44', width: '13px', flexShrink: 0 }}>
                          {item.num}
                        </span>
                        <i
                          className={`ti ${item.icon}`}
                          style={{ fontSize: '12px', width: '13px', flexShrink: 0, color: active ? '#8B85FF' : hasData ? '#3A3A60' : '#282840' }}
                          aria-hidden="true"
                        />
                        <span
                          style={{ flex: 1, fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? '#D8D8F8' : hasData ? '#505078' : '#343450' }}
                        >
                          {item.label}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: active ? '#6C63FF' : hasData ? '#484868' : '#232336' }}>
                          {score ?? '—'}
                        </span>
                        <span
                          style={{ width: '4px', height: '4px', borderRadius: '50%', flexShrink: 0, background: hasData ? '#22C55E' : '#1E1E30' }}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-orbit-border px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
              <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '.07em', color: '#22C55E' }}>
                SYS:OPERATIONAL
              </span>
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
        <main className="flex-1 overflow-y-auto">

          {/* Error banner */}
          {analysisError && (
            <div className="m-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
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
            <div className="p-4">
              <AnalysisRunningState
                clientName={project.clientName}
                triggeredAt={triggeredAt}
                hasError={!!analysisError}
              />
            </div>
          )}

          {/* No results yet */}
          {!isRunning && !hasResults && (
            <div className="p-4 flex flex-col gap-4">
              <CompetitorsPanel
                projectId={projectId}
                competitors={project.competitors ?? []}
                onChange={fetchProject}
              />
              <NoAnalysisState clientName={project.clientName} onRun={triggerAnalysis} />
            </div>
          )}

          {/* Executive Overview — 2×2 grid */}
          {hasResults && analysis && activeSection === 'overview' && (
            <div className="p-3 flex flex-col gap-3 animate-fade-in">
              <CompetitorsPanel
                projectId={projectId}
                competitors={project.competitors ?? []}
                onChange={fetchProject}
              />
              <div className="grid grid-cols-2 gap-3">
                <MarketGapSection analysis={analysis} />
                <CompetitorGapSection
                  analysis={analysis}
                  manualDomains={(project.competitors ?? []).map(c => c.domain)}
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

          {/* Sections not yet built */}
          {hasResults && analysis && activeSection !== 'overview' && activeSection !== 'keywords' && (
            <div className="flex items-center justify-center" style={{ height: '60%' }}>
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

// ── No Analysis State ─────────────────────────────────────────────────────────

function NoAnalysisState({ clientName, onRun }: { clientName: string; onRun: () => void }) {
  return (
    <div className="orbit-card p-12 flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-orbit-accent/10 border border-orbit-accent/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div>
        <h3 className="text-orbit-primary text-xl font-semibold">Ready to analyze {clientName}</h3>
        <p className="text-orbit-secondary text-sm mt-2 max-w-md">
          Add competitors above, then run the analysis. OrbitIQ will query Semrush, SerpAPI, and probe live LLMs to synthesize a CMO-level brief.
        </p>
      </div>
      <button
        onClick={onRun}
        className="bg-orbit-accent hover:bg-orbit-accent-light text-white font-medium px-8 py-3 rounded-lg transition-colors text-sm"
      >
        Run Organic Intelligence Analysis
      </button>
    </div>
  );
}
