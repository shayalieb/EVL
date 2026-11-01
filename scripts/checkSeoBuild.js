import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { HOME_SEO, SEO_LANDING_PAGES } from '../src/lib/seoPages.js';

const pages = [HOME_SEO, ...SEO_LANDING_PAGES];
const failures = [];
const hosting = JSON.parse(await readFile(path.resolve('vercel.json'), 'utf8'));
const routes = await readFile(path.resolve('src/App.jsx'), 'utf8');
const sitemap = await readFile(path.resolve('public/sitemap.xml'), 'utf8');
const sitemapRoute = await readFile(path.resolve('server/src/routes/landing.js'), 'utf8');
const homeHtml = await readFile(path.resolve('dist/index.html'), 'utf8');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

for (const page of pages) {
  const file = page.path === '/' ? 'dist/index.html' : `dist${page.path}/index.html`;
  const html = await readFile(path.resolve(file), 'utf8');
  const checks = [
    ['title', html.includes(`<title>${page.title.replaceAll('&', '&amp;')}</title>`) || html.includes(`<title>${page.title}</title>`)],
    ['description', html.includes(page.description.replaceAll('&', '&amp;'))],
    ['canonical', html.includes(`href="https://www.gigworks.io${page.path}"`)],
    ['crawlable H1', /<h1[^>]*>[^<]+<\/h1>/.test(html)],
    ['social image', html.includes('og-gigworks.png')],
  ];
  if (page.path !== '/') {
    checks.push(
      ['public React route', routes.includes(`path="${page.path}" element={<SeoLandingPage />}`)],
      ['direct URL rewrite', hosting.rewrites.some((rule) => rule.source === page.path && rule.destination === `${page.path}/index.html`)],
      ['static sitemap entry', sitemap.includes(`<loc>https://www.gigworks.io${page.path}</loc>`)],
      ['production sitemap entry', sitemapRoute.includes(`'https://www.gigworks.io${page.path}'`)],
      ['homepage link', homeHtml.includes(`href="${page.path}"`)],
    );
  }
  for (const detail of page.details || []) checks.push(['workflow content', html.includes(escapeHtml(detail.body))]);
  for (const faq of page.faqs || []) checks.push(['FAQ content', html.includes(escapeHtml(faq.answer))]);
  if (page.screenshot) await access(path.resolve(`dist${page.screenshot.src}`));
  for (const [name, passed] of checks) if (!passed) failures.push(`${page.path}: ${name}`);
}

await access(path.resolve('dist/404.html'));
await access(path.resolve('dist/og-gigworks.png'));
const privateRobots = JSON.parse(await readFile(path.resolve('vercel.json'), 'utf8')).headers.filter((rule) => rule.headers?.some((header) => header.key === 'X-Robots-Tag')).map((rule) => rule.source);
for (const required of ['/bookings', '/events', '/inbox', '/import', '/stage-plot/(.*)', '/run-of-show/(.*)']) {
  if (!privateRobots.includes(required)) failures.push(`missing noindex header: ${required}`);
}

if (failures.length) {
  console.error(`SEO build checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`SEO build checks passed for ${pages.length} indexable pages, social previews, 404 handling, and private-route headers.`);
