import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HOME_SEO, LEGAL_SEO_PAGES, SEO_LANDING_PAGES, SITE_URL } from '../src/lib/seoPages.js';

const outputRoot = path.resolve('dist');
const template = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
const verification = process.env.GOOGLE_SITE_VERIFICATION || process.env.VITE_GOOGLE_SITE_VERIFICATION || '';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function metadata(html, page) {
  const canonical = `${SITE_URL}${page.path === '/' ? '/' : page.path}`;
  let output = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`);
  if (verification) output = output.replace('</head>', `    <meta name="google-site-verification" content="${escapeHtml(verification)}" />\n  </head>`);
  return output;
}

const styles = `<style>.seo-snapshot{font-family:system-ui,sans-serif;color:#0f172a}.seo-snapshot *{box-sizing:border-box}.seo-hero{background:#312e81;color:#fff;padding:72px 24px;text-align:center}.seo-wrap{max-width:1000px;margin:auto}.seo-hero h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.08;margin:12px auto;max-width:900px}.seo-hero p{font-size:1.2rem;line-height:1.7;max-width:760px;margin:20px auto}.seo-content{padding:56px 24px}.seo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}.seo-card{border:1px solid #e2e8f0;border-radius:16px;padding:22px}.seo-snapshot a{color:#4338ca}.seo-hero a{display:inline-block;background:#fff;color:#4338ca;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px}.seo-snapshot li{margin:12px 0;line-height:1.5}</style>`;

function marketingSnapshot(page) {
  const related = page.related.map((relatedPath) => SEO_LANDING_PAGES.find((candidate) => candidate.path === relatedPath)).filter(Boolean);
  return `${styles}<main class="seo-snapshot"><section class="seo-hero"><div class="seo-wrap"><strong>${escapeHtml(page.eyebrow)}</strong><h1>${escapeHtml(page.headline)}</h1><p>${escapeHtml(page.summary)}</p><a href="/#pricing">View plans and pricing</a></div></section><section class="seo-content"><div class="seo-wrap"><div class="seo-grid"><article class="seo-card"><h2>What you can manage</h2><ul>${page.benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article><article class="seo-card"><h2>A clearer workflow</h2><ol>${page.workflow.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></article></div><h2>Explore more GigWorks workflows</h2><ul>${related.map((item) => `<li><a href="${item.path}">${escapeHtml(item.headline)}</a></li>`).join('')}</ul><p><a href="/">Learn more about GigWorks</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></div></section></main>`;
}

function homeSnapshot() {
  return `${styles}<main class="seo-snapshot"><section class="seo-hero"><div class="seo-wrap"><strong>For bands, DJs, orchestras, and entertainment agencies</strong><h1>${escapeHtml(HOME_SEO.headline)}</h1><p>${escapeHtml(HOME_SEO.summary)}</p><a href="#pricing">View plans and pricing</a></div></section><section class="seo-content"><div class="seo-wrap"><h2>Run the business behind every gig</h2><div class="seo-grid">${['Inquiries and bookings', 'Proposals, contracts, and invoices', 'Contractor scheduling', 'Stage plots and set lists'].map((item) => `<article class="seo-card"><h3>${item}</h3><p>Keep the details connected to the client, venue, roster, and event.</p></article>`).join('')}</div><h2>Built for live entertainment</h2><ul>${SEO_LANDING_PAGES.map((page) => `<li><a href="${page.path}">${escapeHtml(page.headline)}</a></li>`).join('')}</ul></div></section></main>`;
}

async function writePage(page, snapshot) {
  const html = metadata(template, page).replace('<div id="root"></div>', `<div id="root">${snapshot}</div>`);
  const directory = page.path === '/' ? outputRoot : path.join(outputRoot, page.path.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
}

await writePage(HOME_SEO, homeSnapshot());
for (const page of SEO_LANDING_PAGES) await writePage(page, marketingSnapshot(page));
for (const [pagePath, page] of Object.entries(LEGAL_SEO_PAGES)) {
  const heading = page.title.replace(' | GigWorks', '');
  await writePage({ ...page, path: pagePath }, `${styles}<main class="seo-snapshot"><section class="seo-content"><div class="seo-wrap"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(page.description)}</p><p><a href="/">Return to GigWorks</a></p></div></section></main>`);
}
