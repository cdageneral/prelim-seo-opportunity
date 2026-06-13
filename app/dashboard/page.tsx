'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import NewProjectModal from '@/components/dashboard/NewProjectModal';
import ProjectCard from '@/components/dashboard/ProjectCard';

interface Project {
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  updatedAt:  string;
}

export default function DashboardPage() {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  async function fetchProjects() {
    const res  = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchProjects(); }, []);

  async function handleDelete(id: string) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects(p => p.filter(x => x.id !== id));
  }

  async function handleRename(id: string, newName: string) {
    await fetch(`/api/projects/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientName: newName }),
    });
    setProjects(p => p.map(x => x.id === id ? { ...x, clientName: newName } : x));
  }

  return (
    <div className="min-h-screen bg-orbit-bg">
      {/* Nav */}
      <nav className="border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold gradient-text">OrbitIQ</span>
          <div className="flex items-center gap-3">
            {/* v7.185: global dark/light theme toggle */}
            <ThemeToggle />
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-orbit-primary">Client Projects</h2>
          <p className="text-orbit-secondary text-sm mt-1">
            Select a client to view or run their organic opportunity brief.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="orbit-card h-40 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onNew={() => setShowNewModal(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
            <button
              onClick={() => setShowNewModal(true)}
              className="orbit-card h-44 flex flex-col items-center justify-center gap-2 text-orbit-secondary hover:text-orbit-accent hover:border-orbit-accent-dim transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:border-orbit-accent transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium">Add Client</span>
            </button>
          </div>
        )}
      </main>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); fetchProjects(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-orbit-muted flex items-center justify-center">
        <svg className="w-8 h-8 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-orbit-primary font-semibold text-lg">No projects yet</h3>
        <p className="text-orbit-secondary text-sm mt-1">Add your first client to run an organic intelligence analysis.</p>
      </div>
      <button onClick={onNew} className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
        Add First Client
      </button>
    </div>
  );
}
