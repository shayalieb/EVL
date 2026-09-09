const VERIFIED = new Set(['verified', 'valid', 'active']);
const FAILED = new Set(['failed', 'temporary_failure', 'invalid', 'error']);
const statusOf = (records) => records.length && records.every((record) => VERIFIED.has(String(record.status).toLowerCase()))
  ? 'verified'
  : records.some((record) => FAILED.has(String(record.status).toLowerCase())) ? 'failed' : 'pending';

export function analyzeEmailDomainRecords(records = []) {
  const inbound = records.filter((record) => String(record.value || '').toLowerCase().includes('inbound-smtp'));
  const outbound = records.filter((record) => !inbound.includes(record));
  return {
    sendingStatus: statusOf(outbound),
    receivingStatus: inbound.length ? statusOf(inbound) : 'not_configured',
  };
}
