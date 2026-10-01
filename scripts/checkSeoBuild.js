import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { HOME_SEO, SEO_LANDING_PAGES } from '../src/lib/seoPages.js';

const pages = [HOME_SEO, ...SEO_LANDING_PAGES];
const failures = [];

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
