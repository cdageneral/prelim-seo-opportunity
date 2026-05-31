'use client';
import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SerpKw {
  keyword:          string;
  serpFeatures:     string[];
  hasAIO:           boolean;
  aioSources:       Array<{ domain: string; title: string; url: string }>;
  featuredSnippet?: { domain: string; title: string; url: string } | null;
  paaQuestions:     string[];
  paaClientCited:   boolean;
  videoClientCited: boolean;
  clientRank:       number | null;
}

interface Props { analysis: any; }

type FeatureTab = 'aio' | 'paa' | 'video' | 'more';

// ── Feature Card (compact rate) ────────────────────────────────────────────────

function FeatureRateCard({
  label, color, icon, rate, acquired, available, active, onClick,
}: {
  label: string; color: string; icon: string;
  rate: number; acquired: number; available: number;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 text-left transition-all"
      style={{
        flex: 1, padding: '14px', borderRadius: '10px',
        background: active ? `${color}12` : '#0F0F1E',
        border: `1.5px solid ${active ? color : '#1E1E35'}`,
        cursor: 'pointer',
        transition: 'all .15s',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full shrink-0" style={{ width: '8px', height: '8px', background: color }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#8888AA', textTransform: 'uppercase', letterSpacing: '.07em', flex: 1 }}>{label}</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color }}>{rate}%</span>
      </div>
      <p style={{ fontSize: '11px', color: '#555570', margin: 0 }}>
        <span style={{ color: '#C0C0E8', fontWeight: 600 }}>{acquired}</span> cited /{' '}
        <span style={{ color: '#C0C0E8', fontWeight: 600 }}>{available}</span> available
      </p>
      <div style={{ background: '#1E1E2E', borderRadius: '3px', height: '3px' }}>
        <div style={{ background: color, borderRadius: '3px', height: '3px', width: `${Math.min(100, rate)}%` }} />
      </div>
    </button>
  );
}

// ── Cited / Not Cited indicator ────────────────────────────────────────────────

function CitedBadge({ cited, label }: { cited: boolean; label?: string }) {
  return cited ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
      background: '#0A2A0A', border: '1px solid #22C55E44', color: '#22C55E',
    }}>
      ✓ {label ?? 'Cited'}
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
      background: '#1A0A0A', border: '1px solid #EF444433', color: '#EF4444',
    }}>
      ✗ Not cited
    </span>
  );
}

// ── Section Label ──────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <p style={{ fontSize: '10px', fontWeight: 600, color: '#444458', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>
      {text}
    </p>
  );
}

// ── Additional Feature Row ─────────────────────────────────────────────────────

const ADD_FEATURES: Array<{ key: string; label: string; color: string; desc: string }> = [
  { key: 'featured_snippet', label: 'Featured Snippet', color: '#22C55E', desc: 'Answer box at top of results' },
  { key: 'knowledge_panel',  label: 'Knowledge Panel',  color: '#F59E0B', desc: 'Entity knowledge card (right rail)' },
  { key: 'local_pack',       label: 'Local Pack',       color: '#EF4444', desc: 'Map + local business results' },
  { key: 'shopping',         label: 'Shopping / PLAs',  color: '#F97316', desc: 'Product listing carousel' },
  { key: 'image_pack',       label: 'Image Pack',       color: '#8B5CF6', desc: 'Google image results row' },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SerpFeaturesSection({ analysis }: Props) {
  const [activeTab, setActiveTab] = useState<FeatureTab>('aio');

  // ── Data ──────────────────────────────────────────────────────────────────
  const serpSnap   = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;
  const aioSummary  = serpSnap.aioSummary;

  const scannedKws: SerpKw[] = serpSnap.keywords ?? [];
  const scanned = featSummary?.scanned ?? scannedKws.length ?? 0;

  // AIO
  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // PAA
  const paaAvail = featSummary?.withPAA       ?? scannedKws.filter((k: SerpKw) => k.paaQuestions?.length > 0).length;
  const paaAcq   = featSummary?.paaClientCited ?? scannedKws.filter((k: SerpKw) => k.paaClientCited).length;
  const paaRate  = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;

  // Video
  const videoAvail = featSummary?.withVideo        ?? scannedKws.filter((k: SerpKw) => k.serpFeatures?.includes('video_carousel')).length;
  const videoAcq   = featSummary?.videoClientCited ?? scannedKws.filter((k: SerpKw) => k.videoClientCited).length;
  const videoRate  = videoAvail > 0 ? Math.round((videoAcq / videoAvail) * 100) : 0;

  // Combined
  const totalAvail    = aioAvail + paaAvail + videoAvail;
  const totalAcq      = aioAcq  + paaAcq  + videoAcq;
  const combinedRate  = totalAvail > 0 ? Math.min(100, Math.round((totalAcq / totalAvail) * 100)) : 0;

  // Top AIO competitors
  const topAIOCompetitors: Array<{ domain: string; citedCount: number }> =
    (serpSnap.topAIOCompetitors ?? []).slice(0, 6);

  // Scan date
  const scanDate = serpSnap.fetchedAt
    ? new Date(serpSnap.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Additional features inventory
  const addFeatureCounts: Record<string, number> = {};
  ADD_FEATURES.forEach(af => {
    addFeatureCounts[af.key] = scannedKws.filter((k: SerpKw) => k.serpFeatures?.includes(af.key)).length;
  });
  const hasAnyAddFeatures = ADD_FEATURES.some(af => addFeatureCounts[af.key] > 0);

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4 animate-fade-in">

      {/* ── Section Header ── */}
      <div className="orbit-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Search · 04</p>
            <h2 className="text-orbit-primary text-xl font-bold mt-1">SERP Features</h2>
            <p className="text-orbit-secondary text-sm mt-1">AI Overviews · People Also Ask · Video Carousel</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {scanDate && (
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>
                Scan: {scanDate}
              </span>
            )}
            {scanned > 0 && (
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>
                {scanned} kw{scanned !== 1 ? 's' : ''} scanned
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero: Combined Coverage ── */}
      <div className="orbit-card p-5">
        <div className="flex items-center gap-6">

          {/* Donut */}
          <div className="relative shrink-0" style={{ width: '120px', height: '120px' }}>
            <svg viewBox="0 0 36 36" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9"
                fill="none" stroke="#6C63FF" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${combinedRate} 100`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ color: '#6C63FF', fontWeight: 700, fontSize: '26px', lineHeight: 1 }}>{combinedRate}%</span>
              <span style={{ color: '#8888AA', fontSize: '10px', marginTop: '3px', textAlign: 'center', lineHeight: 1.3 }}>
                SERP<br />coverage
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 grid grid-cols-3 gap-3">
            {[
              { label: 'Available', val: totalAvail, color: '#8888AA', sub: 'total feature slots' },
              { label: 'Captured', val: totalAcq,   color: '#22C55E', sub: 'client is cited' },
              { label: 'Gap',      val: totalAvail - totalAcq, color: '#EF4444', sub: 'uncaptured' },
            ].map(s => (
              <div key={s.label} className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
                <p style={{ fontSize: '10px', color: '#8888AA', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 6px' }}>{s.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: s.color, lineHeight: 1, margin: 0 }}>{s.val}</p>
                <p style={{ fontSize: '10px', color: '#444458', margin: '4px 0 0' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Insight */}
          {totalAvail > 0 && (
            <div style={{ flexShrink: 0, maxWidth: '200px', padding: '12px', borderRadius: '8px', background: '#0F0F1E', border: '1px solid #1E1E35', borderLeft: '3px solid #6C63FF' }}>
              <p style={{ fontSize: '11px', color: '#8888AA', lineHeight: 1.5, margin: 0 }}>
                {combinedRate < 20
                  ? <>Strong opportunity — client appears in only <span style={{ color: '#EF4444', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features across scanned keywords.</>
                  : combinedRate < 60
                  ? <>Growing presence — capturing <span style={{ color: '#F59E0B', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features. Significant upside remains.</>
                  : <>Solid feature presence — capturing <span style={{ color: '#22C55E', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features across AIO, PAA &amp; video.</>
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature Tab Selector ── */}
      <div className="flex gap-2 flex-wrap">
        <FeatureRateCard label="AI Overviews" color="#6C63FF" icon="ti-robot"
          rate={aioRate} acquired={aioAcq} available={aioAvail}
          active={activeTab === 'aio'} onClick={() => setActiveTab('aio')} />
        <FeatureRateCard label="People Also Ask" color="#06B6D4" icon="ti-help"
          rate={paaRate} acquired={paaAcq} available={paaAvail}
          active={activeTab === 'paa'} onClick={() => setActiveTab('paa')} />
        <FeatureRateCard label="Video Carousel" color="#F59E0B" icon="ti-player-play"
          rate={videoRate} acquired={videoAcq} available={videoAvail}
          active={activeTab === 'video'} onClick={() => setActiveTab('video')} />
        <button
          onClick={() => setActiveTab('more')}
          className="flex flex-col gap-2 text-left transition-all"
          style={{
            flex: 1, padding: '14px', borderRadius: '10px',
            background: activeTab === 'more' ? '#22C55E12' : '#0F0F1E',
            border: `1.5px solid ${activeTab === 'more' ? '#22C55E' : '#1E1E35'}`,
            cursor: 'pointer', minWidth: '120px',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#8888AA', textTransform: 'uppercase', letterSpacing: '.07em' }}>More Features</span>
          </div>
          <p style={{ fontSize: '11px', color: '#555570', margin: 0 }}>Snippets · KP · Local · Shopping</p>
        </button>
      </div>

      {/* ── Tab Content ── */}

      {/* AIO Tab */}
      {activeTab === 'aio' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="AI Overviews" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                Google surfaces an AI-generated answer for qualifying keywords.
                Client must be cited as a source to gain visibility.
              </p>
            </div>
            {aioAcq < aioAvail && aioAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#150A2A', border: '1px solid #3A1A6A' }}>
                <p style={{ fontSize: '10px', color: '#9B6FCA', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#C08AF0', margin: 0 }}>
                  {aioAvail - aioAcq} uncaptured AIO{aioAvail - aioAcq !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              {/* Per-keyword AIO table */}
              <div>
                <SectionLabel text={`Keyword-level breakdown (${scannedKws.length} scanned)`} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {scannedKws.map((kw: SerpKw) => (
                    <div key={kw.keyword} style={{
                      background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '10px 14px',
                    }}>
                      <div className="flex items-start gap-3">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {kw.keyword}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {kw.hasAIO ? (
                              <>
                                <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1040', border: '1px solid #6C63FF44', color: '#8B85FF' }}>
                                  AI Overview present
                                </span>
                                <CitedBadge cited={kw.aioSources?.some(s => s)} />
                              </>
                            ) : (
                              <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570' }}>
                                No AI Overview
                              </span>
                            )}
                          </div>
                        </div>
                        {kw.hasAIO && kw.aioSources && kw.aioSources.length > 0 && (
                          <div style={{ flexShrink: 0, fontSize: '10px', color: '#444458' }}>
                            {kw.aioSources.slice(0, 3).map((s, i) => (
                              <p key={i} style={{ margin: '1px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                {s.domain}
                              </p>
                            ))}
                            {kw.aioSources.length > 3 && (
                              <p style={{ margin: '1px 0', color: '#333350' }}>+{kw.aioSources.length - 3} more sources</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top AIO competitors */}
              {topAIOCompetitors.length > 0 && (
                <div>
                  <SectionLabel text="Top AIO competitors (domains most cited in AI Overviews)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {topAIOCompetitors.map((c, i) => (
                      <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '10px', color: '#444458', width: '14px', flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
                        <span style={{ fontSize: '11px', color: '#C0C0D8', flex: 1 }}>{c.domain}</span>
                        <span style={{ fontSize: '11px', color: '#6C63FF', fontWeight: 600, flexShrink: 0 }}>
                          {c.citedCount} citation{c.citedCount !== 1 ? 's' : ''}
                        </span>
                        <div style={{ width: '80px', background: '#1E1E2E', borderRadius: '3px', height: '4px', flexShrink: 0 }}>
                          <div style={{
                            background: '#6C63FF', borderRadius: '3px', height: '4px',
                            width: `${Math.min(100, (c.citedCount / (topAIOCompetitors[0]?.citedCount ?? 1)) * 100)}%`,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PAA Tab */}
      {activeTab === 'paa' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="People Also Ask" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                PAA boxes surface related questions users are asking.
                Client cited = the client&apos;s content answers one of those questions.
              </p>
            </div>
            {paaAcq < paaAvail && paaAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#001A24', border: '1px solid #005070' }}>
                <p style={{ fontSize: '10px', color: '#06B6D4', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#06B6D4', margin: 0 }}>
                  {paaAvail - paaAcq} uncaptured PAA{paaAvail - paaAcq !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasPAA = (kw.paaQuestions ?? []).length > 0;
                return (
                  <div key={kw.keyword} style={{
                    background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '12px 14px',
                  }}>
                    <div className="flex items-start justify-between gap-3">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: '0 0 6px' }}>{kw.keyword}</p>
                        {hasPAA ? (
                          <>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#001820', border: '1px solid #06B6D444', color: '#06B6D4' }}>
                                PAA present · {kw.paaQuestions.length} question{kw.paaQuestions.length !== 1 ? 's' : ''}
                              </span>
                              <CitedBadge cited={kw.paaClientCited} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {kw.paaQuestions.slice(0, 3).map((q: string, i: number) => (
                                <p key={i} style={{ fontSize: '10px', color: '#555570', margin: 0 }}>
                                  · {q}
                                </p>
                              ))}
                              {kw.paaQuestions.length > 3 && (
                                <p style={{ fontSize: '10px', color: '#333350', margin: 0 }}>
                                  +{kw.paaQuestions.length - 3} more questions
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570' }}>
                            No PAA box
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Video Tab */}
      {activeTab === 'video' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="Video Carousel" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                Video carousels appear on queries where YouTube &amp; video content ranks well.
                Client cited = the client&apos;s YouTube channel or hosted video appears in the carousel.
              </p>
            </div>
            {videoAcq < videoAvail && videoAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#1A1000', border: '1px solid #504000' }}>
                <p style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', margin: 0 }}>
                  {videoAvail - videoAcq} uncaptured
                </p>
              </div>
            )}
          </div>

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasVideo = kw.serpFeatures?.includes('video_carousel');
                return (
                  <div key={kw.keyword} style={{
                    background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {kw.keyword}
                      </p>
                    </div>
                    {hasVideo ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1000', border: '1px solid #F59E0B44', color: '#F59E0B' }}>
                          Video carousel
                        </span>
                        <CitedBadge cited={kw.videoClientCited} />
                      </div>
                    ) : (
                      <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570', flexShrink: 0 }}>
                        No video carousel
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {videoAvail === 0 && scannedKws.length > 0 && (
            <div style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#555570' }}>
                No video carousels detected on scanned keywords. This is common for services-based queries.
                Creating a YouTube channel and optimizing video content for key terms could unlock this SERP feature.
              </p>
            </div>
          )}
        </div>
      )}

      {/* More Features Tab */}
      {activeTab === 'more' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div>
            <SectionLabel text="Additional SERP features detected" />
            <p style={{ fontSize: '12px', color: '#8888AA', margin: '0 0 12px' }}>
              These features were detected across {scannedKws.length} scanned keywords.
              They represent SERP real estate the client is currently not in.
            </p>
          </div>

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ADD_FEATURES.map(af => {
                  const count = addFeatureCounts[af.key] ?? 0;
                  const pct = scannedKws.length > 0 ? Math.round((count / scannedKws.length) * 100) : 0;
                  return (
                    <div key={af.key} style={{
                      background: '#0F0F1E', border: `1px solid ${count > 0 ? `${af.color}30` : '#1E1E35'}`,
                      borderRadius: '8px', padding: '12px 14px',
                      opacity: count > 0 ? 1 : 0.5,
                    }}>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full shrink-0" style={{ width: '8px', height: '8px', background: count > 0 ? af.color : '#2A2A3A' }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: '0 0 2px' }}>{af.label}</p>
                          <p style={{ fontSize: '10px', color: '#555570', margin: 0 }}>{af.desc}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '16px', fontWeight: 700, color: count > 0 ? af.color : '#333350', margin: 0, lineHeight: 1 }}>{count}</p>
                          <p style={{ fontSize: '9px', color: '#444458', margin: '2px 0 0' }}>of {scannedKws.length} kws</p>
                        </div>
                        <div style={{ width: '60px', background: '#1E1E2E', borderRadius: '3px', height: '4px', flexShrink: 0 }}>
                          <div style={{ background: count > 0 ? af.color : '#2A2A2A', borderRadius: '3px', height: '4px', width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!hasAnyAddFeatures && (
                <div style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#555570' }}>
                    No featured snippets, knowledge panels, local packs, or shopping results detected on scanned keywords.
                    Expand SERP scanning to more keywords for a broader picture.
                  </p>
                </div>
              )}

              {/* Per-keyword full feature inventory */}
              {scannedKws.length > 0 && (
                <div>
                  <SectionLabel text="Full SERP feature inventory by keyword" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {scannedKws.map((kw: SerpKw) => (
                      <div key={kw.keyword} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 10px', background: '#080812', borderRadius: '6px', border: '1px solid #12121E',
                      }}>
                        <span style={{ fontSize: '11px', color: '#9090B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</span>
                        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                          {(kw.serpFeatures ?? []).length > 0 ? (
                            kw.serpFeatures.map((f: string) => {
                              const meta = ({
                                ai_overview:      { label: 'AIO',      color: '#6C63FF' },
                                featured_snippet: { label: 'Snippet',  color: '#22C55E' },
                                knowledge_panel:  { label: 'KP',       color: '#F59E0B' },
                                local_pack:       { label: 'Local',    color: '#EF4444' },
                                shopping:         { label: 'Shop',     color: '#F97316' },
                                video_carousel:   { label: 'Video',    color: '#06B6D4' },
                                image_pack:       { label: 'Images',   color: '#8B5CF6' },
                                twitter_pack:     { label: 'Twitter',  color: '#1DA1F2' },
                              } as Record<string, { label: string; color: string }>)[f];
                              if (!meta) return null;
                              return (
                                <span key={f} style={{
                                  padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600,
                                  background: `${meta.color}1A`, border: `1px solid ${meta.color}33`, color: meta.color,
                                }}>{meta.label}</span>
                              );
                            })
                          ) : (
                            <span style={{ fontSize: '10px', color: '#2A2A40' }}>no features</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
