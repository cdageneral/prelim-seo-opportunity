'use client';

/**
 * NewProjectModal — v7.50
 *
 * Added to the create flow:
 *  - Competitors section: add up to 5 competitors (domain + name) before creating.
 *    These are POSTed to /api/projects/[id]/competitors after project creation.
 *    CSV upload is available in Edit Project after creation.
 *  - Keyword volume thresholds: client ranked + competitor gap minimums (preset buttons).
 *    Saved with the project on create; editable later in Edit Project.
 *  - v7.418 Access section: pick the users and/or groups that can see the new
 *    project (rosters come from the admin API; the section hides itself for
 *    non-admins). Grants are applied server-side right after creation; access
 *    is editable later in Admin → Users & Access / Groups.
 */

import { useState, useEffect } from 'react';
import { MARKETS } from '@/lib/utils/markets';

const INDUSTRIES = [
  'SaaS / Software', 'E-commerce', 'Healthcare', 'Finance / Fintech',
  'Professional Services', 'Real Estate', 'Education', 'Marketing / Agency',
  'Manufacturing', 'Retail', 'Hospitality', 'Non-profit', 'Other',
];

const VOL_PRESETS: { label: string; value: number }[] = [
  { label: 'All',   value: 0    },
  { label: '500+',  value: 500  },
  { label: '1K+',   value: 1000 },
  { label: '2.4K+', value: 2400 },
  { label: '5K+',   value: 5000 },
];

interface CompetitorEntry { domain: string; name: string; }

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [form,       setForm]       = useState({ clientName: '', websiteUrl: '', industry: '', notes: '' });
  const [dataSource, setDataSource] = useState<'auto' | 'upload' | null>(null);
  const [market,     setMarket]     = useState<string>('us');   // v7.99: Semrush database / SerpAPI country

  // Competitors
  const [competitors,    setCompetitors]    = useState<CompetitorEntry[]>([]);
  const [compDomain,     setCompDomain]     = useState('');
  const [compName,       setCompName]       = useState('');
  const [compError,      setCompError]      = useState('');

  // Thresholds
  const [clientThresh,     setClientThresh]     = useState<number>(0);
  const [competitorThresh, setCompetitorThresh] = useState<number>(0);

  // v7.418: who can see this project — users + groups (admin-only rosters; the
  // section renders only if the admin API answers, so non-admins never see it).
  const [accessUsers,  setAccessUsers]  = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [accessGroups, setAccessGroups] = useState<{ id: string; name: string; memberIds: string[] }[]>([]);
  const [selUserIds,   setSelUserIds]   = useState<string[]>([]);
  const [selGroupIds,  setSelGroupIds]  = useState<string[]>([]);
  const [accessReady,  setAccessReady]  = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/groups', { cache: 'no-store' });
        if (!res.ok) return; // not an admin (401/403) — keep the section hidden
        const data = await res.json();
        if (!alive) return;
        // Grants only matter for editors/viewers — owners & admins see everything.
        const grantable = (data.users ?? []).filter((u: { role: string }) => u.role === 'editor' || u.role === 'viewer');
        setAccessUsers(grantable);
        setAccessGroups(data.groups ?? []);
        setAccessReady(true);
      } catch { /* roster unavailable — section stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  const toggleUser  = (id: string) => setSelUserIds(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  const toggleGroup = (id: string) => setSelGroupIds(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function handleUrlBlur() {
    if (form.websiteUrl && !form.websiteUrl.startsWith('http')) {
      setForm(f => ({ ...f, websiteUrl: `https://${f.websiteUrl}` }));
    }
  }

  function addCompetitor() {
    const d = compDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    if (!d) { setCompError('Enter a domain.'); return; }
    if (competitors.some(c => c.domain === d)) { setCompError('Already added.'); return; }
    if (competitors.length >= 5) { setCompError('Maximum 5 competitors.'); return; }
    setCompetitors(prev => [...prev, { domain: d, name: compName.trim() }]);
    setCompDomain(''); setCompName(''); setCompError('');
  }

  function removeCompetitor(domain: string) {
    setCompetitors(prev => prev.filter(c => c.domain !== domain));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataSource) return;
    setLoading(true);
    setError('');
    try {
      // 1. Create project
      const res  = await fetch('/api/projects', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          dataSource,
          kwVolThresholdClient:     clientThresh,
          kwVolThresholdCompetitor: competitorThresh,
          semrushDatabase:          market,
          accessUserIds:            selUserIds,
          accessGroupIds:           selGroupIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.formErrors?.[0] ?? 'Failed to create project'); return; }

      // 2. Add competitors (best-effort, don't block on failure)
      if (competitors.length > 0) {
        await Promise.allSettled(
          competitors.map(c =>
            fetch(`/api/projects/${data.project.id}/competitors`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ domain: c.domain, name: c.name || undefined }),
            }),
          ),
        );
      }

      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!dataSource && !loading;

  // Threshold preset style
  function presetStyle(value: number, current: number, color: { bg: string; border: string; text: string }): React.CSSProperties {
    const active = current === value;
    return {
      padding: '4px 11px', borderRadius: '20px',
      border: `1px solid ${active ? color.border : 'var(--c-2a2a48)'}`,
      background: active ? color.bg : 'transparent',
      color: active ? color.text : 'var(--c-707090)',
      fontSize: '11px', cursor: 'pointer',
      transition: 'all 0.12s',
      fontWeight: active ? 600 : 400,
    };
  }

  const clientColor     = { bg: 'var(--ca-56-189-248-0_14)', border: 'var(--ca-56-189-248-0_6)', text: 'var(--c-38bdf8)' };
  const competitorColor = { bg: 'var(--ca-245-158-11-0_14)', border: 'var(--ca-245-158-11-0_6)', text: 'var(--c-f59e0b)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full animate-fade-in"
        style={{
          maxWidth: '560px', maxHeight: '92vh',
          background: 'var(--c-0c0c18)', border: '1px solid var(--c-1e1e35)',
          borderRadius: '14px', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px var(--ca-0-0-0-0_7)',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid var(--c-1a1a2e)', flexShrink: 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-e8e8ff)', margin: 0 }}>Add New Client</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-505070)', padding: '4px' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── Project info ── */}
          <SectionLabel label="Project Info" />

          <Field label="Client Name *">
            <input type="text" required value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Acme Corp" style={inputStyle} />
          </Field>

          <Field label="Website URL *">
            <input type="text" required value={form.websiteUrl}
              onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
              onBlur={handleUrlBlur}
              placeholder="acme.com" style={inputStyle} />
            <p style={{ fontSize: '10px', color: 'var(--c-505070)', marginTop: '4px' }}>https:// added automatically.</p>
          </Field>

          <Field label="Industry">
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={inputStyle}>
              <option value="">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>

          <Field label="Market">
            <select value={market} onChange={e => setMarket(e.target.value)} style={inputStyle}>
              {MARKETS.map(m => <option key={m.code} value={m.code}>{m.flag} {m.label}</option>)}
            </select>
            <p style={{ fontSize: '10px', color: 'var(--c-505070)', marginTop: '4px' }}>
              Which country&apos;s Google to analyze — sets the Semrush keyword database AND the country used for SERP feature scans.
            </p>
          </Field>

          {/* ── Keyword data source ── */}
          <div style={{ borderTop: '0.5px solid var(--c-1e1e35)', paddingTop: '14px' }}>
            <SectionLabel label="Keyword Data Source" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              {!dataSource && (
                <span style={{ fontSize: '10px', color: 'var(--c-f87171)', background: 'var(--c-2b0d0d)', padding: '2px 8px', borderRadius: '10px' }}>
                  Choose one to continue
                </span>
              )}
              {dataSource && (
                <span style={{ fontSize: '10px', color: 'var(--c-4ade80)', background: 'var(--c-0d2b1d)', padding: '2px 8px', borderRadius: '10px' }}>
                  Selected
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {/* Auto-discover */}
              <button type="button" onClick={() => setDataSource('auto')}
                style={{ flex: 1, textAlign: 'left', cursor: 'pointer', background: dataSource === 'auto' ? 'var(--c-1a1a3a)' : 'var(--c-111118)', border: `1.5px solid ${dataSource === 'auto' ? 'var(--c-6c63ff)' : 'var(--c-1e1e2e)'}`, borderRadius: '8px', padding: '12px', transition: 'border-color .15s, background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-antenna" style={{ fontSize: '16px', color: dataSource === 'auto' ? 'var(--c-7b68ee)' : 'var(--c-404060)' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: 'var(--c-2b0d0d)', color: 'var(--c-f87171)', fontWeight: 500 }}>cost shown before run</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 3px' }}>Auto-discover</p>
                <p style={{ fontSize: '11px', color: 'var(--c-707090)', margin: 0, lineHeight: 1.4 }}>Semrush crawls client + competitors automatically.</p>
              </button>

              {/* Upload */}
              <button type="button" onClick={() => setDataSource('upload')}
                style={{ flex: 1, textAlign: 'left', cursor: 'pointer', background: dataSource === 'upload' ? 'var(--c-0d1e2b)' : 'var(--c-111118)', border: `1.5px solid ${dataSource === 'upload' ? 'var(--c-00c9b1)' : 'var(--c-1e1e2e)'}`, borderRadius: '8px', padding: '12px', transition: 'border-color .15s, background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-upload" style={{ fontSize: '16px', color: dataSource === 'upload' ? 'var(--c-00c9b1)' : 'var(--c-404060)' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: 'var(--c-0d2b1d)', color: 'var(--c-4ade80)', fontWeight: 500 }}>0 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 3px' }}>Upload files</p>
                <p style={{ fontSize: '11px', color: 'var(--c-707090)', margin: 0, lineHeight: 1.4 }}>Upload keyword CSVs on the project page — no auto-crawl.</p>
              </button>
            </div>

            {dataSource === 'auto' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', background: 'var(--c-141428)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '6px', padding: '9px 11px' }}>
                <i className="ti ti-info-circle" style={{ fontSize: '13px', color: 'var(--c-6c63ff)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                <p style={{ fontSize: '11px', color: 'var(--c-8080b0)', margin: 0, lineHeight: 1.5 }}>
                  Semrush will run automatically on first analysis. Add competitors below to include their footprints.
                </p>
              </div>
            )}
          </div>

          {/* ── Competitors ── */}
          <div style={{ borderTop: '0.5px solid var(--c-1e1e35)', paddingTop: '14px' }}>
            <SectionLabel label="Competitors (optional)" />
            <p style={{ fontSize: '11px', color: 'var(--c-606080)', marginBottom: '12px', lineHeight: 1.5 }}>
              Add up to 5 competitors. CSV keyword upload is available in Edit Project after creation.
            </p>

            {/* Add competitor inline */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <input
                value={compDomain}
                onChange={e => setCompDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                placeholder="competitor.com"
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                value={compName}
                onChange={e => setCompName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                placeholder="Name (opt.)"
                style={{ ...inputStyle, flex: 1.5 }}
              />
              <button
                type="button"
                onClick={addCompetitor}
                disabled={competitors.length >= 5}
                style={{
                  padding: '9px 16px', borderRadius: '8px',
                  background: competitors.length >= 5 ? 'var(--c-1a1a30)' : 'var(--ca-108-99-255-0_15)',
                  border: `1px solid ${competitors.length >= 5 ? 'var(--c-1e1e35)' : 'var(--ca-108-99-255-0_45)'}`,
                  color: competitors.length >= 5 ? 'var(--c-8888aa)' : 'var(--c-9b96ff)',
                  fontSize: '12px', cursor: competitors.length >= 5 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
            {compError && <p style={{ fontSize: '11px', color: 'var(--c-f87171)', marginBottom: '6px' }}>{compError}</p>}

            {/* Competitor list */}
            {competitors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {competitors.map(c => (
                  <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--c-141428)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '7px', padding: '8px 12px' }}>
                    <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=14`} alt="" style={{ width: '14px', height: '14px', borderRadius: '2px', opacity: 0.7 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span style={{ fontSize: '12px', color: 'var(--c-c0c0e0)', flex: 1 }}>{c.name || c.domain}</span>
                    {c.name && <span style={{ fontSize: '10px', color: 'var(--c-555575)' }}>{c.domain}</span>}
                    <button type="button" onClick={() => removeCompetitor(c.domain)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-404060)', padding: '2px' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Keyword volume thresholds ── */}
          <div style={{ borderTop: '0.5px solid var(--c-1e1e35)', paddingTop: '14px' }}>
            <SectionLabel label="Keyword Volume Thresholds" />
            <div style={{ background: 'var(--c-0f0f1c)', border: '0.5px solid var(--c-1e1e38)', borderRadius: '10px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', marginBottom: '14px', lineHeight: 1.5 }}>
                Hide keywords below these monthly volume minimums. Can be changed anytime in Edit Project.
              </p>

              {/* Client */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-38bdf8)', letterSpacing: '.04em' }}>Client ranked</span>
                  {clientThresh > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--c-38bdf8)', background: 'var(--ca-56-189-248-0_1)', border: '1px solid var(--ca-56-189-248-0_3)', padding: '1px 7px', borderRadius: '10px' }}>
                      ≥ {clientThresh >= 1000 ? `${clientThresh / 1000}K` : clientThresh}/mo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {VOL_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setClientThresh(p.value)}
                      style={presetStyle(p.value, clientThresh, clientColor)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Competitor */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-f59e0b)', letterSpacing: '.04em' }}>Competitor gap</span>
                  {competitorThresh > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--c-f59e0b)', background: 'var(--ca-245-158-11-0_1)', border: '1px solid var(--ca-245-158-11-0_3)', padding: '1px 7px', borderRadius: '10px' }}>
                      ≥ {competitorThresh >= 1000 ? `${competitorThresh / 1000}K` : competitorThresh}/mo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {VOL_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setCompetitorThresh(p.value)}
                      style={presetStyle(p.value, competitorThresh, competitorColor)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Who can see this project (v7.418, admins only) ── */}
          {accessReady && (
            <div style={{ borderTop: '0.5px solid var(--c-1e1e35)', paddingTop: '14px' }}>
              <SectionLabel label="Who Can See This Project (optional)" />
              <p style={{ fontSize: '11px', color: 'var(--c-606080)', marginBottom: '12px', lineHeight: 1.5 }}>
                Owners and admins always see every project. Grant it to groups and/or individual editors &amp; viewers — you can change this anytime in Admin → Users &amp; Access.
              </p>

              {accessGroups.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '0 0 6px' }}>Groups</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {accessGroups.map(g => {
                      const on = selGroupIds.includes(g.id);
                      return (
                        <button key={g.id} type="button" onClick={() => toggleGroup(g.id)}
                          style={{
                            padding: '5px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--ca-108-99-255-0_45)' : 'var(--c-2a2a48)'}`,
                            background: on ? 'var(--ca-108-99-255-0_15)' : 'transparent',
                            color: on ? 'var(--c-9b96ff)' : 'var(--c-707090)',
                            fontWeight: on ? 600 : 400, transition: 'all 0.12s',
                          }}>
                          <i className="ti ti-users" style={{ fontSize: '11px', marginRight: '5px' }} aria-hidden="true" />
                          {g.name}{g.memberIds.length ? ` (${g.memberIds.length})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {accessUsers.length > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '0 0 6px' }}>Users</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {accessUsers.map(u => {
                      const on = selUserIds.includes(u.id);
                      return (
                        <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                          style={{
                            padding: '5px 12px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--ca-56-189-248-0_6)' : 'var(--c-2a2a48)'}`,
                            background: on ? 'var(--ca-56-189-248-0_14)' : 'transparent',
                            color: on ? 'var(--c-38bdf8)' : 'var(--c-707090)',
                            fontWeight: on ? 600 : 400, transition: 'all 0.12s',
                          }}>
                          {u.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {accessGroups.length === 0 && accessUsers.length === 0 && (
                <p style={{ fontSize: '11px', color: 'var(--c-505070)', margin: 0 }}>
                  No groups or grantable users yet — create them in Admin → Users &amp; Access, or grant access there later.
                </p>
              )}
            </div>
          )}

          {error && <p style={{ fontSize: '12px', color: 'var(--c-f87171)' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px', paddingBottom: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--c-2a2a48)', color: 'var(--c-8080a8)', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              style={{ flex: 2, padding: '10px', borderRadius: '8px', background: canSubmit ? 'var(--c-6c63ff)' : 'var(--c-3d3d8a)', border: 'none', color: 'var(--on-fill-accent)', fontSize: '13px', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: !dataSource ? 0.4 : 1 }}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--c-111118)', border: '1px solid var(--c-1e1e2e)',
  borderRadius: '8px', padding: '9px 12px', color: 'var(--c-f0f0ff)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: 'var(--c-4a4a72)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: 'var(--c-1a1a30)' }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', letterSpacing: '.05em', marginBottom: '6px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function presetStyle(value: number, current: number, color: { bg: string; border: string; text: string }): React.CSSProperties {
  const active = current === value;
  return {
    padding: '4px 11px', borderRadius: '20px',
    border: `1px solid ${active ? color.border : 'var(--c-2a2a48)'}`,
    background: active ? color.bg : 'transparent',
    color: active ? color.text : 'var(--c-707090)',
    fontSize: '11px', cursor: 'pointer',
    transition: 'all 0.12s',
    fontWeight: active ? 600 : 400,
  };
}
