/**
 * lib/pdf/journeyMapTemplate.ts — v7.489
 *
 * The Journey panel's mind-map, as a printable report. Wayne 2026-09-11:
 * "lets add a pdf export of the journey panel so we can visually see the journey".
 *
 * WHY IT IS A PURE SERIALIZER
 * Every box, every edge and every label in here was POSITIONED BY THE PANEL and
 * arrives in the payload already placed (lib/journey/mapLayout.ts — the same
 * buildMindLayout the screen runs). This template re-derives no volume, no count
 * and no coordinate; it draws what it was handed. Same discipline as the v7.378
 * delivery package and the v7.482 usage report: a rollup READS a metric, it never
 * re-derives one (Const II.6a). A second layout implementation here would drift
 * from the screen the first time either changed.
 *
 * WHY IT HAS ITS OWN :root
 * Chromium renders this HTML standalone — `var(--c-*)` from app/globals.css would
 * resolve to nothing and fills would come out BLACK (the v7.467 class of bug). The
 * palette below is the LIGHT ("warm paper") theme's real token values, hard-coded
 * once, because paper is a light surface. Declared in this file's own :root and
 * re-checked against those declarations by the retained suite's print-template
 * sweep (the v7.482 earned-exemption pattern).
 */

import {
  MIND_COL_LABELS, truncMindLabel,
  type MindLayout, type MindNode, type MindPlanState,
} from '@/lib/journey/mapLayout';
import { fmtSummaryVol, type JourneyPdfSummary } from '@/lib/journey/segmentSummary';

// ── Page geometry: Letter LANDSCAPE at 96dpi ────────────────────────────────────
const PAGE_W = 1056;
const PAGE_H = 816;
const MARGIN = 34;
const HEAD_H = 74;    // title band on every map page
const STRIP_H = 26;   // repeated UMBRELLA/CATEGORY/TOPIC column labels
const FOOT_H = 24;
/** the clipped window into the (arbitrarily tall) umbrella canvas */
const WIN_H = PAGE_H - HEAD_H - STRIP_H - FOOT_H - MARGIN;

// ── Warm-paper palette (the light theme's real values from app/globals.css) ─────
const PALETTE = `
  --paper:#F0EDE5; --card:#FDFCF8; --line:#D9D4C6;
  --ink:#2B2A30; --muted:#5C594F; --faint:#767061;
  --umb:#915d06; --cat:#210574; --topic:#0a7282;
  --green:#1a7655; --red:#8e0707; --accent:#4338CA;
  --umb-fill:rgba(145,93,6,0.06); --cat-fill:rgba(33,5,116,0.06);
  --green-fill:rgba(26,118,85,0.07); --red-fill:rgba(142,7,7,0.06);
`;
const LEVEL_COLOR = ['var(--umb)', 'var(--cat)', 'var(--topic)'];
const LEVEL_FILL  = ['var(--umb-fill)', 'var(--cat-fill)', 'transparent'];

export interface JourneyMapUmbrella {
  name: string;
  /** the exact "2.4M/mo"-style string the panel prints for this umbrella */
  volLabel: string;
  categories: number;
  topics: number;
  existing: number;
  build: number;
  inPlan: number;
  layout: MindLayout;
  /** v7.489: categories only — the whole product line on one sheet, drawn by the same builder */
  overview?: MindLayout | null;
}

export interface JourneyMapInput {
  clientDomain: string;
  projectName?: string | null;
  /** journey scope the panel was showing: all | product | pre */
  scopeLabel: string;
  scopeStatement: string;
  segmentLabel?: string | null;
  planCount: number;
  umbrellas: JourneyMapUmbrella[];
  /** v7.554: the panel's segment summary or all-journeys rollup — printed as page 2, never re-derived */
  summary?: JourneyPdfSummary | null;
  generatedAt: string;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const n0 = (n: number): string => Number(n ?? 0).toLocaleString('en-US');

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Break one umbrella's canvas into page windows. A break is only taken in the GAP
 * between two boxes (node pitch is 70px on a 56px box, so a 14px gutter always
 * exists) — a box is never sliced in half. When a single box is taller than the
 * window the page advances by the raw window height rather than looping forever.
 */
export function paginateMap(layout: MindLayout, winH: number = WIN_H): Array<{ y0: number; y1: number }> {
  const half = layout.NH / 2;
  const tops = layout.nodes.map(n => n.y - half);
  const bottoms = layout.nodes.map(n => n.y + half);
  const first = tops.length ? Math.min(...tops) : 0;
  const last = bottoms.length ? Math.max(...bottoms) : layout.height;
  const start = Math.max(0, first - 16);

  // A page may only break in a gutter that crosses NO box. Topic rows leave a 14px
  // gutter between them, but a CATEGORY box is centred on its children and routinely
  // sits across a topic gutter — breaking there sliced it in half on both pages
  // (caught by the v7.489 straddle check). So the breaks are computed from the MERGED
  // vertical spans of every box, and only a true gap between merged spans is a break.
  const spans = layout.nodes
    .map(n => [n.y - half, n.y + half] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const sp of spans) {
    const tail = merged[merged.length - 1];
    if (tail && sp[0] <= tail[1] + 0.5) tail[1] = Math.max(tail[1], sp[1]);
    else merged.push([sp[0], sp[1]]);
  }
  /** the last box-free gutter at or above `limit`, or null when none exists below it */
  const cutAt = (y0: number, limit: number): number | null => {
    let best: number | null = null;
    for (let i = 0; i < merged.length - 1; i++) {
      const gapTop = merged[i][1], gapBottom = merged[i + 1][0];
      if (gapTop <= y0 + 0.5) continue;          // the gutter must be below this page's start
      if (gapTop > limit) break;                  // and at or above the page's limit
      best = Math.min((gapTop + gapBottom) / 2, limit);
    }
    return best;
  };

  // Pass 1: how many pages does this canvas need at all?
  let pageCount = 0;
  for (let y = start, guard = 0; y < last && guard++ < 400; pageCount++) {
    if (y + winH >= last) { pageCount++; break; }
    const next = cutAt(y, y + winH);
    y = next == null ? y + winH : next;
  }
  pageCount = Math.max(1, pageCount);

  // Pass 2: spread the rows evenly across exactly that many pages, so the last page is
  // never left holding a single orphan box. No page ever exceeds the printable window.
  const pages: Array<{ y0: number; y1: number }> = [];
  let y0 = start;
  for (let i = 0; i < pageCount; i++) {
    const remainingPages = pageCount - i;
    if (remainingPages === 1) { pages.push({ y0, y1: last + 12 }); break; }
    const target = y0 + Math.min(winH, (last - y0) / remainingPages + layout.NH);
    const next = cutAt(y0, target) ?? cutAt(y0, y0 + winH) ?? (y0 + winH);
    pages.push({ y0, y1: next });
    y0 = next;
    if (y0 >= last) break;
  }
  if (!pages.length) pages.push({ y0: start, y1: last + 12 });
  return pages;
}

function checkbox(x: number, y: number, state: MindPlanState | undefined): string {
  const s = 15;
  const on = state === 'all';
  const some = state === 'some';
  const fill = on ? 'var(--green)' : some ? 'var(--green-fill)' : 'var(--card)';
  const stroke = state && state !== 'none' ? 'var(--green)' : 'var(--faint)';
  const mark = on
    ? `<path d="M${x + 3.4},${y + 7.6} l2.8,2.8 l5.2,-6" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    : some
      ? `<rect x="${x + 3}" y="${y + s / 2 - 1}" width="${s - 6}" height="2" rx="1" fill="var(--green)"/>`
      : '';
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>${mark}`;
}

/**
 * One node, drawn exactly as the panel draws it (v7.467 status-outlined topics).
 * `ghostY` re-pins a parent that scrolled off the top of this page: its children are
 * here, so the branch has to show where they hang from. A ghost is drawn dashed and
 * labelled "continued" so it can never be mistaken for a second copy of the node.
 */
function nodeSVG(n: MindNode, layout: MindLayout, ghostY?: number): string {
  const lv = Math.min(n.level, 2);
  const w = layout.NW[lv];
  const h = layout.NH;
  const isTopic = n.kind === 'topic';
  const existing = n.action === 'optimize';
  const statusColor = existing ? 'var(--green)' : 'var(--red)';
  const stroke = isTopic ? statusColor : LEVEL_COLOR[lv];
  const fill = isTopic ? (existing ? 'var(--green-fill)' : 'var(--red-fill)') : LEVEL_FILL[lv];
  const cy = ghostY ?? n.y;
  const x = n.x - w / 2;
  const y = cy - h / 2;
  const bw = existing ? 52 : 38;
  const cbx = x + (n.level === 0 ? 16 : 9);
  const cby = y + 7;
  const label = esc(truncMindLabel(n.label, isTopic ? 26 : 24));
  const labelY = isTopic ? cy - 9 : (n.sub ? cy - 2 : cy + 4);
  const body = isTopic
    ? `<text x="${x + 12}" y="${cy + 13}" text-anchor="start" fill="${statusColor}" font-size="9" font-weight="700">${esc(n.sub)}</text>
       <rect x="${n.x + w / 2 - bw - 8}" y="${cy + 2}" width="${bw}" height="15" rx="7.5" fill="var(--paper)" stroke="${statusColor}" stroke-width="0.9"/>
       <text x="${n.x + w / 2 - 8 - bw / 2}" y="${cy + 12.5}" text-anchor="middle" fill="${statusColor}" font-size="8" font-weight="700" letter-spacing="0.03em">${existing ? 'EXISTING' : 'BUILD'}</text>`
    : (n.sub ? `<text x="${n.x}" y="${cy + 13}" text-anchor="middle" fill="${LEVEL_COLOR[lv]}" font-size="9" font-weight="700">${esc(n.sub)}</text>` : '');
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.level === 0 ? 24 : 14}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${ghostY != null ? ' stroke-dasharray="5 4"' : ''}/>
    ${ghostY != null ? `<text x="${n.x + w / 2 - 8}" y="${y - 4}" text-anchor="end" fill="var(--faint)" font-size="7.5" font-weight="700" letter-spacing="0.06em">CONTINUED</text>` : ''}
    ${checkbox(cbx, cby, n.plan)}
    <text x="${n.x}" y="${labelY}" text-anchor="middle" fill="var(--ink)" font-size="${n.level === 0 ? 12 : 11}" font-weight="600">${label}</text>
    ${body}
  </g>`;
}

function edgeSVG(e: { x1: number; y1: number; x2: number; y2: number; level: number }): string {
  const mx = (e.x1 + e.x2) / 2;
  return `<path d="M${e.x1},${e.y1} C${mx},${e.y1} ${mx},${e.y2} ${e.x2},${e.y2}" fill="none" stroke="${LEVEL_COLOR[Math.min(e.level, 2)]}" stroke-width="2.2" opacity="0.6"/>`;
}

function columnStrip(layout: MindLayout, scale: number, offsetX: number, levels: Set<number>): string {
  return MIND_COL_LABELS.map((lab, i) => {
    if (!levels.has(i)) return '';
    const cx = (layout.colX[i] - layout.NW[i] / 2) * scale + offsetX;
    const wid = layout.NW[i] * scale;
    return `<text x="${cx}" y="14" fill="${LEVEL_COLOR[i]}" font-size="9" font-weight="700" letter-spacing="0.08em">${lab}</text>
            <line x1="${cx}" y1="20" x2="${cx + wid}" y2="20" stroke="${LEVEL_COLOR[i]}" stroke-width="1" opacity="0.35"/>`;
  }).join('');
}

function legend(): string {
  const dot = (c: string, l: string) => `<span class="lg"><i style="background:${c}"></i>${l}</span>`;
  return `<div class="legend">
    ${dot('var(--umb)', 'Umbrella (product line)')}
    ${dot('var(--cat)', 'Category')}
    ${dot('var(--green)', 'EXISTING — you already rank or hold a page')}
    ${dot('var(--red)', 'BUILD — net-new page')}
    <span class="lg"><svg width="13" height="13" viewBox="0 0 15 15">${checkbox(0, 0, 'all')}</svg>In your Content Plan</span>
  </div>`;
}

function coverPage(d: JourneyMapInput): string {
  const totals = d.umbrellas.reduce((a, u) => ({
    cats: a.cats + u.categories, topics: a.topics + u.topics,
    existing: a.existing + u.existing, build: a.build + u.build, plan: a.plan + u.inPlan,
  }), { cats: 0, topics: 0, existing: 0, build: 0, plan: 0 });
  const rows = d.umbrellas.map(u => `<tr>
      <td><b>${esc(u.name)}</b></td>
      <td class="num">${esc(u.volLabel)}</td>
      <td class="num">${n0(u.categories)}</td>
      <td class="num">${n0(u.topics)}</td>
      <td class="num green">${n0(u.existing)}</td>
      <td class="num red">${n0(u.build)}</td>
      <td class="num">${n0(u.inPlan)}</td>
    </tr>`).join('');
  return `<section class="page cover">
    <div class="kicker">OrbitIQ &middot; User Journey Map</div>
    <h1>${esc(d.clientDomain || d.projectName || 'Journey map')}</h1>
    <div class="sub">Topic hierarchy &mdash; umbrella &rarr; category &rarr; topic, drawn from the stored taxonomy. ${esc(d.scopeStatement)}</div>
    <div class="tiles">
      <div class="tile"><div class="tv">${n0(d.umbrellas.length)}</div><div class="tl">Umbrellas</div></div>
      <div class="tile"><div class="tv">${n0(totals.cats)}</div><div class="tl">Categories</div></div>
      <div class="tile"><div class="tv">${n0(totals.topics)}</div><div class="tl">Topics</div></div>
      <div class="tile"><div class="tv green">${n0(totals.existing)}</div><div class="tl">Existing pages</div></div>
      <div class="tile"><div class="tv red">${n0(totals.build)}</div><div class="tl">To build</div></div>
      <div class="tile"><div class="tv">${n0(totals.plan)}</div><div class="tl">In Content Plan</div></div>
    </div>
    <table class="tbl">
      <tr><th>Umbrella</th><th class="num">Volume</th><th class="num">Categories</th><th class="num">Topics</th><th class="num">Existing</th><th class="num">Build</th><th class="num">In plan</th></tr>
      ${rows}
    </table>
    ${legend()}
    <div class="src">Every volume is a real Semrush figure rolled up from the stored keyword pool; every box is a stored taxonomy node. Nothing on these pages is modeled, sampled or capped (Constitution I.1 / I.6). Counts and positions are the panel's own &mdash; this report re-derives none of them (Constitution II.6a).</div>
    <div class="stamp">Generated ${esc(fmtStamp(d.generatedAt))}${d.segmentLabel ? ` &middot; segment lens: ${esc(d.segmentLabel)}` : ''}</div>
  </section>`;
}

/**
 * Which node owns which, read off the edges the panel already drew — the report never
 * rebuilds the hierarchy (Const II.8 / III.1b), it reads the connections it was given.
 */
function parentOf(layout: MindLayout): Map<string, string> {
  const byAnchor = new Map<string, MindNode>();
  for (const n of layout.nodes) {
    const w = layout.NW[Math.min(n.level, 2)];
    byAnchor.set(`R:${(n.x + w / 2).toFixed(1)}:${n.y.toFixed(1)}`, n);   // right edge = a parent anchor
  }
  const byLeft = new Map<string, MindNode>();
  for (const n of layout.nodes) {
    const w = layout.NW[Math.min(n.level, 2)];
    byLeft.set(`L:${(n.x - w / 2).toFixed(1)}:${n.y.toFixed(1)}`, n);     // left edge = a child anchor
  }
  const m = new Map<string, string>();
  for (const e of layout.edges) {
    const parent = byAnchor.get(`R:${e.x1.toFixed(1)}:${e.y1.toFixed(1)}`);
    const child  = byLeft.get(`L:${e.x2.toFixed(1)}:${e.y2.toFixed(1)}`);
    if (parent && child) m.set(child.id, parent.id);
  }
  return m;
}

function mapPages(u: JourneyMapUmbrella, d: JourneyMapInput, layout: MindLayout, kicker: string): string {
  const avail = PAGE_W - MARGIN * 2;
  const scale = Math.min(1, avail / Math.max(1, layout.width));
  const offsetX = Math.max(0, (avail - layout.width * scale) / 2);
  const windows = paginateMap(layout, WIN_H / Math.max(scale, 0.01));
  const half = layout.NH / 2;
  const parents = parentOf(layout);
  const byId = new Map(layout.nodes.map(n => [n.id, n] as [string, MindNode]));
  const levels = new Set(layout.nodes.map(n => Math.min(n.level, 2)));

  return windows.map((win, i) => {
    const inWin = layout.nodes.filter(n => n.y + half > win.y0 && n.y - half < win.y1);
    const onPage = new Set(inWin.map(n => n.id));

    // A parent whose children are on this page but which sits above the fold is re-pinned
    // at the top of its own column, dashed and marked CONTINUED — so no box on any page is
    // ever an orphan and the branch it belongs to is always named.
    const ghostY = new Map<string, number>();
    const ghosts: MindNode[] = [];
    const seen = new Set<string>();
    const wantGhost = (id: string) => {
      if (onPage.has(id) || seen.has(id)) return;   // one ghost per node, never a stack of copies
      const g = byId.get(id);
      if (!g) return;
      seen.add(id);
      ghosts.push(g);
      const pid = parents.get(id);
      if (pid) wantGhost(pid);                      // a ghost's own parent is pinned too
    };
    for (const n of inWin) { const pid = parents.get(n.id); if (pid) wantGhost(pid); }
    // Two categories can both be off-page when a page spans the tail of one branch and
    // the head of the next, so ghosts STACK within their own column instead of landing on
    // top of each other. They stack in the order their children appear down the page.
    const stacked = new Map<number, number>();
    for (const g of ghosts) {
      const k = stacked.get(g.level) ?? 0;
      stacked.set(g.level, k + 1);
      ghostY.set(g.id, win.y0 + half + 16 + k * (layout.NH + 12));
    }

    const yOf = (n: MindNode) => ghostY.get(n.id) ?? n.y;
    const drawn = inWin.concat(ghosts);
    const drawnIds = new Set(drawn.map(n => n.id));
    // Re-anchor an edge onto the ghost it now hangs from; drop edges with no box on this page.
    const edges = layout.edges.map(e => {
      const child = drawn.find(n => {
        const w = layout.NW[Math.min(n.level, 2)];
        return Math.abs(n.x - w / 2 - e.x2) < 0.6 && Math.abs(n.y - e.y2) < 0.6;
      });
      if (!child || !drawnIds.has(child.id)) return null;
      const pid = parents.get(child.id);
      if (!pid || !drawnIds.has(pid)) return null;
      const p = byId.get(pid)!;
      return { ...e, y1: yOf(p), y2: yOf(child) };
    }).filter(Boolean) as Array<{ x1: number; y1: number; x2: number; y2: number; level: number }>;

    const h = (win.y1 - win.y0) * scale;
    const cont = i > 0;
    return `<section class="page">
      <div class="band">
        <div>
          <div class="kicker">${esc(kicker)}${cont ? ' &middot; continued' : ''}</div>
          <div class="uname">${esc(u.name)}</div>
        </div>
        <div class="ustats">
          <span><b>${esc(u.volLabel)}</b> searches/mo</span>
          <span>${n0(u.categories)} categories &middot; ${n0(u.topics)} topics</span>
          <span class="green">${n0(u.existing)} existing</span>
          <span class="red">${n0(u.build)} to build</span>
        </div>
      </div>
      <svg class="strip" width="${avail}" height="${STRIP_H}" viewBox="0 0 ${avail} ${STRIP_H}">${columnStrip(layout, scale, offsetX, levels)}</svg>
      <svg class="map" width="${avail}" height="${Math.max(10, h)}" viewBox="0 0 ${avail} ${Math.max(10, h)}">
        <g transform="translate(${offsetX},0) scale(${scale}) translate(0,${-win.y0})">
          ${edges.map(edgeSVG).join('')}
          ${inWin.map(n => nodeSVG(n, layout)).join('')}
          ${ghosts.map(g => nodeSVG(g, layout, ghostY.get(g.id))).join('')}
        </g>
      </svg>
      <div class="foot"><span>${esc(d.clientDomain || '')} &middot; ${esc(d.scopeLabel)}</span><span>${esc(u.name)} &mdash; ${esc(kicker)} page ${i + 1} of ${windows.length}</span></div>
    </section>`;
  }).join('');
}

/**
 * v7.554: the segment Journey & Content Gap page (one segment selected) or the
 * all-journeys rollup page (All Segments). Every figure is the panel's own, handed over
 * pre-computed by lib/journey/segmentSummary.ts — this function formats, it never counts.
 * Covers BOTH journey lanes (the panel summary does), whatever lane the map pages show.
 * No persona photo: the report stays fully self-contained (no external requests).
 */
export function summaryPage(d: JourneyMapInput): string {
  const sm = d.summary;
  if (!sm) return '';
  const sl = sm.slice;
  const tiles = `<div class="tiles">
      <div class="tile"><div class="tv">${n0(sl.lobs)}</div><div class="tl">LOBs</div></div>
      <div class="tile"><div class="tv">${n0(sl.categories)}</div><div class="tl">Categories</div></div>
      <div class="tile"><div class="tv">${n0(sl.topics)}</div><div class="tl">Topics</div></div>
      <div class="tile"><div class="tv green">${n0(sl.existing)}</div><div class="tl">Existing pages</div></div>
      <div class="tile"><div class="tv red">${n0(sl.build)}</div><div class="tl">To build</div></div>
      <div class="tile"><div class="tv">${n0(sl.inPlan)}</div><div class="tl">In Content Plan</div></div>
    </div>`;
  const table = sl.umbrellas.length ? `<table class="tbl">
      <tr><th>Umbrella</th><th class="num">Volume</th><th class="num">Categories</th><th class="num">Topics</th><th class="num">Existing</th><th class="num">Build</th><th class="num">In plan</th></tr>
      ${sl.umbrellas.map(u => `<tr>
        <td><b>${esc(u.name)}</b></td>
        <td class="num">${esc(fmtSummaryVol(u.volume))}/mo</td>
        <td class="num">${n0(u.categories)}</td>
        <td class="num">${n0(u.topics)}</td>
        <td class="num green">${n0(u.existing)}</td>
        <td class="num red">${n0(u.build)}</td>
        <td class="num">${n0(u.inPlan)}</td>
      </tr>`).join('')}
    </table>` : `<div class="sub">No journey topics are attributed to this segment yet.</div>`;

  if (sm.kind === 'segment' && sm.persona) {
    const p = sm.persona;
    const blk = (t: string, v?: string) => v ? `<div class="pblk"><div class="plab">${esc(t)}</div><div class="ptxt">${esc(v)}</div></div>` : '';
    const path = (p.touchpoints ?? []).length
      ? `<div class="pblk"><div class="plab">Path to purchase</div>${(p.touchpoints ?? []).map((tp, i) => `<div class="ptxt"><b>${i + 1}. ${esc(tp.stage)}</b>${tp.description ? ` &mdash; ${esc(tp.description)}` : ''}</div>`).join('')}</div>` : '';
    return `<section class="page" data-summary="segment">
      <div class="kicker">OrbitIQ &middot; Audience journey</div>
      <h1 style="font-size:28px">${esc(p.label)}: <span style="color:var(--umb)">Journey &amp; Content Gap</span></h1>
      <div class="sumgrid">
        <div class="pcard">
          <div class="plabel">${esc(p.label)}</div>
          <div class="pname">${esc(p.name)}</div>
          ${p.volumePct ? `<div class="ppct"><b>${n0(p.volumePct)}%</b> of volume <span>(modeled share of real demand)</span></div>` : ''}
          ${p.tagline ? `<div class="pquote">&ldquo;${esc(p.tagline)}&rdquo;</div>` : ''}
          ${blk('Who they are', p.demographics)}
          ${blk('The wake-up call', p.trigger)}
          ${blk('Influence & validation', p.influencerRole)}
          ${path}
          ${blk('Messaging that wins', p.messagingAndTone)}
        </div>
        <div class="sumright">${tiles}${table}${legend()}</div>
      </div>
      <div class="src">Both journey lanes. Volumes are real Semrush monthly searches, each keyword counted once. Topics are attributed to this segment by the audience-language partition every panel uses (a modeled attribution, Constitution I.5a). In plan = this segment&rsquo;s topics in the Content Plan. Figures are the panel&rsquo;s own (Constitution II.6a).</div>
    </section>`;
  }

  const r = sm.rollup;
  if (!r) return '';
  const segCards = r.segments.length
    ? `<div class="rsegs">${r.segments.map(s => `<div class="rseg"><div class="rsl">${esc(s.label)}</div><div class="rsv">${n0(s.topics)}</div><div class="rss">${esc(s.name)}</div></div>`).join('')}
        <div class="rseg ov"><div class="rsl">Overlapping segments</div><div class="rsv">${n0(r.shared)}</div><div class="rss">shared across segments</div></div></div>` : '';
  return `<section class="page" data-summary="rollup">
    <div class="kicker">OrbitIQ &middot; All audience journeys</div>
    <div class="rhead">Total pages required in all product journeys</div>
    <div class="rtop">
      <div><div class="rbig">${n0(r.topics)}</div><div class="sub">topics across ${n0(r.categories)} categories &middot; <span class="green">${n0(sl.existing)} existing</span> &middot; <span class="red">${n0(sl.build)} to build</span></div></div>
      <div class="rvol">
        <div class="rvl">Total annual search volume</div><div><span class="rvv">${esc(fmtSummaryVol(r.annualVolume))}</span> searches / yr</div>
        <div class="rvl" style="margin-top:8px">Total monthly volume</div><div><span class="rvv2">${esc(fmtSummaryVol(r.monthlyVolume))}</span> searches / mo</div>
      </div>
    </div>
    ${segCards}
    ${table}
    <div class="src">One topic = one page; both journey lanes. Monthly volume is the real Semrush average monthly searches across every journey keyword, each keyword counted once; annual = monthly &times; 12.${r.segments.length ? ' Segment counts use the panels&rsquo; audience-language partition (a modeled attribution, Constitution I.5a); overlapping = topics shared by more than one segment or matching none specifically. Segments + overlapping sum to the total.' : ''} Figures are the panel&rsquo;s own (Constitution II.6a).</div>
  </section>`;
}

function umbrellaPages(u: JourneyMapUmbrella, d: JourneyMapInput): string {
  // An umbrella leads with its shape — umbrella -> categories, the whole product line
  // at a glance — then every topic underneath it. Both trees come from the same builder.
  const glance = u.overview ? mapPages(u, d, u.overview, 'At a glance') : '';
  return glance + mapPages(u, d, u.layout, 'Journey map');
}

export function buildJourneyMapHTML(d: JourneyMapInput): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OrbitIQ Journey Map</title>
<style>
  :root { ${PALETTE} }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:var(--paper); color:var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .page { width:${PAGE_W}px; height:${PAGE_H}px; padding:${MARGIN}px; background:var(--paper);
    page-break-after:always; break-after:page; position:relative; overflow:hidden; }
  .page:last-child { page-break-after:auto; break-after:auto; }
  .kicker { font-size:9px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--umb); }
  h1 { font-size:34px; margin:6px 0 4px; font-weight:700; letter-spacing:-0.01em; }
  .sub { font-size:12px; color:var(--muted); max-width:8.4in; line-height:1.55; }
  .band { height:${HEAD_H - 18}px; display:flex; align-items:flex-end; justify-content:space-between;
    border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:8px; }
  .uname { font-size:21px; font-weight:700; margin-top:2px; }
  .ustats { display:flex; gap:16px; font-size:11px; color:var(--muted); align-items:baseline; }
  .strip { display:block; margin:0 auto; }
  .map { display:block; margin:0 auto; }
  .foot { position:absolute; left:${MARGIN}px; right:${MARGIN}px; bottom:${MARGIN - 14}px;
    display:flex; justify-content:space-between; font-size:9px; color:var(--faint);
    border-top:1px solid var(--line); padding-top:5px; }
  .tiles { display:flex; gap:10px; margin:20px 0 16px; }
  .tile { flex:1; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .tv { font-size:26px; font-weight:700; }
  .tl { font-size:10px; color:var(--muted); margin-top:2px; }
  .green { color:var(--green); } .red { color:var(--red); }
  .tbl { width:100%; border-collapse:collapse; font-size:11.5px; margin-top:4px; }
  .tbl th { text-align:left; font-size:9px; letter-spacing:.08em; text-transform:uppercase;
    color:var(--faint); border-bottom:1px solid var(--line); padding:6px 8px; }
  .tbl td { padding:6px 8px; border-bottom:1px solid var(--line); }
  .tbl .num { text-align:right; font-variant-numeric:tabular-nums; }
  .legend { display:flex; gap:18px; flex-wrap:wrap; margin-top:18px; font-size:10.5px; color:var(--muted); align-items:center; }
  .lg { display:inline-flex; align-items:center; gap:6px; }
  .lg i { width:10px; height:10px; border-radius:3px; display:inline-block; }
  .src { font-size:9px; color:var(--faint); line-height:1.5; margin-top:16px; max-width:9in; }
  .sumgrid { display:flex; gap:18px; margin-top:12px; align-items:flex-start; }
  .pcard { width:3.1in; flex:none; background:var(--card); border:1px solid var(--line); border-top:4px solid var(--umb); border-radius:10px; padding:12px 14px; }
  .plabel { font-size:8.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--umb); }
  .pname { font-size:17px; font-weight:700; margin-top:2px; }
  .ppct { font-size:10.5px; color:var(--muted); margin-top:4px; } .ppct span { color:var(--faint); font-size:9px; }
  .pquote { font-size:10.5px; font-style:italic; border-left:3px solid var(--umb); padding-left:8px; margin-top:8px; line-height:1.45; }
  .pblk { margin-top:8px; } .plab { font-size:8px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--cat); }
  .ptxt { font-size:9.5px; color:var(--muted); line-height:1.45; margin-top:1px; }
  .sumright { flex:1; min-width:0; } .sumright .tiles { margin-top:0; }
  .rhead { font-size:15px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--umb); margin-top:10px; }
  .rtop { display:flex; gap:36px; align-items:center; margin:8px 0 14px; }
  .rbig { font-size:88px; font-weight:800; line-height:1; color:var(--cat); }
  .rvol { border-left:4px solid var(--umb); padding-left:18px; font-size:12px; color:var(--muted); }
  .rvl { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
  .rvv { font-size:34px; font-weight:800; color:var(--cat); } .rvv2 { font-size:24px; font-weight:800; color:var(--muted); }
  .rsegs { display:flex; gap:12px; margin-bottom:14px; }
  .rseg { flex:1; background:var(--card); border-top:5px solid var(--cat); padding:10px 14px; border-radius:0 0 8px 8px; }
  .rseg.ov { border-top-color:var(--umb); } .rseg.ov .rsv { color:var(--umb); }
  .rsl { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
  .rsv { font-size:34px; font-weight:800; color:var(--cat); line-height:1.1; }
  .rss { font-size:10px; color:var(--muted); }
  .stamp { position:absolute; left:${MARGIN}px; bottom:${MARGIN}px; font-size:9px; color:var(--faint); }
</style></head><body>
${coverPage(d)}
${summaryPage(d)}
${d.umbrellas.map(u => umbrellaPages(u, d)).join('')}
</body></html>`;
}
