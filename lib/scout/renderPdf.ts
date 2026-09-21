/**
 * lib/scout/renderPdf.ts — HTML → Letter PDF for the Scout snapshot (v7.513).
 * Same launch recipe as the assessment report (@sparticuz/chromium ^149 +
 * puppeteer-core ^24). Unlike that template, the Scout report loads two webfonts
 * (Fraunces, Inter), so this waits for `document.fonts.ready` — bounded at 6s, and
 * a font that does not arrive falls back to Georgia / system-ui rather than
 * failing the render.
 */
export async function renderScoutPdf(html: string): Promise<Buffer> {
  const chromium  = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    args:           chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless:       true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await Promise.race([
      page.evaluate(() => (document as any).fonts?.ready?.then(() => true)),
      new Promise(res => setTimeout(res, 6000)),
    ]).catch(() => {});
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
