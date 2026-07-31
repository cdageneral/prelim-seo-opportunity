// ─────────────────────────────────────────────────────────────────────────────
// lib/insights.ts — v7.366: the per-panel INSIGHT SENTENCE layer (rules only).
//
// Each rule is a PURE function: it takes numbers a panel has ALREADY derived
// from real source rows (Const II.6 — views over the deep layer, no forked
// math, no new fetches) and returns either an Insight (a computed, client-
// facing sentence with an evidence stamp) or null (don't render — honest gap,
// Const I.5). Rules never invent numbers: every figure interpolated into a
// sentence arrives as an argument the caller read off its own real data.
//
// Fire/no-fire thresholds below are PRESENTATIONAL (when a sentence is worth
// stating) — they never trim, cap, or hide the underlying data, which stays
// fully rendered on the panel (Const I.6). Approved in the 2026-07-14 insight
// review (rec IDs G1, G2, G6, G8, G9, A2, A3, A4, A6, A8, L1–L4, E3); the
// mockup GEO/orbitiq-insight-action-mockup-2026-07-14.html is the visual spec.
//
// The only modeled figure any rule touches is the page-1 click estimate that
// landGrabInsight receives from computeSov() — it is labeled with the approved
// GrowthSRC curve via the ctrLabel argument (Const I.5a; single shared
// constant, lib/sov/model.ts CTR_SOURCE_LABEL — never forked here).
// ─────────────────────────────────────────────────────────────────────────────

export interface InsightSeg { t: string; em?: boolean }

export interface Insight {
  id: string;                       // rec id from the 2026-07-14 review (G1, A2, …)
  tone: 'signal' | 'watch';         // signal = cyan finding · watch = amber warning
  kicker: string;                   // small uppercase label, e.g. 'Finding · Demand inversion'
  parts: InsightSeg[];              // the sentence, split so key figures render emphasized
  evidence: string;                 // source + freshness stamp (Const I.1 / IV.5)
}

// ── shared formatting (mirrors the panels' fmtHero/fmtVol conventions) ───────
export function fmtInsightVol(v: number): string {
  if (!isFinite(v) || v <= 0) return '0';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}
const seg = (t: string, em?: boolean): InsightSeg => (em ? { t, em: true } : { t });
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

// ─────────────────────────────────────────────────────────────────────────────
// G1 — Demand Inversion (Theme Clusters). Exact annual-volume rollups by
// cluster state; ratio of trailing (competitor-led) demand to leading demand.
// ─────────────────────────────────────────────────────────────────────────────
export function demandInversionInsight(a: {
  leadingCount: number; leadingAnnualVol: number;
  trailingCount: number; trailingAnnualVol: number;
}): Insight | null {
  const { leadingCount, leadingAnnualVol, trailingCount, trailingAnnualVol } = a;
  if (leadingCount + trailingCount === 0) return null;
  const ev = 'exact topic-volume rollups by cluster state · this scan';
  if (leadingCount === 0 && trailingCount > 0) {
    return { id: 'G1', tone: 'watch', kicker: 'Finding · Demand inversion',
      parts: [seg('Competitors lead every one of the '), seg(String(trailingCount), true),
        seg(' mapped clusters — '), seg(`${fmtInsightVol(trailingAnnualVol)} searches/yr`, true),
        seg(' with no cluster where you’re ahead yet.')], evidence: ev };
  }
  if (leadingAnnualVol <= 0 || trailingCount === 0) return null;
  const ratio = trailingAnnualVol / leadingAnnualVol;
  if (ratio >= 1.5) {
    return { id: 'G1', tone: 'watch', kicker: 'Finding · Demand inversion',
      parts: [seg('The '), seg(String(trailingCount), true), seg(' clusters you’re trailing in carry '),
        seg(`${fmtInsightVol(trailingAnnualVol)} searches/yr`, true), seg(' — '),
        seg(`${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× the demand`, true),
        seg(` of all ${leadingCount} clusters you’re winning (${fmtInsightVol(leadingAnnualVol)}/yr). Your growth lives on the other side of the map.`)],
      evidence: ev };
  }
  if (ratio <= 0.7) {
    return { id: 'G1', tone: 'signal', kicker: 'Finding · Demand position',
      parts: [seg('You lead where the demand is: your '), seg(String(leadingCount), true),
        seg(' winning clusters carry '), seg(`${fmtInsightVol(leadingAnnualVol)}/yr`, true),
        seg(` vs ${fmtInsightVol(trailingAnnualVol)}/yr in the ${trailingCount} you trail — defend the lead.`)],
      evidence: ev };
  }
  return { id: 'G1', tone: 'signal', kicker: 'Finding · Demand position',
    parts: [seg('Demand is split: '), seg(`${fmtInsightVol(leadingAnnualVol)}/yr`, true),
      seg(` across ${leadingCount} clusters you lead vs `), seg(`${fmtInsightVol(trailingAnnualVol)}/yr`, true),
      seg(` across ${trailingCount} competitors lead.`)], evidence: ev };
}

// ─────────────────────────────────────────────────────────────────────────────
// G2 — Land-Grab Index (SovPanel — renders on Google Ranks AND the Exec, one
// implementation). Inputs come straight from computeSov(); the click figures
// are modeled and MUST be labeled with the curve (ctrLabel), per Const I.5a.
// ─────────────────────────────────────────────────────────────────────────────
export function landGrabInsight(a: {
  clientPct: number;                       // 0..1 — sovPct
  openPct: number;                         // 0..1 — openClicks / availableClicks
  availableClicks: number;                 // modeled monthly page-1 clicks
  topRival: { label: string; pct: number } | null;   // best competitor slice (0..1)
  ctrLabel: string;                        // CTR_SOURCE_LABEL — named source, I.5a
}): Insight | null {
  const { clientPct, openPct, availableClicks, topRival, ctrLabel } = a;
  if (!(availableClicks > 0)) return null;
  const ev = `modeled clicks — ${ctrLabel} · volumes & positions are real rows`;
  const rivalTxt = topRival ? `your closest tracked rival ${topRival.label} ${pct0(topRival.pct)}` : 'no competitor slice on file yet';
  if (openPct >= 0.6) {
    return { id: 'G2', tone: 'signal', kicker: 'Finding · Land grab',
      parts: [seg(pct0(openPct), true), seg(` of the ~${fmtInsightVol(availableClicks)} page-1 clicks/mo across this footprint are captured by `),
        seg('no tracked competitor', true),
        seg(` — you hold ${pct0(clientPct)}, ${rivalTxt}. This is a land-grab, not a share fight.`)],
      evidence: ev };
  }
  if (openPct >= 0.3) {
    return { id: 'G2', tone: 'signal', kicker: 'Finding · Contested market',
      parts: [seg(pct0(openPct), true), seg(` of ~${fmtInsightVol(availableClicks)} page-1 clicks/mo remain unclaimed — you hold ${pct0(clientPct)}, ${rivalTxt}.`)],
      evidence: ev };
  }
  return { id: 'G2', tone: 'watch', kicker: 'Finding · Displacement fight',
    parts: [seg(`Only ${pct0(openPct)} of page-1 clicks are unclaimed — winning here means displacing `),
      seg(topRival ? topRival.label : 'the incumbents', true),
      seg(`, who capture more of your footprint than you do (${pct0(clientPct)}).`)], evidence: ev };
}

// ─────────────────────────────────────────────────────────────────────────────
// G6 — Build-vs-Optimize mandate (Journeys, beside the Completeness stat so
// "coverage" is never read alone again). Counts + volumes are exact rollups.
// ─────────────────────────────────────────────────────────────────────────────
export function mandateInsight(a: {
  coveragePct: number;                // 0..100 — existing / total topics
  existingCount: number;
  buildCount: number;                 // missing + competitor-held topics
  buildAnnualVol: number;             // exact annual volume across build topics
}): Insight | null {
  const { coveragePct, existingCount, buildCount, buildAnnualVol } = a;
  if (existingCount + buildCount === 0) return null;
  const ev = 'coverage counts a page existing, not ranking · exact topic rollups';
  if (coveragePct >= 80) {
    return { id: 'G6', tone: 'watch', kicker: 'Verdict · Optimization mandate',
      parts: [seg(`Pages exist for ${coveragePct}% of mapped topics — but coverage counts a page existing, `),
        seg('not ranking', true),
        seg(`. ${existingCount} topics need better pages`),
        seg(buildCount > 0 ? `; the ${buildCount} you’d build new carry ${fmtInsightVol(buildAnnualVol)} searches/yr.` : '.')],
      evidence: ev };
  }
  if (coveragePct < 50) {
    return { id: 'G6', tone: 'watch', kicker: 'Verdict · Build mandate',
      parts: [seg(`Only ${coveragePct}% of mapped topics have a page — `),
        seg(`${buildCount} topics (${fmtInsightVol(buildAnnualVol)}/yr)`, true),
        seg(' need net-new pages before optimization can matter.')], evidence: ev };
  }
  return { id: 'G6', tone: 'signal', kicker: 'Verdict · Hybrid mandate',
    parts: [seg(`${coveragePct}% of topics have a page: optimize the ${existingCount} existing, build the `),
      seg(`${buildCount} missing (${fmtInsightVol(buildAnnualVol)}/yr)`, true), seg('.')], evidence: ev };
}

// Pre-product silent zero (Journeys — companion to G6; Const III.2a-ii means
// the lane is empty until the deep journey is deliberately built).
export function preProductZeroInsight(a: { preTopics: number; prodTopics: number }): Insight | null {
  if (a.preTopics > 0 || a.prodTopics === 0) return null;
  return { id: 'G6', tone: 'watch', kicker: 'Finding · Pre-product journey not built',
    parts: [seg('The pre-product journey holds '), seg('0 topics', true),
      seg(` beside ${a.prodTopics} product topics — the problem-aware demand layer AI engines feed on is unmapped. Build it from the Keyword panel workflow (Step 4).`)],
    evidence: 'pre-product populates only from the deep-journey build (Const III.2a-ii)' };
}

// ─────────────────────────────────────────────────────────────────────────────
// G8 — Funnel blind spot (Theme Clusters, over the stage roll-up).
// ─────────────────────────────────────────────────────────────────────────────
export function funnelBlindSpotInsight(a: {
  stages: Array<{ label: string; topics: number; annualVol: number }>;   // awareness→retention order
}): Insight | null {
  const total = a.stages.reduce((s, x) => s + x.topics, 0);
  if (total < 10 || a.stages.length < 4) return null;
  const aw = a.stages[0];
  const lower = a.stages.slice(1);
  const lowerTopics = lower.reduce((s, x) => s + x.topics, 0);
  const lowerVol    = lower.reduce((s, x) => s + x.annualVol, 0);
  if (aw.topics / total < 0.7 || lowerTopics / total > 0.3) return null;
  return { id: 'G8', tone: 'watch', kicker: 'Finding · Funnel blind spot',
    parts: [seg(`${aw.topics} of ${total} topics (${fmtInsightVol(aw.annualVol)}/yr) sit at Awareness vs `),
      seg(`${lowerTopics} across Consideration, Decision and Retention (${fmtInsightVol(lowerVol)}/yr)`, true),
      seg(' — visible where people learn, thin where they choose.')],
    evidence: 'stage per topic from stored intent classification · exact rollups' };
}

// ─────────────────────────────────────────────────────────────────────────────
// G9 — Big-category underperformance (Keyword panel category breakdown).
// Operates on the GUARDED category list the panel already renders (III.1a).
// ─────────────────────────────────────────────────────────────────────────────
export function bigCategoryInsight(a: {
  cats: Array<{ name: string; monthlyDemand: number; page1Demand: number }>;
  overallShare: number;               // 0..1 — footprint page-1 volume share
}): Insight | null {
  const cats = a.cats.filter(c => c.monthlyDemand > 0);
  if (cats.length < 5 || !(a.overallShare > 0)) return null;
  const sorted = cats.slice().sort((x, y) => y.monthlyDemand - x.monthlyDemand);
  const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 5)));   // top demand quintile (min 3)
  const bigDemand = top.reduce((s, c) => s + c.monthlyDemand, 0);
  const bigP1     = top.reduce((s, c) => s + c.page1Demand, 0);
  if (!(bigDemand > 0)) return null;
  const bigShare = bigP1 / bigDemand;
  if (bigShare >= 0.5 * a.overallShare) return null;
  const median = sorted[Math.floor(sorted.length / 2)].monthlyDemand;
  const proof = cats.filter(c => c.monthlyDemand >= median)
    .slice().sort((x, y) => (y.page1Demand / y.monthlyDemand) - (x.page1Demand / x.monthlyDemand))[0];
  const worst = top.slice().sort((x, y) => (x.page1Demand / x.monthlyDemand) - (y.page1Demand / y.monthlyDemand))[0];
  const parts: InsightSeg[] = [
    seg(`Across your ${top.length} biggest categories you hold `), seg(pct1(bigShare), true),
    seg(` page-1 share vs ${pct1(a.overallShare)} overall — `),
    seg(worst.name, true), seg(` runs ${pct1(worst.page1Demand / Math.max(1, worst.monthlyDemand))} on ${fmtInsightVol(worst.monthlyDemand)}/mo.`)];
  if (proof && proof.page1Demand / Math.max(1, proof.monthlyDemand) > bigShare) {
    parts.push(seg(` ${proof.name} (${pct1(proof.page1Demand / Math.max(1, proof.monthlyDemand))}) proves the playbook works — it isn’t pointed at the demand.`));
  }
  return { id: 'G9', tone: 'watch', kicker: 'Finding · You win the small stuff',
    parts, evidence: 'guarded category rollups · exact page-1 / demand volumes' };
}

// ─────────────────────────────────────────────────────────────────────────────
// A2 — The AIO toll booth (SERP Features, AIO tab).
// ─────────────────────────────────────────────────────────────────────────────
export function aioTollBoothInsight(a: {
  scanned: number;                    // scanned queries
  withAIO: number;                    // scanned queries that triggered an AIO
  missing: number;                    // scan-verified AIOs that do NOT cite the client
  clientCited: number;                // scan-verified AIOs citing the client
  topRival: { name: string; cited: number } | null;
}): Insight | null {
  const { scanned, withAIO, missing, clientCited, topRival } = a;
  if (scanned < 20 || withAIO <= 0 || missing < 5) return null;
  const pen = withAIO / scanned;
  if (pen < 0.3) return null;
  const parts: InsightSeg[] = [
    seg(pct1(pen), true), seg(` of your ${scanned.toLocaleString()} scanned queries now trigger an AI Overview — `),
    seg(`${missing.toLocaleString()} of them answer without citing you`, true), seg('.')];
  if (topRival && clientCited >= 0 && topRival.cited > Math.max(1, clientCited)) {
    const mult = clientCited > 0 ? `${(topRival.cited / clientCited).toFixed(1)}× as often as you` : `${topRival.cited} times — you: ${clientCited}`;
    parts.push(seg(` ${topRival.name} is cited ${mult} on your own footprint.`));
  }
  return { id: 'A2', tone: 'watch', kicker: 'Finding · The answer layer moved',
    parts, evidence: `of ${scanned.toLocaleString()} scanned · live SerpAPI AIO citations` };
}

// ─────────────────────────────────────────────────────────────────────────────
// A3 — Shadow competitor (AI Answer Engines / Profound uploads).
// ─────────────────────────────────────────────────────────────────────────────
export function shadowCompetitorInsight(a: {
  rival: { brand: string; count: number; pct: number } | null;   // top non-client prompt coverage (pct 0..100)
  client: { count: number; pct: number } | null;                 // client prompt coverage (pct 0..100)
  promptN: number;
  rivalCites?: number; clientCites?: number;                     // optional citation counts
  updatedAt?: string;
}): Insight | null {
  const { rival, client, promptN } = a;
  if (!rival || promptN < 50) return null;
  const clientPct = client?.pct ?? 0;
  if (rival.pct < Math.max(10, 2 * clientPct)) return null;
  const parts: InsightSeg[] = [
    seg('Your biggest AI rival is '), seg(rival.brand, true),
    seg(` — in ${rival.count} of ${promptN} tracked prompts (${rival.pct.toFixed(0)}%) vs your ${clientPct.toFixed(0)}%`)];
  if (typeof a.rivalCites === 'number' && typeof a.clientCites === 'number' && a.rivalCites > a.clientCites) {
    parts.push(seg(`, and ${a.rivalCites.toLocaleString()} AI citations vs your ${a.clientCites.toLocaleString()}`));
  }
  parts.push(seg('.'));
  return { id: 'A3', tone: 'watch', kicker: 'Finding · Shadow competitor',
    parts, evidence: `Profound export${a.updatedAt ? ` · updated ${a.updatedAt}` : ''} — real answer counts` };
}

// ─────────────────────────────────────────────────────────────────────────────
// A4 — Zero-owned citations + the earned-media fast path (Citation Landscape).
// ─────────────────────────────────────────────────────────────────────────────
export function earnedFastPathInsight(a: {
  citeTotal: number; citeOwned: number; citeOwnedShare: number;   // share 0..100
  earnedShare: number;                                            // 0..100 from citeCatMix
  mentionHosts: Array<{ hostname: string; count: number }>;       // non-client hosts naming the brand
  citeMentions: number;
  updatedAt?: string;
}): Insight | null {
  const { citeTotal, citeOwned, citeOwnedShare, earnedShare, mentionHosts, citeMentions } = a;
  if (citeTotal <= 0 || citeOwnedShare >= 5 || earnedShare < 20) return null;
  const hosts = mentionHosts.filter(h => h.count >= 10).slice(0, 3);
  const parts: InsightSeg[] = [
    seg(`${citeOwned.toLocaleString()} of ${citeTotal.toLocaleString()}`, true),
    seg(` AI citations point to your domain — while `),
    seg(`${earnedShare.toFixed(0)}% are earned media`, true), seg('.')];
  if (hosts.length > 0 && citeMentions > 0) {
    const hostSum = hosts.reduce((s, h) => s + h.count, 0);
    parts.push(seg(` ${hostSum} of your ${citeMentions} brand mentions already sit on ${hosts.map(h => h.hostname).join(', ')} — your fastest route into AI answers runs through pages that already exist.`));
  }
  return { id: 'A4', tone: 'signal', kicker: 'Finding · The earned-media fast path',
    parts, evidence: `Profound citations_data${a.updatedAt ? ` · updated ${a.updatedAt}` : ''} — direct counts` };
}

// ─────────────────────────────────────────────────────────────────────────────
// A6 — Known but never recommended (LLM probe — always available, no uploads).
// ─────────────────────────────────────────────────────────────────────────────
export function probeAnchorInsight(a: {
  brandedScore: number | null; unbrandedScore: number | null; unbrandedTotal: number;
}): Insight | null {
  const { brandedScore, unbrandedScore, unbrandedTotal } = a;
  if (brandedScore === null || unbrandedScore === null || unbrandedTotal < 30) return null;
  if (brandedScore < 70 || unbrandedScore > 25) return null;
  return { id: 'A6', tone: 'watch', kicker: 'Finding · Known, never recommended',
    parts: [seg('AI engines recognize your brand in '), seg(`${Math.round(brandedScore)}%`, true),
      seg(' of branded prompts — and recommend you in '), seg(`${Math.round(unbrandedScore)}%`, true),
      seg(` of ${unbrandedTotal} unbranded answers. The machines know who you are; they don’t tell anyone.`)],
    evidence: 'live LLM probe — real classified responses, never modeled' };
}

// ─────────────────────────────────────────────────────────────────────────────
// A8 — AI whitespace priced in search demand (probe categories = taxonomy
// names by construction, so the demand join is exact).
// ─────────────────────────────────────────────────────────────────────────────
export function aiWhitespaceInsight(a: {
  cats: Array<{ category: string; monthlyDemand: number; mentions: number; total: number }>;
}): Insight | null {
  const cats = a.cats.filter(c => c.total >= 6 && c.monthlyDemand > 0);
  if (cats.length < 3) return null;
  const demands = cats.map(c => c.monthlyDemand).sort((x, y) => x - y);
  const median = demands[Math.floor(demands.length / 2)];
  const worst = cats.filter(c => c.monthlyDemand >= median && c.mentions / c.total <= 0.02)
    .sort((x, y) => y.monthlyDemand - x.monthlyDemand)[0];
  if (!worst) return null;
  return { id: 'A8', tone: 'watch', kicker: 'Finding · AI whitespace',
    parts: [seg(`In ${worst.category} — `), seg(`${fmtInsightVol(worst.monthlyDemand)} monthly searches`, true),
      seg(' — you were mentioned in '), seg(`${worst.mentions} of ${worst.total}`, true),
      seg(' AI answers.')],
    evidence: 'probe mention counts × exact Semrush category demand' };
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 — Presence vs quality diagnosis (Local Search).
// ─────────────────────────────────────────────────────────────────────────────
export function localDiagnosisInsight(a: {
  withPack: number;                   // scanned keywords that showed a pack
  present: number;                    // packs where the client appears
  avgRank: number | null;             // client avg pack rank when present
  scanDate?: string;
}): Insight | null {
  const { withPack, present, avgRank } = a;
  if (withPack < 10) return null;
  const presence = present / withPack;
  const ev = `live local scan${a.scanDate ? ` · ${a.scanDate}` : ''} — real pack rows`;
  if (presence < 0.5 && avgRank !== null && avgRank <= 2.5) {
    return { id: 'L1', tone: 'watch', kicker: 'Diagnosis · Presence, not performance',
      parts: [seg('You appear in only '), seg(pct0(presence), true),
        seg(` of the ${withPack} map packs on your keywords — but when you appear, you rank `),
        seg(avgRank.toFixed(1), true),
        seg('. The lever is listing coverage + reviews, not rank optimization.')], evidence: ev };
  }
  if (presence >= 0.5 && avgRank !== null && avgRank > 2.5) {
    return { id: 'L1', tone: 'watch', kicker: 'Diagnosis · Performance, not presence',
      parts: [seg(`You show in ${pct0(presence)} of packs but average rank `), seg(avgRank.toFixed(1), true),
        seg(' — presence is solved; pack rank (reviews, proximity signals) is the fight.')], evidence: ev };
  }
  if (presence >= 0.5 && avgRank !== null) {
    return { id: 'L1', tone: 'signal', kicker: 'Diagnosis · Local position strong',
      parts: [seg(`You appear in ${pct0(presence)} of packs at avg rank `), seg(avgRank.toFixed(1), true),
        seg(' — defend it; the remaining misses are the growth list below.')], evidence: ev };
  }
  return null;
}

// L2 — David vs Goliath: the biggest pack the client is absent from.
export function localUsurperInsight(a: {
  top: { keyword: string; searchVolume: number; leader: string } | null;
  clientLocations: number;
  scanDate?: string;
}): Insight | null {
  if (!a.top || a.top.searchVolume <= 0 || !a.top.leader) return null;
  return { id: 'L2', tone: 'watch', kicker: 'Finding · Who owns your map pack',
    parts: [seg(a.top.leader, true), seg(` leads the map pack for “${a.top.keyword}” — `),
      seg(`${fmtInsightVol(a.top.searchVolume)} searches/mo`, true),
      seg(a.clientLocations > 0 ? ` — and you’re absent, with ${a.clientLocations.toLocaleString()} locations on file.` : ' — and you’re absent.')],
    evidence: `live local scan${a.scanDate ? ` · ${a.scanDate}` : ''} — real pack leaders` };
}

// L3 — Review deficit.
export function reviewDeficitInsight(a: {
  avgRating: number | null; totalReviews: number; scanDate?: string;
}): Insight | null {
  if (a.avgRating === null || a.totalReviews < 50) return null;
  if (a.avgRating >= 4.0) return null;
  return { id: 'L3', tone: 'watch', kicker: 'Finding · Review deficit',
    parts: [seg('Your locations average '), seg(`${a.avgRating.toFixed(1)}★`, true),
      seg(` across ${a.totalReviews.toLocaleString()} reviews — below the 4.0 bar that gates pack rank. Reputation is a ranking lever here, not a vanity metric.`)],
    evidence: `live local scan${a.scanDate ? ` · ${a.scanDate}` : ''} — real Google ratings` };
}

// L4 — Pre-scan stakes teaser (Local empty state; fires only when NO scan).
export function localTeaserInsight(a: { packKwCount: number; annualVol: number }): Insight | null {
  if (a.packKwCount < 20) return null;
  return { id: 'L4', tone: 'signal', kicker: 'Unscanned · Demand decided on the map',
    parts: [seg(`${a.packKwCount.toLocaleString()} of your keywords trigger a Google map pack`, true),
      seg(a.annualVol > 0 ? ` — ${fmtInsightVol(a.annualVol)} searches/yr of your demand is decided on the map, and it hasn’t been scanned yet.` : ' — and the packs haven’t been scanned yet.')],
    evidence: 'Semrush SERP-features column — real flags; run the scan to see who wins them' };
}

// ─────────────────────────────────────────────────────────────────────────────
// E3 — Execution gap (Content Plan header): diagnosis vs queued work.
// ─────────────────────────────────────────────────────────────────────────────
export function executionGapInsight(a: {
  totalTopics: number; p0Count: number; p0MonthlyVol: number; quickWins: number; planCount: number;
}): Insight | null {
  const { totalTopics, p0Count, p0MonthlyVol, quickWins, planCount } = a;
  if (totalTopics < 20) return null;
  if (planCount >= Math.max(5, p0Count)) {
    return { id: 'E3', tone: 'signal', kicker: 'Finding · Plan in motion',
      parts: [seg(`Your plan holds ${planCount} of ${totalTopics} prioritized topics — the diagnosis is being worked.`)],
      evidence: 'plan selections vs prioritized topic set · exact counts' };
  }
  return { id: 'E3', tone: 'watch', kicker: 'Finding · Execution gap',
    parts: [seg(`This analysis prioritized `), seg(`${totalTopics} topics`, true),
      seg(` — ${p0Count} P0 (${fmtInsightVol(p0MonthlyVol)}/mo)${quickWins > 0 ? ` · ${quickWins} quick wins` : ''}. Your plan holds `),
      seg(String(planCount), true), seg('.')],
    evidence: 'plan selections vs prioritized topic set · exact counts' };
}

// ═════════════════════════════════════════════════════════════════════════════
// v7.382 — KEY INSIGHTS (Executive Summary box). Wayne 2026-07-31: "list all the
// key insights an executive or CMO would need to know."
//
// Same contract as every rule above: PURE, no fetches, no forked math. Every
// figure arrives as an argument the Executive Summary already derived from the
// deep panels it rolls up (Const II.6) — this file never recomputes one. A rule
// that has no real data behind it returns nothing rather than a placeholder
// sentence (Const I.5). The ONE modeled input any rule touches is Share of Voice
// (the approved GrowthSRC CTR curve, Const I.5a); its sentence says "modeled" on
// screen and names the curve in its evidence stamp — every other line is measured.
//
// `sev` is a PRESENTATIONAL rank only (0 critical → 1 watch → 2 win/context). It
// orders the box; it never trims, caps, or hides the underlying panels (Const I.6).
// The caller renders the top N with the rest one click away — nothing is dropped.
// ═════════════════════════════════════════════════════════════════════════════

// v7.383 (Wayne 2026-07-31): the rail groups findings into three named categories, so
// every rule declares which one it belongs to. `other` is not a fourth section — it is the
// context/risk material that appears only once the reader expands the full set, so nothing
// a rule computed is ever thrown away (Const I.6).
export type ExecInsightCat = 'opportunity' | 'competitor' | 'quickwin' | 'other';

export interface ExecKeyInsight {
  id:       string;                        // stable key (also the anchor for future click-through)
  cat:      ExecInsightCat;                // which rail section this belongs to
  sev:      0 | 1 | 2;                     // 0 = critical · 1 = watch · 2 = win / context
  kicker:   string;                        // small uppercase label
  parts:    InsightSeg[];                  // the sentence, key figures emphasized
  evidence: string;                        // source + freshness stamp (Const I.1 / IV.5)
  panel?:   string;                        // the deep panel this rolls up from (Const II.6)
}

// v7.384 (Wayne 2026-07-31): the two standalone finding rows that used to sit under the KPI
// cards — A6 "Known, never recommended" and A8 "AI whitespace" — were removed from the panel
// body and re-homed into the rail. They are ADOPTED, not rewritten: the sentence still comes
// from the single v7.366 rule that owns it, so the wording and the evidence stamp can never
// drift into a second version. Only the section and the urgency rank are assigned here.
export function adoptInsight(
  ins: Insight | null,
  cat: ExecInsightCat,
  sev: 0 | 1 | 2,
  opts?: { kicker?: string; panel?: string },
): ExecKeyInsight | null {
  if (!ins) return null;
  return {
    id: ins.id, cat, sev,
    kicker: opts?.kicker ?? ins.kicker,
    parts: ins.parts,             // verbatim — never re-derived
    evidence: ins.evidence,       // verbatim — the rule's own provenance stamp
    panel: opts?.panel,
  };
}

export const EXEC_INSIGHT_SECTIONS: Array<{ cat: ExecInsightCat; label: string; accent: string }> = [
  { cat: 'opportunity', label: 'Missed opportunities',     accent: 'var(--c-f59e0b)' },
  { cat: 'competitor',  label: 'Competitors outperforming', accent: 'var(--c-ef4444)' },
  { cat: 'quickwin',    label: 'Quick wins ready now',      accent: 'var(--c-22c55e)' },
];

const oxford = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '')
  : xs.length === 2 ? `${xs[0]} and ${xs[1]}`
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function execKeyInsights(a: {
  // ── AI answer engines (nav 09 · Profound) — null when that panel has no data
  aiVisPct:        number | null;
  aiAnswers:       number;                 // strict denominator the panel headlines
  aiEnginesZero:   number;
  aiEnginesTotal:  number;
  aiZeroEngineNames: string[];
  aiTopicsZero:    number;
  aiTopicsTotal:   number;
  winnablePrompts: number;
  winnableLeader:  string | null;
  promptsSeen:     number | null;          // prompts where the client appears
  promptsTotal:    number | null;
  netSentiment:    number | null;          // −100…+100, null when no sentiment export
  ownedCites:      number | null;
  totalCites:      number | null;
  aiSourceLabel:   string;                 // e.g. "AI Answer Engines (09) · Profound export, updated <date>"
  // ── Google rank / SoV
  page1Pct:        number;
  top3Pct:         number;
  sovPct:          number | null;          // MODELED (CTR curve) — labeled on screen
  ctrSourceLabel:  string;
  nearMissCount:   number;
  nearMissMonthly: number;
  climberCount:    number;
  // ── Coverage map (nav 05)
  optimizeTopics:  number;
  netNewTopics:    number;
  netNewMonthly:   number;
  gapKwCount:      number;
  gapMonthly:      number;
  // ── Journey (nav 04)
  absentStages:    string[];
  thinStages:      string[];
  preProductBuilt: boolean;
  // ── SERP features (nav 07)
  aioAvail:        number;
  aioAcq:          number;
  // ── Read confidence
  confidencePct:   number;
  missingSignals:  string[];
  // ── v7.383: competitor-relative rows, so "Competitors outperforming" is built from real
  // rival figures rather than inferred from the client's own numbers.
  sovRivals?:      Array<{ domain: string; pct: number }>;   // page-1 click capture, MODELED (same curve as K7)
  promptRivals?:   Array<{ brand: string; count: number }>;  // prompts each rival appears on (Profound)
  // v7.384: the A6/A8 findings, computed by the caller from the SAME probe figures the LLM
  // panel shows and passed in whole. Null when the rule declines to fire (honest gap, I.5).
  probeAnchor?:    Insight | null;
  aiWhitespace?:   Insight | null;
}): ExecKeyInsight[] {
  const out: ExecKeyInsight[] = [];
  const push = (i: ExecKeyInsight | null) => { if (i) out.push(i); };

  // ── K1 · AI answer visibility (the headline a CMO is asked about first) ────
  // v7.386: this line absorbed the framing sentence from the removed "The landscape" block —
  // the CONTRAST between what you win on Google and what you win in AI answers. Both figures
  // were already stated separately (here and in K6); the juxtaposition is the finding, and it
  // is now computed live off the same two numbers rather than sitting in analysis-time prose.
  if (a.aiVisPct !== null && a.aiAnswers > 0) {
    const crit = a.aiVisPct < 10;
    const diverged = a.page1Pct > 0 && a.aiVisPct < a.page1Pct;
    const denom = ` of the ${a.aiAnswers.toLocaleString()} AI answers tested across ${a.aiEnginesTotal} engine${a.aiEnginesTotal === 1 ? '' : 's'}`;
    push({
      id: 'K1', cat: 'other', sev: crit ? 0 : a.aiVisPct < 30 ? 1 : 2,
      kicker: crit ? 'Critical · Two worlds of visibility' : 'Finding · AI answers',
      parts: diverged
        ? [seg('You win page 1 for '), seg(`${a.page1Pct}% of demand`, true),
           seg(' — but you are cited in just '), seg(`${a.aiVisPct}%`, true), seg(denom),
           seg(crit ? '. The buyers who ask an assistant first almost never hear your name.' : '.')]
        : [seg('You are cited in '), seg(`${a.aiVisPct}%`, true), seg(denom),
           seg(crit ? ' — the buyers who ask an assistant first almost never hear your name.' : '.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K2 · engine blackouts (which assistants never say your name) ───────────
  if (a.aiEnginesTotal > 0 && a.aiEnginesZero > 0) {
    push({
      id: 'K2', cat: 'opportunity', sev: 0, kicker: 'Critical · Engine blackout',
      parts: [seg(`${a.aiEnginesZero} of ${a.aiEnginesTotal} engine${a.aiEnginesTotal === 1 ? '' : 's'}`, true),
        seg(' never cite you once'),
        seg(a.aiZeroEngineNames.length > 0 ? ` — ${oxford(a.aiZeroEngineNames)}.` : '.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  } else if (a.aiEnginesTotal > 0) {
    // v7.388: the clean sweep is a real reading and it used to be stated on the removed
    // AI-answer-engines card ("present on all engines"). Without this branch, a client with no
    // blackouts loses the finding entirely — a rule that only speaks when the news is bad tells
    // half the truth (Const I.6).
    push({
      id: 'K2', cat: 'other', sev: 2, kicker: 'Win · Engine coverage',
      parts: [seg('You are cited on '), seg(`all ${a.aiEnginesTotal} engines tested`, true),
        seg(' at least once — thin in places, but no engine is a blackout.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K3 · topic whitespace ─────────────────────────────────────────────────
  if (a.aiTopicsTotal > 0 && a.aiTopicsZero > 0) {
    push({
      id: 'K3', cat: 'opportunity', sev: a.aiTopicsZero / a.aiTopicsTotal >= 0.25 ? 0 : 1,
      kicker: 'Watch · Topic whitespace',
      parts: [seg(`${a.aiTopicsZero} of ${a.aiTopicsTotal} tested topic${a.aiTopicsTotal === 1 ? '' : 's'}`, true),
        seg(' return zero mentions of you — whole subject areas where the assistants have no reason to name you yet.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  } else if (a.aiTopicsTotal > 0) {
    // v7.388: as K2 — "no topic whitespace" was on the removed card and is worth stating.
    push({
      id: 'K3', cat: 'other', sev: 2, kicker: 'Win · Topic coverage',
      parts: [seg('You appear somewhere in '), seg(`all ${a.aiTopicsTotal} tested topic${a.aiTopicsTotal === 1 ? '' : 's'}`, true),
        seg(' — there is no subject area you are completely absent from.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── A6 / A8 · adopted from the v7.366 rules (v7.384) ──────────────────────
  // Both are missed opportunities in the plainest sense: real demand, real answers being
  // given, and the client absent from them. Ranked critical because the gates on those two
  // rules only open when the gap is already stark (A6 needs branded ≥70% with unbranded
  // ≤25%; A8 needs an above-median-demand category at ≤2% mention rate).
  push(adoptInsight(a.aiWhitespace ?? null, 'opportunity', 0,
    { kicker: 'Critical · AI whitespace', panel: 'LLM Visibility (08)' }));
  push(adoptInsight(a.probeAnchor ?? null, 'opportunity', 0,
    { kicker: 'Critical · Known, never recommended', panel: 'LLM Visibility (08)' }));

  // ── K4 · winnable prompts (rivals cited, you absent) ──────────────────────
  if (a.winnablePrompts > 0) {
    push({
      id: 'K4', cat: 'competitor', sev: 1, kicker: 'Opportunity · Winnable prompts',
      parts: [seg(`${a.winnablePrompts.toLocaleString()} prompt${a.winnablePrompts === 1 ? '' : 's'}`, true),
        seg(' cite a rival but never you'),
        seg(a.winnableLeader ? ` — ${a.winnableLeader} takes the most of them.` : '.'),
        seg(' These are answers already being given; the question is who gets named.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K5 · prompt coverage ──────────────────────────────────────────────────
  if (a.promptsTotal !== null && a.promptsSeen !== null && a.promptsTotal > 0) {
    const pct = Math.round((100 * a.promptsSeen) / a.promptsTotal);
    push({
      id: 'K5', cat: 'other', sev: pct < 40 ? 1 : 2, kicker: 'Finding · Prompt coverage',
      parts: [seg('You surface on '), seg(`${a.promptsSeen.toLocaleString()} of ${a.promptsTotal.toLocaleString()} tracked prompts`, true),
        seg(` (${pct}%) at least once.`)],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K6 · Google page-1 capture ────────────────────────────────────────────
  push({
    id: 'K6', cat: 'other', sev: a.page1Pct < 25 ? 0 : a.page1Pct < 50 ? 1 : 2,
    kicker: a.page1Pct < 25 ? 'Critical · Google ranks' : 'Finding · Google ranks',
    parts: [seg('You hold page 1 for '), seg(`${a.page1Pct}% of your tracked demand`, true),
      seg(`, and only ${a.top3Pct}% sits in the top 3 — where the clicks actually are.`)],
    evidence: 'ranked search volume on the canonical keyword pool · this scan', panel: 'Google Rank (06)',
  });

  // ── K7 · Share of Voice — the one MODELED line (Const I.5a) ────────────────
  if (a.sovPct !== null) {
    push({
      id: 'K7', cat: 'other', sev: a.sovPct < 10 ? 1 : 2, kicker: 'Modeled · Share of voice',
      parts: [seg('You capture an estimated '), seg(`${a.sovPct}%`, true),
        seg(` of the page-1 clicks available across your footprint — ${Math.round((100 - a.sovPct) * 10) / 10}% is still open.`)],
      evidence: `modeled estimate · ${a.ctrSourceLabel} applied to real volume + real positions`, panel: 'Google Rank (06)',
    });
  }

  // ── K8 · near-miss quick wins (measured counts, no modeled click figure) ───
  if (a.nearMissCount > 0) {
    push({
      id: 'K8', cat: 'quickwin', sev: 2, kicker: 'Opportunity · One step from the top 3',
      parts: [seg(`${a.nearMissCount.toLocaleString()} keyword${a.nearMissCount === 1 ? '' : 's'}`, true),
        seg(` already rank 4–10 — ${fmtInsightVol(a.nearMissMonthly * 12)} searches/yr sitting one position band below the click curve`),
        seg(a.climberCount > 0 ? `, with another ${a.climberCount.toLocaleString()} on page 2.` : '.')],
      evidence: 'exact keyword counts + real Semrush volume at real positions · this scan', panel: 'Google Rank (06)',
    });
  }

  // ── K9 · coverage map split ───────────────────────────────────────────────
  if (a.optimizeTopics + a.netNewTopics > 0) {
    push({
      id: 'K9', cat: 'opportunity', sev: 2, kicker: 'Plan · Coverage map',
      parts: [seg(`${(a.optimizeTopics + a.netNewTopics).toLocaleString()} page${a.optimizeTopics + a.netNewTopics === 1 ? '' : 's'}`, true),
        seg(` are mapped — ${a.optimizeTopics.toLocaleString()} existing to optimize and `),
        seg(`${a.netNewTopics.toLocaleString()} net-new to build`, true),
        seg(a.netNewMonthly > 0 ? ` (${fmtInsightVol(a.netNewMonthly * 12)} searches/yr behind the net-new set).` : '.')],
    evidence: 'canonical content-map topics · exact rollups', panel: 'Content Map (05)',
    });
  }

  // ── K10 · competitor gap ──────────────────────────────────────────────────
  if (a.gapKwCount > 0) {
    push({
      id: 'K10', cat: 'competitor', sev: 1, kicker: 'Watch · Competitor gap',
      parts: [seg(`${a.gapKwCount.toLocaleString()} in-scope keyword${a.gapKwCount === 1 ? '' : 's'}`, true),
        seg(` earn a competitor a ranking and you nothing — ${fmtInsightVol(a.gapMonthly * 12)} searches/yr you are not in the running for.`)],
      evidence: 'competitor-gap rows on the canonical pool, scope-gated · this scan', panel: 'Keyword Landscape (02)',
    });
  }

  // ── K11 · journey blind spots ─────────────────────────────────────────────
  if (a.absentStages.length > 0) {
    push({
      id: 'K11', cat: 'opportunity', sev: 0, kicker: 'Critical · Journey blind spot',
      parts: [seg('You have no page-1 presence at all in '), seg(oxford(a.absentStages), true),
        seg(' — the buyer moves through that stage without meeting you.')],
      evidence: 'journey-stage volume rollups from the canonical clusters · this scan', panel: 'Journeys (04)',
    });
  } else if (a.thinStages.length > 0) {
    push({
      id: 'K11', cat: 'opportunity', sev: 1, kicker: 'Watch · Thin journey stage',
      parts: [seg('Your coverage is thin (under a fifth of stage demand) in '), seg(oxford(a.thinStages), true), seg('.')],
      evidence: 'journey-stage volume rollups from the canonical clusters · this scan', panel: 'Journeys (04)',
    });
  }

  // ── K12 · pre-product lane not built (honest gap, Const III.2a-ii) ─────────
  if (!a.preProductBuilt) {
    push({
      id: 'K12', cat: 'opportunity', sev: 1, kicker: 'Gap · Pre-product journey',
      parts: [seg('The pre-product journey — the problem-aware demand that reaches buyers before they know your category — '),
        seg('has not been built yet', true), seg('. Until it is, this read covers only people already searching for the product.')],
      evidence: 'deep-journey build state · nothing inferred from the ranking footprint', panel: 'Journeys (04)',
    });
  }

  // ── K13 · AI Overviews toll booth ─────────────────────────────────────────
  if (a.aioAvail > 0) {
    const rate = Math.round((100 * a.aioAcq) / a.aioAvail);
    push({
      id: 'K13', cat: 'quickwin', sev: rate < 20 ? 1 : 2, kicker: 'Finding · AI Overviews',
      parts: [seg('Google shows an AI Overview on '), seg(`${a.aioAvail.toLocaleString()} of your keywords`, true),
        seg(` and cites you on ${a.aioAcq.toLocaleString()} of them (${rate}%) — the answer box sits above every rank you own there.`)],
      evidence: 'scanned SERP rows + uploaded Semrush SERP-feature flags · live rollup', panel: 'SERP Features (07)',
    });
  }

  // ── K14 · AI sentiment when you ARE named ─────────────────────────────────
  if (a.netSentiment !== null) {
    push({
      id: 'K14', cat: 'other', sev: a.netSentiment < 0 ? 0 : 2,
      kicker: a.netSentiment < 0 ? 'Critical · AI sentiment' : 'Win · AI sentiment',
      parts: [seg('When the assistants do name you, net sentiment is '),
        seg(`${a.netSentiment > 0 ? '+' : ''}${a.netSentiment}`, true),
        seg(a.netSentiment < 0 ? ' — being found is currently working against you.' : ' — the mentions you earn read favourably.')],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K15 · whose pages the assistants actually quote ───────────────────────
  if (a.totalCites !== null && a.ownedCites !== null && a.totalCites > 0) {
    const pct = (100 * a.ownedCites) / a.totalCites;
    push({
      id: 'K15', cat: 'other', sev: pct < 5 ? 1 : 2, kicker: 'Finding · Citation share',
      parts: [seg(`${a.ownedCites.toLocaleString()} of ${a.totalCites.toLocaleString()} AI citations`, true),
        seg(` point at your own domain (${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%) — the rest is your story told on someone else's page.`)],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K16 · read confidence (what this read cannot yet see) ─────────────────
  if (a.missingSignals.length > 0) {
    push({
      id: 'K16', cat: 'other', sev: 1, kicker: 'Gap · Read confidence',
      parts: [seg(`This read is at ${a.confidencePct}% confidence — `),
        seg(oxford(a.missingSignals), true), seg(` ${a.missingSignals.length === 1 ? 'is' : 'are'} still missing, so anything above that depends on ${a.missingSignals.length === 1 ? 'it' : 'them'} is unmeasured rather than zero.`)],
      evidence: 'presence of each input signal on this project · not a data quality score',
    });
  }

  // ── K17 · a rival takes more page-1 clicks than you (MODELED, same curve as K7) ──
  const rivalsAhead = (a.sovRivals ?? []).filter(r => a.sovPct !== null && r.pct > a.sovPct);
  if (rivalsAhead.length > 0 && a.sovPct !== null) {
    const top = rivalsAhead.slice().sort((x, y) => y.pct - x.pct)[0];
    push({
      id: 'K17', cat: 'competitor', sev: 1, kicker: 'Modeled · Page-1 clicks',
      parts: [seg(top.domain, true), seg(' takes an estimated '), seg(`${top.pct}%`, true),
        seg(` of the page-1 clicks across your footprint to your ${a.sovPct}%`),
        seg(rivalsAhead.length > 1 ? ` — and ${rivalsAhead.length - 1} other tracked rival${rivalsAhead.length === 2 ? '' : 's'} sit ahead of you too.` : '.')],
      evidence: `modeled estimate · ${a.ctrSourceLabel} applied to real volume + real positions`, panel: 'Google Rank (06)',
    });
  }

  // ── K18 · a rival is named on more AI prompts than you ────────────────────
  const promptAhead = (a.promptRivals ?? [])
    .filter(r => a.promptsSeen !== null && r.count > (a.promptsSeen as number))
    .sort((x, y) => y.count - x.count);
  if (promptAhead.length > 0 && a.promptsSeen !== null && a.promptsTotal) {
    const top = promptAhead[0];
    push({
      id: 'K18', cat: 'competitor', sev: 0, kicker: 'Critical · AI prompt share',
      parts: [seg(top.brand, true), seg(' is named on '), seg(`${top.count.toLocaleString()} of ${a.promptsTotal.toLocaleString()} tracked prompts`, true),
        seg(` — ${(top.count / Math.max(1, a.promptsSeen)).toFixed(1)}× your ${a.promptsSeen.toLocaleString()}. The assistants have a default answer, and it isn't you.`)],
      evidence: a.aiSourceLabel, panel: 'AI Answer Engines (09)',
    });
  }

  // ── K19 · pages that already exist and just need work (quick win) ─────────
  if (a.optimizeTopics > 0) {
    push({
      id: 'K19', cat: 'quickwin', sev: 2, kicker: 'Ready now · Pages you already have',
      parts: [seg(`${a.optimizeTopics.toLocaleString()} mapped topic${a.optimizeTopics === 1 ? '' : 's'}`, true),
        seg(' already have a page behind them — these are optimisations, not net-new builds, so they move first and cost least.')],
      evidence: 'canonical content-map topics matched to existing pages · exact counts', panel: 'Content Map (05)',
    });
  }

  // Severity first, then original (topic) order — a stable sort, so two runs of
  // the same data always produce the same list.
  return out
    .map((ins, i) => ({ ins, i }))
    .sort((x, y) => (x.ins.sev - y.ins.sev) || (x.i - y.i))
    .map(x => x.ins);
}
