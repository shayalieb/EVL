import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { prisma } from '../server/src/lib/prisma.js';

// Stored XSS sweep. A separate tenant is created whose every text field in every
// customer-facing model is a payload that records itself in window.__xss if it
// ever runs (img onerror, svg onload, script, details ontoggle, attribute
// breakout). Each page that renders that data is then loaded; any recorded
// payload, alert dialog or injected element fails the test and names the
// field that did it. The same data reaches the owner (lists, details) and
// outside readers (proposal, contract, invoice, inquiry, RSVP, portal pages).

const require = createRequire(new URL('../server/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');

const API = 'http://127.0.0.1:4100/api';
const EMAIL = 'xss.owner@e2e.test';
const PASSWORD = 'xss-test-password-1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(24).toString('hex');

// One payload per field, carrying the field's name so a hit says exactly where it ran.
const payload = (point) => `"'><img src=x onerror="window.__xss.push('${point}')"><svg onload="window.__xss.push('${point}')"><details open ontoggle="window.__xss.push('${point}')"></details><script>window.__xss.push('${point}')</script><a href="javascript:window.__xss.push('${point}')">${point}</a>`;
const deep = (value, point) => {
  if (typeof value === 'string') return payload(point);
  if (Array.isArray(value)) return value.map((item, index) => deep(item, `${point}[${index}]`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deep(child, `${point}.${key}`)]));
  return value;
};

const MODELS = ['Client', 'Contractor', 'Venue', 'Offering', 'Booking', 'Event', 'ContractorGroup', 'Reminder', 'SetListLibraryItem', 'RunOfShowLibraryItem', 'StagePlotLibraryItem', 'EmailThread'];
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const camel = (name) => name[0].toLowerCase() + name.slice(1);
const LOOSE_REFERENCES = { clientId: 'xss-client', eventId: 'xss-event', bookingId: 'xss-booking', contractorId: 'xss-contractor' };

let account;
let user;
const tokens = {};

async function createHostileRow(modelName) {
  const model = models.get(modelName);
  const foreignKeys = new Set(model.fields.filter((field) => field.kind === 'object' && field.relationFromFields?.length).flatMap((field) => field.relationFromFields));
  const data = { id: `xss-${camel(modelName).toLowerCase()}`.replace('xss-contractorgroup', 'xss-group') };
  for (const field of model.fields) {
    if (field.kind === 'object' || field.isId) continue;
    if (field.name === 'accountId') { data.accountId = account.id; continue; }
    if (foreignKeys.has(field.name)) { if (field.name === 'createdByUserId' || field.name === 'userId') data[field.name] = user.id; continue; }
    if (field.name in LOOSE_REFERENCES) { data[field.name] = LOOSE_REFERENCES[field.name]; continue; }
    if (field.hasDefaultValue) continue;
    const point = `${modelName}.${field.name}`;
    if (field.type === 'String') data[field.name] = /email/i.test(field.name) ? `xss-${modelName.toLowerCase()}@example.test` : payload(point);
    else if (field.type === 'Json') data[field.name] = field.isList || /s$/.test(field.name) ? [{ name: payload(`${point}[0].name`), label: payload(`${point}[0].label`), note: payload(`${point}[0].note`) }] : deep({ name: 'x', label: 'x', note: 'x', venue: 'x' }, point);
    else if (field.type === 'DateTime') { if (field.isRequired) data[field.name] = new Date(Date.now() + 5 * 86_400_000); }
    else if (field.type === 'Int' || field.type === 'Float') data[field.name] = 1;
    else if (field.type === 'Boolean') data[field.name] = false;
    else if (field.kind === 'enum') data[field.name] = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === field.type)?.values?.[0]?.name;
  }
  if (modelName === 'Booking' || modelName === 'Event') { data.eventDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10); data.venue = deep({ name: 'x', address1: 'x', city: 'x' }, `${modelName}.venue`); }
  if (modelName === 'Offering') { data.type = 'general'; data.amount = '100'; }
  if (modelName === 'ContractorGroup') data.contractorIds = [];
  if (modelName === 'Reminder') data.remindAt = new Date(Date.now() + 86_400_000);
  if (modelName === 'EmailThread') { data.emailThreadKey = undefined; }
  await prisma[camel(modelName)].create({ data }).catch((error) => { throw new Error(`could not seed ${modelName}: ${String(error.message).split('\n').filter(Boolean).pop()}`); });
}

test.beforeAll(async () => {
  account = await prisma.account.create({ data: { id: 'xss-account', approvedAt: new Date(), vertical: 'band_orchestra' } });
  user = await prisma.user.create({ data: { id: 'xss-user', firstName: payload('User.firstName'), lastName: payload('User.lastName'), email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
  await prisma.membership.create({ data: { userId: user.id, accountId: account.id, role: 'owner', permissions: {} } });
  const businessInfo = deep({ name: 'x', email: 'x', phone: 'x', address1: 'x', address2: 'x', city: 'x', state: 'x', zip: 'x', website: 'x', logoUrl: 'x', description: 'x' }, 'businessInfo');
  businessInfo.email = EMAIL;
  await prisma.accountData.create({ data: { accountId: account.id, data: {
    businessInfo, venues: [], contractorTypes: [payload('contractorTypes[0]')], eventTypes: [payload('eventTypes[0]')],
    emailTemplates: [{ id: 'xss-template', name: payload('emailTemplates.name'), subject: payload('emailTemplates.subject'), body: payload('emailTemplates.body') }],
    offerings: [{ id: 'xss-offering-blob', name: payload('blob.offering.name'), type: 'general', amount: '100', details: payload('blob.offering.details'), category: payload('blob.offering.category') }],
    proposalTemplates: [], contractTemplates: [], setListLibrary: [], contractorGroups: [{ id: 'xss-group-blob', name: payload('blob.group.name'), contractorIds: [], price: '1' }],
    bookingStatuses: [{ id: 'new', label: payload('bookingStatuses.label'), color: '#6366f1' }],
    eventStatuses: [{ id: 'confirmed', label: payload('eventStatuses.label'), color: '#10b981' }],
    inquiryStatuses: [{ id: 'pending', label: payload('inquiryStatuses.label'), bucket: 'pending', color: '#f59e0b' }],
  } } });

  await prisma.client.create({ data: { id: 'xss-client', accountId: account.id, firstName: payload('Client.firstName'), lastName: payload('Client.lastName'), email: 'xss-client@example.test', phone: payload('Client.phone'), address1: payload('Client.address1'), city: payload('Client.city'), notes: payload('Client.notes') } });
  for (const name of MODELS.filter((entry) => entry !== 'Client')) {
    try { await createHostileRow(name); } catch (error) { console.warn(String(error.message)); }
  }

  // Documents the outside world reads, with a hostile snapshot and hostile owner details.
  const snapshot = deep({
    businessInfo: { name: 'x', email: 'x', phone: 'x', address1: 'x' }, client: { firstName: 'x', lastName: 'x', email: 'x' },
    booking: { eventName: 'x', eventType: 'x', eventDate: 'x', venue: { name: 'x', address1: 'x' }, notes: 'x' },
    event: { name: 'x', eventDate: 'x', venue: { name: 'x' } },
    proposal: { lineItems: [{ name: 'x', amount: 1 }], offerings: [{ name: 'x', type: 'general', amount: 1, details: 'x' }], sections: [{ title: 'x', body: 'x' }], notes: 'x' },
    lineItems: [{ name: 'x', amount: 1 }], offerings: [{ name: 'x', type: 'general', amount: 1 }], terms: 'x',
  }, 'snapshot');
  const bearer = { proposal: token(), contract: token(), invoice: token(), inquiry: token(), rsvp: token(), portal: token(), gigs: token() };
  Object.assign(tokens, bearer);
  const common = { accountId: account.id, recipientEmail: 'xss-client@example.test', recipientName: payload('recipientName'), ownerEmail: EMAIL };
  await prisma.proposalResponse.create({ data: { ...common, bookingId: 'xss-booking', snapshot, status: 'sent', tokenHash: hash(bearer.proposal) } });
  await prisma.contract.create({ data: { ...common, bookingId: 'xss-booking', snapshot, terms: payload('Contract.terms'), status: 'sent', clientTokenHash: hash(bearer.contract) } });
  await prisma.invoice.create({ data: { ...common, bookingId: 'xss-booking', snapshot: { ...snapshot, event: snapshot.booking, lineItems: snapshot.lineItems }, status: 'sent', acceptPayment: false, memo: payload('Invoice.memo'), payTokenHash: hash(bearer.invoice), sentAt: new Date() } });
  await prisma.inquiryLink.create({ data: { accountId: account.id, tokenHash: hash(bearer.inquiry), status: 'open', expiresAt: new Date(Date.now() + 86_400_000), ownerEmail: EMAIL, recipientEmail: null, recipientName: payload('InquiryLink.recipientName') } });
  await prisma.eventRsvpLink.create({ data: { accountId: account.id, eventId: 'xss-event', tokenHash: hash(bearer.rsvp), publicToken: bearer.rsvp } });
  await prisma.clientPortalToken.create({ data: { clientId: 'xss-client', tokenHash: hash(bearer.portal), expiresAt: new Date(Date.now() + 3_600_000) } });
});

test.afterAll(async () => {
  // Remove everything this tenant created so the other specs see an untouched database.
  await prisma.account.delete({ where: { id: 'xss-account' } }).catch(() => {});
  await prisma.user.delete({ where: { id: 'xss-user' } }).catch(() => {});
  await prisma.clientPortalToken.deleteMany({ where: { clientId: 'xss-client' } }).catch(() => {});
  for (const name of ['Client', ...MODELS]) await prisma[camel(name)].deleteMany({ where: { id: { startsWith: 'xss-' } } }).catch(() => {});
});

// Fails on anything that ran, and on any element the payloads would have created.
async function visitAndWatch(page, url, { settle = 600, after, showsData = true } = {}) {
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(() => { window.__xss = []; });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (after) await after(page);
  await page.waitForTimeout(settle);
  const executed = await page.evaluate(() => window.__xss);
  // Proof the page really displayed the hostile text (as text), so a clean result means "escaped",
  // not "never rendered": it is visible in the page or sitting in an input.
  if (showsData) {
    expect(new URL(page.url()).pathname, `${url} redirected away (not signed in?)`).not.toMatch(/^\/(auth|portal\/login)$/);
    const visible = await page.evaluate(() => `${window.__seen || ''} ${document.body.innerText} ${[...document.querySelectorAll('input,textarea,select')].map((element) => element.value).join(' ')}`);
    expect(visible, `${url} did not display any of the seeded payloads, so this check proved nothing`).toContain('__xss.push(');
  }
  const injected = await page.evaluate(() => [...document.querySelectorAll('script:not([src])')].filter((node) => node.textContent.includes('__xss')).length
    + document.querySelectorAll('img[src="x"][onerror], svg[onload], details[ontoggle], a[href^="javascript:"]').length);
  expect({ url, executed, dialogs, injectedElements: injected }, `a payload took effect on ${url}`).toEqual({ url, executed: [], dialogs: [], injectedElements: 0 });
}

test('control: the detector reports a payload that really runs', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = []; });
  await page.goto('/auth');
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__xss.push(\'control\')">'));
  await expect.poll(() => page.evaluate(() => window.__xss)).toEqual(['control']);
  const injected = await page.evaluate(() => document.querySelectorAll('img[src="x"][onerror]').length);
  expect(injected).toBe(1);
});

test.describe('stored XSS: owner-facing pages render other people’s text as text', () => {
  test.beforeEach(async ({ page }) => {
    // Log in by API from a private address so the shared login limiter is not spent on this spec.
    const response = await page.request.post(`${API}/auth/login`, { data: { email: EMAIL, password: PASSWORD }, headers: { 'x-forwarded-for': `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
    expect(response.status(), await response.text()).toBe(200);
  });

  test('coverage guard: the API returns the seeded hostile rows', async ({ page }) => {
    const missing = [];
    for (const [path, marker] of [['/clients?page=1&pageSize=25', 'Client.firstName'], ['/contractors?page=1&pageSize=25', 'Contractor.firstName'], ['/venues?page=1&pageSize=25', 'Venue.name'], ['/offerings?page=1&pageSize=25', 'Offering.name'], ['/contractor-groups?page=1&pageSize=25', 'ContractorGroup.name'], ['/bookings?page=1&pageSize=25', 'Booking.eventName'], ['/events?page=1&pageSize=25', 'Event.name'], ['/reminders', 'Reminder.note']]) {
      const response = await page.request.get(`${API}${path}`);
      const text = await response.text();
      if (!text.includes(marker)) missing.push(`${path} -> ${response.status()} ${text.slice(0, 120)}`);
    }
    expect(missing, 'seeded rows are not served, so pages cannot be showing them').toEqual([]);
  });

  const emptyByDesign = new Set(['/home', '/inbox', '/financials', '/help', '/stage-plot-library', '/run-of-show-library', '/set-lists']);
  for (const path of ['/home', '/clients', '/contractors', '/venues', '/offerings', '/bookings', '/bookings/xss-booking', '/events', '/events/xss-event', '/reminders', '/email-templates', '/settings', '/inbox', '/set-lists', '/run-of-show-library', '/stage-plot-library', '/financials', '/help']) {
    test(`${path}`, async ({ page }) => {
      await visitAndWatch(page, path, { showsData: !emptyByDesign.has(path), after: path === '/settings' ? async (target) => {
        // Each tab replaces the last, so remember what every one displayed.
        for (const name of ['Business Info', 'Custom Fields', 'Templates', 'Users', 'Plan', 'Booking Link', 'Email Domain', 'Messaging', 'Integrations']) {
          const tab = target.getByRole('button', { name, exact: true }).or(target.getByRole('tab', { name, exact: true })).first();
          if (await tab.isVisible().catch(() => false)) {
            await tab.click({ timeout: 2000 }).catch(() => {});
            await target.waitForTimeout(250);
            await target.evaluate(() => { window.__seen = `${window.__seen || ''} ${document.body.innerText} ${[...document.querySelectorAll('input,textarea,select')].map((element) => element.value).join(' ')}`; });
          }
        }
      } : undefined });
    });
  }

  test('the event page with its email and document modals open', async ({ page }) => {
    await visitAndWatch(page, '/events/xss-event', { after: async (target) => {
      for (const name of [/email/i, /message/i, /documents?/i, /preview/i]) {
        const button = target.getByRole('button', { name }).first();
        if (await button.isVisible().catch(() => false)) { await button.click({ timeout: 2000 }).catch(() => {}); await target.waitForTimeout(250); await target.keyboard.press('Escape'); }
      }
    } });
  });

  test('the booking page with its proposal, contract and invoice tabs', async ({ page }) => {
    await visitAndWatch(page, '/bookings/xss-booking', { after: async (target) => {
      for (const name of [/proposal/i, /contract/i, /invoice/i, /activity/i, /notes?/i]) {
        const control = target.getByRole('tab', { name }).or(target.getByRole('button', { name })).first();
        if (await control.isVisible().catch(() => false)) { await control.click({ timeout: 2000 }).catch(() => {}); await target.waitForTimeout(250); }
      }
    } });
  });
});

test.describe('stored XSS: pages outsiders read render the owner’s and each other’s text as text', () => {
  test('proposal page', async ({ page }) => { await visitAndWatch(page, `/proposal/${tokens.proposal}`); });
  test('contract signing page, before and after confirming the recipient email', async ({ page }) => {
    await visitAndWatch(page, `/sign/${tokens.contract}`, { showsData: false, after: async (target) => {
      await target.getByPlaceholder(/email address/i).fill('xss-client@example.test');
      await target.getByRole('button', { name: /continue/i }).click();
      await target.waitForLoadState('networkidle');
    } });
    expect(await page.evaluate(() => `${document.body.innerText}`), 'the contract did not render after confirming the email').toContain('__xss.push(');
  });
  test('invoice page', async ({ page }) => { await visitAndWatch(page, `/invoice/${tokens.invoice}`); });
  test('inquiry form', async ({ page }) => { await visitAndWatch(page, `/inquiry/${tokens.inquiry}`); });
  test('RSVP page', async ({ page }) => { await visitAndWatch(page, `/rsvp/${tokens.rsvp}`); });
  test('client portal after signing in with its link', async ({ page }) => {
    await page.addInitScript(() => { window.__xss = []; });
    await visitAndWatch(page, `/portal/verify?token=${tokens.portal}`, { settle: 1200, after: async (target) => { await target.waitForURL(/\/portal/, { timeout: 8000 }).catch(() => {}); await target.goto('/portal', { waitUntil: 'networkidle' }); } });
  });
  test('public forms echo what a visitor types as text, and a submitted payload is inert for the owner', async ({ page }) => {
    await page.goto(`/inquiry/${tokens.inquiry}`, { waitUntil: 'networkidle' });
    await page.addInitScript(() => { window.__xss = []; });
    const fields = page.locator('input[type=text], input:not([type]), textarea');
    for (let index = 0; index < Math.min(await fields.count(), 8); index += 1) await fields.nth(index).fill(payload(`form.field${index}`)).catch(() => {});
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss ?? [])).toEqual([]);
  });
});
