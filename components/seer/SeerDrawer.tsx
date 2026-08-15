'use client';

/**
 * components/seer/SeerDrawer.tsx — v7.462 · OrbitIQ Seer
 *
 * In-project Q&A drawer over the project's stored data. Opens from the sidebar
 * pin (or ⌘K), slides over the active panel, and streams grounded answers from
 * /api/projects/[id]/seer (NDJSON: status lines then the final answer).
 *
 * UX invariants honoured:
 *  - IV.1: the conversation is the one scrolling region (flex-1 min-h-0 overflow-y-auto).
 *  - IV.2/IV.3: while Seer works the drawer shows a LIVE changing step label
 *    (each tool call the server makes) plus elapsed seconds — never a bare spinner.
 *  - IV.6: every color is an existing theme token or themed class — both themes.
 *  - No cost/token/usage figures render here: usage is admin-only (ledger rows
 *    are still written server-side, attributed to this project).
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface SeerMsg {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  refusal?: boolean;
  error?: boolean;
  /** v7.463: how many numeric values in this answer the server verified verbatim against tool results. */
  verified?: number;
}

interface SeerDrawerProps {
  projectId: string;
  projectName: string;
  activePanelLabel: string;
  open: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  'Where are our biggest keyword gaps vs competitors?',
  'Which categories have the most demand we don’t rank for?',
  'How visible are we in AI answers vs our rivals?',
  'Summarize this project’s position in plain language',
];

/** Minimal markdown renderer: **bold**, `- ` bullets, and | tables. Text nodes only — no HTML injection. */
function renderAnswer(text: string): JSX.Element {
  const lines = text.split('\n');
  const out: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  const inline = (s: string): Array<string | JSX.Element> =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} className="font-bold text-orbit-primary">{part.slice(2, -2)}</strong>
        : part,
    );

  while (i < lines.length) {
    const line = lines[i];
    // table block: header row then |---| separator
    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const splitRow = (s: string): string[] =>
        s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j} className="text-left font-bold uppercase tracking-wide text-[9.5px] text-[color:var(--c-7070a0)] px-2 py-1 border-b border-orbit-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 border-b border-orbit-border/50 text-orbit-secondary">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // bullet run
    if (/^\s*[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="my-1.5 space-y-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2 text-orbit-secondary"><span className="text-[color:var(--c-7070a0)] flex-shrink-0">&middot;</span><span>{inline(it)}</span></li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    // paragraph: absorb consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*[-•]\s+/.test(lines[i]) && !lines[i].trim().startsWith('|')) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={key++} className="my-1.5 text-orbit-secondary leading-relaxed">{inline(para.join(' '))}</p>);
  }
  return <div>{out}</div>;
}

export default function SeerDrawer({ projectId, projectName, activePanelLabel, open, onClose }: SeerDrawerProps) {
  const [messages, setMessages] = useState<SeerMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const convRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // elapsed timer while busy (IV.3 — never looks frozen)
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [busy]);

  // autoscroll on new content
  useEffect(() => {
    const el = convRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, statusLabel]);

  // focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setBusy(true);
    setStatusLabel('Loading stored project data');

    // carry recent turns for follow-up questions (session-only, never persisted)
    const history = messages.slice(-8).map(m => ({
      role: m.role,
      content: m.role === 'assistant' ? m.text.slice(0, 4000) : m.text,
    }));

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`/api/projects/${projectId}/seer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, activePanel: activePanelLabel }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error('No response stream');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += dec.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const lineRaw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!lineRaw) continue;
          let evt: any;
          try { evt = JSON.parse(lineRaw); } catch { continue; }
          if (evt.type === 'status') {
            setStatusLabel(String(evt.label ?? ''));
          } else if (evt.type === 'answer') {
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: String(evt.answer ?? ''),
              sources: Array.isArray(evt.sources) ? evt.sources : [],
              refusal: Boolean(evt.refusal),
              verified: typeof evt.verified === 'number' ? evt.verified : undefined,
            }]);
          } else if (evt.type === 'error') {
            setMessages(prev => [...prev, { role: 'assistant', text: String(evt.error ?? 'Seer failed'), error: true }]);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', text: e?.message ?? 'Seer failed — try again', error: true }]);
      }
    } finally {
      setBusy(false);
      setStatusLabel('');
      abortRef.current = null;
    }
  }, [busy, messages, projectId, activePanelLabel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="OrbitIQ Seer">
      {/* click-away backdrop — same treatment as existing modals */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div
        className="relative h-full flex flex-col border-l border-orbit-border shadow-2xl"
        style={{ width: 'min(520px, 92vw)', background: 'var(--c-0d0d16)' }}
      >
        {/* header */}
        <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-orbit-border">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: 'var(--ca-108-99-255-0_15)', color: 'var(--c-6c63ff)' }}
            aria-hidden="true"
          >&#9678;</span>
          <span className="text-orbit-primary text-sm font-bold">OrbitIQ Seer</span>
          <span
            className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: 'var(--c-6c63ff)', background: 'var(--ca-108-99-255-0_12)', border: '1px solid var(--ca-108-99-255-0_3)' }}
          >BETA</span>
          <button
            onClick={onClose}
            className="ml-auto text-orbit-secondary hover:text-orbit-primary transition-colors text-sm px-1"
            aria-label="Close Seer"
          >&#10005;</button>
        </div>

        {/* scope bar */}
        <div className="flex-shrink-0 flex items-center gap-2 flex-wrap px-4 py-2 border-b border-orbit-border" style={{ background: 'var(--c-0a0a14)' }}>
          <span className="text-[10px] font-semibold text-orbit-secondary border border-orbit-border rounded px-1.5 py-0.5">{projectName}</span>
          <span className="text-[10px] font-semibold text-orbit-secondary border border-orbit-border rounded px-1.5 py-0.5">Viewing: {activePanelLabel}</span>
          <span className="text-[10px] text-[color:var(--c-7070a0)]">Stored project data only</span>
        </div>

        {/* conversation — THE scrolling region (IV.1) */}
        <div ref={convRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !busy && (
            <div className="mt-2">
              <p className="text-orbit-secondary text-xs leading-relaxed">
                Ask anything about this project&apos;s data — keywords, categories, competitors,
                AI visibility, rankings, demand. Answers come only from stored data; Seer never
                estimates or fills gaps.
              </p>
              <div className="text-[9.5px] font-bold tracking-wider uppercase text-[color:var(--c-7070a0)] mt-4 mb-2">Try asking</div>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s, j) => (
                  <button
                    key={j}
                    onClick={() => ask(s)}
                    className="text-left text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted rounded-lg px-3 py-2 transition-all"
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {messages.map((m, j) => m.role === 'user' ? (
              <div key={j} className="self-end max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-xs font-medium text-white" style={{ background: 'var(--c-6c63ff)', backgroundImage: 'linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.22))' }}>
                {m.text}
              </div>
            ) : (
              <div
                key={j}
                className="self-start max-w-[96%] rounded-xl rounded-bl-sm px-3.5 py-2.5 text-xs border"
                style={m.error
                  ? { background: 'var(--ca-239-68-68-0_08)', borderColor: 'var(--ca-239-68-68-0_3)' }
                  : m.refusal
                    ? { background: 'var(--c-0a0a14)', borderColor: 'var(--ca-245-158-11-0_3)' }
                    : { background: 'var(--c-0a0a14)', borderColor: 'var(--c-1e1e30)' }}
              >
                {m.refusal && (
                  <div className="text-[9.5px] font-bold tracking-wider mb-1.5" style={{ color: 'var(--c-f59e0b)' }}>
                    &#9888; NOT IN STORED DATA — SEER WON&apos;T ESTIMATE
                  </div>
                )}
                {m.error
                  ? <p style={{ color: 'var(--c-f87171)' }}>{m.text}</p>
                  : renderAnswer(m.text)}
                {!!m.sources?.length && (
                  <div className="flex gap-1.5 flex-wrap mt-2 pt-2 border-t border-orbit-border/50">
                    {m.sources.map((s, si) => (
                      <span key={si} className="text-[9.5px] font-semibold text-orbit-secondary border border-orbit-border rounded px-1.5 py-0.5">{s}</span>
                    ))}
                  </div>
                )}
                {/* v7.463: the grounding check is machine-enforced server-side; this states its real result */}
                {!m.error && !m.refusal && typeof m.verified === 'number' && m.verified > 0 && (
                  <div className="text-[9.5px] font-semibold mt-1.5" style={{ color: 'var(--c-22c55e)' }}>
                    &#10003; {m.verified} number{m.verified === 1 ? '' : 's'} verified against stored data
                  </div>
                )}
              </div>
            ))}

            {/* live progress (IV.2/IV.3): changing step label + elapsed, never a bare spinner */}
            {busy && (
              <div className="self-start flex items-center gap-2.5 rounded-xl rounded-bl-sm px-3.5 py-2.5 border" style={{ background: 'var(--c-0a0a14)', borderColor: 'var(--c-1e1e30)' }}>
                <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--c-6c63ff)' }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-xs text-orbit-secondary">{statusLabel || 'Working'}&hellip;</span>
                <span className="text-[10px] text-[color:var(--c-7070a0)] tabular-nums">{elapsed}s</span>
              </div>
            )}
          </div>
        </div>

        {/* input */}
        <div className="flex-shrink-0 border-t border-orbit-border px-4 py-3">
          <form
            onSubmit={e => { e.preventDefault(); ask(input); }}
            className="flex items-center gap-2 rounded-lg border border-orbit-border px-3 py-2"
            style={{ background: 'var(--c-0a0a14)' }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about this project's data…"
              disabled={busy}
              className="flex-1 bg-transparent text-xs text-orbit-primary placeholder:text-[color:var(--c-7070a0)] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="w-7 h-7 rounded-md flex items-center justify-center text-white text-sm disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--c-6c63ff)', backgroundImage: 'linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.22))' }}
              aria-label="Ask"
            >&#8593;</button>
          </form>
          <div className="text-[9.5px] text-[color:var(--c-7070a0)] mt-1.5">
            Answers come only from this project&apos;s stored data &middot; Seer never estimates or fills gaps
          </div>
        </div>
      </div>
    </div>
  );
}
