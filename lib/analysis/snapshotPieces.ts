/**
 * v7.501 — read one analysis snapshot column in pieces, losslessly.
 *
 * Neon's HTTP driver refuses any single response over 64 MiB (67,108,864 bytes).
 * v7.411 split the project GET so each analysis row got its own response, but a
 * single row can now exceed that on its own: "Sono Bello - SEO & GEO" analysis
 * 0eb03afc measured 63,284,928 bytes on 2026-09-17 (serpapi_snapshot 45,507,417 +
 * semrush_snapshot 16,828,043 + profound_snapshot 949,468). The route degraded to
 * a snapshot-free row and every panel rendered empty. The data was intact.
 *
 * The browser and the function already handle a response that size (First
 * Citizens Bank — Small Business returns 53.14 MB from the same route today). The
 * only ceiling is Neon's per-response cap, so the fix is to ask Postgres for the
 * column in pieces and put it back together here. Nothing is dropped, sampled or
 * projected (Const I.6) — the reassembled value is the stored value.
 *
 *   1. A column whose measured size fits PIECE_BUDGET is read in one query.
 *   2. A larger OBJECT is read one top-level key per query.
 *   3. A key still larger than the budget that is an ARRAY is read in index
 *      ranges. The ranges are packed from each element's MEASURED size
 *      (octet_length, Const I.1), never from an average.
 *   4. Anything that still cannot fit (a single element over the budget, or an
 *      oversized non-array value) throws. The caller degrades honestly.
 *
 * Every size here comes from Postgres. Only integers and the pieces cross the wire.
 */

import { sql } from 'drizzle-orm';
import { db }  from '@/db';

/** Neon's hard per-response limit. */
export const NEON_HTTP_RESPONSE_LIMIT = 67_108_864;

/** Bytes of raw JSON per query. Kept well under the limit because the driver
 *  ships each value inside its own JSON envelope, which escapes the payload. */
export const PIECE_BUDGET = 16_000_000;

/** The only columns this module may name. Identifiers cannot be bound as
 *  parameters, so the column is whitelisted and injected with sql.raw. */
export const SNAPSHOT_COLUMNS = ['semrush_snapshot', 'serpapi_snapshot', 'profound_snapshot'] as const;
export type SnapshotColumn = typeof SNAPSHOT_COLUMNS[number];

function rowsOf(res: any): any[] {
  return (res?.rows ?? res ?? []) as any[];
}

/** Every piece is selected as ::text and parsed here, so the result never depends on
 *  whether the driver would have parsed jsonb itself (a jsonb string "123" must stay a
 *  string). SQL NULL comes back as null. */
function asJson(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error('snapshotPieces: expected text from a ::text select');
  return JSON.parse(v);
}

function col(column: SnapshotColumn) {
  if (!(SNAPSHOT_COLUMNS as readonly string[]).includes(column)) {
    throw new Error(`snapshotPieces: column not allowed: ${column}`);
  }
  return sql.raw(column);
}

/** Pack consecutive items into ranges whose summed bytes stay within budget.
 *  Returns inclusive [from, to] index pairs. Throws if one item alone is over. */
export function packRanges(sizes: number[], budget: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  let acc = 0;
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    if (s > budget) {
      throw new Error(`snapshotPieces: element ${i} is ${s} bytes, over the ${budget}-byte piece budget`);
    }
    if (i > start && acc + s > budget) {
      out.push([start, i - 1]);
      start = i;
      acc = 0;
    }
    acc += s;
  }
  if (sizes.length > 0) out.push([start, sizes.length - 1]);
  return out;
}

/** Read an array-valued top-level key in measured, packed index ranges. */
async function readArrayKey(analysisId: string, column: SnapshotColumn, key: string, budget: number): Promise<unknown[]> {
  const c = col(column);
  const sizeRes = await db.execute(sql`
    SELECT (e.ord - 1)::int AS "i", octet_length(e.v::text)::int AS "b"
      FROM analyses a,
           jsonb_array_elements(a.${c} -> ${key}::text) WITH ORDINALITY AS e(v, ord)
     WHERE a.id = ${analysisId}::uuid
     ORDER BY e.ord
  `);
  const sizes = rowsOf(sizeRes).map(r => Number(r.b ?? 0));
  const ranges = packRanges(sizes, budget);
  const out: unknown[] = [];
  for (const [from, to] of ranges) {
    const path = `$[${from} to ${to}]`;
    const res = await db.execute(sql`
      SELECT jsonb_path_query_array(${c} -> ${key}::text, ${path}::jsonpath)::text AS "v"
        FROM analyses
       WHERE id = ${analysisId}::uuid
    `);
    const piece = asJson(rowsOf(res)[0]?.v);
    if (!Array.isArray(piece) || piece.length !== to - from + 1) {
      throw new Error(`snapshotPieces: ${column}.${key}[${from}..${to}] came back with ${Array.isArray(piece) ? piece.length : 'no'} elements`);
    }
    for (const el of piece) out.push(el);
  }
  if (out.length !== sizes.length) {
    throw new Error(`snapshotPieces: ${column}.${key} reassembled ${out.length} of ${sizes.length} elements`);
  }
  return out;
}

/**
 * Read one snapshot column, in as many queries as its measured size needs.
 * `bytes` is octet_length(column::text), as measured by the caller.
 */
export async function readSnapshotColumn(
  analysisId: string,
  column: SnapshotColumn,
  bytes: number,
  budget: number = PIECE_BUDGET,
): Promise<unknown> {
  const c = col(column);
  if (bytes <= 0) return null;

  if (bytes <= budget) {
    const res = await db.execute(sql`SELECT ${c}::text AS "v" FROM analyses WHERE id = ${analysisId}::uuid`);
    return asJson(rowsOf(res)[0]?.v);
  }

  const typeRes = await db.execute(sql`SELECT jsonb_typeof(${c}) AS "t" FROM analyses WHERE id = ${analysisId}::uuid`);
  const t = rowsOf(typeRes)[0]?.t;
  if (t !== 'object') {
    throw new Error(`snapshotPieces: ${column} is ${bytes} bytes and a ${t}, which cannot be split`);
  }

  const keyRes = await db.execute(sql`
    SELECT k.key AS "k", octet_length(k.value::text)::int AS "b", jsonb_typeof(k.value) AS "t"
      FROM analyses a, jsonb_each(a.${c}) AS k
     WHERE a.id = ${analysisId}::uuid
  `);
  const keys = rowsOf(keyRes).map(r => ({ k: String(r.k), b: Number(r.b ?? 0), t: String(r.t) }));

  const out: Record<string, unknown> = {};
  for (const { k, b, t: kt } of keys) {
    if (b <= budget) {
      const res = await db.execute(sql`SELECT (${c} -> ${k}::text)::text AS "v" FROM analyses WHERE id = ${analysisId}::uuid`);
      out[k] = asJson(rowsOf(res)[0]?.v);
    } else if (kt === 'array') {
      out[k] = await readArrayKey(analysisId, column, k, budget);
    } else {
      throw new Error(`snapshotPieces: ${column}.${k} is ${b} bytes and a ${kt}, which cannot be split`);
    }
  }
  return out;
}
