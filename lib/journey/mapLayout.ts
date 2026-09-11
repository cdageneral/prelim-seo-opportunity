/**
 * lib/journey/mapLayout.ts — v7.489
 *
 * The Journey mind-map's GEOMETRY, moved verbatim out of
 * components/brief/JourneySection.tsx (the v7.466 left-to-right tree, v7.468's
 * no-cap rule and v7.469's collapse are all preserved byte-for-byte).
 *
 * WHY IT MOVED
 * The panel drew the tree inside a `useMemo` that only ever ran for the ONE
 * focused umbrella, so nothing outside that render could ask "what does this
 * journey look like?". The v7.489 PDF export needs the same tree for EVERY
 * umbrella, and the only acceptable way to get a second copy of a picture is to
 * compute it with the SAME function — a second layout implementation would drift
 * from the screen the first time either changed (Const II.6a/II.7).
 *
 * WHAT THIS MODULE IS NOT
 * It holds no data and derives no metric. Volumes, topic labels, category names
 * and the optimize/build action all arrive from the caller, already read from the
 * stored taxonomy (Const II.8 / III.1b) — this file only decides where a box
 * sits. `fmtVol` is INJECTED rather than re-implemented, so the sub-labels the
 * report prints are the exact strings the panel renders (Const I.1).
 */

export type MindKind = 'umbrella' | 'category' | 'topic';
export type MindPlanState = 'none' | 'some' | 'all';

export interface MindNode {
  id: string;
  kind: MindKind;
  level: number;
  x: number;
  y: number;
  label: string;
  sub: string;
  action?: 'optimize' | 'build';
  kids?: number;
  shut?: boolean;
  /** v7.489: the node's Content-Plan checkbox state, carried so the PDF prints it. */
  plan?: MindPlanState;
}

export interface MindEdge { id: string; x1: number; y1: number; x2: number; y2: number; level: number }

export interface MindLayout {
  nodes: MindNode[];
  edges: MindEdge[];
  width: number;
  height: number;
  NW: number[];
  NH: number;
  colX: number[];
}

/** A category and the topics under it, in the order the panel sorted them. */
export interface MindCat {
  name: string;
  /** real monthly volume for the category = the exact roll-up of its topics (Const III.1b) */
  vol: number;
  topics: Array<{ id: string; label: string; vol: number; action: 'optimize' | 'build' }>;
  /**
   * v7.489: the category's REAL topic count, for the at-a-glance overview which draws
   * the categories without their topics. Defaults to `topics.length`, so the panel's
   * own call is unchanged — an overview never under-reports what is under a branch.
   */
  topicCount?: number;
}

// Geometry constants — unchanged from v7.466/v7.468.
export const MIND_NW = [196, 214, 252];
export const MIND_NH = 56;
export const MIND_LEAF_STEP = 70;
export const MIND_COL_GAP = 86;
export const MIND_PAD_X = 26;
export const MIND_TOP_PAD = 46;
export const MIND_CAT_GAP = 26;

export const MIND_COL_X = [
  MIND_PAD_X + MIND_NW[0] / 2,
  MIND_PAD_X + MIND_NW[0] + MIND_COL_GAP + MIND_NW[1] / 2,
  MIND_PAD_X + MIND_NW[0] + MIND_COL_GAP + MIND_NW[1] + MIND_COL_GAP + MIND_NW[2] / 2,
];
export const MIND_WIDTH = MIND_PAD_X * 2 + MIND_NW[0] + MIND_NW[1] + MIND_NW[2] + MIND_COL_GAP * 2;
export const MIND_COL_LABELS = ['UMBRELLA', 'CATEGORY', 'TOPIC'];

/**
 * Node-label truncation, moved verbatim from the panel (v7.489). The report clips
 * labels at the SAME character counts the screen does (topic 26, parent 24), so a
 * name that is shortened on screen is shortened identically on paper.
 */
export function truncMindLabel(s: string, n = 22): string { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

export interface BuildMindLayoutInput {
  /** the focused umbrella, or null when the scope holds none */
  umbrella: { name: string; vol: number } | null;
  /** its categories, already sorted by the caller (panel order: volume desc) */
  cats: MindCat[];
  /** collapse state — display only; it never touches stored data or a total */
  umbShut?: boolean;
  isCatShut?: (catName: string) => boolean;
  /** the panel's own volume formatter, injected so labels cannot drift */
  fmtVol: (v: number) => string;
  /** optional Content-Plan checkbox state per node */
  planStateOf?: (id: string, kind: MindKind) => MindPlanState;
}

/**
 * Place the umbrella -> category -> topic tree left to right. Verbatim port of the
 * v7.466 layout memo: level drives X (three fixed columns), leaf order drives Y,
 * the canvas grows DOWN, and the umbrella is PINNED to the top row rather than
 * centred on its categories (on a tall umbrella the centroid lands a thousand-odd
 * px down and the root would be off-screen on first paint).
 */
export function buildMindLayout(input: BuildMindLayoutInput): MindLayout {
  const { umbrella, cats, fmtVol } = input;
  const umbShut = !!input.umbShut;
  const isCatShut = input.isCatShut ?? (() => false);
  const planStateOf = input.planStateOf;
  const NW = MIND_NW, NH = MIND_NH, colX = MIND_COL_X, width = MIND_WIDTH;

  if (!umbrella) return { nodes: [], edges: [], width, height: 200, NW, NH, colX };

  const nodes: MindNode[] = [];
  const edges: MindEdge[] = [];
  let y = MIND_TOP_PAD + NH / 2;
  let maxY = y;
  const catYs: number[] = [];
  const umbId = 'umb:' + umbrella.name;

  (umbShut ? [] : cats).forEach(cat => {
    const catId = 'cat:' + cat.name;
    const catShut = isCatShut(cat.name);
    const childYs: number[] = [];
    if (!catShut) cat.topics.forEach(t => {
      const cy = y; y += MIND_LEAF_STEP; childYs.push(cy);
      nodes.push({
        id: t.id, kind: 'topic', level: 2, x: colX[2], y: cy,
        label: t.label, sub: `${fmtVol(t.vol)}/mo`, action: t.action,
        plan: planStateOf ? planStateOf(t.id, 'topic') : undefined,
      });
    });
    let cy: number;
    if (childYs.length) { cy = (childYs[0] + childYs[childYs.length - 1]) / 2; }
    else { cy = y; y += MIND_LEAF_STEP; }
    catYs.push(cy);
    nodes.push({
      id: catId, kind: 'category', level: 1, x: colX[1], y: cy,
      label: cat.name, sub: `${fmtVol(cat.vol)}/mo · ${cat.topicCount ?? cat.topics.length} topics`,
      kids: cat.topicCount ?? cat.topics.length, shut: catShut,
      plan: planStateOf ? planStateOf(catId, 'category') : undefined,
    });
    for (const ty of childYs) edges.push({ id: `e1:${cat.name}:${ty}`, x1: colX[1] + NW[1] / 2, y1: cy, x2: colX[2] - NW[2] / 2, y2: ty, level: 2 });
    maxY = Math.max(maxY, cy, childYs.length ? childYs[childYs.length - 1] : cy);
    y += MIND_CAT_GAP;
  });

  const rootY = MIND_TOP_PAD + NH / 2;
  nodes.push({
    id: umbId, kind: 'umbrella', level: 0, x: colX[0], y: rootY,
    label: umbrella.name, sub: `${fmtVol(umbrella.vol)}/mo`,
    kids: cats.length, shut: umbShut,
    plan: planStateOf ? planStateOf(umbId, 'umbrella') : undefined,
  });
  for (const cy of catYs) edges.push({ id: `e0:${cy}`, x1: colX[0] + NW[0] / 2, y1: rootY, x2: colX[1] - NW[1] / 2, y2: cy, level: 1 });

  const height = Math.max(240, maxY + NH / 2 + 24);
  return { nodes, edges, width, height, NW, NH, colX };
}
