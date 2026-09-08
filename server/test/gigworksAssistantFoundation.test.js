import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantToolNamesForPermissions, findHelpArticles } from '../src/lib/gigworksAssistant.js';
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
});

test('local training search works without calling an AI provider', () => {
  const articles = findHelpArticles('how do I build a stage plot');
  assert.ok(articles.length > 0);
  assert.equal(articles[0].id, 'stage-plot');
  assert.match(articles[0].content, /stage/i);
});

test('training fallback returns useful steps and a verified Help Center link', () => {
  const result = fallbackTrainingAnswer('Teach me how to create and send an invoice');
  assert.equal(result.fallback, true);
  assert.equal(result.link.recordId, 'create-invoice');
  assert.match(result.answer, /^## /);
  assert.match(result.answer, /1\./);
  assert.match(result.answer, /full guide/i);
});

test('ordinary operational questions do not receive a generic training fallback', () => {
  assert.equal(fallbackTrainingAnswer('Which invoices are overdue?'), null);
});

test('guided training paths only link to real Help Center articles', () => {
  const articleIds = new Set(HELP_ARTICLES_FLAT.map((article) => article.id));
  assert.ok(ASSISTANT_GUIDES.length >= 6);
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
