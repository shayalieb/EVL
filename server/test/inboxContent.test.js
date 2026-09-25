import test from 'node:test';
import assert from 'node:assert/strict';
import { mailbox, inboxHtml, inboundAddresses, attachmentMetadata } from '../src/lib/inboxContent.js';
import { resolveInboxTarget } from '../src/lib/inboxReceiving.js';

test('inbox renders email safely without scripts, forms or tracking pixels', () => {
  const result = inboxHtml('<script>alert(1)</script><img src="https://tracker.test/pixel"><form><input></form><a href="javascript:alert(1)">Bad</a><p onclick="bad()">Hello</p>');
  assert.equal(result, '<a>Bad</a><p>Hello</p>');
  assert.equal(mailbox('Client <CLIENT@example.com>'), 'client@example.com');
  assert.equal(mailbox('invalid'), null);
  assert.deepEqual(inboundAddresses({ to: ['A@EXAMPLE.COM'], received_for: ['a@example.com'] }), ['a@example.com']);
  assert.deepEqual(attachmentMetadata([{ id: 'a', filename: 'test.pdf', size: 50, content_type: 'application/pdf', download_url: 'https://untrusted.test' }]), [{ filename: 'test.pdf', size: 50, contentType: 'application/pdf', providerAttachmentId: 'a' }]);
});

test('routing requires exact aliases or one verified account domain, never sender identity', async () => {
  const calls = [];
  const db = { inboxThread: { findFirst: async ({ where }) => { calls.push(where); return null; } }, emailDomain: { findMany: async ({ where }) => { calls.push(where); return []; } } };
  assert.equal(await resolveInboxTarget({ to: ['inbox+known@wrong-domain.test'] }, db), null);
  assert.deepEqual(calls[0], { OR: [{ replyAlias: { in: ['inbox+known@wrong-domain.test'] } }, { replyAliases: { hasSome: ['inbox+known@wrong-domain.test'] } }] });
  assert.equal(await resolveInboxTarget({ to: ['hello@gigworks.io'], from: 'owner@customer.test' }, db), null);
  assert.equal(calls[1].receivingStatus, 'verified');
  assert.equal(await resolveInboxTarget({ to: ['reply+old@customer.test'] }, db), null);
});
