'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

// Brief section components
import MarketGapSection      from '@/components/brief/MarketGapSection';
import CompetitorGapSection  from '@/components/brief/CompetitorGapSection';
import LLMVisibilitySection  from '@/components/brief/LLMVisibilitySection';
import FootprintSection      from '@/components/brief/FootprintSection';
import OpportunitiesSection  from '@/components/brief/OpportunitiesSection';
import PersonasSection       from '@/components/brief/PersonasSection';
import AnalysisRunningState  from '@/components/brief/AnalysisRunningState';
import ReportsPanel          from '@/components/brief/ReportsPanel';

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
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  analyses:   Analysis[];
}

export default function ProjectBriefPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject]   = useState<Project | null>(null);
  const [loading, setLoading]   = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [pollingId, setPollingId]   = useState<string | null>(null);

  const analysis = project?.analyses?.[0] ?? null;

  const fetchProject = useCallback(async () => {
    const res  = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (res.ok) setProject(data.project);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Poll for analysis completion
  useEffect(() => {
    if (!pollingId) return;

    const interval = setInterval(async () => {
      const res  = await fetch(`/api/analyze?id=${pollingId}`);
      const data = await res.json();
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
        setPollingId(null);
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
      }
    } finally {
      setTriggering(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-orbit-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-orbit-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-orbit-secondary">Project not found.</p>
          <Link href="/dashboard" className="text-orbit-accent text-sm mt-2 block hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isRunning  = analysis?.status === 'running' || pollingId !== null;
  const hasResults = analysis?.status === 'completed';

  return (
    <div className="min-h-screen bg-orbit-bg">
      {/* Background glow */}
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
            <span className="text-orbit-secondary text-sm font-bold gradient-text">OrbitIQ</span>
            <span className="text-orbit-tertiary">/</span>
            <span className="text-orbit-primary text-sm font-medium">{project.clientName}</span>
          </div>
          <div className="flex items-center gap-3">
            {hasResults && (
              <button
                onClick={triggerAnalysis}
                disabled={triggering || isRunning}
                className="text-sm text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
              >
                Re-run Analysis
              </button>
            )}
            {!hasResults && !isRunning && (
              <button
                onClick={triggerAnalysis}
                disabled={triggering}
                className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {triggering ? 'Starting...' : 'Run Analysis'}
              </button>
            )}
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-6 py-10">

        {/* Client Header */}
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
                {new Date(analysis.completedAt).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
            </div>
          )}
        </div>

        {/* No Analysis Yet */}
        {!isRunning && !hasResults && (
          <NoAnalysisState
            clientName={project.clientName}
            onRun={triggerAnalysis}
            loading={triggering}
          />
        )}

        {/* Analysis Running */}
        {isRunning && <AnalysisRunningState clientName={project.clientName} />}

        {/* Brief — Full Results */}
        {hasResults && analysis && (
          <div className="flex flex-col gap-8 animate-fade-in">
            {/* Row 1: Market Gap + Competitor Gap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MarketGapSection analysis={analysis} />
              <CompetitorGapSection analysis={analysis} />
            </div>

            {/* Row 2: Keyword Footprint */}
            <FootprintSection analysis={analysis} />

            {/* Row 3: LLM Visibility */}
            <LLMVisibilitySection analysis={analysis} />

            {/* Row 4: Top 3 Opportunities */}
            <OpportunitiesSection analysis={analysis} />

            {/* Row 5: Buyer Personas */}
            <PersonasSection analysis={analysis} />

            {/* Row 6: Export / Reports */}
            <ReportsPanel
              analysisId={analysis.id}
              projectId={project.id}
              clientName={project.clientName}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function NoAnalysisState({
  clientName, onRun, loading
}: { clientName: string; onRun: () => void; loading: boolean }) {
  return (
    <div className="orbit-card p-12 flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-orbit-accent/10 border border-orbit-accent/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div>
        <h3 className="text-orbit-primary text-xl font-semibold">Ready to analyze {clientName}</h3>
        <p className="text-orbit-secondary text-sm mt-2 max-w-md">
          OrbitIQ will query Semrush, SerpAPI, and Profound in parallel, then synthesize a
          CMO-level organic opportunity brief in minutes.
        </p>
      </div>
      <button
        onClick={onRun}
        disabled={loading}
        className="bg-orbit-accent hover:bg-orbit-accent-light text-white font-medium px-8 py-3 rounded-lg transition-colors disabled:opacity-50 text-sm"
      >
        {loading ? 'Starting analysis...' : 'Run Organic Intelligence Analysis'}
      </button>
    </div>
  );
}
