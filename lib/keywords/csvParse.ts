/**
 * lib/keywords/csvParse.ts — v7.459 (Wayne, 2026-08-14)
 *
 * THE one header-aware keyword-CSV parser (Const II.7). Both upload paths — the
 * Keyword panel (client rows + the competitor-gap dropdown) and the Competitors
 * modal — parse through THIS module.
 *
 * Born from a real defect: the modal kept its own v7.92 parser, which never
 * learned the URL column (v7.251) or the Position Type column (v7.451). Five
 * Synchrony competitors uploaded through the modal (us.etrade, capitalone,
 * openbank, breadfinancial, americanexpress) lost every landing URL their
 * Semrush export carried — their positions survived, so the page-1 ladder was
 * full strength while the Content Footprint read "no URL data" (Wayne: "those
 * URLs exist in the csv upload"). Two parsers drifting is exactly what II.7
 * exists to prevent; this file ends the fork.
 *
 * Column detection is the UNION of both parsers' historical header aliases —
 * a file that parsed through either path before parses identically here.
 */

export interface CsvKwRow {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  /** v7.451: Semrush "Position Type" — 'Organic' or a SERP-feature name, verbatim.
   *  Absent => null, which reads as an UNVERIFIED basis downstream, never organic. */
  positionType: string | null;
  /** v7.103: raw Semrush "SERP Features by Keyword" list, verbatim. */
  serpFeatures: string | null;
  /** v7.251: real ranking/landing URL for this keyword (real data only, I.1). */
  url:          string | null;
  /** Raw "type" column value when the file carries one (simple exports), lowercased. */
  typeRaw:      string | null;
}

/** Proper quoted-field CSV splitter (shared verbatim from both prior parsers). */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.replace(/\r$/, '').trim());
  return result;
}

/** Column-presence metadata — the upload UIs warn on a MISSING column (e.g. no
 *  "Position Type" means every position is of unknown basis, v7.451), which is a
 *  property of the file's header, not of any parsed row. */
export interface CsvParseMeta {
  rows: CsvKwRow[];
  hasPositionType: boolean;
  hasUrl: boolean;
  hasSerpFeatures: boolean;
}

/** Parse a keyword CSV (client, competitor, Semrush Positions export, or the
 *  simple keyword/search_volume/type layout). Returns rows + header metadata. */
export function parseKeywordCsvMeta(text: string): CsvParseMeta {
  const rows = parseKeywordCsv(text);
  const header = ((text.replace(/^﻿/, '').split(/\r\n|\r|\n/)[0]) ?? '').toLowerCase();
  const cols = header.split(',').map(c => c.replace(/^"|"$/g, '').trim());
  return {
    rows,
    hasPositionType: cols.some(h => ['position type', 'position_type', 'positiontype', 'type of position'].includes(h)),
    hasUrl:          cols.some(h => ['url', 'ranking url', 'landing page', 'page', 'page url', 'address', 'current url', 'target url'].includes(h)),
    hasSerpFeatures: cols.some(h => ['serp features by keyword', 'serp features', 'serp_features'].includes(h)),
  };
}

/** Parse a keyword CSV (client, competitor, Semrush Positions export, or the
 *  simple keyword/search_volume/type layout). Returns [] when no data rows. */
export function parseKeywordCsv(text: string): CsvKwRow[] {
  // BOM strip (modal lineage) + newline normalise (panel lineage)
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const dataLines = lines.slice(1).filter((l: string) => l.trim().length > 0);
  if (dataLines.length === 0) return [];

  const headerCols = (lines[0] ?? '').toLowerCase().split(',').map((c: string) => c.replace(/^"|"$/g, '').trim());
  const findIdx = (names: string[], fallback: number) => {
    const i = headerCols.findIndex((h: string) => names.includes(h));
    return i >= 0 ? i : fallback;
  };
  // union of both parsers' aliases (panel: keyword/keywords · modal adds ph/query, pos/po, nq)
  const kwCol      = findIdx(['keyword', 'keywords', 'ph', 'query'], 0);
  const volCol     = findIdx(['search volume', 'search_volume', 'searchvolume', 'volume', 'monthly volume', 'nq'], 1);
  const posCol     = findIdx(['position', 'rank', 'ranking position', 'pos', 'po'], -1);
  const typeCol    = findIdx(['type'], -1);
  const posTypeCol = findIdx(['position type', 'position_type', 'positiontype', 'type of position'], -1);
  const featCol    = findIdx(['serp features by keyword', 'serp features', 'serp_features'], -1);
  const urlCol     = findIdx(['url', 'ranking url', 'landing page', 'page', 'page url', 'address', 'current url', 'target url'], -1);

  const rows: CsvKwRow[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    const strip = (s: string | undefined) => (s ?? '').replace(/^"|"$/g, '').trim();
    const keyword = strip(cols[kwCol]);
    if (!keyword) continue;
    rows.push({
      keyword,
      searchVolume: parseInt(cols[volCol] ?? '0') || 0,
      position:     posCol >= 0 ? (parseInt(cols[posCol] ?? '') || null) : null,
      positionType: posTypeCol >= 0 ? (strip(cols[posTypeCol]) || null) : null,
      serpFeatures: featCol    >= 0 ? (strip(cols[featCol])    || null) : null,
      url:          urlCol     >= 0 ? (strip(cols[urlCol])     || null) : null,
      typeRaw:      typeCol    >= 0 ? (strip(cols[typeCol]).toLowerCase() || null) : null,
    });
  }
  return rows;
}
