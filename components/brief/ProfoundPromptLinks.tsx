/**
 * components/brief/ProfoundPromptLinks.tsx — v7.547
 *
 * The Product Insights surfaces for the AI Answer Engines prompt ↔ page link
 * (lib/profound/pageLinks.ts — the ONE basis the panel and the PDF read, Const II.7):
 *
 *   <PromptLinksCard>   project-level block under the KPI tiles: upload / re-upload state,
 *                       filing control (Lane 2) with live progress + ETA (IV.2), and the two
 *                       gap cards — prompts with no page to answer them, pages that rank
 *                       but are never cited.
 *   <PromptCell>        the "AI PROMPTS · PROFOUND" column on a topic row — cited / named /
 *                       absent counts + one dot per engine.
 *   <PromptDrawer>      the prompts behind a topic row, grouped by bucket, with the engines
 *                       and the third-party domains the answers cited instead.
 *
 * Every count is a direct count of stored link rows (I.1). The two lanes are labelled on
 * every row — CITED is measured (a citation URL on this page); NAMED / ABSENT are filed
 * (ASSIGNED, with the model's own confidence) and never add into a measured figure.
 * Colours are theme tokens only (IV.6).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  orderedEngines, topicPromptsTsv, ASSIGN_REVIEW_BELOW,
  type ProfoundLinkStore, type JoinResult, type TopicPromptSummary, type TopicPromptRow, type GapViews,
} from '@/lib/profound/pageLinks';

// ─── shared bits ─────────────────────────────────────────────────────────────

const chip = (tone: 'green' | 'amber' | 'red' | 'acc' | 'mute', text: string, title?: string) => {
  const c = {
    green: ['var(--ca-52-211-153-0_08)', 'var(--c-34d399)', 'var(--ca-52-211-153-0_3)'],
    amber: ['var(--ca-245-158-11-0_08)', 'var(--c-f59e0b)', 'var(--ca-245-158-11-0_3)'],
    red:   ['var(--ca-248-113-113-0_1)', 'var(--c-f87171)', 'var(--ca-248-113-113-0_2)'],
    acc:   ['var(--ca-108-99-255-0_12)', 'var(--c-9b96ff)', 'var(--ca-108-99-255-0_25)'],
    mute:  ['transparent', 'var(--c-55557a)', 'var(--c-2a2a40)'],
  }[tone];
  return <span title={title} style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', padding: '2px 6px', borderRadius: '5px', background: c[0], color: c[1], border: `1px solid ${c[2]}`, whiteSpace: 'nowrap' }}>{text}</span>;
};

const ENGINE_SHORT: Record<string, string> = {
  'ChatGPT': 'ChatGPT', 'Google AI Overviews': 'AI Overviews', 'Google AI Mode': 'AI Mode',
  'Google Gemini': 'Gemini', 'Microsoft Copilot': 'Copilot', 'Perplexity': 'Perplexity',
};
const engShort = (e: string) => ENGINE_SHORT[e] ?? e;

/** One dot per engine: full = cited on every recorded answer, half = on some, empty = never. */
function EngineDots({ engines }: { engines: Record<string, { cited: number; runs: number }> }) {
  const keys = orderedEngines(Object.keys(engines));
  if (keys.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }} title={'Answers citing any owned page / answers recorded, per engine — ' + keys.map(k => `${engShort(k)}: ${engines[k].cited} of ${engines[k].runs}`).join(' · ')}>
      {keys.map(k => {
        const e = engines[k];
        const full = e.runs > 0 && e.cited >= e.runs, half = e.cited > 0 && !full;
        return <i key={k} style={{ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
          border: `1px solid ${e.cited > 0 ? 'var(--c-6c63ff)' : 'var(--c-2a2a40)'}`,
          background: full ? 'var(--c-6c63ff)' : half ? 'linear-gradient(90deg, var(--c-6c63ff) 50%, transparent 50%)' : 'transparent' }} />;
      })}
    </span>
  );
}

export const promptLinkState = (links: ProfoundLinkStore | null, hasProfoundData: boolean): 'none' | 'reupload' | 'ready' =>
  links && links.prompts.length > 0 ? 'ready' : hasProfoundData ? 'reupload' : 'none';

// ─── topic-row cell ───────────────────────────────────────────────────────────

export function PromptCell({ s, state }: { s: TopicPromptSummary | undefined; state: 'none' | 'reupload' | 'ready' }) {
  if (state !== 'ready') {
    return <span style={{ fontSize: '9.5px', color: 'var(--c-55557a)' }} title={state === 'none' ? 'Upload the Profound export in AI Answer Engines to link prompts to pages' : 'Re-upload the Profound Responses file in AI Answer Engines to link its prompts to pages'}>{state === 'none' ? 'no Profound upload' : 're-upload to link'}</span>;
  }
  if (!s || s.rows.length === 0) {
    return <span style={{ fontSize: '9.5px', color: 'var(--c-55557a)' }} title="No tracked prompt cites this page and none was filed to this topic">{s && s.pages.length === 0 ? 'no page · no prompts' : 'no prompts'}</span>;
  }
  return (
    <span style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
      {s.pages.length === 0 ? chip('mute', 'NO PAGE', 'This topic has no ranking page — nothing to cite yet')
        : s.cited > 0 ? chip('green', `CITED ${s.cited}`, 'Prompts whose answers cite this page (measured)')
        : s.citedOn ? chip('green', 'CITED', `This page is cited — the citations are counted on "${s.citedOn}", which shares the page`)
        : chip('mute', 'NOT CITED', 'No answer cites this page')}
      {s.named > 0 && chip('amber', `NAMED ${s.named}`, 'Filed to this topic; the answer names the brand but does not cite this page')}
      {s.absent > 0 && chip('red', `ABSENT ${s.absent}`, 'Filed to this topic; the answer never mentions the brand')}
      {s.unknown > 0 && chip('amber', `FILED ${s.unknown}`, 'Filed to this topic and not cited; whether the answer names the brand is unknown — this export carries no mentioned? column')}
      {s.review > 0 && chip('mute', `${s.review} REVIEW`, `Filed below ${ASSIGN_REVIEW_BELOW} confidence — needs review`)}
      <EngineDots engines={s.engines} />
    </span>
  );
}

// ─── drawer ───────────────────────────────────────────────────────────────────

const PAGE = 8;

function PromptRowView({ r }: { r: TopicPromptRow }) {
  const l = r.link;
  const engs = orderedEngines(Object.keys(l.engines));
  const citedOn = engs.filter(e => l.engines[e].cited > 0);
  const engText = r.bucket === 'cited'
    ? `cites you on ${citedOn.map(engShort).join(' · ')}${citedOn.length < engs.length ? ` · answered on ${engs.length}` : ''}`
    : `${engs.length === 1 ? engShort(engs[0]) : `${engs.length} engines`} · ${l.runs} answer${l.runs === 1 ? '' : 's'}`;
  const rivals = Object.entries(l.rivals).slice(0, 3).map(([d]) => d);
  const a = r.assignment;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(200px,1fr) minmax(130px,0.6fr) minmax(150px,0.7fr)', gap: '8px', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed var(--c-1e1e34)', fontSize: '11px' }}>
      <span>{r.bucket === 'cited' ? chip('green', 'CITED') : r.bucket === 'named' ? chip('amber', 'NAMED') : r.bucket === 'unknown' ? chip('amber', 'FILED', 'not cited · mention unknown (no mentioned? column)') : chip('red', 'ABSENT')}</span>
      <span style={{ color: 'var(--c-c8c8e8)' }}>
        {l.prompt}
        {r.lane === 'measured' && r.paths.length > 0 && <span style={{ fontSize: '9px', color: 'var(--c-6a6a90)' }}> · {r.paths.join(', ')}</span>}
        {r.lane === 'assigned' && a && <span style={{ fontSize: '8.5px', marginLeft: '6px', color: a.status === 'review' ? 'var(--c-f59e0b)' : 'var(--c-6a6a90)' }} title={`Filed into ${a.path.join(' › ')} by ${a.model} — the model's own confidence, not a data metric`}>{a.status === 'review' ? 'REVIEW' : 'ASSIGNED'} {a.confidence.toFixed(2)}</span>}
      </span>
      <span style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)' }}>{engText}</span>
      <span style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={Object.entries(l.rivals).map(([d, n]) => `${d} ×${n}`).join(' · ')}>
        {rivals.length ? <>{r.bucket === 'cited' ? 'also cites ' : 'cites '}<b style={{ color: 'var(--c-8a8aa8)', fontWeight: 600 }}>{rivals.join(', ')}</b>{l.rivalTotal > rivals.length ? ` +${l.rivalTotal - rivals.length}` : ''}</> : <span style={{ color: 'var(--c-55557a)' }}>no third-party citations</span>}
      </span>
    </div>
  );
}

export function PromptDrawer({ s, topicLabel, sourceFile, builtAt }: { s: TopicPromptSummary; topicLabel: string; sourceFile: string; builtAt: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? s.rows : s.rows.slice(0, PAGE);
  const page = s.pages[0];
  const download = () => {
    try {
      const blob = new Blob([topicPromptsTsv(s)], { type: 'text/tab-separated-values' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ai-prompts-${topicLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.tsv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { /* browser blocked the download — nothing to fabricate */ }
  };
  return (
    <div onClick={e => e.stopPropagation()} style={{ margin: '0 0 6px 18px', padding: '8px 10px', border: '1px solid var(--c-1e1e34)', borderLeft: '3px solid var(--c-6c63ff)', borderRadius: '0 8px 8px 0', background: 'var(--c-111120)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
        <div style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.07em', color: 'var(--c-8a8aa8)' }}>
          AI PROMPTS · PROFOUND — {s.rows.length} ON THIS TOPIC · {s.cited} CITE {page ? page.toUpperCase() : 'A PAGE'}{s.unknown > 0 ? ` · ${s.unknown} FILED, NOT CITED (MENTION UNKNOWN)` : ` · ${s.named} NAME YOU WITHOUT CITING · ${s.absent} NEVER MENTION YOU`}
        </div>
        <button onClick={download} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Download TSV</button>
      </div>
      {rows.map(r => <PromptRowView key={`${r.bucket}:${r.link.prompt}`} r={r} />)}
      {s.rows.length > PAGE && (
        <button onClick={() => setShowAll(v => !v)} style={{ marginTop: '5px', fontSize: '9.5px', fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-9b96ff)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
          {showAll ? 'Show fewer ▴' : `Show all ${s.rows.length} ▾`}
        </button>
      )}
      <div style={{ fontSize: '9px', color: 'var(--c-6a6a90)', marginTop: '7px', paddingTop: '5px', borderTop: '1px solid var(--c-1e1e34)' }}>
        <b style={{ color: 'var(--c-8a8aa8)' }}>Basis.</b> CITED = a recorded answer's citation URL is one of this topic's ranking pages (measured — Profound {sourceFile}, uploaded {new Date(builtAt).toLocaleDateString('en-US')}). NAMED / ABSENT = the prompt was ASSIGNED to this topic by the taxonomy filer (the model's own confidence is shown; under {ASSIGN_REVIEW_BELOW} it is marked REVIEW) and the answer did / did not name the brand per Profound's mentioned flag; FILED = assigned, not cited, and the export carries no mentioned column. Dots = the Profound engines: answers citing any owned page out of answers recorded (the store is per prompt, not per page); a half dot = some answers, not all. The two bases are never added together.
      </div>
    </div>
  );
}

// ─── project-level card ──────────────────────────────────────────────────────

export interface AssignInfo { total: number; assigned: number; review: number; noFit: number; unassigned: number; batchSize: number; model: string }

interface CardProps {
  projectId:  string;
  links:      ProfoundLinkStore | null;
  hasProfoundData: boolean;
  join:       JoinResult;
  gaps:       GapViews;
  assign:     AssignInfo | null;
  onLinksChanged: () => void;        // re-fetch the store after filing
  hrefFor:    (u: string) => string | null;
}

export function PromptLinksCard(p: CardProps) {
  const state = promptLinkState(p.links, p.hasProfoundData);
  const [filing, setFiling] = useState<{ done: number; total: number; msPer: number; calls: number } | null>(null);
  const [filingErr, setFilingErr] = useState<string | null>(null);
  const [showAllNoPage, setShowAllNoPage] = useState(false);
  const [showAllNever, setShowAllNever] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => () => { stopRef.current = true; }, []);

  const runFiling = async (mode: 'pending' | 'refile') => {
    if (!p.assign) return;
    const total = mode === 'refile' ? p.assign.total : p.assign.unassigned;
    if (total === 0) return;
    stopRef.current = false; setFilingErr(null);
    setFiling({ done: 0, total, msPer: 0, calls: 0 });
    let done = 0, sent = 0, calls = 0, lastMs = 0, lastBatch = 0;
    try {
      for (;;) {
        if (stopRef.current) break;
        const t0 = Date.now();
        const res = await fetch(`/api/projects/${p.projectId}/profound-links/assign`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, limit: 400, offset: sent }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setFilingErr(d?.error || `Filing failed (${res.status})`); break; }
        const batch = (d.filed ?? 0) + (d.noFit ?? 0) + (d.review ?? 0);
        done += batch; sent += (d.sent ?? batch); calls++; lastMs = Date.now() - t0; lastBatch = batch;
        // ETA from the LAST call's measured throughput (a call may stop early at the function cap)
        setFiling({ done, total, msPer: lastBatch > 0 ? lastMs / lastBatch : 0, calls });
        if ((d.remaining ?? 0) === 0) break;
        if (batch === 0) {
          if ((d.failedCalls ?? 0) > 0) setFilingErr(`${d.failedCalls} filer call${d.failedCalls === 1 ? '' : 's'} failed — ${d.remaining} prompts still unfiled. Run again to retry.`);
          if (mode !== 'refile') break;   // refile keeps walking by offset; pending would loop on the same set
        }
      }
    } catch (e) { setFilingErr(e instanceof Error ? e.message : 'Filing failed'); }
    setFiling(null);
    p.onLinksChanged();
  };

  const card = (children: ReactNode) => (
    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '10px', padding: '11px 13px', marginBottom: '18px' }}>{children}</div>
  );
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
      <span style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.07em', color: 'var(--c-6a6a90)' }}>AI PROMPTS · PROFOUND → PAGES</span>
      <span style={{ fontSize: '9.5px', color: 'var(--c-55557a)' }}>which tracked AI questions cite your pages, and which page should be answering the rest</span>
    </div>
  );

  if (state === 'none') return card(<>{head}<div style={{ fontSize: '11px', color: 'var(--c-8a8aa8)' }}>No Profound export on this project yet — upload the Responses file in <b>AI Answer Engines</b> and its prompts are linked to pages here automatically.</div></>);
  if (state === 'reupload') return card(<>{head}<div style={{ fontSize: '11px', color: 'var(--c-8a8aa8)' }}>The AI Answer Engines upload predates prompt linking. <b>Re-upload the Responses file (Step 1)</b> in AI Answer Engines once — its prompts are then linked to the pages below. Nothing is back-filled from the stored metrics (they carry no prompt → URL rows).</div></>);

  const L = p.links!; const c = p.join.counts;
  const eta = filing && filing.msPer > 0 ? Math.max(0, Math.round((filing.total - filing.done) * filing.msPer / 1000)) : null;
  const gapList = (rows: ReactNode[], all: boolean, setAll: (v: boolean) => void, n: number) => (
    <>
      {rows.slice(0, all ? rows.length : 6)}
      {n > 6 && <button onClick={() => setAll(!all)} style={{ marginTop: '4px', fontSize: '9.5px', fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-9b96ff)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{all ? 'Show fewer ▴' : `Show all ${n} ▾`}</button>}
    </>
  );
  const kv = (left: ReactNode, right: ReactNode, key: string) => (
    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0', borderBottom: '1px dashed var(--c-1e1e34)', fontSize: '11px', alignItems: 'baseline' }}>
      <span style={{ minWidth: 0, color: 'var(--c-c8c8e8)' }}>{left}</span><span style={{ fontWeight: 700, color: 'var(--c-e8e8ff)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );

  return card(<>
    {head}
    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '11px', color: 'var(--c-8a8aa8)', marginBottom: '8px' }}>
      <span><b style={{ color: 'var(--c-e8e8ff)', fontSize: '13px' }} className="num">{L.prompts.length.toLocaleString()}</b> prompts{L.promptTotal > L.prompts.length ? ` of ${L.promptTotal.toLocaleString()} (store capped)` : ''} · {L.totalRows.toLocaleString()} answers</span>
      <span><b style={{ color: 'var(--c-34d399)' }}>{c.citedAny}</b> cite one of your pages</span>
      {L.hasNamedFlag ? <span><b style={{ color: 'var(--c-f59e0b)' }}>{c.namedAny}</b> name you</span> : <span title="This export carries no mentioned? column">named: not in export</span>}
      <span style={{ color: 'var(--c-55557a)' }}>{L.sourceFile} · {new Date(L.builtAt).toLocaleDateString('en-US')}</span>
    </div>

    {/* Lane 2 control */}
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--c-1e1e34)', background: 'var(--c-0a0a14)', marginBottom: '10px', fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>
      <span style={{ fontWeight: 800, letterSpacing: '0.05em', fontSize: '9px', color: 'var(--c-6a6a90)' }}>FILED INTO TAXONOMY</span>
      {p.assign ? (
        <>
          <span><b style={{ color: 'var(--c-e8e8ff)' }}>{p.assign.assigned}</b> filed · <b style={{ color: 'var(--c-f59e0b)' }}>{p.assign.review}</b> needs review · {p.assign.noFit} no fit · <b style={{ color: p.assign.unassigned > 0 ? 'var(--c-f87171)' : 'var(--c-8a8aa8)' }}>{p.assign.unassigned}</b> not yet filed{p.join.assignedElsewhere > 0 ? ` · ${p.join.assignedElsewhere} filed to a node not on these lines` : ''}{p.join.assignedAmbiguous > 0 ? ` · ${p.join.assignedAmbiguous} filed to a name that matches several topics (not placed)` : ''}{p.join.citedUnmappedOnly > 0 ? ` · ${p.join.citedUnmappedOnly} cite an owned URL no topic owns` : ''}</span>
          {!filing && p.assign.unassigned > 0 && (
            <button onClick={() => void runFiling('pending')} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)' }}
              title={`Files ${p.assign.unassigned} prompts into the stored taxonomy with ${p.assign.model} (${Math.ceil(p.assign.unassigned / p.assign.batchSize)} calls — real token cost lands on the API Usage ledger)`}>
              File {p.assign.unassigned} prompts
            </button>
          )}
          {!filing && p.assign.unassigned === 0 && p.assign.total > 0 && (
            <button onClick={() => void runFiling('refile')} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }} title="Re-file every prompt (after a taxonomy change)">Re-file all</button>
          )}
          {filing && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '120px', height: '6px', borderRadius: '3px', background: 'var(--c-1e1e34)', overflow: 'hidden', display: 'inline-block' }}><span style={{ display: 'block', height: '100%', width: `${filing.total ? Math.min(100, (filing.done / filing.total) * 100) : 0}%`, background: 'var(--c-6c63ff)' }} /></span>
              <span className="num">{filing.done} / {filing.total} filed{eta !== null && filing.calls > 0 ? ` · ~${eta}s left` : ' · measuring…'}</span>
              <button onClick={() => { stopRef.current = true; }} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Stop</button>
            </span>
          )}
          {filingErr && <span style={{ color: 'var(--c-f87171)' }}>{filingErr}</span>}
        </>
      ) : <span>loading filing status…</span>}
    </div>

    {/* the two gap cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
      <div style={{ border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '9px 11px' }}>
        <div style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.07em', color: 'var(--c-8a8aa8)', borderBottom: '1px solid var(--c-1e1e34)', paddingBottom: '3px', marginBottom: '5px' }}>PROMPTS WITH NO PAGE TO ANSWER THEM <span style={{ color: 'var(--c-55557a)', fontWeight: 600 }}>· {(() => { const n = p.gaps.noPage.reduce((x, g) => x + g.prompts, 0); return `${n} prompt${n === 1 ? '' : 's'} on ${p.gaps.noPage.length} topic${p.gaps.noPage.length === 1 ? '' : 's'}`; })()}</span></div>
        <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginBottom: '4px' }}>Filed to a topic with no ranking page — the page to build, with the questions it must answer.</div>
        {p.gaps.noPage.length === 0 && <div style={{ fontSize: '10.5px', color: 'var(--c-55557a)' }}>{c.assigned + c.review === 0 ? 'File the prompts into the taxonomy to see this view.' : 'Every filed prompt has a ranking page on its topic.'}</div>}
        {gapList(p.gaps.noPage.map(g => kv(<><span style={{ fontWeight: 600 }}>{g.topic}</span> <span style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)' }}>· {g.theme}{g.rivals.length ? ` · rivals cited: ${g.rivals.map(r => `${r.domain} ×${r.n}`).join(', ')}` : ''}</span></>, <>{g.prompts} prompt{g.prompts === 1 ? '' : 's'}{g.review ? <span style={{ color: 'var(--c-f59e0b)', fontWeight: 600 }}> · {g.review} review</span> : null}</>, g.topicId)), showAllNoPage, setShowAllNoPage, p.gaps.noPage.length)}
      </div>
      <div style={{ border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '9px 11px' }}>
        <div style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.07em', color: 'var(--c-8a8aa8)', borderBottom: '1px solid var(--c-1e1e34)', paddingBottom: '3px', marginBottom: '5px' }}>PAGES THAT RANK BUT ARE NEVER CITED <span style={{ color: 'var(--c-55557a)', fontWeight: 600 }}>· {p.gaps.neverCited.length} page{p.gaps.neverCited.length === 1 ? '' : 's'}</span></div>
        <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginBottom: '4px' }}>A ranking page whose topic's prompts never cite it — the cheapest wins; sorted by prompts, then rank.</div>
        {p.gaps.neverCited.length === 0 && <div style={{ fontSize: '10.5px', color: 'var(--c-55557a)' }}>{c.assigned + c.review === 0 ? 'File the prompts into the taxonomy to see this view.' : 'Every ranking page with filed prompts is cited at least once.'}</div>}
        {gapList(p.gaps.neverCited.map(g => kv(<><a href={p.hrefFor(g.page) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-9b96ff)', textDecoration: 'underline', textUnderlineOffset: '2px', fontFamily: 'ui-monospace, monospace', fontSize: '10.5px' }}>{g.page}</a> <span style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)' }}>· {g.topic}{g.bestPos !== null ? ` · pos ${g.bestPos}` : ''}{g.rivals.length ? ` · cited instead: ${g.rivals.map(r => r.domain).join(', ')}` : ''}</span></>, <>{g.unknown > 0 ? `${g.unknown} filed (mention unknown)` : `${g.absent} absent`}{g.named ? ` · ${g.named} named` : ''}</>, g.topicId)), showAllNever, setShowAllNever, p.gaps.neverCited.length)}
      </div>
    </div>

    {p.join.unmappedOwned.length > 0 && (
      <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--c-8a8aa8)' }}>
        <button onClick={() => setShowUnmapped(v => !v)} style={{ fontSize: '10px', fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-9b96ff)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
          {p.join.unmappedOwned.length} owned URL{p.join.unmappedOwned.length === 1 ? ' is' : 's are'} cited but {p.join.unmappedOwned.length === 1 ? 'is' : 'are'} not a topic's ranking page {showUnmapped ? '▴' : '▾'}
        </button>
        {showUnmapped && (
          <div style={{ marginTop: '4px' }}>
            {p.join.unmappedOwned.slice(0, 25).map(u => <div key={u.path} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '2px 0', borderBottom: '1px dashed var(--c-1e1e34)' }}><a href={p.hrefFor(u.path) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px', fontFamily: 'ui-monospace, monospace' }}>{u.path}</a><span className="num">{u.prompts} prompt{u.prompts === 1 ? '' : 's'} · {u.answers} answers</span></div>)}
            {p.join.unmappedOwned.length > 25 && <div style={{ color: 'var(--c-55557a)' }}>+ {p.join.unmappedOwned.length - 25} more</div>}
            <div style={{ color: 'var(--c-55557a)', marginTop: '3px' }}>These pages are cited by AI answers but are not a ranking page of any topic on these lines, so no topic owns them. They are disclosed here, never dropped; their prompts are never filed as named or absent.</div>
          </div>
        )}
      </div>
    )}

    <div style={{ fontSize: '9px', color: 'var(--c-6a6a90)', marginTop: '8px', paddingTop: '5px', borderTop: '1px solid var(--c-1e1e34)' }}>
      <b style={{ color: 'var(--c-8a8aa8)' }}>Basis.</b> Built from the Profound Responses export at upload (one row per prompt: answers per engine, owned citation URLs, third-party domains cited). A prompt CITES a page when an answer's citation URL is that topic's ranking page — the same URL identity the clusters use. Filing (ASSIGNED) uses the stored taxonomy only, never a new node; the model's confidence is its own estimate and under {ASSIGN_REVIEW_BELOW} the prompt is marked REVIEW. Measured and assigned figures are never added together.
    </div>
  </>);
}
