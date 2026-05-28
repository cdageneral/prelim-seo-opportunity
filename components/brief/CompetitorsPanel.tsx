'use client';

import { useState } from 'react';

interface Competitor {
  id:        string;
  domain:    string;
  name:      string | null;
  createdAt: string;
}

interface Props {
  projectId:   string;
  competitors: Competitor[];
  onChange:    () => void;  // refresh parent after add/delete
}

export default function CompetitorsPanel({ projectId, competitors, onChange }: Props) {
  const [domain, setDomain]   = useState('');
  const [name, setName]       = useState('');
  const [adding, setAdding]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError]     = useState('');

  async function addCompetitor(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: domain.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to add'); return; }
      setDomain('');
      setName('');
      setShowForm(false);
      onChange();
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(cid: string) {
    await fetch(`/api/projects/${projectId}/competitors/${cid}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="orbit-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Competitors</p>
          <h3 className="text-orbit-primary text-base font-semibold mt-0.5">Tracked Competitors</h3>
        </div>
        <button
          onClick={() => { setShowForm(f => !f); setError(''); }}
          className="flex items-center gap-1.5 text-xs text-orbit-accent hover:text-orbit-accent-light border border-orbit-accent/30 hover:border-orbit-accent/60 px-3 py-1.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Competitor
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={addCompetitor} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Domain *</label>
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="competitor.com"
                required
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Competitor Co."
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setDomain(''); setName(''); }}
              className="flex-1 text-xs text-orbit-secondary border border-orbit-border py-1.5 rounded-lg hover:text-orbit-primary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={adding}
              className="flex-1 text-xs bg-orbit-accent hover:bg-orbit-accent-light text-white py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Competitors list */}
      {competitors.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-orbit-tertiary text-xs">No competitors tracked yet.</p>
          <p className="text-orbit-tertiary text-[10px] mt-1">Add competitors to include them in gap analysis when you run an analysis.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {competitors.map(comp => (
            <div
              key={comp.id}
              className="flex items-center gap-2 bg-orbit-surface border border-orbit-border rounded-lg px-3 py-1.5 group"
            >
              {/* Favicon */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${comp.domain}&sz=16`}
                alt=""
                className="w-4 h-4 rounded-sm opacity-70"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <p className="text-orbit-primary text-xs font-medium leading-tight">{comp.name ?? comp.domain}</p>
                {comp.name && <p className="text-orbit-tertiary text-[10px]">{comp.domain}</p>}
              </div>
              <button
                onClick={() => removeCompetitor(comp.id)}
                className="ml-1 text-orbit-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove competitor"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {competitors.length > 0 && (
        <p className="text-orbit-tertiary text-[10px]">
          These competitors are included in gap analysis when you run or refresh an analysis.
        </p>
      )}
    </div>
  );
}
