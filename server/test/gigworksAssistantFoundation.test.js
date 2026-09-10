import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantToolNamesForPermissions, eventAttentionIssues, financialSnapshot, findHelpArticles, migrationAssistantInstructions, updateClientAction, updateEventAction } from '../src/lib/gigworksAssistant.js';
import { fallbackTrainingAnswer } from '../src/routes/assistant.js';
import { ASSISTANT_GUIDES } from '../../src/lib/assistantGuides.js';
import { HELP_ARTICLES_FLAT } from '../../src/lib/helpArticles.js';

test('training and navigation remain available without booking permissions', () => {
  const tools = assistantToolNamesForPermissions({});
  assert.equal(tools.includes('find_help_article'), true);
  assert.equal(tools.includes('navigate_to'), true);
  assert.equal(tools.includes('get_upcoming_schedule'), false);
  assert.equal(tools.includes('propose_update_booking'), false);
});

test('assistant tools follow the matching module permission', () => {
  const tools = assistantToolNamesForPermissions({ manageContractors: true, viewFinancials: true });
  assert.equal(tools.includes('find_contractor'), true);
  assert.equal(tools.includes('get_pending_contractor_payments'), true);
  assert.equal(tools.includes('find_client'), false);
  assert.equal(tools.includes('propose_create_booking'), false);
  assert.equal(tools.includes('get_financial_snapshot'), true);
  assert.equal(tools.includes('get_events_needing_attention'), false);
  assert.equal(tools.includes('get_due_reminders'), true);
});

test('operational coverage follows each matching module permission', () => {
  const tools = assistantToolNamesForPermissions({ manageBookings: true, manageEvents: true, manageVenues: true, manageOfferings: true });
  assert.equal(tools.includes('search_bookings'), true);
  assert.equal(tools.includes('get_events_needing_attention'), true);
  assert.equal(tools.includes('find_venue'), true);
  assert.equal(tools.includes('get_offerings_summary'), true);
  assert.equal(tools.includes('get_financial_snapshot'), false);
  assert.equal(tools.includes('propose_update_client'), false);
  assert.equal(tools.includes('propose_add_contractor'), false);
  assert.equal(tools.includes('propose_add_venue'), true);
  assert.equal(tools.includes('propose_update_event'), true);
});

test('final-phase write tools follow their own module permissions', () => {
  const clientTools = assistantToolNamesForPermissions({ manageClients: true });
  const contractorTools = assistantToolNamesForPermissions({ manageContractors: true });
  assert.equal(clientTools.includes('propose_update_client'), true);
  assert.equal(clientTools.includes('propose_update_contractor'), false);
  assert.equal(contractorTools.includes('propose_add_contractor'), true);
  assert.equal(contractorTools.includes('propose_update_contractor'), true);
  assert.equal(contractorTools.includes('propose_update_event'), false);
});

test('client updates reject stale proposals before writing', async () => {
  let wrote = false;
  const db = { client: {
    findFirst: async () => ({ id: 'client-1', accountId: 'account-1', firstName: 'Jamie', lastName: 'Lee', updatedAt: new Date('2026-09-08T12:00:00Z') }),
    update: async () => { wrote = true; },
  } };
  await assert.rejects(() => updateClientAction('account-1', { clientId: 'client-1', expectedUpdatedAt: '2026-09-07T12:00:00.000Z', fields: { phone: '555-1111' } }, db), /changed after/);
  assert.equal(wrote, false);
});

test('event updates allow safe fields and discard privileged fields', async () => {
  let savedData;
  const db = { event: {
    findFirst: async () => ({ id: 'event-1', accountId: 'account-1', name: 'Gala', history: [], updatedAt: new Date('2026-09-08T12:00:00Z') }),
    update: async ({ data }) => { savedData = data; return { id: 'event-1', ...data }; },
  } };
  await updateEventAction('account-1', { eventId: 'event-1', expectedUpdatedAt: '2026-09-08T12:00:00.000Z', fields: { startTime: '18:30', eventNote: 'Bring music stands', contractorBookings: [{ paymentStatus: 'paid' }], deletedAt: new Date() } }, db);
  assert.equal(savedData.startTime, '18:30');
  assert.equal(savedData.eventNote, 'Bring music stands');
  assert.equal(savedData.contractorBookings, undefined);
  assert.equal(savedData.deletedAt, undefined);
  assert.equal(savedData.history.length, 1);
});

test('event attention explains missing operational setup in plain language', () => {
  const issues = eventAttentionIssues({ contractorBookings: [], noOutsideContractorsNeeded: false, contactEmail: '', venue: {} });
  assert.deepEqual(issues, ['No contractors added', 'Client contact email missing', 'Venue missing']);
  assert.deepEqual(eventAttentionIssues({ contractorBookings: [], noOutsideContractorsNeeded: true, contactEmail: 'client@example.com', venue: { name: 'Main Hall' } }), []);
});

test('financial snapshot separates receivables, requests, and recent cash', () => {
  const result = financialSnapshot({
    now: new Date('2026-09-08T12:00:00Z'),
    invoices: [{ snapshot: { lineItems: [{ amount: 1000 }] }, paidAmount: 250, dueDate: new Date('2026-09-01T12:00:00Z') }],
    requests: [{ amountCents: 12500 }],
    transactions: [{ amountCents: 50000 }, { amountCents: -20000 }],
  });
  assert.equal(result.outstandingClientBalance, 750);
  assert.equal(result.overdueClientBalance, 750);
  assert.equal(result.submittedContractorRequests, 125);
  assert.deepEqual(result.last30Days, { cashIn: 500, cashOut: 200, netCash: 300 });
});

test('local training search works without calling an AI provider', () => {
  const articles = findHelpArticles('how do I build a stage plot');
  assert.ok(articles.length > 0);
  assert.equal(articles[0].id, 'stage-plot');
  assert.match(articles[0].content, /stage/i);
});

test('migration help is searchable for PandaDoc and calendar questions', () => {
  for (const question of ['move my PandaDoc records', 'import old Google Calendar events', 'migrate a client CSV']) {
    const articles = findHelpArticles(question);
    assert.ok(articles.some((article) => article.id === 'migration-center'), question);
  }
});

test('migration assistant pauses at safety checkpoints', () => {
  const instructions = migrationAssistantInstructions();
  assert.match(instructions, /exactly one next step per turn/i);
  assert.match(instructions, /preview changes nothing/i);
  assert.match(instructions, /Never advance to confirmation/i);
  assert.match(instructions, /remain separate bookings/i);
});

test('training fallback returns useful steps and a verified Help Center link', () => {
  const result = fallbackTrainingAnswer('Teach me how to create and send an invoice');
  assert.equal(result.fallback, true);
  assert.equal(result.link.recordId, 'create-invoice');
  assert.match(result.answer, /^## /);
  assert.match(result.answer, /1\./);
  assert.match(result.answer, /full guide/i);
});

test('migration fallback starts with one source-specific step', () => {
  const unknown = fallbackTrainingAnswer('Help me migrate my records');
  assert.equal(unknown.link.recordId, 'migration-center');
  assert.match(unknown.answer, /Which system/i);
  const pandaDoc = fallbackTrainingAnswer('Import my PandaDoc data');
  assert.match(pandaDoc.answer, /Step 1: Export from PandaDoc/i);
  assert.doesNotMatch(pandaDoc.answer, /Confirm and import/i);
});

test('ordinary operational questions do not receive a generic training fallback', () => {
  assert.equal(fallbackTrainingAnswer('Which invoices are overdue?'), null);
});

test('guided training paths only link to real Help Center articles', () => {
  const articleIds = new Set(HELP_ARTICLES_FLAT.map((article) => article.id));
  assert.ok(ASSISTANT_GUIDES.length >= 6);
  const migrationGuide = ASSISTANT_GUIDES.find((guide) => guide.id === 'migrate-data');
  assert.equal(migrationGuide.steps.length, 5);
  for (const guide of ASSISTANT_GUIDES) {
    assert.ok(guide.steps.length >= 3, `${guide.id} should be a meaningful workflow`);
    for (const step of guide.steps) {
      if (step.articleId) {
        assert.equal(articleIds.has(step.articleId), true, `${step.articleId} must exist`);
        assert.equal(step.path, `/help?article=${step.articleId}`);
      }
    }
  }
});
