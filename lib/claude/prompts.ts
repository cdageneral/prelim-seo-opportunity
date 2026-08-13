/**
 * OrbitIQ Claude Prompt Templates
 *
 * Five-pass synthesis pipeline:
 *  1. Personas         — haiku  (fast classification)
 *  2. Opportunities    — sonnet (analytical scoring)
 *  3. Narrative        — opus   (CMO-level storytelling)
 *  4. PDF copy         — sonnet (structured brief copy)
 *  5. PPT prompt       — sonnet (generate pptx skill prompt)
 */

import type { SemrushSnapshot, SemrushKeyword }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';

// ─── LLM Probe context helper (v7.80) ────────────────────────────────────────
//
// Builds the "LLM visibility" data block for synthesis prompts from whatever
// probe snapshot shape is present: v2 (llm_probe_v2), v1 (llm_probe), or none.
// Every number in the block comes from actual probe results — no estimates.

export function llmProbeContext(profound: any): string {
  if (profound?.source === 'llm_probe_v2') {
    const cats: any[] = profound.categories ?? [];
    const invisible = cats.filter(c => c.mentionRate === 0).map(c => c.category);
    const visible   = cats.filter(c => c.mentionRate > 0)
      .map(c => `${c.category} (${Math.round(c.mentionRate * 100)}%)`);
    const s = profound.sentiment ?? {};
    const negExample = (s.examples ?? []).find((e: any) => e.tone === 'negative');

    return `LLM VISIBILITY (live probe of Claude + ChatGPT, ${profound.promptsPerPlatform ?? '?'} prompts/platform):
- Unbranded visibility: ${profound.unbranded?.score ?? 0}/100 — mentioned in ${profound.unbranded?.mentions ?? 0} of ${profound.unbranded?.total ?? 0} prompts that never named the brand
- Brand recognition: ${profound.branded?.score ?? 0}/100 (${profound.branded?.recognized ?? 0}/${profound.branded?.total ?? 0} branded prompts answered accurately)
- Categories where brand is NEVER recommended by AI: ${invisible.length > 0 ? invisible.join(', ') : 'none'}
- Categories with some AI visibility: ${visible.length > 0 ? visible.join(', ') : 'none'}
- Sentiment of brand mentions: ${s.positive ?? 0} positive / ${s.neutral ?? 0} neutral / ${s.negative ?? 0} negative${s.assessed === false ? ' (not assessed this run)' : ''}
${negExample ? `- Example negative AI excerpt (verbatim): "${negExample.quote}"` : ''}`;
  }

  if (profound?.source === 'llm_probe') {
    return `LLM VISIBILITY (live probe of Claude + ChatGPT):
- Overall LLM visibility score: ${profound.overallScore ?? 0}/100 (${profound.overallMentions ?? 0}/${profound.overallTotal ?? 0} prompts mentioned brand)`;
  }

  return `LLM VISIBILITY: not yet assessed (no probe data for this analysis)`;
}


// ─── Pass 2.5: Category Breakdown ────────────────────────────────────────────
//
// Classifies a MERGED pool of (a) keywords the client ranks for and
// (b) gap keywords from the top competitor that the client doesn't rank for.
// Claude only outputs a keyword-to-index mapping.
// All arithmetic (demand sums) is computed in TypeScript.

export interface MergedKeyword {
  keyword:        string;
  searchVolume:   number;
  clientPosition: number | null; // null = client doesn't rank for this keyword
}

export function categoryBreakdownPrompt(
  domain: string,
  industry: string,
  keywords: MergedKeyword[]
): string {
  const kwList = keywords
    .map((k, i) => {
      const posLabel = k.clientPosition !== null
        ? `client pos: ${k.clientPosition}`
        : 'client: unranked';
      return `${i}. ${k.keyword} | ${posLabel} | ${k.searchVolume.toLocaleString()}/mo`;
    })
    .join('\n');

  // Extract a clean brand name hint from domain (e.g. "sonobello.com" → "Sono Bello")
  const brandHint = domain.replace(/\.(com|net|org|io|co).*$/, '').replace(/[-_]/g, ' ');

  return `You are analyzing organic search keywords for a website to identify its core service or product categories.

WEBSITE: ${domain}
INDUSTRY: ${industry}
BRAND NAME HINT: "${brandHint}" (use this to identify branded keywords)

KEYWORDS (index. keyword | client ranking | monthly search volume):
${kwList}

Note: "client: unranked" means this keyword has demand but the client does not rank on page 1 for it.

CATEGORIZATION RULES — follow exactly:

1. BRAND category (type: "brand"): keywords that contain the brand name, brand variants, or misspellings. Name this category after the actual brand (e.g. "Sono Bello Brand Searches", not "Brand & Company Name").

2. LOCATION category (type: "location"): keywords combining the brand or service with a city, state, or "near me". Name it after what you find (e.g. "Sono Bello Locations", not "Location Services").

3. PROCEDURE categories (type: "procedure"): group all remaining keywords by the specific SERVICE or PROCEDURE they represent. Name each from the keywords themselves (e.g. "Liposuction", "Tummy Tuck").
   - CRITICAL: pricing, cost, reviews, before/after, testimonials, and how-to keywords MUST be placed inside their parent procedure category. NEVER create a standalone "Reviews", "Pricing", or "Cost" category — these are modifiers, not procedures.
   - If a review or pricing keyword clearly belongs to a procedure (e.g. "liposuction reviews", "tummy tuck cost"), assign it to that procedure.
   - Only create a new procedure category if 2+ keywords share the same core service topic.

Every keyword index must appear in exactly one category. Omit only obvious nonsensical misspellings.

Return JSON ONLY — no markdown, no explanation. Category names must come from the actual keywords, not from these examples:
{
  "categories": [
    { "name": "[Derived from actual keywords — e.g. Liposuction]", "type": "procedure", "keywordIndices": [0, 3, 7, 12] },
    { "name": "[Actual brand name + descriptor — e.g. Sono Bello Brand Searches]", "type": "brand", "keywordIndices": [1, 2] },
    { "name": "[Actual brand/service + location — e.g. Sono Bello Locations]", "type": "location", "keywordIndices": [5, 8] }
  ]
}`;
}

// ─── Pass 2.5b: Category Consolidation ───────────────────────────────────────
//
// v7.80: The full keyword set is discovered in independent parallel batches,
// so the same concept can surface under different names ("Liposuction" vs
// "Lipo Procedures"). This single call merges those aliases into one canonical
// category list. Claude only maps names → names; all demand arithmetic stays
// in TypeScript.

export function categoryConsolidationPrompt(
  domain: string,
  industry: string,
  categories: Array<{ name: string; type: string }>
): string {
  const catList = categories
    .map(c => `- "${c.name}" (${c.type})`)
    .join('\n');

  return `You are consolidating a list of keyword category names for a ${industry} website (${domain}).
The categories below were generated by independent passes over different slices of the same keyword set, so the SAME concept may appear under slightly different names.

PROPOSED CATEGORIES:
${catList}

CONSOLIDATION RULES:
1. Merge names that refer to the SAME service, procedure, brand, or concept (e.g. "Liposuction", "Lipo Procedures", "Liposuction Services" → one category).
2. Do NOT merge genuinely distinct procedures or services (e.g. "Liposuction" and "Tummy Tuck" stay separate).
3. Merge all brand-search variants into ONE brand category, and all brand+location variants into ONE location category.
4. The canonical name should be the clearest, most natural name from the group.
5. Every proposed name must appear in EXACTLY ONE "merges" array — none may be dropped or duplicated.
6. type: "procedure" | "brand" | "location" — keep the most accurate type for the merged group.

Return JSON ONLY — no markdown, no explanation:
{
  "categories": [
    { "name": "Liposuction", "type": "procedure", "merges": ["Liposuction", "Lipo Procedures"] },
    { "name": "Sono Bello Brand Searches", "type": "brand", "merges": ["Sono Bello Brand Searches", "Brand Keywords"] }
  ]
}`;
}

// ─── Pass 1.9 (v7.339): TAXONOMY SKELETON — shared tree before batching ───────
//
// Root cause of duplicate categories (Wills / Wills & Trusts / Estate Planning as
// three separate nodes): the 25-keyword discovery batches each invented the tree
// independently, with no shared vocabulary (Const III.1e). This ONE upfront call
// looks at a volume-ranked sample of the footprint (plus, on a re-analysis, the
// PRIOR stored taxonomy) and proposes the canonical umbrella → theme skeleton.
// Every discovery batch then receives this skeleton and must assign INTO it.
// Labels/structure only — no keyword membership and no volume math here (Const I.1).

export function taxonomySkeletonPrompt(
  domain: string,
  industry: string,
  sampleKeywords: Array<{ keyword: string; searchVolume: number }>,
  priorTree?: string[],   // ' > ' joined umbrella>theme lines from the previous analysis
): string {
  const kwList = sampleKeywords
    .map(k => `- ${k.keyword} (${(k.searchVolume ?? 0).toLocaleString()}/mo)`)
    .join('\n');
  const priorBlock = priorTree && priorTree.length > 0
    ? `\nEXISTING TAXONOMY from this project's previous analysis — REUSE these exact labels and structure wherever they still fit; only add or retire nodes the keywords genuinely require (label stability matters more than novelty):\n${priorTree.map(l => `- ${l}`).join('\n')}\n`
    : '';

  return `You are designing the canonical INTENT-FIRST SEO taxonomy skeleton for a ${industry} website (${domain}) — the tree every keyword will be filed into. It models a WEBSITE (a tree of pages), organized by USER TASK, not a keyword list (Const III.10).

REPRESENTATIVE KEYWORDS (volume-ranked sample of the full footprint):
${kwList}
${priorBlock}
RULES — follow exactly:
1. LEVEL 1 = PRODUCT FAMILY (WHAT the search is about): the broad product/service families (e.g. "Credit Cards", "Mortgages", "Checking Accounts"). Group by MEANING, never by shared words. DISTINCT PRODUCTS ARE DISTINCT UMBRELLAS: never bundle two separate products into one umbrella — "Checking Accounts" and "Savings Accounts" are SEPARATE umbrellas (different products, different pages), NOT a combined "Checking & Savings Accounts"; likewise keep e.g. Auto Loans vs Auto Insurance separate. Only keep a shared umbrella when the terms are genuinely ONE offering, not two products joined by "&".
2. LEVEL 2 = INTENT GROUP (WHY the search exists — the user's TASK / a cluster of pages), NEVER a product sub-noun. Name the tasks the keywords actually express, e.g. "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card", "Support". Different user tasks are different intent groups because Google ranks different pages for them (Const III.11). Product variants (rewards, secured, student) live BELOW an intent group like "Credit Card Types", not as level-2 nodes themselves.
3. ONE concept = ONE node. Never emit two nodes that mean the same thing or where one contains the other as a sibling. Fold subtypes into their intent group.
4. Keep it lean: only families / intent-groups this sample actually supports. No filler, no speculative nodes, no generic buckets like "Services" or "Resources".
5. Do NOT create nodes for brand or location searches (they are handled separately).
6. Intent-group labels read as a user task or page cluster (e.g. "Getting a Credit Card", "Choosing a Credit Card"), not a bare repeat of the product family.

Return JSON ONLY — no markdown, no prose (the "themes" array now holds INTENT GROUPS):
{
  "umbrellas": [
    { "name": "Credit Cards", "themes": ["Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card"] },
    { "name": "Mortgages", "themes": ["Getting a Mortgage", "Rates & Calculators", "Refinancing", "Education"] }
  ]
}`;
}

// ─── Pass 2 (v7.231): HIERARCHICAL DISCOVERY — full path per keyword ──────────
//
// Replaces the flat category discovery: instead of one category name per keyword, the
// model returns the FULL semantic path from a top umbrella down to the most specific
// node (e.g. ["Mortgages","Mortgage Rates","Current rates","VA"]). Unlimited depth;
// v7.339: umbrellas are NO LONGER defined fresh per batch — every batch receives the
// shared skeleton (taxonomySkeletonPrompt) and assigns INTO it (Const III.1e), only
// proposing a new node when nothing fits. Every level is a real page target. Claude
// only assigns labels + structure; all volume math is done in TypeScript (Const I.1).
// Runs per batch (like the old discovery) so cost is unchanged; a later canonicalization
// pass aligns synonym labels across batches.

export function hierarchicalDiscoveryPrompt(
  domain: string,
  industry: string,
  keywords: MergedKeyword[],
  anchorTree?: string,   // v7.339: rendered skeleton (umbrella › themes lines)
): string {
  const kwList = keywords
    .map((k, i) => {
      const posLabel = k.clientPosition !== null ? `client pos: ${k.clientPosition}` : 'client: unranked';
      return `${i}. ${k.keyword} | ${posLabel} | ${k.searchVolume.toLocaleString()}/mo`;
    })
    .join('\n');
  const brandHint = domain.replace(/\.(com|net|org|io|co).*$/, '').replace(/[-_]/g, ' ');
  const anchorBlock = anchorTree && anchorTree.trim().length > 0
    ? `\nCANONICAL TAXONOMY — the tree already established for this website. You MUST file every keyword INTO this tree, reusing these labels EXACTLY as spelled (umbrella and theme levels):\n${anchorTree.trim()}\n\nOnly introduce a node that is NOT in this tree when the keyword names a genuinely new product/service no existing node covers — and NEVER introduce a node that means the same as an existing one or is a subtype of one ("Wills" must go inside the existing "Estate Planning > Wills & Trusts", never become a new umbrella).\n\nCRITICAL — THE ANCHOR FIXES ONLY THE TOP TWO LEVELS. You MUST still go DEEPER: place every keyword in its MOST-SPECIFIC sub-topic BENEATH the anchored theme (rule 3 applies in full), creating sub-topic nodes as the keywords warrant. "mortgage calculator" → [..., "Mortgages & Refinancing", "Mortgage Calculators"]; "fha loan" → [..., "Mortgages & Refinancing", "FHA Loans"]; "refinance rates" → [..., "Mortgages & Refinancing", "Refinancing", "Refinance Rates"]. A path that STOPS at the theme is correct ONLY when the keyword IS the theme's own generic head term (e.g. "mortgage", "mortgages") — parking specific keywords at the theme level flattens the tree and is a failure (v7.341).\n`
    : '';

  return `You are organizing a website's organic search keywords into a clean, multi-level SEO content taxonomy — a tree of pages.

WEBSITE: ${domain}
INDUSTRY: ${industry}
BRAND NAME HINT: "${brandHint}" (use to detect branded keywords)
${anchorBlock}
KEYWORDS (index. keyword | client ranking | monthly search volume):
${kwList}

For EACH keyword, return the full INTENT-FIRST topic PATH it belongs to, the INTENT FAMILY (the user's task), the MODIFIER pulled out of it, its search INTENT, a CONFIDENCE score, and a one-line REASONING. Each path node is a page.

THE PATH IS INTENT-FIRST — [PRODUCT FAMILY, INTENT GROUP, LEAF] (Const III.9–III.11):
   • Level 1 = PRODUCT FAMILY (WHAT it's about): "Credit Cards", "Mortgages", …
   • Level 2 = INTENT GROUP (WHY — the user's TASK / page cluster): "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card", "Support". This is decided by INTENT, never by a shared product word.
   • Level 3+ = LEAF (the specific same-page group): "Application", "Requirements", "Rewards", "APR", "Interest Calculator".

RULES — follow exactly:
1. INTENT decides architecture, never shared words. "apply for a credit card" and "credit card application" are the SAME page → same leaf under "Getting a Credit Card". "compare credit cards" is a DIFFERENT page → "Choosing a Credit Card". "what is apr" is a DIFFERENT page → "Education". They all share the word "credit card" but sit in different intent groups because Google ranks different pages for each task.
2. A QUALIFIER THAT CHANGES THE USER'S TASK IS A NODE, NOT A MODIFIER (Const III.1c, revised). THE TEST: does this term change the page Google would rank? If YES it is a node (an intent group or leaf), NOT a modifier.
   • KEEP as nodes (task-changing — each is its own page): apply / application, requirements, eligibility, pre-approval, compare, reviews, vs, alternatives, benefits, how it works, calculator, rates, redeem, cash advance, annual fee, and product-defining facets "no annual fee", "0 APR" / "intro APR", "balance transfer", "cash back", "rewards", "travel", "secured", "student", "business", "for bad credit", "30-year", "15-year", "VA".
   • Strip as modifiers ONLY purely linguistic adjectives that do NOT change the page: best, top, cheap, good, easy, near me, online, a year like "2025". Even these stay in "modifier" (never dropped from the record) and never become a node.
   CRITICAL — two-sided failure: over-stripping a task-changing qualifier flattens the tree (FAIL); minting a look-alike leaf for the SAME page over-splits it (FAIL, fixed by rule 2b). "apply for a credit card" → path ["Credit Cards","Getting a Credit Card","Application"], modifier "". "best travel credit cards" → path ["Credit Cards","Credit Card Types","Travel"], modifier "best". "credit card interest calculator" → path ["Credit Cards","Using a Credit Card","Interest Calculator"], modifier "". If there is no linguistic adjective, modifier is "".
2b. THE LEAF IS A SAME-MEANING GROUP — SAME NEED = SAME LEAF, DIFFERENT NEED = SIBLING LEAF. Keywords one page would satisfy identically share ONE leaf: "apr", "what is an apr", "meaning of apr", "how do aprs work" all express the SAME definitional need → one leaf ["Credit Cards","Education","APR"]. "apr rates" and "best apr rates" express a DIFFERENT (rate-shopping) need → a SIBLING leaf ["Credit Cards","Education","APR Rates"] (with "best" as a modifier inside it). A definitional/educational need and a commercial/comparison/rate need are DIFFERENT pages even when they share the head term — NEVER mix them in one leaf, and never scatter same-meaning phrasings ("what is X" / "X meaning" / "X definition" / bare "X") across different nodes.
3. Path shape: [product family, INTENT GROUP, leaf, …]. Go only as deep as the keyword's specificity warrants (a head term like "credit card application" stops at ["Credit Cards","Getting a Credit Card","Application"]; a bare product head like "credit cards" sits at ["Credit Cards"]). Unlimited depth allowed; do NOT pad with filler levels. NEVER PARK a specific keyword at a broad node: if the keyword names a specific task/variant/definition/rate/calculator, it belongs in a leaf under its intent group — create that leaf. A keyword sits AT a node only when it IS that node's own generic head term.
4. Level 1 is the broad product/service family (e.g. "Mortgages", "Credit Cards", "Investing"). DISTINCT PRODUCTS ARE DISTINCT LEVEL-1 FAMILIES — never merge two separate products into one umbrella: "Checking Accounts" and "Savings Accounts" are SEPARATE families, NOT "Checking & Savings Accounts". Level 2 sibling INTENT GROUPS share the family (e.g. "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card" all under "Credit Cards"). A product variant is a LEAF under an intent group ("Rewards" under "Credit Card Types"), never a level-2 sibling of the intent groups.
5. MOST-SPECIFIC, COMMERCIALLY-USEFUL placement. If a keyword could fit more than one place, pick the most specific page-useful node. Parent/child is decided by MEANING, never overlap — a specific product is never nested under a different specific product. Routing: generic "construction loan" is NOT defaulted under Personal Loans; "home construction loan" → home/mortgage lending; "business construction loan" → business lending.
6. type: "procedure" (a real service/product topic), "brand" (the keyword names a company/retailer/store/issuer brand), or "location" (brand/service + a place). ANY third-party brand — including a co-branded product like "nordstrom card", "amazon store card", "costco visa" — MUST be type "brand", NEVER "procedure", with path ["<Brand> Brand Searches"]. The client's OWN brand also uses "<Client> Brand Searches". Never put a third-party brand inside a product/procedure umbrella, and never name a procedure path after a non-client brand.
7. intent: one of "informational", "commercial", "transactional", "navigational" — the searcher's intent.
7b. intentFamily: the user's dominant TASK — EXACTLY ONE of: learn, definition, education, how-it-works, benefits, faqs, comparison, selection, reviews, alternatives, use-cases, qualification, application, purchase, requirements, eligibility, rates, calculator, management, optimization, support, troubleshooting, maintenance, redemption, merchant-acceptance. This sets the funnel stage (assigned deterministically in code — do NOT return a stage). It must be consistent with the level-2 intent group (e.g. "Getting a Credit Card" → application/requirements/eligibility; "Education" → definition/how-it-works; "Using a Credit Card" → management/redemption/support). For a brand/location keyword use "learn".
8. confidence: an integer 0–100 = how sure you are of THIS placement. Be honest; a vague or cross-cutting keyword scores low. Below 80 means "needs human review" (still give your best path).
9. reasoning: one short clause explaining the placement (≤ 12 words).
10. Reuse identical label spellings across keywords so the same node merges. Every index appears exactly once.

Return JSON ONLY — no markdown, no prose:
{
  "assignments": [
    { "index": 0, "path": ["Credit Cards","Getting a Credit Card","Application"], "modifier": "", "type": "procedure", "intent": "transactional", "intentFamily": "application", "confidence": 95, "reasoning": "'apply' names the getting task" },
    { "index": 1, "path": ["Credit Cards","Credit Card Types","Travel"], "modifier": "best", "type": "procedure", "intent": "commercial", "intentFamily": "selection", "confidence": 92, "reasoning": "travel card type, 'best' is a modifier" },
    { "index": 2, "path": ["Credit Cards","Education","APR"], "modifier": "", "type": "procedure", "intent": "informational", "intentFamily": "definition", "confidence": 90, "reasoning": "definitional APR query" },
    { "index": 3, "path": ["${brandHint} Brand Searches"], "modifier": "", "type": "brand", "intent": "navigational", "intentFamily": "learn", "confidence": 98, "reasoning": "client brand term" }
  ]
}`;
}

// ─── Pass 2.6 (v7.231, rewritten v7.339): PATH CANONICALIZATION ────────────────
//
// Independent discovery batches can name the same node slightly differently
// ("30-yr fixed" vs "30 Year Fixed") — or, worse, file the same CONCEPT at
// different places in the tree ("Wills" as its own umbrella while "Estate
// Planning > Wills & Trusts" exists). v7.339 removes the old "preserve the parent
// chain" restriction that made the second failure unfixable (Const III.1e): this
// pass now RE-PARENTS — a node that is the same concept as, or a strict subtype
// of, an existing node is folded into that node's chain. Runs in CHUNKS with the
// already-established canonical nodes carried forward, so large taxonomies
// (previously skipped entirely past 300 paths) are fully processed. Claude maps
// paths → paths only; no keyword or volume is touched (Const I.1).

export function pathCanonicalizationPrompt(
  domain: string,
  industry: string,
  paths: string[][],
  establishedNodes?: string[],   // v7.339: canonical 'umbrella > theme' lines from earlier chunks
): string {
  const list = paths.map((p, i) => `${i}. ${p.join(' > ')}`).join('\n');
  const establishedBlock = establishedNodes && establishedNodes.length > 0
    ? `\nESTABLISHED CANONICAL NODES (from already-processed slices of this same taxonomy — map equivalent concepts onto these EXACT labels and chains instead of inventing parallel ones):\n${establishedNodes.map(n => `- ${n}`).join('\n')}\n`
    : '';

  return `You are consolidating a multi-level SEO taxonomy for a ${industry} website (${domain}). The paths below were produced by independent passes over different keyword slices, so the SAME concept may appear under different labels, at different depths, or in different places in the tree.
${establishedBlock}
PATHS (index. umbrella > theme > …):
${list}

For each path, return its CANONICAL form so every concept ends up in EXACTLY ONE place in the tree.

RULES — follow exactly:
1. ONE CONCEPT, ONE NODE. Merge labels that mean the same thing to ONE spelling at each level ("30 Year Fixed" / "30-yr fixed" / "30 year fixed rate" → one). Keep the clearest, most natural label.
2. RE-PARENT SUBSUMED CONCEPTS. If one path's concept is the same as — or a strict subtype of — a concept that lives elsewhere in this list (or in the established nodes), move it INTO that node's chain. "Wills" alone → ["Estate Planning","Wills & Trusts"] when that node exists; "Living Trusts" → a child of ["Estate Planning","Wills & Trusts"], never a new umbrella. Two umbrellas must never remain where one contains the other or they mean the same thing.
3. AGGRESSIVELY merge near-duplicates that are the SAME concept differing only by: spacing/compounding ("Cash Back" = "Cashback"), plural/singular ("Card" = "Cards"), word order, OR a redundant trailing/leading category word ("Balance Transfer" = "Balance Transfer Credit Cards" = "Balance Transfer Cards" when the parent is already "Credit Cards"). Pick ONE clean label (drop the redundant parent word). These MUST collapse to one node — leaving them separate is the failure this pass exists to prevent.
4. Do NOT append the parent's name into a child label. A child of "Credit Cards" is "No Annual Fee", NOT "No Annual Fee Credit Cards".
5. Keep genuinely distinct nodes separate. Do NOT merge a specific topic into an unrelated sibling (e.g. "Secured" ≠ "Unsecured"; "Cash Back" ≠ "Cash Advances") — subsumption (rule 2) requires a real subtype relationship, not surface similarity.
6. Every input index must appear exactly once with a canonical path (return the same path if it needs no change).

Return JSON ONLY — no markdown, no prose:
{
  "canonical": [
    { "index": 0, "path": ["Mortgages","Mortgage Rates","30-yr fixed"] },
    { "index": 1, "path": ["Estate Planning","Wills & Trusts"] }
  ]
}`;
}

// ─── Pass 2.7 (v7.341): SIBLING AUDIT — merge same-concept sibling sub-topics ──
//
// The chunked canonicalization can leave two nodes meaning the same thing as
// SIBLINGS under one parent when they were processed in different chunks (found
// live in v7.339's first rebuild: "Loan Interest Rates" beside "Mortgage Rates"
// under Mortgages & Refinancing). This pass sees each parent WITH its full child
// list — the exact context chunking loses — and returns the merges. One bounded
// call over node names only (no keywords, no volumes); merges are applied and
// logged in TypeScript (Const III.1e — one concept, one node).

export function siblingAuditPrompt(
  domain: string,
  industry: string,
  groups: Array<{ parent: string; children: string[] }>,
): string {
  const list = groups
    .map((g, i) => `${i}. PARENT: ${g.parent}\n   CHILDREN: ${g.children.join(' | ')}`)
    .join('\n');
  return `You are auditing a ${industry} website's (${domain}) SEO taxonomy for duplicate SIBLING nodes. Each group below is one parent node and ALL of its direct children.

GROUPS (index. parent, then its children):
${list}

Find children within the SAME group that are the SAME concept or where one is a strict subtype of another — those must merge into ONE node.

RULES — follow exactly:
1. Merge two siblings when they mean the same thing for this site's users ("Loan Interest Rates" = "Mortgage Rates" under a mortgage parent; "Cash Back" = "Cashback") — keep the clearer, more conventional label as "to".
2. Merge a sibling INTO another when it is a strict subtype ("30 Year Fixed Rates" into "Mortgage Rates" only if "Mortgage Rates" has no better sub-structure — prefer keeping genuine subtypes as separate nodes; only merge REAL duplicates).
3. Do NOT merge genuinely distinct siblings ("Secured" ≠ "Unsecured"; "Refinancing" ≠ "First-Time Buyer"; "FHA Loans" ≠ "VA Loans"). When in doubt, do not merge.
4. Only report groups that need changes. "from" and "to" must both be children of that group's parent, spelled exactly as listed, and different from each other.

Return JSON ONLY — no markdown, no prose:
{
  "merges": [
    { "group": 0, "from": "Loan Interest Rates", "to": "Mortgage Rates" }
  ]
}`;
}

// ─── Pass 2.5d: Category Taxonomy (real parent/child) — v7.229 ────────────────
//
// The canonical category list is FLAT. This pass assigns each PROCEDURE category
// a semantic PRODUCT-LINE parent, chosen BY MEANING — never by shared trailing
// words. It replaces the render-time lexical nesting (the old buildFamilies /
// buildSubTree heuristics) so the parent/child structure is real, stored data
// (Const I.1, II.8, III.1). Claude only maps category names → a product-line
// label; no keyword moves and no arithmetic happens here.

export function categoryTaxonomyPrompt(
  domain: string,
  industry: string,
  categories: Array<{ name: string }>
): string {
  const catList = categories.map(c => `- "${c.name}"`).join('\n');

  return `You are organizing the product/service categories of a ${industry} website (${domain}) into a clean two-level taxonomy.

PROCEDURE CATEGORIES (each is one specific service or product line):
${catList}

Your job: give each category a PARENT — the broader product line or service family it belongs to.

RULES — follow exactly:
1. The parent is decided by MEANING, never by shared words. "Mortgage Rates and Calculators" belongs to a "Mortgages" parent, NOT to a "Calculators" parent just because its name ends in "calculators".
2. NEVER make one specific product a child of a different specific product. "Credit Cards" is never under "Mortgages"; "Auto Loans" is never under "Personal Loans". Siblings stay siblings under a shared family.
3. Only group categories under the same parent when they genuinely belong to the same offering family (e.g. "Personal Loans" + "Auto Loans" + "Home Loans" → parent "Loans"; "Travel Cards" + "Secured Cards" → parent "Credit Cards").
4. If a category is already a standalone top-level line with no sibling family in this list, set its parent equal to its own name (it stays top-level).
5. Parent names must come from the meaning of these categories or the industry — do NOT invent unrelated abstractions, and do NOT use a non-client brand name.
6. Every category name must appear EXACTLY ONCE, spelled identically to the input.

Return JSON ONLY — no markdown, no explanation:
{
  "assignments": [
    { "category": "Mortgage Rates and Calculators", "parent": "Mortgages" },
    { "category": "Credit Cards", "parent": "Credit Cards" }
  ]
}`;
}

// ─── Pass 2.5c: Category Membership Self-Check — v7.229 ───────────────────────
//
// Batched discovery can sweep a keyword into the wrong category (e.g. credit-card
// keywords landing inside "Mortgage Rates and Calculators"). This pass re-reads
// each category's assigned keywords and names ONLY the keywords that clearly do
// not belong, with the correct category from the SAME canonical list. Claude
// relabels keywords; it never invents a category and never touches volume —
// every demand sum is still computed in TypeScript afterward (Const I.1).

export function categoryMembershipCheckPrompt(
  domain: string,
  industry: string,
  categories: Array<{ name: string; keywords: string[] }>
): string {
  const validNames = categories.map(c => `"${c.name}"`).join(', ');
  const blocks = categories
    .map(c => `### ${c.name}\n${c.keywords.map(k => `- ${k}`).join('\n')}`)
    .join('\n\n');

  return `You are auditing keyword-to-category assignments for a ${industry} website (${domain}). Each keyword below was auto-assigned to a category, but some were misfiled.

VALID CATEGORIES (a corrected keyword MUST map to one of these exact names): ${validNames}

CURRENT ASSIGNMENTS (category header, then its keywords):
${blocks}

Your job: find ONLY the keywords that clearly do NOT belong in the category they are currently under, and give the correct category for each.

RULES — follow exactly:
1. Move a keyword ONLY when it clearly belongs to a different listed category (e.g. "credit card balance transfer" sitting under "Mortgage Rates and Calculators" → "Credit Cards"). When in doubt, LEAVE IT — do not move borderline or generic keywords.
2. The "to" value MUST be one of the valid category names above, spelled identically. Never invent a new category.
3. Do not move a keyword to the category it is already in.
4. Only list keywords that need correcting. If everything looks correctly filed, return an empty array.
5. Use the keyword text exactly as written.

Return JSON ONLY — no markdown, no explanation:
{
  "corrections": [
    { "keyword": "credit card balance transfer", "from": "Mortgage Rates and Calculators", "to": "Credit Cards" }
  ]
}`;
}

// ─── Pass 1: Audience Segment Generation ─────────────────────────────────────

export function personaPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot
): string {
  const topKws = semrush.topKeywords.map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join('\n- ');
  const gapKws = semrush.gapKeywords.map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join('\n- ');
  const paa    = serp.keywords.flatMap(k => k.paaQuestions).slice(0, 25).join('\n- ');

  return `You are a senior audience strategist building deep-dive segment profiles from real organic search data.

WEBSITE: ${domain}
INDUSTRY: ${industry}

── REAL SEARCH DATA ──────────────────────────────────────────────────────────

TOP ORGANIC KEYWORDS (client currently ranks for these):
- ${topKws}

GAP KEYWORDS (competitors rank, client does not):
- ${gapKws}

PEOPLE ALSO ASK QUESTIONS (live SERP data):
- ${paa}

── YOUR TASK ─────────────────────────────────────────────────────────────────

From this real search behavior, identify 2-3 distinct audience segments. Each segment represents a meaningfully different type of person with a different motivation, timeline, and decision journey.

For each segment, generate a full deep-dive profile. Return a JSON array of objects with EXACTLY this structure:

[
  {
    "id": "segment-a",
    "name": "The [Memorable Archetype Name]",
    "tagline": "A first-person quote that captures this segment's core mindset and urgency — 1-2 sentences as if the person is speaking",
    "volumePct": 40,
    "whoTheyAre": {
      "demographics": "Age range, life stage, financial/professional situation, how they make decisions, typical purchase timeline",
      "trigger": "The specific life event or situation that triggers their search journey — be precise",
      "influencerRole": "Who else influences or gates their decision (partner, advisor, adult child, colleague) — omit if not applicable"
    },
    "preLLMPrompts": [
      "life-problem prompt they use BEFORE they think of the product (5-6 prompts that signal intent upstream)"
    ],
    "productPrompts": [
      "direct product or solution search they use once they know what they want (4-5 prompts)"
    ],
    "touchpoints": [
      { "stage": "Stage 1 — AI / LLM", "description": "How and why they start in an AI chat tool, what they ask, what content must be there to intercept them" },
      { "stage": "Stage 2 — Google Search", "description": "What they search on Google after LLM, which query types, what they need to find" },
      { "stage": "Stage 3 — Website", "description": "What they do on the client website — which pages, tools, CTAs matter most" },
      { "stage": "Stage 4 — Conversion", "description": "How they convert — call, form, chat, walk-in — and what triggers the final decision" }
    ],
    "messagingAndTone": "3-4 specific messaging directions for this segment: what to lead with, what tone to use, what to avoid, which objections to address first",
    "creativeDirection": "3-4 specific creative and imagery directions: what scenes/moments to show, what to avoid, any specific ad formats or content types that will resonate",
    "channelApproach": "3-4 specific channel recommendations: which paid/organic/social channels, why, and what content type works on each for this segment"
  }
]

RULES:
- volumePct values must sum to 100 across all segments
- All prompts must feel like real search queries or LLM inputs, not descriptions
- Messaging, creative, and channel sections must be specific and actionable — not generic
- Base everything on the actual keyword and PAA data provided — no generic industry assumptions
- CONCISENESS: demographics 2 sentences max · trigger 1 sentence · influencerRole 1 sentence · touchpoint descriptions 2 sentences max · messagingAndTone/creativeDirection/channelApproach 3-4 bullet-style points as a single string separated by newlines
- No markdown, no explanation — pure JSON array only`;
}

// ─── v7.442: position-distribution accessors (Const I.5 — honest gap, never a crash) ──
// `positionDist` is NULLED by a scope clear (lib/clearScope.ts) and is absent on any
// snapshot that never gathered a footprint. Two prior hazards lived here:
//   • `semrush.positionDist['11-20'] ?? 0` dereferenced the null and killed Phase 2
//     outright — "Cannot read properties of null (reading '11-20')" — so a cleared
//     project could never re-analyse (First Citizens, 2026-08-13).
//   • `JSON.stringify(null)` wrote the literal string "null" into three prompts, i.e.
//     handed the model a value that reads like data but is not one (Const I.1).
// Both now resolve to a stated absence. The `?? 0` guarded the VALUE, not the OBJECT.
const NO_POSITION_DIST = 'not available (this analysis carries no ranking footprint)';

function distJson(d: Record<string, number> | null | undefined): string {
  return d && typeof d === 'object' && Object.keys(d).length > 0 ? JSON.stringify(d) : NO_POSITION_DIST;
}

function distBand(d: Record<string, number> | null | undefined, band: string): number {
  return d && typeof d === 'object' ? (d[band] ?? 0) : 0;
}

// ─── Pass 2: Opportunity Scoring ──────────────────────────────────────────────

export function opportunityPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any
): string {
  const positionDist = distJson(semrush.positionDist);
  // Sort by organicTraffic so manually-added competitors (traffic=0) don't steal top spot
  const topComp      = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? 'unknown competitor';
  const gapKeywords  = semrush.gapKeywords
    .map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`)
    .join(', ');

  const aioStats = serp.aioSummary;

  return `You are a senior SEO and GEO strategist building a CMO-level opportunity brief.

WEBSITE: ${domain}
INDUSTRY: ${industry}

── REAL DATA INPUTS ──────────────────────────────────────────────────────────

SEMRUSH DATA (live):
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()}
- Organic traffic: ${semrush.overview.organicTraffic.toLocaleString()} visits/mo
- Position distribution: ${positionDist}
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} shared keywords)
- Gap keywords (competitor ranks, client doesn't): ${gapKeywords}

SERPAPI DATA (live SERP snapshots):
- AI Overview coverage rate: ${Math.round(aioStats.aioRate * 100)}% of queried keywords show AIO
- Client AIO acquisition rate: ${Math.round(aioStats.clientAIORate * 100)}% of AIOs cite client
- Keywords queried: ${aioStats.total}

${llmProbeContext(profound)}

─────────────────────────────────────────────────────────────────────────────

Identify the TOP 3 highest-impact organic growth opportunities specific to this website.

Each opportunity must:
1. Be grounded in the real data above (cite the specific metric)
2. Be actionable — a strategy a CMO could greenlight
3. Span SEO, GEO (LLM visibility), Content, or Competitive categories

For each opportunity return a JSON object:
{
  "category": "SEO | GEO | Content | Technical | Competitive",
  "title": "Short, punchy opportunity title (e.g. 'Claim the Unranked Decision Layer')",
  "summary": "2-3 sentences: what the gap is, why it matters, what to do",
  "impactScore": 8.5,   // 0-10 (based on volume + strategic importance)
  "effortScore": 4.0,   // 0-10 (lower = easier to execute)
  "estimatedVisits": 12000,  // estimated incremental visits/mo if captured
  "estimatedLeads": 240,     // estimated leads/mo (use industry conversion benchmarks)
  "evidence": [
    { "metric": "9%", "label": "Current market capture rate", "source": "Semrush Domain Overview" },
    { "metric": "47%", "label": "AIO coverage on target keywords", "source": "SerpAPI AIO scan" },
    { "metric": "2%", "label": "Client AIO acquisition rate", "source": "SerpAPI AIO scan" },
    { "metric": "31/100", "label": "LLM visibility score", "source": "Profound API" }
  ],
  "rank": 1  // 1 = highest priority
}

Return a JSON array of exactly 3 opportunity objects, ranked 1-3. No markdown, pure JSON only.`;
}

// ─── Pass 3: Narrative Generation (Opus) ─────────────────────────────────────

export function narrativePrompt(
  domain: string,
  clientName: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any,
  personas: any[],
  opportunities: any[],
  categoryBreakdown: { page1CaptureRate: number; totalMonthlyDemand: number; totalPage1Demand: number }
): string {
  // Use keyword-level capture rate from category breakdown — this is the same
  // number displayed as the hero metric in the UI (page1Demand / totalMonthlyDemand).
  const captureRate     = categoryBreakdown.page1CaptureRate > 0
    ? categoryBreakdown.page1CaptureRate
    : (semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic)));
  const totalCategory   = categoryBreakdown.totalMonthlyDemand > 0
    ? categoryBreakdown.totalMonthlyDemand
    : semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic);
  // Sort by organicTraffic so manually-added competitors (traffic=0) don't steal top spot
  const topComp         = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? 'the market leader';
  const aioRate         = Math.round(serp.aioSummary.aioRate * 100);
  const clientAIORate   = Math.round(serp.aioSummary.clientAIORate * 100);

  return `You are a senior growth strategist writing an executive narrative for a CMO at ${clientName}.

This is NOT a data report. This is a strategic story that answers:
"Where is organic demand going in our market, and why aren't we capturing it?"

The tone is: direct, confident, data-backed, CMO-appropriate.
No bullet-point summaries. Write in sharp, declarative paragraphs.

STRICT DATA RULES — apply to every section without exception:
1. Only cite numbers that appear verbatim in the VERIFIED DATA section below. Do not calculate, derive, or estimate any other numbers.
2. Never mention "visits", "traffic", "sessions", "pageviews", or "monthly visitors" for any party — client or competitor. This data is not verified.
3. Use "search demand" or "searches" instead of "visits" when referring to volume.
4. The page 1 capture rate is ${Math.round(captureRate * 100)}% — use only this figure, never a different percentage.

── VERIFIED DATA (cite these exact numbers — do not invent or round differently) ──

Market position:
- Page 1 capture rate: ${Math.round(captureRate * 100)}% (keyword demand analysis — use THIS number, not any other)
- Total category search demand: ~${totalCategory.toLocaleString()} searches/mo (keyword-level analysis)
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} keywords overlap with ${clientName})
- ${semrush.competitors.length} competitors identified in this category

Keyword footprint:
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()} (Semrush)
- Keywords ranking page 1 (positions 1–10): ${semrush.topKeywords.filter(k => k.position <= 10).length}
- Keywords ranking page 2+ (positions 11+): ${semrush.topKeywords.filter(k => k.position > 10).length}
- Position distribution: ${distJson(semrush.positionDist)} (Semrush)

AI search landscape:
- ${aioRate}% of tracked keywords trigger AI Overviews (SerpAPI live data)
- ${clientName} appears in ${clientAIORate}% of those AI Overviews

${llmProbeContext(profound)}

Top opportunities: ${opportunities.map(o => o.title).join(', ')}

─────────────────────────────────────────────────────────────────────────────

Write the following narrative sections:

1. MARKET POSITION NARRATIVE (150 words)
   Open with the page 1 capture rate as the story hook. Make it visceral — the search demand exists, the question is who captures it.

2. THE VISIBILITY GAP (100 words)
   Translate the position distribution into business impact. What does it mean to have ${distBand(semrush.positionDist, '11-20')} keywords on page 2? Revenue language, not SEO metrics.

3. THE AI SEARCH MOMENT (2 sentences, 40 words max)
   Be blunt. State the AIO exposure rate and the client's citation rate, then name the business consequence in one sentence. No fluff.

4. COMPETITIVE REALITY (100 words)
   Frame it as: here's the keyword territory already contested, here's what's still unclaimed. Do NOT mention competitor traffic or visit counts — use keyword overlap and market capture rate only.

5. THE STRATEGIC CALL (80 words)
   One clear recommendation a CMO can take to the board. No waffling. What's the move?

Return the narrative as a JSON object:
{
  "marketPositionNarrative": "...",
  "visibilityGap": "...",
  "aiSearchMoment": "...",
  "competitiveReality": "...",
  "strategicCall": "..."
}

Pure JSON only. No markdown wrappers.`;
}

// ─── Pass 4: PPT Prompt Generator ─────────────────────────────────────────────

export function pptPromptGenerator(
  clientName: string,
  domain: string,
  industry: string,
  narrative: any,
  opportunities: any[],
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any
): string {
  return `You are creating a structured prompt for the Claude PPTX skill to generate a CMO-level pitch deck.

Generate a detailed PPTX skill prompt for a ${industry} company called "${clientName}" (${domain}).

The prompt should instruct Claude to build a 10-slide deck with:

SLIDE 1 — Title slide
"${clientName}: Organic Growth Intelligence Brief"
Subtitle: "Where demand is going — and why we're not capturing it"

SLIDE 2 — The Market Opportunity
Hero stat: ${Math.round((semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic))) * 100)}% market capture rate
Visual: Large donut chart showing client share vs. total market
Source: Semrush competitive landscape data

SLIDE 3 — Where Rankings Live Today
Position distribution visualization
Stats: ${distJson(semrush.positionDist)}
Narrative: "${narrative?.visibilityGap?.substring(0, 150) ?? ''}"

SLIDE 4 — The AI Search Landscape
AI Overview rate: ${Math.round(serp.aioSummary.aioRate * 100)}%
Client AIO rate: ${Math.round(serp.aioSummary.clientAIORate * 100)}%
Visual: Bar comparison of client vs. top competitors in AI citations
Source: SerpAPI live SERP data

SLIDE 5 — LLM Brand Visibility
${llmProbeContext(profound)}
Source: Live AI Probe (Claude + ChatGPT)

SLIDE 6 — Opportunity #1
Title: ${opportunities[0]?.title ?? 'Top Opportunity'}
Impact: ${opportunities[0]?.impactScore ?? 0}/10 | Effort: ${opportunities[0]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[0]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[0]?.evidence ?? [])}

SLIDE 7 — Opportunity #2
Title: ${opportunities[1]?.title ?? 'Second Opportunity'}
Impact: ${opportunities[1]?.impactScore ?? 0}/10 | Effort: ${opportunities[1]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[1]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[1]?.evidence ?? [])}

SLIDE 8 — Opportunity #3
Title: ${opportunities[2]?.title ?? 'Third Opportunity'}
Impact: ${opportunities[2]?.impactScore ?? 0}/10 | Effort: ${opportunities[2]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[2]?.estimatedVisits ?? 0).toLocaleString()} visits/mo

SLIDE 9 — Competitive Landscape
Top competitors by organic presence
SOV comparison vs. ${semrush.competitors.slice(0, 3).map(c => c.domain).join(', ')}

SLIDE 10 — The Strategic Call
"${narrative?.strategicCall ?? 'Invest in the organic layer that compounds.'}"
3 prioritized next steps

DESIGN REQUIREMENTS:
- Color scheme: Dark background (#0A0A0F), electric indigo accents (#6C63FF), white text
- Professional, minimal — no clip art, no stock icons
- Each slide: one hero number, one supporting visual, one source citation
- Font: Inter or similar clean sans-serif
- Slide dimensions: 16:9 widescreen

Return this as a ready-to-paste prompt for the Claude PPTX skill.`;
}
