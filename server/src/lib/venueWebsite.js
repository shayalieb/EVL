import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const fail = (message) => Object.assign(new Error(message), { status: 400 });
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export function websiteURL(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('Enter a complete HTTPS venue website address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || !url.hostname.includes('.')) throw fail('Use a public HTTPS venue website address.');
  url.hash = '';
  return url;
}
async function readPage(url, signal) {
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((entry) => !publicIPv4(entry.address))) throw fail('This website address is not supported.');
  // Pin the connection to the validated IP to prevent DNS rebinding.
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal, agent: false, lookup: (_host, options, callback) => options?.all ? callback(null, [addresses[0]]) : callback(null, addresses[0].address, 4), headers: { 'User-Agent': 'GigworksVenueImport/1.0', Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' } }, (response) => {
      let size = 0; const chunks = [];
      response.on('data', (chunk) => { size += chunk.length; if (size > 1024 * 1024) response.destroy(fail('The website page is too large to import.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
  });
}
const string = (value) => typeof value === 'string' ? value.trim().slice(0, 500) : '';
export function extractWebsiteVenues(html) {
  const candidates = [];
  function visit(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 20 || candidates.length >= 20) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    const address = node.address;
    if (![].concat(node['@type'] || []).includes('Person') && string(node.name) && address && typeof address === 'object' && !Array.isArray(address) && string(address.streetAddress)) {
      const contact = Array.isArray(node.contactPoint) ? node.contactPoint[0] : node.contactPoint;
      const venue = { name: string(node.name), address1: string(address.streetAddress), city: string(address.addressLocality), state: string(address.addressRegion), zip: string(address.postalCode), contactPhone: string(node.telephone || contact?.telephone), contactEmail: string(node.email || contact?.email).replace(/^mailto:/i, ''), countryCode: string(address.addressCountry?.name || address.addressCountry) };
      venue.formattedAddress = [venue.address1, venue.city, venue.state, venue.zip, venue.countryCode].filter(Boolean).join(', ');
      if (!candidates.some((item) => item.name === venue.name && item.formattedAddress === venue.formattedAddress)) candidates.push(venue);
    }
    Object.values(node).forEach((item) => visit(item, depth + 1));
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Ignore malformed structured data, never guess. */ }
  }
  return candidates;
}
export function robotsAllows(body, url) {
  const groups = []; let group = { agents: [], rules: [] };
  for (const line of body.split(/\r?\n/)) {
    const match = line.split('#')[0].match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2];
    if (key === 'user-agent') {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && group.agents.length) group.rules.push({ allow: key === 'allow', path: value });
  }
  groups.push(group);
  const specific = groups.filter((item) => item.agents.some((agent) => agent !== '*' && 'gigworksvenueimport'.includes(agent)));
  const active = specific.length ? specific : groups.filter((item) => item.agents.includes('*'));
  const path = url.pathname + url.search;
  const matches = active.flatMap((item) => item.rules).filter((rule) => {
    if (!rule.path) return false;
    const end = rule.path.endsWith('$');
    const value = end ? rule.path.slice(0, -1) : rule.path;
    const pattern = value.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp('^' + pattern + (end ? '$' : '')).test(path);
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}
export async function importVenueWebsite(value, { read = readPage } = {}) {
  let url = websiteURL(value);
  const signal = AbortSignal.timeout(12000);
  for (let hop = 0; hop < 4; hop++) {
    const robots = await read(new URL('/robots.txt', url), signal);
    // Missing robots is allowed; failures/redirects are not treated as permission.
    if (robots.status !== 404 && (robots.status !== 200 || !robotsAllows(robots.body, url))) throw fail('This website restricts automated access. Enter its venue details manually.');
    const page = await read(url, signal);
    if ([301, 302, 303, 307, 308].includes(page.status) && page.headers.location) { url = websiteURL(new URL(page.headers.location, url).href); continue; }
    if (page.status !== 200 || !String(page.headers['content-type']).includes('text/html')) throw fail('This page could not be imported. Enter the venue details manually.');
    return { places: extractWebsiteVenues(page.body), sourceUrl: url.href };
  }
  throw fail('This website redirects too many times. Use its final website address.');
}
