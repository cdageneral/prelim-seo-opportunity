// ─── v7.252: READ-ONLY keyword-count provenance ────────────────────────────────
// Pure, dependency-free partition of the "All Keywords" pool by its REAL source so
// the headline count is fully traceable (Const I.2) and any unexpected source or
// duplicate rows is visible. This reads existing data only — it writes nothing and
// changes no count. It is intentionally a standalone lib so it can be unit-tested
// against the real compiled code in the retained regression suite (Const V.6).
//
// Buckets (each pool row lands in exactly one — no double counting, Const I.3):
//   upload  = client footprint keyword present in the uploaded CSV/manual rows
//   crawl   = client footprint keyword present ONLY via the Semrush auto-crawl
//             (semrushSnapshot.topKeywords, populated by "Run Analysis")
//   demand  = deep-journey "missing demand" universe (origin:'demand')
//   gap     = competitor gap (the client does not rank; a competitor does)
// `rawDbRows` vs `distinctDb` exposes duplicate keyword rows in the upload.

export interface ProvenanceRow {
  keyword:    string;
  type:       'ranked' | 'gap';
  origin:     'footprint' | 'demand';
  competitor: string | null;
}

export interface ProvenanceDbRow {
  keyword: string;
  source?: string;          // 'csv' | 'custom' | 'blocked' | …
  type?:   'ranked' | 'gap';
}

export interface KeywordProvenance {
  upload:    number;
  crawl:     number;
  demand:    number;
  gap:       number;
  total:     number;        // upload + crawl + demand + gap (= the All Keywords count)
  rawDbRows: number;        // total uploaded rows (incl. duplicates / blocked)
  distinctDb: number;       // distinct non-blocked uploaded keywords
}

export function keywordProvenance(
  summaryRows: ProvenanceRow[],
  dbKeywords:  ProvenanceDbRow[],
): KeywordProvenance {
  const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().trim();

  // Distinct client-upload keywords (the uploaded footprint, gap/blocked excluded).
  const upClient = new Set(
    dbKeywords
      .filter(k => k.source !== 'blocked' && k.type !== 'gap')
      .map(k => norm(k.keyword))
      .filter(Boolean),
  );

  let upload = 0, crawl = 0, demand = 0, gap = 0;
  for (const r of summaryRows) {
    if (r.origin === 'demand') { demand++; continue; }
    if (r.type === 'gap') { if (r.competitor) gap++; continue; }   // mirror the card's gap basis
    if (upClient.has(norm(r.keyword))) upload++;
    else crawl++;
  }

  const distinctDb = new Set(
    dbKeywords.filter(k => k.source !== 'blocked').map(k => norm(k.keyword)).filter(Boolean),
  ).size;

  return {
    upload, crawl, demand, gap,
    total: upload + crawl + demand + gap,
    rawDbRows: dbKeywords.length,
    distinctDb,
  };
}
