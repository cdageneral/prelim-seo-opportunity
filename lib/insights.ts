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
