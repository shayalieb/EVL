import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateTwilioSignature } from '../src/lib/twilioSms.js';

test('validates Twilio form webhook signatures and rejects tampering', () => {
  const prior = process.env.TWILIO_AUTH_TOKEN;
  const priorSid = process.env.TWILIO_ACCOUNT_SID;
  process.env.TWILIO_AUTH_TOKEN = 'test-token';
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  try {
    const url = 'https://api.example.com/api/webhooks/twilio/sms/inbound';
    const params = { Body: 'Confirmed', From: '+12125550100', To: '+16465550100' };
    const data = `${url}BodyConfirmedFrom+12125550100To+16465550100`;
    const signature = crypto.createHmac('sha1', 'test-token').update(data).digest('base64');
    assert.equal(validateTwilioSignature({ url, params, signature }), true);
    assert.equal(validateTwilioSignature({ url, params: { ...params, Body: 'Tampered' }, signature }), false);
  } finally {
    if (prior === undefined) delete process.env.TWILIO_AUTH_TOKEN; else process.env.TWILIO_AUTH_TOKEN = prior;
    if (priorSid === undefined) delete process.env.TWILIO_ACCOUNT_SID; else process.env.TWILIO_ACCOUNT_SID = priorSid;
  }
});
