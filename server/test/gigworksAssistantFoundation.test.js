import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantToolNamesForPermissions, findHelpArticles } from '../src/lib/gigworksAssistant.js';

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
});

test('local training search works without calling an AI provider', () => {
  const articles = findHelpArticles('how do I build a stage plot');
  assert.ok(articles.length > 0);
  assert.equal(articles[0].id, 'stage-plot');
  assert.match(articles[0].content, /stage/i);
});
