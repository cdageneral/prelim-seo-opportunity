'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter }  from 'next/navigation';
import Link from 'next/link';
import MarketGapSection      from '@/components/brief/MarketGapSection';
import CompetitorGapSection  from '@/components/brief/CompetitorGapSection';
import LLMVisibilitySection  from '@/components/brief/LLMVisibilitySection';
import FootprintSection      from '@/components/brief/FootprintSection';
import OpportunitiesSection  from '@/components/brief/OpportunitiesSection';
import PersonasSection       from '@/components/brief/PersonasSection';
import AnalysisRunningState  from '@/components/brief/AnalysisRunningState';
import ReportsPanel          from '@/components/brief/ReportsPanel';
import CompetitorsPanel      from '@/components/brief/CompetitorsPanel';

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

export default function ProjectBriefPage() {
  const params    = useParams();
  const router    = useRouter();
  const projectId = params.id as string;

  const [project, setProject]       = useState<Project | null>(null);
  const [loading, setLoading]       = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [pollingId, setPollingId]   = useState<string | null>(null);
  const [polledTriggeredAt, setPolledTriggeredAt] = useState<string | undefined>(undefined);
  const [renaming, setRenaming]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const analysis = project?.analyses?.[0] ?? null;
  const isRunning  = analysis?.status === 'running' || pollingId !== null;
  const hasResults = analysis?.status === 'completed';

  // Timeout: if an analysis has been "running" for >6 minutes without resolving,
  // something went wrong on the server (Lambda timeout, etc). Show an error.
  const ANALYSIS_TIMEOUT_MS = 6 * 60 * 1000;
  useEffect(() => {
    if (!isRunning) return;
    const startMs = polledTriggeredAt
      ? new Date(polledTriggeredAt).getTime()
      : analysis?.triggeredAt
        ? new Date(analysis.triggeredAt).getTime()
        : Date.now();
    const elapsed = Date.now() - startMs;
    if (elapsed > ANALYSIS_TIMEOUT_MS) {
      setPollingId(null);
      setAnalysisError(
        'Analysis timed out after 6 minutes. This usually means Vercel ended the function early. Try running again — if it keeps failing, check your Vercel function logs.'
      );
    }
  }, [isRunning, polledTriggeredAt, analysis?.triggeredAt, ANALYSIS_TIMEOUT_MS]);

  const fetchProject = useCallback(async () => {
    const res  = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) { router.push('/dashboard'); return; }
    const data = await res.json();
    setProject(data.project);
    setNewName(data.project.clientName);
    setLoading(false);
  }, [projectId, router]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Poll for analysis completion
  useEffect(() => {
    if (!pollingId) return;
    const interval = setInterval(async () => {
      const res  = await fetch(`/api/analyze?id=${pollingId}`);
      const data = await res.json();
      // Capture the real triggeredAt from each poll so the timeout clock
      // anchors to THIS run, not a stale previous analysis in project data.
      if (data.triggeredAt) setPolledTriggeredAt(data.triggeredAt);
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
        setPollingId(null);
        if (data.status === 'failed') {
          setAnalysisError(data.errorMessage ?? 'Analysis failed. Check that your API keys are correct in Vercel environment variables.');
        }
        fetchProject();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingId, fetchProject]);

  async function triggerAnalysis() {
    setTriggering(true);
    try {
      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPollingId(data.analysisId);
        fetchProject();
      } else {
        setAnalysisError(
          data?.error ?? 'Failed to start analysis. Check that your API keys are set correctly in Vercel → Settings → Environment Variables.'
        );
      }
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

  if (loading) return (
    <div className="min-h-screen bg-orbit-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return null;

  return (
    <div className="min-h-screen bg-orbit-bg">
      <div className="fixed inset-0 bg-orbit-glow pointer-events-none" />

      {/* Nav */}
      <nav className="border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-orbit-secondary hover:text-orbit-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <span className="text-orbit-tertiary">/</span>
            <span className="text-sm font-bold gradient-text">OrbitIQ</span>
            <span className="text-orbit-tertiary">/</span>
            <span className="text-orbit-primary text-sm font-medium">{project.clientName}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Rename */}
            <button
              onClick={() => setRenaming(true)}
              className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all"
            >
              Rename
            </button>
            {/* Refresh / Run */}
            <button
              onClick={triggerAnalysis}
              disabled={triggering || isRunning}
              className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRunning ? 'Running...' : hasResults ? 'Refresh Analysis' : 'Run Analysis'}
            </button>
            {/* Delete */}
            <button
              onClick={deleteProject}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 px-3 py-1.5 rounded-lg transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      </nav>

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRenaming(false)} />
          <div className="relative orbit-card orbit-glow w-full max-w-sm p-6 animate-fade-in">
            <h3 className="text-orbit-primary font-semibold mb-4">Rename Project</h3>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
              className="w-full bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2.5 text-orbit-primary text-sm focus:outline-none focus:border-orbit-accent transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenaming(false)} className="flex-1 border border-orbit-border text-orbit-secondary text-sm py-2 rounded-lg hover:text-orbit-primary transition-colors">Cancel</button>
              <button onClick={saveRename} className="flex-1 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm py-2 rounded-lg transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      <main className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Client header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-orbit-primary">{project.clientName}</h1>
            <p className="text-orbit-secondary text-sm mt-1">
              {project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
              {project.industry && <span className="ml-2 text-orbit-tertiary">· {project.industry}</span>}
            </p>
          </div>
          {hasResults && analysis?.completedAt && (
            <div className="text-right">
              <p className="text-orbit-tertiary text-xs">Last analyzed</p>
              <p className="text-orbit-secondary text-sm mt-0.5">
                {new Date(analysis.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Competitors panel — always visible */}
          <CompetitorsPanel
            projectId={projectId}
            competitors={project.competitors ?? []}
            onChange={fetchProject}
          />

          {/* Error banner */}
          {analysisError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
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

          {/* No analysis yet */}
          {!isRunning && !hasResults && (
            <NoAnalysisState clientName={project.clientName} onRun={triggerAnalysis} loading={triggering} />
          )}

          {/* Running */}
          {isRunning && (
            <AnalysisRunningState
              clientName={project.clientName}
              triggeredAt={polledTriggeredAt ?? analysis?.triggeredAt ?? undefined}
              hasError={!!analysisError}
            />
          )}

          {/* Brief */}
          {hasResults && analysis && (
            <div className="flex flex-col gap-8 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MarketGapSection     analysis={analysis} />
                <CompetitorGapSection analysis={analysis} />
              </div>
              <FootprintSection      analysis={analysis} />
              <LLMVisibilitySection  analysis={analysis} />
              <OpportunitiesSection  analysis={analysis} />
              <PersonasSection       analysis={analysis} />
              <ReportsPanel
                analysisId={analysis.id}
                projectId={project.id}
                clientName={project.clientName}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NoAnalysisState({ clientName, onRun, loading }: { clientName: string; onRun: () => void; loading: boolean }) {
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
          Add competitors above, then run the analysis. OrbitIQ will query Semrush, SerpAPI, and Profound and synthesize a CMO-level brief.
        </p>
      </div>
      <button onClick={onRun} disabled={loading}
        className="bg-orbit-accent hover:bg-orbit-accent-light text-white font-medium px-8 py-3 rounded-lg transition-colors disabled:opacity-50 text-sm">
        {loading ? 'Starting...' : 'Run Organic Intelligence Analysis'}
      </button>
    </div>
  );
}
