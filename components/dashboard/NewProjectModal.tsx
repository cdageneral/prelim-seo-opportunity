'use client';

import { useState } from 'react';

const INDUSTRIES = [
  'SaaS / Software', 'E-commerce', 'Healthcare', 'Finance / Fintech',
  'Professional Services', 'Real Estate', 'Education', 'Marketing / Agency',
  'Manufacturing', 'Retail', 'Hospitality', 'Non-profit', 'Other',
];

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [form, setForm]       = useState({ clientName: '', websiteUrl: '', industry: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Auto-prefix https:// if missing
  function handleUrlBlur() {
    if (form.websiteUrl && !form.websiteUrl.startsWith('http')) {
      setForm(f => ({ ...f, websiteUrl: `https://${f.websiteUrl}` }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/projects', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.formErrors?.[0] ?? 'Failed to create project'); return; }
      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative orbit-card orbit-glow w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-orbit-primary font-semibold text-lg">Add New Client</h2>
          <button onClick={onClose} className="text-orbit-secondary hover:text-orbit-primary transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Client Name *">
            <input
              type="text" required
              value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Acme Corp"
              className="orbit-input"
            />
          </Field>

          <Field label="Website URL *">
            <input
              type="text" required
              value={form.websiteUrl}
              onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
              onBlur={handleUrlBlur}
              placeholder="acme.com"
              className="orbit-input"
            />
            <p className="text-orbit-tertiary text-[10px] mt-1">Enter the domain — https:// will be added automatically.</p>
          </Field>

          <Field label="Industry">
            <select
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="orbit-input"
            >
              <option value="">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Context about this client..."
              rows={2}
              className="orbit-input resize-none"
            />
          </Field>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-orbit-border text-orbit-secondary hover:text-orbit-primary text-sm py-2.5 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .orbit-input {
          width: 100%;
          background: #111118;
          border: 1px solid #1E1E2E;
          border-radius: 8px;
          padding: 10px 12px;
          color: #F0F0FF;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .orbit-input:focus { border-color: #6C63FF; }
        .orbit-input::placeholder { color: #555570; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-orbit-secondary text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
