'use client';
/**
 * lib/pages/usePageMap.ts — v7.549
 *
 * The project page's AUTOMATIC page-map runner (Wayne: "the mapping should happen automatically
 * on a project, we dont want each user to remember or have to hit map pages"). On load — and
 * again whenever the analysis or the keyword set changes — it reads the map's status and, when
 * work is pending, calls the step route until the phase is 'done'. One runner per store (the
 * route's lock); a second tab polls instead of racing. A step that makes no progress three
 * times in a row stops the loop and surfaces the route's last error (never a silent spin).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageMapStatus, NodeMapping, PageMapPhase } from '@/lib/pages/pageMap';

export interface PageMapProgress { phase: PageMapPhase; done: number; total: number; remaining: number }

export interface PageMapState {
  status:   PageMapStatus | null;
  nodes:    Record<string, NodeMapping>;
  progress: PageMapProgress | null;
  running:  boolean;
  error:    string | null;
  refresh:  () => Promise<PageMapStatus | null>;
  run:      (force?: 'all' | 'map') => Promise<void>;
}

const STALL_LIMIT = 3;

export function usePageMap(projectId: string, ready: boolean, version: string | number = 0): PageMapState {
  const [status, setStatus]     = useState<PageMapStatus | null>(null);
  const [nodes, setNodes]       = useState<Record<string, NodeMapping>>({});
  const [progress, setProgress] = useState<PageMapProgress | null>(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const tokenRef   = useRef<string>(Math.random().toString(36).slice(2, 14));
  const runningRef = useRef(false);
  const aliveRef   = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const refresh = useCallback(async (): Promise<PageMapStatus | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/page-mapping`, { cache: 'no-store' });
      if (!res.ok) return null;
      const d = await res.json();
      if (!aliveRef.current) return null;
      setStatus(d.status ?? null);
      setNodes(d.nodes ?? {});
      return d.status ?? null;
    } catch { return null; }
  }, [projectId]);

  const run = useCallback(async (force?: 'all' | 'map') => {
    if (runningRef.current) return;
    runningRef.current = true; setRunning(true); setError(null);
    let stalls = 0, first = true;
    try {
      for (;;) {
        if (!aliveRef.current) break;
        let res: Response;
        try {
          res = await fetch(`/api/projects/${projectId}/page-mapping`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenRef.current, ...(first && force ? { force } : {}) }),
          });
        } catch { stalls++; if (stalls >= STALL_LIMIT) { setError('The page map step could not be reached.'); break; } continue; }
        first = false;
        if (res.status === 409) {
          // another runner holds the lock — poll until it is done
          await new Promise(r => setTimeout(r, 10_000));
          const st = await refresh();
          if (!st || st.phase === 'done' || !st.running) { if (st && st.phase !== 'done') continue; break; }
          continue;
        }
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* keep */ }
          setError(msg); break;
        }
        const d = await res.json();
        if (!aliveRef.current) break;
        setProgress({ phase: d.phase, done: d.done ?? 0, total: d.total ?? 0, remaining: d.remaining ?? 0 });
        if (d.status) setStatus(d.status);
        if (d.status?.phase === 'done' || d.remaining === 0) break;
        if ((d.done ?? 0) === 0) { stalls++; if (stalls >= STALL_LIMIT) { setError(d.status?.lastError ? `Page map stopped: ${d.status.lastError}` : 'Page map made no progress — it will retry on the next load.'); break; } }
        else stalls = 0;
      }
    } finally {
      runningRef.current = false;
      if (aliveRef.current) { setRunning(false); setProgress(null); await refresh(); }
    }
  }, [projectId, refresh]);

  // auto: read the status; run when anything is pending and nobody else is running it;
  // when another runner holds the lock, look again in 30 s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const st = await refresh();
      if (cancelled || !st) return;
      if (st.phase === 'done' || st.nodes.total === 0) return;
      if (st.running && !runningRef.current) { timer = setTimeout(() => setTick(t => t + 1), 30_000); return; }
      void run();
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [ready, version, tick, refresh, run]);

  return { status, nodes, progress, running, error, refresh, run };
}
