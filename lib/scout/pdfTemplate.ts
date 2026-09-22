/**
 * lib/scout/pdfTemplate.ts — the client-facing Scout snapshot (v7.513).
 *
 * Reads the STORED ScoutResult verbatim (Const II.6a) — no figure is derived here
 * that lib/scout/opportunity did not already compute from Semrush / DataForSEO
 * rows. Every sentence is a template filled with those figures; no LLM writes
 * prose on this report, so there is nothing to fact-check after the fact.
 *
 * Layout signed off by Wayne on scout-mockup-v6 (2026-09-21): one lead
 * opportunity, chart-led pages, serif headlines with Inter numerals, and a
 * relationship-first close with a single ask — a 30-minute call — and no rep
 * name, booking link, QR code or contact email (iQuanti has none to print).
 * A section whose data is missing is dropped, never padded (Const I.5).
 */

import type { ScoutResult, ThemeLite, KeywordLite } from './run';
import { OPEN_BELOW_SHARE, HELD_FROM_SHARE, DEMAND_FLOOR_MONTHLY, AI_NAMED_FROM, AUTHORITY_TOLERANCE, NEAR_WIN_MIN, PAGES_GAP_MULTIPLE } from './config';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
export function vol(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return Math.round(n / 1000) + 'K';
  if (n >= 1_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n0(n);
}
const pct = (x: number) => (x * 100 >= 10 || x === 0 ? Math.round(x * 100) : Math.round(x * 1000) / 10) + '%';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (d: string) => d.replace(/^www\./, '');
const path = (u: string) => { const p = String(u ?? '').replace(/^https?:\/\/[^/]+/i, ''); return p.length > 58 ? p.slice(0, 55) + '…' : (p || '/'); };

// ─── squarified treemap ──────────────────────────────────────────────────────
interface Box { x: number; y: number; w: number; h: number; i: number }
export function treemap(values: number[], W: number, H: number): Box[] {
  const total = values.reduce((s, v) => s + v, 0); if (!(total > 0)) return [];
  const items = values.map((v, i) => ({ a: (v / total) * W * H, i })).filter(t => t.a > 0).sort((a, b) => b.a - a.a);
  const out: Box[] = []; let x = 0, y = 0, w = W, h = H;
  const worst = (row: typeof items, side: number) => { const s = row.reduce((t, r) => t + r.a, 0); const mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  let row: typeof items = [];
  const flush = () => {
    const s = row.reduce((t, r) => t + r.a, 0); if (!row.length) return;
    if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { const ch = r.a / cw; out.push({ x, y: cy, w: cw, h: ch, i: r.i }); cy += ch; } x += cw; w -= cw; }
    else { const ch = s / w; let cx = x; for (const r of row) { const cw = r.a / ch; out.push({ x: cx, y, w: cw, h: ch, i: r.i }); cx += cw; } y += ch; h -= ch; }
    row = [];
  };
  for (const it of items) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it); else { flush(); row.push(it); }
  }
  flush();
  return out;
}

const STATE = {
  open:      { fill: '#d03b3b', ink: '#ffffff', label: 'Open to you' },
  contested: { fill: '#eda100', ink: '#2b1d00', label: 'Contested' },
  held:      { fill: '#2a78d6', ink: '#ffffff', label: 'Held' },
} as const;

export function buildScoutHtml(r: ScoutResult): string {
  const me = r.input.domain;
  const comps = r.input.competitors.map(c => c.domain);
  const o = r.opening;
  const T = (name: string | null | undefined) => r.themes.find(t => t.name === name) ?? null;
  const lead = o ? T(o.theme) : null;
  const when = new Date(r.generatedAt);
  const month = when.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' }).toUpperCase();
  const dateStr = when.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  const floorNote = r.floorVolume > 0 ? `non-branded searches above ${n0(r.floorVolume)} a month` : 'non-branded searches';
  const authOf = (d: string) => r.facts.find(f => f.domain === d)?.authorityScore ?? null;

  let pageNo = 0;
  const foot = () => `<div class="ft"><span>iQ.IMPACT SNAPSHOT · ${esc(me)}</span><span>${String(pageNo).padStart(2, '0')}</span></div>`;
  const page = (kicker: string, inner: string) => { pageNo++; return `<section class="pg"><div class="k">${String(pageNo).padStart(2, '0')} · ${esc(kicker)}</div>${inner}${foot()}</section>`; };
  const bar = (label: string, frac: number, right: string, mine: boolean, lw = '1.7in', rw = '1.1in') =>
    `<div class="sb" style="grid-template-columns:${lw} 1fr ${rw}"><span${mine ? ' class="me"' : ''}>${esc(label)}</span><div class="trk"><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%;background:${mine ? 'var(--indigo)' : 'var(--grey)'}"></i></div><span class="n">${right}</span></div>`;

  // ── cover ──
  const coverH = !o ? `Where <u>${esc(me)}</u> stands in search and AI answers.`
    : o.constraint === 'ai_citation' ? `You rank for ${esc(o.theme.toLowerCase())}. AI answers <u>recommend someone else</u>.`
    : `${vol(lead!.demand)} searches a month are <u>open</u> in ${esc(o.theme.toLowerCase())}.`;
  const cover = `<section class="pg cover"><svg viewBox="0 0 816 1056" class="orb" aria-hidden="true"><g fill="none" stroke="#6C63FF" stroke-opacity=".35"><circle cx="680" cy="285" r="100"/><circle cx="680" cy="285" r="190"/><circle cx="680" cy="285" r="295"/><circle cx="680" cy="285" r="410"/></g><circle cx="680" cy="285" r="10" fill="#fff"/><circle cx="582" cy="258" r="8" fill="#6C63FF"/><circle cx="794" cy="440" r="12" fill="#6C63FF"/><circle cx="445" cy="460" r="7" fill="#6C63FF"/><circle cx="374" cy="148" r="6" fill="#eda100"/></svg>
  <div class="inner"><div class="k">iQ.IMPACT · OPPORTUNITY SNAPSHOT</div><div style="flex:1"></div><h1>${coverH}</h1>
  <p class="csub">A first read on where ${esc(me)} can win in search and AI answers, measured against ${esc(comps.map(short).join(', ').replace(/, ([^,]*)$/, ' and $1'))}.</p>
  <div class="ft"><span>PREPARED BY iQUANTI · ${esc(month)}</span><span>CONFIDENTIAL</span></div></div></section>`;

  // ── 01 the opening ──
  let p1 = '';
  if (o && lead) {
    const leaderS = lead.rivals.find(x => x.domain === o.leader) ?? null;
    const h = o.constraint === 'content' ? `${esc(cap(o.theme))} is your most winnable gap, and it's a <u>content</u> problem, not an authority one.`
      : o.constraint === 'authority' ? `${esc(cap(o.theme))} is your largest open gap, and <u>authority</u> is what stands in the way.`
      : `You're on page one for ${esc(o.theme.toLowerCase())}, yet AI answers name <u>${esc(short(o.leader ?? 'a competitor'))}</u> instead.`;
    const bars = [{ d: me, s: lead.share, n: lead.prospectP1, mine: true }, ...lead.rivals.map(x => ({ d: x.domain, s: x.p1Share, n: x.p1Keywords, mine: false }))]
      .sort((a, b) => b.s - a.s).map(b => `<div class="hb"><span>${esc(short(b.d))}${b.mine ? ' (you)' : ''}</span><div class="ht"><i style="width:${(b.s * 100).toFixed(1)}%;background:${b.mine ? '#fff' : '#6C63FF'}"></i></div><b>${pct(b.s)}</b></div>`).join('');
    const c = o.checks;
    const aRead = r.ai?.reads.find(x => x.theme === o.theme) ?? null;
    const authCard = `<div class="evb"><div class="t">Authority</div><div class="n" style="color:${c.authority.pass ? 'var(--ink)' : 'var(--crit)'}">${c.authority.them === null ? '—' : n0(c.authority.you)} <span>vs ${c.authority.them === null ? '—' : n0(c.authority.them)}</span></div>
      <div class="mini"><i style="width:${Math.min(100, c.authority.you)}%;background:var(--indigo)"></i></div><div class="mini"><i style="width:${Math.min(100, c.authority.them ?? 0)}%;background:var(--grey)"></i></div>
      <p>${c.authority.them === null ? 'Semrush returned no authority score for one of the two domains.' : c.authority.pass ? `Your Semrush Authority Score is within ${AUTHORITY_TOLERANCE} points of ${esc(short(o.leader ?? ''))}, or ahead. Authority isn't what's holding you back here.` : `${esc(short(o.leader ?? ''))} carries more authority. Closing this gap takes links and coverage as well as pages.`}</p></div>`;
    const pagesCard = `<div class="evb"><div class="t">Pages on the theme</div><div class="n" style="color:${c.pages.pass ? 'var(--crit)' : 'var(--ink)'}">${n0(c.pages.you)} <span>vs ${n0(c.pages.them ?? 0)}</span></div>
      <div class="mini"><i style="width:${c.pages.them ? Math.min(100, (c.pages.you / Math.max(c.pages.you, c.pages.them)) * 100) : 0}%;background:${c.pages.pass ? 'var(--crit)' : 'var(--indigo)'}"></i></div><div class="mini"><i style="width:${c.pages.them ? Math.min(100, (c.pages.them / Math.max(c.pages.you, c.pages.them)) * 100) : 0}%;background:var(--grey)"></i></div>
      <p>${esc(short(o.leader ?? ''))} has ${n0(c.pages.them ?? 0)} distinct pages on page one for this theme. You have ${n0(c.pages.you)} ranking anywhere in the top 20.</p></div>`;
    const nearCard = `<div class="evb"><div class="t">Already close</div><div class="n" style="color:${c.nearWins.pass ? 'var(--good)' : 'var(--ink)'}">${n0(c.nearWins.you)}</div>
      <div class="mini"><i style="width:${lead.count ? Math.min(100, (c.nearWins.you / lead.count) * 100) : 0}%;background:var(--good)"></i></div>
      <p>${c.nearWins.you === 1 ? 'search sits' : 'searches sit'} at positions 11–20${lead.nearWinVolume ? `, worth ${vol(lead.nearWinVolume)} searches a month` : ''}. ${c.nearWins.pass ? 'One page away from the clicks.' : `Fewer than ${NEAR_WIN_MIN}, so there is little to build from.`}</p></div>`;
    const verdict = o.constraint === 'content' ? `The demand is there, your domain is strong enough, and the pages aren't.`
      : o.constraint === 'authority' ? `The demand is there, but ${esc(short(o.leader ?? ''))} carries more authority. Pages alone won't close this one.`
      : `Google already trusts you here. The AI engines are drawing on other sources.`;
    const aiLine = aRead ? `Across ${n0(aRead.answers)} recorded AI answers on this theme, you were named in ${n0(aRead.named[me] ?? 0)}${o.leader ? ` and ${esc(short(o.leader))} in ${n0(aRead.named[o.leader] ?? 0)}` : ''}.` : '';
    p1 = page('THE OPENING', `<h3>${h}</h3>
      <div class="hero"><div><div class="k" style="color:#a5a0ff">MONTHLY SEARCHES IN THIS THEME</div><div class="big">${vol(lead.demand)} <small>/mo</small></div>
        <p>Across ${n0(lead.count)} ${esc(floorNote)}. You're on page one for <b>${lead.prospectP1 === 0 ? 'none' : n0(lead.prospectP1)}</b> of them${leaderS ? `; ${esc(short(leaderS.domain))} is on page one for <b>${n0(leaderS.p1Keywords)}</b>` : ''}.</p></div>
        <div><div class="k" style="color:#fff;margin-bottom:8px">SHARE OF THESE SEARCHES ON PAGE ONE</div>${bars}</div></div>
      <div class="fig">${o.constraint === 'ai_citation' ? 'What the search data says' : 'Why this one is winnable'} <span>three measured checks</span></div>
      <div class="ev">${authCard}${pagesCard}${nearCard}</div>
      <div class="verdict"><span class="st">BINDING CONSTRAINT · ${o.constraint === 'ai_citation' ? 'AI CITATION' : o.constraint.toUpperCase()}</span><div><b>${verdict}</b>${aiLine ? `<br><span>${aiLine}${r.ai ? ` See page ${String(pageNo + 4).padStart(2, '0')}.` : ''}</span>` : ''}</div></div>
      <div class="basis">Rankings, volumes, ranking URLs and Authority Score: Semrush, ${esc(r.marketLabel)} database, ${esc(dateStr)}. "Open" = you are on page one for under ${pct(OPEN_BELOW_SHARE)} of the theme's searches. Shares overlap: several sites can be on page one for the same search.</div>`);
  }
  // fix the forward reference to the AI page (its number depends on which pages exist)
  const aiPageNo = (o && lead ? 1 : 0) + 3;
  p1 = p1.replace(/ See page \d\d\./, r.ai ? ` See page ${String(aiPageNo).padStart(2, '0')}.` : '');

  // ── 02 the field ──
  const F = r.field; const mine = F.find(f => f.isProspect)!;
  const weaker = F.filter(f => !f.isProspect && f.authority !== null && mine.authority !== null && f.authority < mine.authority && f.p1Keywords > mine.p1Keywords)
    .sort((a, b) => b.p1Keywords - a.p1Keywords)[0] ?? null;
  const fieldH = weaker ? (mine.p1Keywords > 0
      ? `A competitor with <u>less authority</u> holds ${(weaker.p1Keywords / mine.p1Keywords).toFixed(1).replace(/\.0$/, '')}× your page-one ground.`
      : `A competitor with <u>less authority</u> holds ${n0(weaker.p1Keywords)} page-one searches to your none.`)
    : `Where you stand against <u>the field</u>.`;
  const fieldLede = weaker ? `If authority decided everything, the dots would climb left to right. They don't: ${esc(short(weaker.domain))} sits above you with a weaker domain, which points at content depth rather than links.`
    : `Each dot is a site: how much authority its domain carries, and how many of the measured searches it holds on page one.`;
  const auth = F.map(f => f.authority).filter((x): x is number => x !== null);
  const aMin = Math.max(0, Math.floor((Math.min(...(auth.length ? auth : [0])) - 8) / 10) * 10), aMax = Math.min(100, Math.ceil((Math.max(...(auth.length ? auth : [100])) + 8) / 10) * 10);
  const yMaxRaw = Math.max(1, ...F.map(f => f.p1Keywords)); const yMax = Math.ceil(yMaxRaw * 1.2 / 10) * 10;
  const tMax = Math.max(1, ...F.map(f => f.traffic));
  const X = (a: number) => 56 + ((a - aMin) / Math.max(1, aMax - aMin)) * 620, Y = (v: number) => 310 - (v / yMax) * 270;
  // v7.515 — with up to four competitors (five dots) bubbles can cluster, so labels are laid out after the dots: each label keeps its
  // dot's side, and a label that would overlap one already placed (same side, within ~190px across) moves
  // down in 24px steps, with a thin leader line back to its dot. Positions only; no figure changes.
  const placed: Array<{ x0: number; x1: number; y: number }> = [];
  const dotRows = F.filter(f => f.authority !== null).sort((a, b) => b.traffic - a.traffic).map(f => {
    const cx = X(f.authority as number), cy = Y(f.p1Keywords), rad = 9 + Math.sqrt(f.traffic / tMax) * 24;
    const right = cx < 520; const lx = right ? cx + rad + 6 : cx - rad - 6; const anchor = right ? 'start' : 'end';
    return { f, cx, cy, rad, lx, anchor, ly: cy - 2 };
  });
  for (const d of [...dotRows].sort((a, b) => Number(b.f.isProspect) - Number(a.f.isProspect) || a.ly - b.ly)) {
    const name = d.f.isProspect ? 'You' : short(d.f.domain);
    const w = Math.max(name.length * 6.6, 90);                       // 11px bold label / 9px subline, generous
    const x0 = d.anchor === 'start' ? d.lx : d.lx - w, x1 = x0 + w;
    const you = dotRows.find(r => r.f.isProspect);   // never write a competitor's label over your own dot
    const overYou = (y: number) => !!you && !d.f.isProspect && you.cx - you.rad < x1 && x0 < you.cx + you.rad && y - 11 < you.cy + you.rad && you.cy - you.rad < y + 14;
    const free = (y: number) => y >= 14 && y <= 300 && !overYou(y) && !placed.some(q => q.x0 < x1 && x0 < q.x1 && Math.abs(q.y - y) < 25);
    let y = d.ly;
    for (let k = 1; k <= 12 && !free(y); k++) { const dn = d.ly + 25 * k, up = d.ly - 25 * k; y = free(dn) ? dn : free(up) ? up : d.ly; if (y !== d.ly) break; }
    d.ly = y; placed.push({ x0, x1, y });
  }
  const dots = dotRows.map(({ f, cx, cy, rad }) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${f.isProspect ? '#4338CA' : '#c9c8c1'}" fill-opacity="${f.isProspect ? 1 : .8}"/>`).join('')
    + dotRows.map(({ f, cx, cy, rad, lx, ly, anchor }) => {
      const moved = Math.abs(ly - (cy - 2)) > 6;
      const lead = moved ? `<line x1="${(anchor === 'start' ? cx + rad * .7 : cx - rad * .7).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(anchor === 'start' ? lx - 2 : lx + 2).toFixed(1)}" y2="${(ly - 4).toFixed(1)}" stroke="#898781" stroke-width=".6"/>` : '';
      return `${lead}<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="11" font-weight="800" fill="${f.isProspect ? '#4338CA' : '#0b0b14'}">${esc(f.isProspect ? 'You' : short(f.domain))}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="${f.isProspect ? '#4338CA' : '#52514e'}">${n0(f.p1Keywords)} on page one · AS ${n0(f.authority as number)}</text>`;
    }).join('');
  const grid = [0, .25, .5, .75, 1].map(g => `<line x1="56" y1="${Y(yMax * g)}" x2="676" y2="${Y(yMax * g)}" stroke="${g === 0 ? '#0b0b14' : '#e1e0d9'}"/><text x="50" y="${Y(yMax * g) + 3}" text-anchor="end" font-size="8.5" fill="#898781">${n0(yMax * g)}</text>`).join('');
  const xt = [0, .25, .5, .75, 1].map(g => `<text x="${X(aMin + (aMax - aMin) * g)}" y="326" text-anchor="middle" font-size="8.5" fill="#898781">${n0(aMin + (aMax - aMin) * g)}</text>`).join('');
  const vMax = Math.max(1, ...F.map(f => f.p1Volume));
  const volBars = [...F].sort((a, b) => b.p1Volume - a.p1Volume).map(f => bar(f.isProspect ? `${short(f.domain)} (you)` : short(f.domain), f.p1Volume / vMax, `${vol(f.p1Volume)}/mo`, f.isProspect)).join('');
  const noAuth = F.filter(f => f.authority === null).map(f => short(f.domain));
  const p2 = page('THE FIELD', `<h3>${fieldH}</h3><p class="lede">${fieldLede}</p>
    <div class="fig">Authority vs page-one searches <span>bubble size = Semrush estimated monthly organic visits</span></div>
    <svg viewBox="0 0 708 344" width="100%">${grid}${xt}<text x="366" y="341" text-anchor="middle" font-size="8.5" font-weight="700" fill="#898781" letter-spacing="1">SEMRUSH AUTHORITY SCORE →</text>${dots}</svg>
    ${noAuth.length ? `<div class="basis">Not plotted — Semrush returned no Authority Score: ${esc(noAuth.join(', '))}.</div>` : ''}
    <div class="fig">Monthly searches where each site is on page one <span>${n0(r.counts.themed)} searches measured</span></div>${volBars}
    <div class="call"><b>You're on page one for ${n0(mine.p1Keywords)} of the ${n0(r.counts.themed)} searches measured.</b> ${(() => { const top = [...F].filter(f => !f.isProspect).sort((a, b) => b.p1Keywords - a.p1Keywords)[0]; return top ? `${esc(short(top.domain))} is on page one for ${n0(top.p1Keywords)}.` : ''; })()}</div>
    <div class="basis">Measured set: ${esc(floorNote)} where ${esc(me)} ranks in the top 20 or a selected competitor ranks on page one, grouped into the themes on the next page. Semrush, ${esc(r.marketLabel)}, ${esc(dateStr)}. Visits are a Semrush estimate.</div>`);

  // ── 03 demand map ──
  const shown = r.themes.slice(0, 9);
  const boxes = treemap(shown.map(t => t.demand), 708, 400);
  const tm = boxes.map(b => {
    const t = shown[b.i]; const st = STATE[t.state]; const isLead = !!o && t.name === o.theme; const big = b.w > 190 && b.h > 110; const small = b.w < 190 || b.h < 70;
    const fs0 = big ? 17 : small ? 9.5 : 12.5; const words = t.name;
    // Shrink the label to the block's width (≈0.56em per character) instead of letting it clip.
    const fs = Math.max(7.5, Math.min(fs0, (b.w - 26) / (Math.max(6, words.length) * 0.56)));
    return `<g><rect x="${(b.x + 2).toFixed(1)}" y="${(b.y + 2).toFixed(1)}" width="${Math.max(0, b.w - 4).toFixed(1)}" height="${Math.max(0, b.h - 4).toFixed(1)}" rx="5" fill="${st.fill}"/>
      ${isLead ? `<rect x="${(b.x + 5).toFixed(1)}" y="${(b.y + 5).toFixed(1)}" width="${Math.max(0, b.w - 10).toFixed(1)}" height="${Math.max(0, b.h - 10).toFixed(1)}" rx="4" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="5 4"/>` : ''}
      <svg x="${(b.x + 2).toFixed(1)}" y="${(b.y + 2).toFixed(1)}" width="${Math.max(0, b.w - 4).toFixed(1)}" height="${Math.max(0, b.h - 4).toFixed(1)}"><g fill="${st.ink}">
      ${isLead && !small ? `<text x="11" y="19" font-size="8" font-weight="800" letter-spacing="1.2">THE OPENING</text>` : ''}
      <text x="11" y="${isLead && !small ? 38 : small ? 15 : 22}" font-size="${fs}" font-weight="700" font-family="Fraunces,Georgia,serif">${esc(words)}</text>
      ${small ? `<text x="11" y="29" font-size="10.5" font-weight="800">${vol(t.demand)} · ${pct(t.share)}</text>`
        : `<text x="11" y="${(isLead ? 38 : 22) + (big ? 40 : 26)}" font-size="${big ? 36 : 21}" font-weight="800" letter-spacing="-1">${vol(t.demand)}</text><text x="11" y="${(isLead ? 38 : 22) + (big ? 58 : 41)}" font-size="9.5">${n0(t.count)} searches · you're on page one for ${pct(t.share)}</text>`}
      </g></svg></g>`;
  }).join('');
  const openThemes = r.themes.filter(t => t.state === 'open');
  const capFrac = r.totals.demand ? r.totals.prospectP1Volume / r.totals.demand : 0;
  const p3 = page('THE DEMAND MAP', `<h3>Where your category's searches go, and <u>who catches them</u>.</h3><p class="lede">Each block is a theme, sized by monthly searches. Colour shows how much of page one you hold.</p>
    <svg viewBox="0 0 708 400" width="100%">${tm}</svg>
    <div class="lg"><span><i style="background:#2a78d6"></i>Held — you're on page one for ${pct(HELD_FROM_SHARE)}+ of the theme's searches</span><span><i style="background:#eda100"></i>Contested — ${pct(OPEN_BELOW_SHARE)}–${pct(HELD_FROM_SHARE)}</span><span><i style="background:#d03b3b"></i>Open to you — under ${pct(OPEN_BELOW_SHARE)}</span></div>
    <div class="fig">Demand you're on page one for vs demand you miss <span>monthly searches</span></div>
    <div class="capbar"><i style="width:${(capFrac * 100).toFixed(1)}%"></i></div>
    <div class="caprow"><span><b style="color:#2a78d6">${vol(r.totals.prospectP1Volume)}</b> where you're on page one today</span><span><b style="color:var(--crit)">${vol(Math.max(0, r.totals.demand - r.totals.prospectP1Volume))}</b> where you aren't</span></div>
    <div class="call"><b>${n0(openThemes.length)} of ${n0(r.themes.length)} themes ${openThemes.length === 1 ? 'is' : 'are'} open.</b> ${o && lead && o.constraint !== 'ai_citation' ? `${esc(cap(o.theme))} leads this report because it is the largest open theme above ${vol(DEMAND_FLOOR_MONTHLY)} searches a month that passed at least two of the three checks on page 01.` : openThemes.length ? `None of them cleared the bar to lead this report: at least ${vol(DEMAND_FLOOR_MONTHLY)} searches a month and two of three winnability checks.` : `You already hold or contest every theme measured.`}</div>
    <div class="basis">Themes ${r.input.scope === 'products' ? 'are the products named for this run' : 'were grouped by Claude from the keyword list'}; every count and volume is summed from Semrush rows. ${n0(r.counts.universe)} searches were read, ${n0(r.counts.themed)} are charted${r.counts.notGrouped ? ` (${n0(r.counts.notGrouped)} were set aside as navigational or off-topic, or sat in themes too small to chart)` : ''}.${r.productTerms ? ` Product filter terms: ${esc(Object.entries(r.productTerms).map(([p, ts]) => `${p} → ${ts.join(', ')}`).join('; '))}.` : ''}</div>`);

  // ── 04 search meets AI ──
  let p4 = '';
  if (r.ai && r.ai.reads.length) {
    const q = (k: string) => r.ai!.quadrants.filter(x => x.quadrant === k).map(x => `<span${o && x.theme === o.theme ? ' class="lead"' : ''}>${esc(x.theme)}</span>`).join('') || '<em>none</em>';
    const both = r.ai.quadrants.filter(x => x.quadrant === 'neither').length;
    const h4 = both > 0 ? `${both === 1 ? 'The theme' : 'The themes'} you miss in Google ${both === 1 ? 'is' : 'are'} the same ${both === 1 ? 'one' : 'ones'} <u>AI leaves you out of</u>.` : `Who AI names when buyers ask about <u>your category</u>.`;
    const doms = [me, ...comps];
    const cell = (x: number) => { const bg = x >= .5 ? '#4338CA' : x >= AI_NAMED_FROM ? '#8f89f0' : x > 0 ? '#d9d6f7' : '#f1f0ec'; return `style="background:${bg};color:${x >= AI_NAMED_FROM ? '#fff' : x > 0 ? '#1f1a78' : '#b5b3aa'}"`; };
    const heat = `<table class="heat"><tr><th style="text-align:left">Theme</th><th>Answers read</th>${doms.map((d, i) => `<th>${esc(i === 0 ? 'You' : short(d))}</th>`).join('')}</tr>${r.ai.reads.map(a => `<tr><td>${esc(a.theme)}</td><td class="c" style="background:none;color:var(--ink2)">${n0(a.answers)}</td>${doms.map((d, i) => { const x = a.answers ? (a.named[d] ?? 0) / a.answers : 0; return `<td class="c${i === 0 ? ' mine' : ''}" ${cell(x)}>${pct(x)}</td>`; }).join('')}</tr>`).join('')}</table>`;
    const leadRead = (o && r.ai.reads.find(x => x.theme === o.theme)) || r.ai.reads[0];
    const sMax = Math.max(1, ...leadRead.topSources.map(s => s.count));
    const srcBars = leadRead.topSources.slice(0, 6).map(s => bar(s.domain, s.count / sMax, `${n0(s.count)} answers`, s.domain === me, '2.2in', '.9in')).join('');
    const totalAns = r.ai.reads.reduce((s, a) => s + a.answers, 0);
    p4 = page('SEARCH MEETS AI', `<h3>${h4}</h3><p class="lede">We read ${n0(totalAns)} recorded answers from ChatGPT and Google AI Overviews to buyer questions about your top themes, and logged every time one of these sites was named or cited.</p>
      <div class="quad"><span></span><span class="ax">AI NAMES YOU</span><span class="ax">AI DOESN'T</span>
        <span class="ax ay">ON PAGE ONE</span><div class="q a"><div class="qt">VISIBLE IN BOTH</div>${q('both')}</div><div class="q b"><div class="qt">GOOGLE YES, AI NO</div>${q('google_only')}<p>You rank, but AI draws on other sources. A citation problem.</p></div>
        <span class="ax ay">NOT ON PAGE ONE</span><div class="q c"><div class="qt">AI YES, GOOGLE NO</div>${q('ai_only')}<p>The brand is known. The pages aren't ranking.</p></div><div class="q d"><div class="qt">INVISIBLE IN BOTH</div>${q('neither')}<p>No pages to rank, nothing for AI to cite.</p></div></div>
      <div class="fig">Share of recorded answers naming each site <span>named in the answer text, or cited as a source</span></div>${heat}
      ${srcBars ? `<div class="fig">Sources AI cited most · ${esc(leadRead.theme)} <span>answers citing the domain</span></div>${srcBars}` : ''}
      <div class="call"><b>Directional, not a score.</b> These are answers DataForSEO has recorded for questions containing each theme, up to 50 per engine. AI output changes from day to day; a full assessment tracks a fixed prompt set over time.</div>
      <div class="basis">Source: DataForSEO LLM Mentions index (ChatGPT and Google AI Overviews), read ${esc(dateStr)}. "AI names you" = named or cited in at least ${pct(AI_NAMED_FROM)} of the answers read. "On page one" = the theme is held or contested on page 03.</div>`);
  }

  // ── 05 inside the opening ──
  let p5 = '';
  if (o && lead && r.detail) {
    const d = r.detail; const kMax = Math.max(1, ...d.topKeywords.map(k => k.volume));
    // Row counts are fixed so the page cannot overflow one Letter sheet (stress-checked in the retained suite).
    const kwRow = (k: KeywordLite) => `<tr><td>${esc(k.keyword)}</td><td><i class="vb" style="width:${Math.max(3, (k.volume / kMax) * 120).toFixed(0)}px"></i>${n0(k.volume)}</td><td>${k.best ? esc(short(k.best.domain)) : '—'}</td><td class="n">${k.best ? '#' + k.best.position : '—'}</td><td class="n"${k.you && k.you <= 20 ? ' style="color:var(--good);font-weight:700"' : ''}>${k.you ? '#' + k.you : 'not in top 20'}</td></tr>`;
    const pMax = Math.max(1, ...d.pagesByDomain.map(p => p.pages));
    const pgBars = [...d.pagesByDomain].sort((a, b) => b.pages - a.pages).map(p => bar(p.isProspect ? `${short(p.domain)} (you)` : short(p.domain), p.pages / pMax, n0(p.pages), p.isProspect, '1.5in', '.4in')).join('');
    const lp = d.leaderPages.slice(0, 4).map(p => `<tr><td class="url">${esc(path(p.url))}</td><td class="n">${n0(p.keywords)}</td><td class="n">${vol(p.volume)}</td></tr>`).join('');
    p5 = page('INSIDE THE OPENING', `<h3>What winning ${esc(o.theme.toLowerCase())} <u>actually takes</u>.</h3><p class="lede">The searches, the pages that win them today, and the questions buyers ask.</p>
      <div class="fig">Largest searches in the theme</div>
      <table class="d"><tr><th>Search</th><th>Searches / mo</th><th>Best-ranked competitor</th><th class="n">Their rank</th><th class="n">You</th></tr>${d.topKeywords.slice(0, 8).map(kwRow).join('')}</table>
      <div class="fig">Pages ranking for the theme <span>distinct URLs — competitors on page one, you anywhere in the top 20</span></div>
      <div class="two"><div>${pgBars}</div>${lp ? `<table class="d"><tr><th>${esc(short(o.leader ?? ''))} · pages winning the most</th><th class="n">Searches</th><th class="n">Volume</th></tr>${lp}</table>` : '<div></div>'}</div>
      ${d.questions.length ? `<div class="fig">What buyers ask <span>Semrush question searches related to "${esc(d.questionSeed ?? '')}"</span></div><div class="qs">${d.questions.slice(0, 6).map(x => `<span>"${esc(x.question)}"<em>${vol(x.volume)}</em></span>`).join('')}</div>
      <div class="call"><b>These questions are what AI engines answer.</b> The sites cited in those answers tend to be the ones with a page that addresses the question directly.</div>` : ''}
      <div class="basis">Semrush, ${esc(r.marketLabel)} database, ${esc(dateStr)}. Ranks are organic positions; "not in top 20" means Semrush shows no ranking for ${esc(me)} in positions 1–20.</div>`);
  }

  // ── 06 from here ──
  const theme = o ? o.theme.toLowerCase() : null;
  const asks = (o?.constraint === 'authority') ? [
    [`Is ${theme} a growth priority this year, or is the quiet there deliberate?`, `Some gaps are a choice. That changes everything about what comes next.`],
    [`What's being done today to earn coverage and links from other sites?`, `Authority is built outside your own website, and it tends to sit with a different team than content does.`],
    [`Is anyone watching how AI assistants describe you yet?`, `Most teams we talk to are just starting. We can share what we're seeing across the industry.`]]
  : (o?.constraint === 'ai_citation') ? [
    [`Is ${theme} where you most need to be the recommended name?`, `AI answers are becoming the first shortlist. It helps to know which shortlist matters most.`],
    [`Which outside sites shape how buyers hear about you?`, `AI engines lean on a small set of sources. Knowing which ones you already have a relationship with is a head start.`],
    [`Is anyone watching how AI assistants describe you yet?`, `Most teams we talk to are just starting. We can share what we're seeing across the industry.`]]
  : [
    [theme ? `Is ${theme} a growth priority this year, or is the quiet there deliberate?` : `Which product lines matter most to growth this year?`, theme ? `Some gaps are a choice. That changes everything about what comes next.` : `The data shows where the searches are. Only you know which of them matter.`],
    [`How does product content get written and approved today?`, r.input.regulated ? `In regulated categories the review cycle often decides the pace more than the strategy does.` : `How fast a team can publish usually decides how fast a gap like this closes.`],
    [`Is anyone watching how AI assistants describe you yet?`, `Most teams we talk to are just starting. We can share what we're seeing across the industry.`]];
  const p6 = page('FROM HERE', `<h3>This is the view from the outside. <u>You know the rest.</u></h3><p class="lede">Public data shows where the searches go. It can't show what you're already working on, what you've tried, or what the business needs this year.</p>
    <div class="two" style="grid-template-columns:1fr 1.05fr;gap:18px"><div class="letter"><p>We put this together because ${theme ? `${esc(theme)} stood out` : `a few things stood out`} when we looked at your category, and we thought you'd want to see it whether or not we ever work together.</p><p>You may already be on it. If so, we'd like to hear how it's going. If it's new, we're happy to walk through what's behind the numbers and answer questions. Either way the report is yours to keep.</p>
      <div class="sig"><span class="av">iQ</span><div><b>The iQuanti team</b><span>Search &amp; AI visibility</span></div></div></div>
      <div><div class="fig" style="margin-top:0">What we'd be curious about</div>${asks.map((a, i) => `<div class="ask" data-n="${i + 1}"><b>${esc(a[0])}</b><span>${esc(a[1])}</span></div>`).join('')}</div></div>
    <div class="soft"><b>Let's set up a 30-minute call to talk it through.</b><span>We'll go over what this report found, and you can tell us where things stand and what you're working on. Just reply to whoever sent you this report and we'll find a time that works.</span></div>
    <p class="method"><b>Sources &amp; method.</b> Rankings, search volumes, Authority Score, ranking URLs, question searches and traffic estimates: Semrush, ${esc(r.marketLabel)} database, ${esc(dateStr)}; traffic is a Semrush estimate and is labelled where shown. AI answers: DataForSEO's recorded ChatGPT and Google AI Overview answers, read the same day. This snapshot reads each competitor's highest-volume page-one searches${r.floorVolume > 0 ? `, so every figure covers searches above ${n0(r.floorVolume)} a month and is exact within that set` : ''}; branded searches are excluded. ${r.input.scope === 'products' ? 'Searches were assigned to the named products' : 'Themes were grouped'} by Claude from the keyword list — it sorts, it does not supply numbers. Every sentence in this report is filled from the measured figures; none of it is written by an AI.${r.notes.length ? ' ' + esc(r.notes.join(' ')) : ''}</p>`);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>iQ.Impact Snapshot — ${esc(me)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${cover}${p1}${p2}${p3}${p4}${p5}${p6}</body></html>`;
}

const CSS = `
:root{--ink:#0b0b14;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--indigo:#4338CA;--violet:#6C63FF;--good:#0ca30c;--crit:#d03b3b;--grey:#c9c8c1;--paper:#F7F5EF}
@page{size:Letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px;line-height:1.45}
svg text{font-family:Inter,system-ui,sans-serif}
.pg{width:8.5in;height:11in;padding:46px 54px 32px;position:relative;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;background:#fff}
.ft{margin-top:auto;padding-top:10px;border-top:1px solid var(--grid);display:flex;justify-content:space-between;font-size:8.5px;color:var(--muted);letter-spacing:.08em}
.k{font-size:9px;font-weight:800;letter-spacing:.16em;color:var(--indigo)}
h3{font:600 30px/1.12 Fraunces,Georgia,serif;letter-spacing:-.02em;margin:9px 0 9px;max-width:6.6in}h3 u,h1 u{text-decoration:none;color:var(--indigo)}
.lede{color:var(--ink2);font-size:12.5px;margin:0 0 14px;max-width:6.2in}
.fig{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);margin:16px 0 7px;display:flex;justify-content:space-between;gap:12px}.fig span{font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted);text-align:right}
.call{background:var(--paper);border-radius:8px;padding:12px 15px;font-size:12px;margin-top:14px;border-left:3px solid var(--indigo)}.call b{font-family:Fraunces,Georgia,serif;font-size:13.5px}
.basis{font-size:8px;color:var(--muted);margin-top:7px;line-height:1.45}
.cover{background:var(--ink);color:#fff;padding:0}.cover .orb{position:absolute;inset:0;width:100%;height:100%}.cover .inner{padding:60px 58px 36px;display:flex;flex-direction:column;height:100%;position:relative}
.cover .k{color:#a5a0ff}.cover h1{font:600 48px/1.05 Fraunces,Georgia,serif;letter-spacing:-.02em;max-width:5.9in;margin:0}.cover h1 u{color:#a5a0ff}.csub{color:#c9c8e6;max-width:5.2in;font-size:14.5px;margin:16px 0 46px}.cover .ft{border-color:#2a2a3d;color:#8888aa}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;align-items:center;background:var(--ink);color:#fff;border-radius:12px;padding:22px 26px;margin:6px 0 4px}
.hero .big{font:800 84px/0.92 Inter,system-ui,sans-serif;letter-spacing:-.045em;margin-top:6px}.hero .big small{font-size:24px;font-weight:600;color:#a5a0ff;letter-spacing:0}
.hero p{margin:10px 0 0;font-size:12px;color:#c9c8e6}.hero p b{color:#fff}
.hb{display:grid;grid-template-columns:1.25in 1fr .45in;gap:8px;align-items:center;font-size:10.5px;color:#c9c8e6;margin:6px 0}.hb b{color:#fff;text-align:right}.ht{height:9px;background:#26263a;border-radius:5px}.ht i{display:block;height:100%;border-radius:5px;min-width:2px}
.ev{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.evb{border:1px solid var(--grid);border-radius:10px;padding:13px}.evb .n{font:800 32px/1 Inter,system-ui,sans-serif;letter-spacing:-.035em}.evb .n span{font-size:14px;color:var(--muted);letter-spacing:0;font-weight:700}
.evb .t{font-size:8.5px;font-weight:800;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:7px}.evb p{margin:8px 0 0;font-size:10.5px;color:var(--ink2)}
.mini{height:7px;border-radius:4px;background:#f1f0ec;margin-top:6px;position:relative}.mini i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;min-width:2px}
.verdict{display:flex;gap:16px;align-items:center;border:1.5px solid var(--indigo);border-radius:10px;padding:14px 18px;margin-top:14px}.verdict .st{background:var(--indigo);color:#fff;font-size:9px;font-weight:800;letter-spacing:.12em;padding:7px 11px;border-radius:5px;white-space:nowrap}.verdict b{font:600 14.5px Fraunces,Georgia,serif}.verdict span{color:var(--ink2);font-size:11px}
.lg{display:flex;gap:16px;font-size:9px;color:var(--ink2);margin-top:8px;flex-wrap:wrap}.lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.sb{display:grid;gap:9px;align-items:center;margin:6px 0;font-size:10.5px}.sb .me{font-weight:800;color:var(--indigo)}.sb .n{text-align:right;color:var(--ink2);font-variant-numeric:tabular-nums}.trk{height:12px;background:#f1f0ec;border-radius:4px}.trk i{display:block;height:100%;border-radius:4px;min-width:2px}
.capbar{height:28px;border-radius:5px;background:#f0d9d6;overflow:hidden}.capbar i{display:block;height:100%;background:#2a78d6;min-width:2px}.caprow{display:flex;justify-content:space-between;font-size:11px;margin-top:5px}.caprow b{font-size:19px;font-weight:800;letter-spacing:-.03em}
.quad{display:grid;grid-template-columns:22px 1fr 1fr;grid-template-rows:auto 1fr 1fr;gap:7px;min-height:236px}.quad .ax{font-size:8.5px;font-weight:800;letter-spacing:.1em;color:var(--muted);text-align:center;align-self:center}.quad .ay{writing-mode:vertical-rl;transform:rotate(180deg)}
.q{border-radius:8px;padding:10px 11px;border:1px solid var(--grid)}.q .qt{font-size:8.5px;font-weight:800;letter-spacing:.09em;margin-bottom:7px}.q span{display:inline-block;font-size:10px;background:#fff;border:1px solid var(--grid);border-radius:4px;padding:2px 7px;margin:0 4px 4px 0}.q em{font-size:9.5px;color:var(--muted)}.q p{margin:3px 0 0;font-size:9px;color:var(--ink2)}
.q.a{background:#eefaee}.q.a .qt{color:var(--good)}.q.b{background:#eef0fd}.q.b .qt{color:var(--indigo)}.q.c{background:#fdf8ec}.q.c .qt{color:#8a5a00}.q.d{background:#fdf0ef}.q.d .qt{color:var(--crit)}.q span.lead{border:1.5px solid var(--crit);font-weight:700}
table.heat{width:100%;border-collapse:separate;border-spacing:3px;font-size:10.5px}table.heat th{font-size:8px;letter-spacing:.06em;color:var(--muted);font-weight:700;text-transform:uppercase;padding:2px}table.heat td.c{width:82px;height:21px;border-radius:3px;text-align:center;font-weight:700;font-size:10px}table.heat td.mine{outline:1.5px solid var(--indigo)}
table.d{width:100%;border-collapse:collapse;font-size:10.5px}table.d th{font-size:8px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);text-align:left;padding:5px 6px;border-bottom:1.5px solid var(--ink)}table.d td{padding:5.5px 6px;border-bottom:1px solid var(--grid)}table.d .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}table.d td.url{font-size:9.5px;color:var(--ink2);word-break:break-all}
.vb{display:inline-block;height:6px;background:var(--indigo);border-radius:3px;vertical-align:middle;margin-right:7px}
.two{display:grid;grid-template-columns:1fr 1.25fr;gap:16px;align-items:start}
.qs{display:flex;flex-wrap:wrap;gap:6px}.qs span{font:400 11.5px Fraunces,Georgia,serif;font-style:italic;background:var(--paper);border-radius:5px;padding:5px 10px}.qs em{font:700 8.5px Inter,system-ui,sans-serif;color:var(--muted);margin-left:7px;font-style:normal}
.letter{background:var(--paper);border-radius:12px;padding:22px 24px;font:400 13.5px/1.62 Fraunces,Georgia,serif;color:#2b2a30}.letter p{margin:0 0 10px}
.sig{display:flex;gap:11px;align-items:center;margin-top:14px;font-family:Inter,system-ui,sans-serif}.av{width:40px;height:40px;border-radius:50%;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}.sig b{font-size:12.5px;display:block}.sig div span{font-size:10.5px;color:var(--ink2)}
.ask{border-bottom:1px solid var(--grid);padding:11px 0 11px 36px;position:relative}.ask:last-child{border:0}.ask:before{content:attr(data-n);position:absolute;left:0;top:9px;font:800 24px/1 Inter,system-ui,sans-serif;color:#c9c6f2;letter-spacing:-.04em}.ask b{display:block;font:600 14px/1.3 Fraunces,Georgia,serif;margin-bottom:3px}.ask span{font-size:10.5px;color:var(--ink2)}
.soft{border:1.5px solid var(--indigo);border-radius:12px;padding:20px 24px;margin-top:22px}.soft b{display:block;font:600 19px Fraunces,Georgia,serif;margin-bottom:5px}.soft span{font-size:12px;color:var(--ink2)}
.method{font-size:8.5px;color:var(--muted);margin-top:14px;line-height:1.55}
`;
