/**
 * lib/usage/pdfTemplate.ts — v7.482: the API Usage & Cost report.
 *
 * A printable copy of the /usage dashboard: grand totals, the fail-closed
 * alarms, the full per-project table, the rate card, and the Hours Saved
 * credited/withheld appendix.
 *
 * Constitution:
 *  - I.1  Every figure is READ from the payloads the three /api/usage routes
 *         measured. This module prices nothing, credits nothing and queries
 *         nothing — it lays out numbers it was handed.
 *  - II.6a A rollup reads a metric, it never re-derives one. The one fold this
 *         file performs (the Keywords subtotal) is the SHARED sumKeywordCounts
 *         from lib/usage/rollupView.ts, which is the same function the panel
 *         calls — so the report and the screen cannot print different totals.
 *  - I.5  A missing payload omits its section and says so; an unknown keyword
 *         count prints a dash, never a zero. Alarms present on the panel are
 *         reproduced here, because a report that quietly drops the "these
 *         totals are understated" warning is worse than no report.
 *  - II.6c This is an OPERATOR artifact. It carries Hours Saved and internal
 *         cost data, is stamped INTERNAL on every page, and is never reachable
 *         from a client-deliverable module. See the location note in
 *         lib/usage/rollupView.ts.
 *  - I.6  No caps: every project, every rate-card row and every activity line
 *         is printed. The report paginates; it does not truncate.
 *
 * Style continuity (Const VII.3) follows lib/pdf/assessmentTemplate.ts — same
 * type scale, tile, table and callout language — but prints LANDSCAPE letter,
 * because the per-project table is up to twelve columns wide.
 */

import {
  fmt, fmtUSD, fmtRate, fmtTime, lineKey, providerLabel, unitLabel,
  sumKeywordCounts, costByProject, hoursByProject,
  type RollupPayload, type CostPayload, type HoursPayload, type KwCount,
} from '@/lib/usage/rollupView';

export interface UsageReportInput {
  rollup: RollupPayload;
  cost: CostPayload | null;
  hours: HoursPayload | null;
  /** Per-project Keyword Landscape counts, exactly as the panel holds them. */
  keywordCounts: Record<string, KwCount>;
  /** When the report itself was produced. */
  generatedAt: string;
  /**
   * v7.483 — what these figures cover. A report of a filtered dashboard that
   * does not say it is filtered is a false report, so this is printed on page
   * one AND repeated in the eyebrow of every page. Absent = an unscoped export
   * from before v7.483; the report simply omits the statement rather than
   * inventing one (Const I.5).
   */
  scope?: { statement: string; rangeLabel: string; dated: boolean; projectFiltered: boolean } | null;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rows of the per-project table per printed page. Layout constant, not a data cap (I.6). */
const ROWS_PER_PAGE = 18;
/** Projects per page in the Hours appendix. */
const HOURS_PER_PAGE = 3;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length > 0 ? out : [[]];
}

/** The Keywords cell, with the panel's exact three honest-gap states (I.5). */
function kwCell(projectId: string | null, counts: Record<string, KwCount>): string {
  if (!projectId) return '<span class="dash">&mdash;</span>';
  const v = counts?.[projectId];
  if (v === undefined) return '<span class="dash">&mdash;</span>';
  if (v === 'error')   return '<span class="warn">?</span>';
  if (v === null)      return '<span class="dash">&mdash;</span>';
  return esc(fmt(v));
}

export function buildUsageHTML(input: UsageReportInput): string {
  const { rollup, cost, hours, keywordCounts, generatedAt, scope } = input;
  const scoped = !!scope && (scope.dated || scope.projectFiltered);

  const grand    = rollup?.grandTotals ?? [];
  const projects = rollup?.projects ?? [];
  const columns  = grand.map(lineKey);
  const costMap  = costByProject(cost);
  const hoursMap = hoursByProject(hours);
  const kw       = sumKeywordCounts(keywordCounts ?? {});
  const kwComplete = kw.loaded >= projects.filter(p => !!p.projectId).length;

  const asOf = fmtTime(rollup?.asOf ?? null);

  // ── Page 1 — headline ──────────────────────────────────────────────────────
  const headTiles: string[] = [];
  if (cost) {
    headTiles.push(`<div class="tile accent"><div class="k">Estimated spend</div>
      <div class="v">${esc(fmtUSD(cost.grandTotalUSD))}</div>
      <div class="d">Across ${esc(fmt(projects.length))} ${projects.length === 1 ? 'project' : 'projects'}. A computed estimate at registry rates, not the invoice.</div></div>`);
  }
  if (hours) {
    headTiles.push(`<div class="tile good"><div class="k">Hours saved &middot; internal</div>
      <div class="v">${esc(fmt(hours.grandHours))}</div>
      <div class="d">Of ${esc(fmt(hours.scope?.total ?? 0))} hrs in full scope, across ${esc(fmt(hours.projectCount))} ${hours.projectCount === 1 ? 'project' : 'projects'}.</div></div>`);
  }
  headTiles.push(`<div class="tile"><div class="k">Projects metered</div>
    <div class="v">${esc(fmt(projects.length))}</div>
    <div class="d">Every project with a recorded call, plus the unattributed bucket where one exists.</div></div>`);
  headTiles.push(`<div class="tile"><div class="k">Keywords under management</div>
    <div class="v">${kw.loaded === 0 ? '<span class="dash">&mdash;</span>' : esc(fmt(kw.total)) + (kwComplete ? '' : '<small>&hellip;</small>')}</div>
    <div class="d">${kw.loaded === 0
      ? 'No keyword counts were available when this report was produced.'
      : kwComplete
        ? 'Full Keyword Landscape across every project counted.'
        : `Subtotal of the ${esc(fmt(kw.loaded))} projects counted so far — counts still arriving.`}</div></div>`);

  const providerCards = grand.map(l => `
    <div class="pcard">
      <div class="pl">${esc(providerLabel(l.provider))}</div>
      <div class="pv">${esc(fmt(l.total))}</div>
      <div class="pu">${esc(unitLabel(l.unit))}</div>
      <div class="pb">${esc(fmt(l.usage))} metered${l.baseline > 0 ? ` &middot; ${esc(fmt(l.baseline))} baseline` : ''} &middot; ${esc(fmt(l.calls))} calls</div>
    </div>`).join('');

  const splitLine = cost ? `
    <p><b>Estimated spend splits three ways</b>, because the bases mean different things:
    <b>${esc(fmtUSD(cost.grandPayPerUseUSD))}</b> pay-per-use (Anthropic &amp; OpenAI tokens, billed per token)
    + <b>${esc(fmtUSD(cost.grandPlanQuotaUSD))}</b> allocated from prepaid plans
    ${(cost.grandMeasuredUSD ?? 0) > 0 ? `+ <b>${esc(fmtUSD(cost.grandMeasuredUSD ?? 0))}</b> measured (DataForSEO reports the real cost of every request, so those dollars are not an estimate at all) ` : ''}
    = <b>${esc(fmtUSD(cost.grandTotalUSD))}</b>. Prepaid allocations sum to <i>less</i> than the invoice: unused quota is allocated to no one.</p>` : `
    <div class="gapblock"><div class="t">NO COST DATA</div>
    <p>The cost rollup was unavailable when this report was produced, so no dollar figure appears anywhere in it. Usage quantities below are unaffected.</p></div>`;

  const page1 = `
    <h1 class="pg">API Usage &amp; Cost</h1>
    <div class="lede">Real metered credit consumption across every project, as of <b>${esc(asOf)}</b>.
    Every quantity below was recorded per call at the moment the call was made; every dollar is that quantity
    multiplied by a named, dated rate. Provider dashboards remain the billing source of truth.</div>
    ${scope?.statement ? `<div class="${scoped ? 'callout scopebox' : 'callout'}">
      <div class="t">${scoped ? 'THIS REPORT IS FILTERED' : 'SCOPE'}</div>
      <p>${esc(scope.statement)}</p></div>` : ''}
    <div class="tiles c4">${headTiles.join('')}</div>
    <div class="figtitle" style="margin-top:18px;">Consumption by provider</div>
    <div class="figsub">Metered usage plus any manual baseline, in each provider&rsquo;s own native unit. These units are not comparable to one another.</div>
    ${grand.length > 0 ? `<div class="pcards">${providerCards}</div>` : '<div class="gapblock"><div class="t">NO USAGE RECORDED</div><p>The ledger holds no metered calls for this period.</p></div>'}
    ${splitLine}`;

  // ── Page 2 — alarms, only when there is something to alarm about ───────────
  const alarms: string[] = [];
  if (cost && (cost.ledgerFailures?.count ?? 0) > 0) {
    alarms.push(`<div class="alarm bad">
      <div class="at">Ledger writes are failing &mdash; these totals are understated</div>
      <p><b>${esc(fmt(cost.ledgerFailures?.count ?? 0))}</b> billable ${(cost.ledgerFailures?.count ?? 0) === 1 ? 'call' : 'calls'}
      could not be written to the usage ledger on the server instance that answered this request, so their spend is
      <b>missing from every figure in this report</b>. Real money was charged by the provider regardless.
      ${cost.ledgerFailures?.lastError ? `<br>Last error: <code>${esc(cost.ledgerFailures.lastError)}</code>` : ''}
      <br>Counted per server instance, so this is a floor, not a total.</p></div>`);
  }
  if (cost && !cost.registryOk) {
    alarms.push(`<div class="alarm warn">
      <div class="at">Unpriced source &mdash; no rate on file</div>
      <p>${cost.unregistered.length === 1 ? 'A metered source is' : `${esc(fmt(cost.unregistered.length))} metered sources are`}
      recording usage with no entry in the rate registry, so ${cost.unregistered.length === 1 ? 'its' : 'their'} spend is
      <b>missing from every total in this report</b>. Add a rate &mdash; or an explicit unpriced declaration &mdash; in
      <code>lib/usage/pricing.ts</code>. This is also an Article VIII release-gate failure.</p>
      <ul>${cost.unregistered.map(u => `<li><b>${esc(providerLabel(u.provider))}</b> &middot; ${esc(u.endpoint)} &middot; ${esc(unitLabel(u.unit))}<br><span class="sub">${esc(u.reason)}</span></li>`).join('')}</ul></div>`);
  }
  if (hours && (hours.unregistered?.length ?? 0) > 0) {
    alarms.push(`<div class="alarm bad">
      <div class="at">Activity with no evidence gate &mdash; its hours are never credited</div>
      <p><b>${esc(hours.unregistered.join(', '))}</b> ${hours.unregistered.length === 1 ? 'names a gate that is' : 'name gates that are'}
      not in the registry, so ${hours.unregistered.length === 1 ? 'its' : 'their'} hours are
      <b>missing from every hours figure in this report</b>. Pick a registered gate in Admin &rarr; Hours Saved,
      or add one in <code>lib/hours/gates.ts</code>.</p></div>`);
  }
  const alarmPage = alarms.length > 0 ? `
    <h1 class="pg sm">Data-integrity alarms</h1>
    <div class="lede">Each item below means a real number is <b>missing</b> from the totals in this report. They are
    reproduced from the dashboard verbatim: a printed copy that silently dropped them would read as a clean bill of health.</div>
    ${alarms.join('')}` : null;

  // ── Per-project table ─────────────────────────────────────────────────────
  const thead = `
    <tr>
      <th class="l">Project</th>
      <th>Keywords</th>
      ${hours ? '<th>Hours saved</th>' : ''}
      ${grand.map(l => `<th>${esc(providerLabel(l.provider))}<span class="sub">${esc(unitLabel(l.unit))}</span></th>`).join('')}
      ${cost ? '<th>Est. cost<span class="sub">USD</span></th>' : ''}
      <th class="r">Last activity</th>
    </tr>`;

  const rowHTML = (proj: RollupPayload['projects'][number]): string => {
    const byKey = new Map(proj.lines.map(l => [lineKey(l), l]));
    const hp = proj.projectId ? hoursMap.get(proj.projectId) : undefined;
    return `<tr>
      <td class="l">${proj.projectId ? `<b>${esc(proj.projectName)}</b>` : `<i class="dash">${esc(proj.projectName)}</i>`}</td>
      <td class="n">${kwCell(proj.projectId, keywordCounts ?? {})}</td>
      ${hours ? `<td class="n">${hp ? esc(fmt(hp.hours)) : '<span class="dash">&mdash;</span>'}</td>` : ''}
      ${columns.map(col => {
        const l = byKey.get(col);
        return `<td class="n">${l ? esc(fmt(l.total)) : '<span class="dash">&mdash;</span>'}</td>`;
      }).join('')}
      ${cost ? `<td class="n money">${esc(fmtUSD(costMap.get(proj.projectId ?? 'unattributed') ?? 0))}</td>` : ''}
      <td class="r sub2">${esc(fmtTime(proj.lastActivity))}</td>
    </tr>`;
  };

  const totalRow = `<tr class="tot">
    <td class="l">All projects</td>
    <td class="n">${kw.loaded === 0 ? '<span class="dash">&mdash;</span>' : esc(fmt(kw.total)) + (kwComplete ? '' : '&hellip;')}</td>
    ${hours ? `<td class="n">${esc(fmt(hours.grandHours))}</td>` : ''}
    ${grand.map(l => `<td class="n">${esc(fmt(l.total))}</td>`).join('')}
    ${cost ? `<td class="n money">${esc(fmtUSD(cost.grandTotalUSD))}</td>` : ''}
    <td class="r"></td>
  </tr>`;

  const pages = chunk(projects, ROWS_PER_PAGE);
  const tablePages = pages.map((slice, i) => `
    <h1 class="pg sm">By project${pages.length > 1 ? ` <span class="ofn">${i + 1} of ${pages.length}</span>` : ''}</h1>
    ${i === 0 ? `<div class="lede">Every project that has recorded a metered call. Real projects rank by consumption;
      calls made outside a project context roll up as <i>Unattributed</i>. A dash is an honest gap &mdash; no data of that
      kind for that project &mdash; never a zero.</div>` : ''}
    <table class="dt">
      <thead>${thead}</thead>
      <tbody>
        ${slice.map(rowHTML).join('')}
        ${i === pages.length - 1 ? totalRow : ''}
      </tbody>
    </table>`);

  // ── Rate card + methodology ───────────────────────────────────────────────
  const rc = cost?.rateCard;
  const ratePage = cost ? `
    <h1 class="pg sm">Rates and method</h1>
    <div class="lede">Every dollar in this report is a recorded quantity multiplied by one of the rates below.
    ${rc?.asOf ? `Rate card as of <b>${esc(rc.asOf)}</b>. ` : ''}It is a <i>computed estimate</i>, not the actual invoice &mdash;
    caching, batch and negotiated discounts are not reflected.</div>
    ${(rc?.models ?? []).length > 0 ? `
      <div class="figtitle">Per token</div>
      <table class="dt sm"><thead><tr><th class="l">Model</th><th>Input &middot; USD / 1M</th><th>Output &middot; USD / 1M</th></tr></thead>
      <tbody>${(rc?.models ?? []).map(m => `<tr><td class="l">${esc(m.label)}</td><td class="n">${esc(fmtRate(m.inputPerM))}</td><td class="n">${esc(fmtRate(m.outputPerM))}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(rc?.units ?? []).length > 0 ? `
      <div class="figtitle" style="margin-top:14px;">Per unit &mdash; prepaid plan allocation</div>
      <table class="dt sm"><thead><tr><th class="l">Unit</th><th>USD / unit</th><th class="l">Plan</th><th class="l">Basis</th><th>As of</th></tr></thead>
      <tbody>${(rc?.units ?? []).map(u => `<tr><td class="l">${esc(u.label)}</td><td class="n">${esc(fmtRate(u.usdPerUnit))}</td><td class="l sub2">${esc(u.plan)}</td><td class="l sub2">${esc(u.basis)}</td><td class="n sub2">${esc(u.asOf)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(rc?.measured ?? []).length > 0 ? `
      <div class="figtitle" style="margin-top:14px;">Measured &mdash; no rate applied</div>
      <table class="dt sm"><thead><tr><th class="l">Source</th><th class="l">Why it is not an estimate</th><th>As of</th></tr></thead>
      <tbody>${(rc?.measured ?? []).map(m => `<tr><td class="l">${esc(m.label)}</td><td class="l sub2">${esc(m.note)}</td><td class="n sub2">${esc(m.asOf)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(rc?.unpriced ?? []).length > 0 ? `
      <div class="figtitle" style="margin-top:14px;">Deliberately unpriced</div>
      <div class="figsub">An honest gap (Const I.5) &mdash; a real quantity is still counted for each; only the dollar figure is withheld.</div>
      <table class="dt sm"><thead><tr><th class="l">Source</th><th class="l">Reason</th><th>Declared</th></tr></thead>
      <tbody>${(rc?.unpriced ?? []).map(u => `<tr><td class="l">${esc(u.label)}</td><td class="l sub2">${esc(u.reason)}</td><td class="n sub2">${esc(u.asOf)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${cost.planQuotaCaveat ? `<div class="callout"><div class="t">WHY THE PREPAID FIGURES ARE AN ALLOCATION</div><p>${esc(cost.planQuotaCaveat)}</p></div>` : ''}
    <div class="src"><b>How units are counted:</b> Semrush units = rows returned &times; published per-line rate
    (domain/URL 10, competitor-discovery &amp; demand 40); SerpAPI = searches; Profound = calls;
    Anthropic/OpenAI = tokens (OpenAI portraits = images). Counting began when v7.225 deployed; per-project baselines
    inside each project&rsquo;s API Usage panel account for earlier spend.
    ${(rc?.sources ?? []).length > 0 ? `<br><b>Rate sources:</b> ${(rc?.sources ?? []).map(s => esc(s)).join(' &middot; ')}` : ''}</div>` : null;

  // ── Hours Saved appendix ──────────────────────────────────────────────────
  const hoursProjects = (hours?.projects ?? []).filter(p => (p.lines?.length ?? 0) > 0);
  const hoursPages = hours && hoursProjects.length > 0
    ? chunk(hoursProjects, HOURS_PER_PAGE).map((slice, i, all) => `
      <h1 class="pg sm">Hours saved &mdash; what was credited${all.length > 1 ? ` <span class="ofn">${i + 1} of ${all.length}</span>` : ''}</h1>
      ${i === 0 ? `<div class="lede">The hours are a declared rate card, not a measurement &mdash; but <i>which</i> activities
        are counted is measured. Each is credited only where the project actually holds that deliverable&rsquo;s stored data,
        so a project with no backlink scan is never credited for a backlink profile. A struck line was withheld for exactly
        that reason. <b>This figure is internal</b> (Const II.6c).</div>` : ''}
      ${slice.map(p => `
        <div class="hblock">
          <div class="hhead"><b>${esc(p.projectName)}</b>
            <span class="sub2">${esc(fmt(p.hours))} hrs credited from ${esc(fmt(p.creditedCount))} of ${esc(fmt(p.totalCount))} activities &middot; ${esc(fmt(p.ceilingHours))} hrs in full scope${p.proxyHours > 0 ? ` &middot; ${esc(fmt(p.proxyHours))} hrs on a proxy signal` : ''}</span>
          </div>
          <div class="hlines">${p.lines.map(l => `
            <div class="hl ${l.credited ? '' : 'off'}">
              <span class="hm">${l.credited ? '&#10003;' : '&ndash;'}</span>
              <span class="hn">${esc(l.label)}${l.proxy && l.credited ? ' <span class="tag">proxy</span>' : ''}${l.unregistered ? ' <span class="tag bad">no gate</span>' : ''}</span>
              <span class="hd"></span>
              <span class="hv">${esc(fmt(l.hours))}</span>
            </div>`).join('')}</div>
        </div>`).join('')}`)
    : [];

  // ── Assemble ──────────────────────────────────────────────────────────────
  const body: string[] = [page1];
  if (alarmPage) body.push(alarmPage);
  body.push(...tablePages);
  if (ratePage) body.push(ratePage);
  body.push(...hoursPages);

  const total = body.length;
  // Every page repeats the window, because pages get printed and passed around
  // individually and a filtered table page must not read as the whole ledger.
  const eyebrowR = `${scope?.rangeLabel ? esc(scope.rangeLabel).toUpperCase() + ' &middot; ' : ''}AS OF ${esc(asOf).toUpperCase()}`
    + (scope?.projectFiltered ? ' &middot; FILTERED' : '');
  const pagesHTML = body.map((inner, i) => `
    <div class="page">
      <div class="eyebrow"><span class="l">ORBITIQ &middot; API USAGE &amp; COST</span><span class="r">${eyebrowR}</span></div>
      ${inner}
      <div class="foot"><span>INTERNAL &mdash; iQuanti operations. Not for client distribution.</span><span>Generated ${esc(fmtTime(generatedAt))} &middot; Page ${i + 1} of ${total}</span></div>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>OrbitIQ — API Usage &amp; Cost</title>
<style>
  :root{--ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --baseline:#c3c2b7; --surface:#fcfcfb;
    --blue:#2a78d6; --blue-550:#1c5cab; --good:#0ca30c; --critical:#d03b3b; --amber:#8a5a00;}
  *{box-sizing:border-box; margin:0; padding:0;}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact;}
  .page{width:11in; height:8.5in; background:#fff; position:relative; padding:.5in .6in .62in .6in; overflow:hidden; page-break-after:always;}
  @page{size:letter landscape; margin:0;}
  .eyebrow{display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:7px; margin-bottom:18px;}
  .eyebrow .l{font-size:9.5px; letter-spacing:.14em; font-weight:700;}
  .eyebrow .r{font-size:9.5px; letter-spacing:.10em; color:var(--muted); font-weight:600;}
  .foot{position:absolute; left:.6in; right:.6in; bottom:.3in; display:flex; justify-content:space-between; font-size:8.5px; color:var(--muted); border-top:1px solid var(--grid); padding-top:7px;}
  h1.pg{font-size:26px; line-height:1.12; font-weight:800; letter-spacing:-.01em; margin-bottom:9px;}
  h1.pg.sm{font-size:20px;}
  h1.pg .ofn{font-size:12px; font-weight:700; color:var(--muted); letter-spacing:0;}
  .lede{font-size:11px; line-height:1.5; color:var(--ink2); max-width:8.2in; margin-bottom:16px;}
  .lede b{color:var(--ink);}
  p{font-size:10px; line-height:1.5; color:var(--ink2); margin-top:10px;}
  p b{color:var(--ink);}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:9px; color:var(--ink);}
  .src{font-size:8.5px; color:var(--muted); margin-top:10px; line-height:1.5;}
  .src b{color:var(--ink2);}
  .callout{border-left:3px solid var(--blue); background:#f5f8fd; padding:10px 14px; border-radius:0 6px 6px 0; margin-top:12px;}
  .callout .t{font-size:8.5px; font-weight:800; letter-spacing:.1em; color:var(--blue-550); margin-bottom:3px;}
  .callout.scopebox{border-left-color:var(--amber); background:#fdf8ec; margin:0 0 14px;}
  .callout.scopebox .t{color:var(--amber);}
  .callout p{margin-top:0;}
  .gapblock{border:1.5px dashed #ecd39a; background:#fdf8ec; padding:12px 14px; border-radius:8px; margin-top:12px;}
  .gapblock .t{font-size:8.5px; font-weight:800; letter-spacing:.1em; color:var(--amber); margin-bottom:3px;}
  .gapblock p{margin-top:0;}
  .tiles{display:grid; gap:11px;} .tiles.c4{grid-template-columns:repeat(4,1fr);}
  .tile{border:1px solid var(--grid); border-radius:8px; padding:12px 13px; background:var(--surface);}
  .tile .k{font-size:8.5px; font-weight:700; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; margin-bottom:6px;}
  .tile .v{font-size:25px; font-weight:800; letter-spacing:-.02em; line-height:1; font-variant-numeric:tabular-nums;}
  .tile .v small{font-size:13px; font-weight:700; color:var(--muted);}
  .tile .d{font-size:8.8px; color:var(--ink2); margin-top:6px; line-height:1.4;}
  .tile.accent{border-top:3px solid var(--blue);}
  .tile.good{border-top:3px solid var(--good);} .tile.good .v{color:var(--good);}
  .pcards{display:grid; grid-template-columns:repeat(4,1fr); gap:10px;}
  .pcard{border:1px solid var(--grid); border-radius:7px; padding:9px 11px; background:#fff;}
  .pcard .pl{font-size:8.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--blue-550);}
  .pcard .pv{font-size:17px; font-weight:800; letter-spacing:-.02em; margin-top:3px; font-variant-numeric:tabular-nums;}
  .pcard .pu{font-size:8.5px; color:var(--muted);}
  .pcard .pb{font-size:8px; color:var(--ink2); margin-top:4px; line-height:1.35;}
  .figtitle{font-size:11px; font-weight:800; margin-bottom:2px;}
  .figsub{font-size:9px; color:var(--muted); margin-bottom:9px;}
  table.dt{width:100%; border-collapse:collapse; font-size:9.5px;}
  table.dt.sm{font-size:9px;}
  table.dt th{font-size:8px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:right; border-bottom:1.5px solid var(--baseline); padding:5px 6px; vertical-align:bottom;}
  table.dt th.l{text-align:left;} table.dt th.r{text-align:right;}
  table.dt th .sub{display:block; font-size:7.5px; font-weight:600; letter-spacing:.02em; text-transform:none; color:var(--baseline);}
  table.dt td{padding:5px 6px; border-bottom:1px solid var(--grid); color:var(--ink2); vertical-align:top; text-align:right;}
  table.dt td.l{text-align:left;} table.dt td.r{text-align:right; white-space:nowrap;}
  table.dt td.n{font-variant-numeric:tabular-nums; color:var(--ink); font-weight:600;}
  table.dt td.money{color:var(--ink);}
  table.dt td b{color:var(--ink);}
  table.dt tr.tot td{border-top:2px solid var(--baseline); border-bottom:none; font-weight:800; color:var(--ink); padding-top:7px;}
  .dash{color:var(--baseline);} .warn{color:var(--amber); font-weight:700;}
  .sub2{font-size:8.5px; color:var(--muted); font-weight:400;}
  .alarm{border-radius:8px; padding:12px 15px; margin-bottom:12px;}
  .alarm.bad{border:1.5px solid #f0c9c5; background:#fdf0ef;}
  .alarm.warn{border:1.5px solid #ecd39a; background:#fdf8ec;}
  .alarm .at{font-size:11px; font-weight:800; margin-bottom:4px;}
  .alarm.bad .at{color:#9c2b2b;} .alarm.warn .at{color:var(--amber);}
  .alarm p{margin-top:0; font-size:9.5px;}
  .alarm ul{list-style:none; margin-top:7px;}
  .alarm li{font-size:9.5px; color:var(--ink2); padding-left:11px; position:relative; margin-bottom:4px;}
  .alarm li:before{content:"\\2022"; position:absolute; left:0; color:var(--amber);}
  .alarm li .sub{font-size:8.5px; color:var(--muted);}
  .hblock{border:1px solid var(--grid); border-radius:8px; padding:10px 13px; background:var(--surface); margin-bottom:9px;}
  .hhead{font-size:11px; margin-bottom:7px; display:flex; justify-content:space-between; align-items:baseline; gap:10px; border-bottom:1px solid var(--grid); padding-bottom:5px;}
  .hlines{display:grid; grid-template-columns:repeat(3,1fr); gap:2px 16px;}
  .hl{display:flex; align-items:baseline; gap:5px; font-size:8.6px; color:var(--ink);}
  .hl.off{color:var(--baseline);}
  .hl .hm{width:8px; color:var(--good);} .hl.off .hm{color:var(--baseline);}
  .hl .hd{flex:1; border-bottom:1px dotted var(--grid); min-width:6px;}
  .hl .hv{font-variant-numeric:tabular-nums; font-weight:700;}
  .hl.off .hv{text-decoration:line-through; font-weight:400;}
  .hl .tag{font-size:7.5px; font-weight:700; color:var(--amber);}
  .hl .tag.bad{color:var(--critical);}
</style></head><body>${pagesHTML}</body></html>`;
}
