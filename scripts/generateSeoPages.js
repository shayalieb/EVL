import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.resolve('dist');
const template = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
const pages = [
  {
    path: 'customer-stories',
    title: 'Customer Stories | GigWorks',
    description: 'See how entertainment businesses use GigWorks to coordinate bookings, contractors, payments, and event production.',
    summary: 'Customer stories from entertainment businesses using GigWorks to manage gigs, staffing, contracts, payments, and production.',
  },
  {
    path: 'privacy',
    title: 'Privacy Policy | GigWorks',
    description: 'Learn how GigWorks collects, uses, protects, and retains account and business information.',
    summary: 'The GigWorks Privacy Policy explains how account and business information is collected, used, protected, retained, and deleted.',
  },
  {
    path: 'terms',
    title: 'Terms of Service | GigWorks',
    description: 'Read the terms governing access to and use of the GigWorks entertainment-business platform.',
    summary: 'The GigWorks Terms of Service govern access to and use of the booking, staffing, contract, invoicing, and event-management platform.',
  },
  {
    path: 'cookies',
    title: 'Cookie Policy | GigWorks',
    description: 'Learn how GigWorks uses essential cookies and local browser storage.',
    summary: 'The GigWorks Cookie Policy explains the essential session cookies and local browser storage used by the service.',
  },
];

function replaceAttribute(html, pattern, replacement) {
  return html.replace(pattern, replacement);
}

for (const page of pages) {
  const canonical = `https://www.gigworks.io/${page.path}`;
  let html = template;
  html = replaceAttribute(html, /<title>.*?<\/title>/, `<title>${page.title}</title>`);
  html = replaceAttribute(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${page.description}" />`);
  html = replaceAttribute(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);
  html = replaceAttribute(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`);
  html = replaceAttribute(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${page.title}" />`);
  html = replaceAttribute(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${page.description}" />`);
  html = replaceAttribute(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${page.title}" />`);
  html = replaceAttribute(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${page.description}" />`);
  html = html.replace('<div id="root"></div>', `<div id="root"><main><h1>${page.title.replace(' | GigWorks', '')}</h1><p>${page.summary}</p></main></div>`);

  const directory = path.join(outputRoot, page.path);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
}
