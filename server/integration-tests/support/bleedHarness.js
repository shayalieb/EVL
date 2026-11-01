import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { hashToken } from '../../src/lib/resetToken.js';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const MARK = { A: 'BLEED-A', B: 'BLEED-B' };
export const MARK_A_PATTERN = /BLEED[-_ ]?A/i;

// What the probe currently being sent is. Set around every request so that
// the Prisma middleware and the socket guard can attribute what they see.
export const current = { probe: null };
export const blockedConnections = [];

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '']);

// Must run before the app is imported: the app reads .env (dotenv never
// overrides a variable that is already set, even to ''), so blanking every
// key here means a probe cannot reach a real email, SMS, payment, AI, domain
// or storage provider. The socket guard is the second line of defence.
export function lockDownEnvironment() {
  const envFile = join(SERVER_DIR, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
      if (key && key !== 'DATABASE_URL') process.env[key] = '';
    }
  }
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'bleed-test-session-secret-32-characters!!';
  process.env.STRIPE_SECRET_KEY = 'sk_test_blocked';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_blocked';

  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const first = args[0];
    let host;
    if (first && typeof first === 'object' && !Array.isArray(first)) host = first.path ? '' : first.host;
    else if (typeof first === 'string' && Number.isNaN(Number(first))) host = ''; // unix socket path
    else host = typeof args[1] === 'string' ? args[1] : undefined;
    const target = (host || 'localhost').replace(/^\[|\]$/g, '');
    if (!LOOPBACK.has(target)) {
      blockedConnections.push({ host: target, probe: current.probe ? `${current.probe.method} ${current.probe.path}` : null });
      const error = new Error(`outbound connection to ${target} blocked by the tenant-bleed harness`);
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return original.apply(this, args);
  };
}

// ---------------------------------------------------------------------------
// Generic seeding: one marker-tagged row in every tenant-owned model, driven
// by Prisma's own schema metadata so a model added later is covered with no
// edits here.
// ---------------------------------------------------------------------------

const models = Prisma.dmmf.datamodel.models;
const modelByName = new Map(models.map((model) => [model.name, model]));
const SKIP_MODELS = new Set(['User', 'Account', 'Membership', 'Session', 'PasswordResetToken', 'BackgroundJobLease', 'WaitlistEntry', 'WebsiteSetting', 'WebsiteSettingVersion', 'WebsiteReviewRequest']);

export async function resetAllTables(prisma) {
  const tables = Prisma.dmmf.datamodel.models.map((model) => `"${model.dbName || model.name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export const camel = (name) => name[0].toLowerCase() + name.slice(1);
export const ownableModels = () => models.filter((model) => !SKIP_MODELS.has(model.name));

function fkTargets(model) {
  const targets = new Map(); // scalar field -> target model name
  for (const field of model.fields) {
    if (field.kind === 'object' && field.relationFromFields?.length) {
      field.relationFromFields.forEach((scalar) => targets.set(scalar, { model: field.type, required: field.isRequired }));
    }
  }
  return targets;
}

// "clientId" -> Client, "channelId" -> the one model whose name ends in Channel.
function modelForStem(stem) {
  const wanted = stem.toLowerCase();
  const exact = models.find((model) => model.name.toLowerCase() === wanted);
  if (exact) return exact;
  const suffixed = models.filter((model) => model.name.toLowerCase().endsWith(wanted));
  return suffixed.length === 1 ? suffixed[0] : null;
}

// Live states for documents and links, so public/token routes treat A's seeded rows as real.
const NOW = () => new Date();
const DOC_EMAILS = { recipientEmail: 'recipient@example.test', ownerEmail: 'owner@example.test' };
const STATE_OVERRIDES = {
  Contract: () => ({ status: 'sent', sentAt: NOW(), ...DOC_EMAILS }),
  Invoice: () => ({ status: 'sent', sentAt: NOW(), acceptPayment: false, ...DOC_EMAILS }),
  ProposalResponse: () => ({ status: 'sent', sentAt: NOW(), ...DOC_EMAILS }),
  InquiryLink: () => ({ status: 'open', ...DOC_EMAILS }),
};

const ACCOUNT_DATA = (marker) => ({
  businessInfo: { name: marker, email: `${marker.toLowerCase()}@example.test` },
  venues: [], contractorTypes: [], emailTemplates: [], offerings: [], proposalTemplates: [], contractTemplates: [], setListLibrary: [], contractorGroups: [],
  eventTypes: ['Wedding'], bookingStatuses: [], eventStatuses: [], inquiryStatuses: [],
});

export async function seedTenant(prisma, label, vertical) {
  const marker = MARK[label];
  const passwordHash = await bcrypt.hash('password-123', 4);
  const account = await prisma.account.create({ data: { approvedAt: new Date(), vertical, id: `${marker}-Account`, planTier: 'agency', quickBooksAccessEnabled: true } });
  const user = await prisma.user.create({ data: { id: `${marker}-User`, firstName: marker, lastName: 'Owner', email: `${marker.toLowerCase()}-owner@example.test`, passwordHash } });
  await prisma.membership.create({ data: { userId: user.id, accountId: account.id, role: 'owner', permissions: {} } });

  const ids = new Map(); // model name -> seeded id
  const tokens = new Map(); // `Model.field` -> plaintext bearer token (for public-route probes)
  const errors = {};
  const inProgress = new Set();

  async function ensure(modelName) {
    if (ids.has(modelName)) return ids.get(modelName);
    const model = modelByName.get(modelName);
    if (!model || inProgress.has(modelName) || SKIP_MODELS.has(modelName)) return null;
    inProgress.add(modelName);
    const fks = fkTargets(model);
    const data = {};
    try {
      for (const field of model.fields) {
        if (field.kind === 'object') continue;
        if (fks.has(field.name)) {
          const target = fks.get(field.name);
          let value = null;
          if (target.model === 'Account') value = account.id;
          else if (target.model === 'User') value = user.id;
          else value = await ensure(target.model);
          if (value) data[field.name] = value;
          else if (target.required) throw new Error(`required parent ${target.model} could not be seeded`);
          continue;
        }
        if (field.name === 'accountId') { data.accountId = account.id; continue; }
        if (field.isId) { if (field.type === 'String') data[field.name] = `${marker}-${modelName}`; continue; }
        // Bearer-token columns get a real, known token so public routes can be probed with A's own links.
        if (field.type === 'String' && (field.name === 'tokenHash' || field.name.endsWith('TokenHash'))) {
          const token = `tok-${marker}-${modelName}-${field.name}`;
          data[field.name] = hashToken(token);
          tokens.set(`${modelName}.${field.name}`, token);
          continue;
        }
        if (field.type === 'String' && field.name === 'publicToken') { data.publicToken = `tok-${marker}-${modelName}-tokenHash`; continue; }
        if (field.name === 'expiresAt' && field.type === 'DateTime') { data[field.name] = new Date(Date.now() + 30 * 86_400_000); continue; }
        if (field.hasDefaultValue) continue;
        const text = `${marker}-${modelName}-${field.name}`;
        if (field.kind === 'enum') {
          const values = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === field.type)?.values;
          if (values?.length) data[field.name] = values[0].name;
        } else if (field.type === 'String') {
          // A loose reference (clientId etc.) points at the real seeded row of that tenant.
          const stem = field.name.endsWith('Id') ? field.name.slice(0, -2) : null;
          const linked = stem ? modelForStem(stem) : null;
          const linkedId = linked && linked.name !== modelName ? await ensure(linked.name) : null;
          data[field.name] = linkedId || text;
        } else if (field.type === 'Json') {
          data[field.name] = modelName === 'AccountData' && field.name === 'data' ? ACCOUNT_DATA(marker)
            : field.isList || /s$|List$|Items$/.test(field.name) ? [{ name: text, label: text }] : { name: text, label: text };
        } else if (field.type === 'DateTime') {
          // optional ones (revokedAt, usedAt, ...) stay null so links remain valid
          if (field.isRequired) data[field.name] = new Date();
        }
        else if (field.type === 'Int') data[field.name] = 1;
        else if (field.type === 'Float') data[field.name] = 1;
        else if (field.type === 'Boolean') data[field.name] = false;
        else if (field.type === 'Bytes') data[field.name] = Buffer.from(text);
        if (field.isList && !Array.isArray(data[field.name]) && data[field.name] !== undefined && field.type === 'String') data[field.name] = [text];
      }
      Object.assign(data, STATE_OVERRIDES[modelName]?.() || {});
      const created = await prisma[camel(modelName)].create({ data });
      const idField = model.fields.find((field) => field.isId);
      ids.set(modelName, created[idField.name]);
    } catch (error) {
      errors[modelName] = String(error.message || error).split('\n').filter(Boolean).slice(-1)[0];
    } finally {
      inProgress.delete(modelName);
    }
    return ids.get(modelName) || null;
  }

  for (const model of ownableModels()) await ensure(model.name);
  ids.set('Account', account.id);
  ids.set('User', user.id);
  return { label, marker, account, user, password: 'password-123', ids, errors, tokens };
}

// Copies of A's documents and links whose references point at tenant B's rows,
// each with its own known bearer token. Models legacy or forged data that is
// already in the database: public routes must not read or touch B through it.
export async function seedPoison(prisma, tenantA, tenantB) {
  const tokens = new Map(); // `Model.field` -> plaintext token
  const errors = {};
  const clone = async (modelName, tokenField, changes) => {
    try {
      const delegate = prisma[camel(modelName)];
      const source = await delegate.findUnique({ where: { id: tenantA.ids.get(modelName) } });
      const token = `tok-poison-${modelName}`;
      const data = { ...source, id: `POISON-A-${modelName}`, [tokenField]: hashToken(token), ...changes };
      if ('publicToken' in data) data.publicToken = token;
      for (const unique of ['number', 'documentNumber', 'displayNumber']) if (typeof data[unique] === 'number') data[unique] += 1000;
      await delegate.create({ data });
      tokens.set(`${modelName}.${tokenField}`, token);
    } catch (error) {
      errors[modelName] = String(error.message || error).split('\n').filter(Boolean).slice(-1)[0];
    }
  };
  const b = (model) => tenantB.ids.get(model);
  await clone('ProposalResponse', 'tokenHash', { bookingId: b('Booking') });
  await clone('Contract', 'clientTokenHash', { bookingId: b('Booking') });
  await clone('Invoice', 'payTokenHash', { bookingId: b('Booking'), stripeCheckoutSessionId: null, stripePaymentIntentId: null });
  await clone('InquiryLink', 'tokenHash', { bookingId: b('Booking') });
  await clone('EventRsvpLink', 'tokenHash', { eventId: b('Event') });
  await clone('EventPrepFormLink', 'tokenHash', { eventId: b('Event') });
  await clone('ContractorCalendarLink', 'tokenHash', { contractorId: b('Contractor') });
  await clone('RunOfShowShare', 'tokenHash', { eventId: b('Event') });
  return { tokens, errors };
}

// Gives tenant B a client with a real email address, so a public flow that
// matches clients by email (an inquiry submitted on A's link) has something of
// B's to wrongly match.
export async function seedVictimClient(prisma, tenantB) {
  await prisma.client.create({ data: {
    id: `${tenantB.marker}-ClientVictim`, accountId: tenantB.account.id, firstName: `${tenantB.marker}-Victim`, lastName: `${tenantB.marker}-Victim`,
    email: 'victim.bravo@example.test', emailNormalized: 'victim.bravo@example.test', nameNormalized: `${tenantB.marker.toLowerCase()}-victim ${tenantB.marker.toLowerCase()}-victim`,
  } });
}
