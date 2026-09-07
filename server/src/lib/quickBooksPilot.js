export function quickBooksPilotHealth({ accessEnabled, connectionStatus, issueCount = 0, lastSuccessfulSyncAt = null }) {
  if (!accessEnabled) return 'not_enabled';
  if (!connectionStatus) return 'awaiting_connection';
  if (connectionStatus !== 'active') return 'connection_issue';
  if (issueCount > 0) return 'needs_attention';
  if (!lastSuccessfulSyncAt) return 'ready';
  return 'healthy';
}

export const QUICKBOOKS_PILOT_TEST_STEPS = ['connection', 'customer_invoice', 'client_payment', 'vendor_bill', 'contractor_payment', 'duplicate_protection', 'reconciliation'];

export function updateQuickBooksPilotTestResults(existing, step, result, evidence = '') {
  if (!QUICKBOOKS_PILOT_TEST_STEPS.includes(step)) throw new Error('Unknown QuickBooks pilot test step.');
  if (!['pending', 'passed', 'failed'].includes(result)) throw new Error('Unknown QuickBooks pilot test result.');
  const results = { ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}), [step]: { result, evidence: String(evidence || '').trim().slice(0, 2000), updatedAt: new Date().toISOString() } };
  const values = QUICKBOOKS_PILOT_TEST_STEPS.map((key) => results[key]?.result || 'pending');
  const complete = values.every((value) => value !== 'pending');
  return { results, status: complete ? (values.includes('failed') ? 'failed' : 'passed') : 'in_progress', complete };
}

export function quickBooksPilotGraduationReadiness({ pilot, hasPassedTest = false, issueCount = 0 }) {
  const checks = [
    { id: 'onboarding', label: 'Customer onboarding completed', complete: !!pilot?.onboardingCompletedAt },
    { id: 'documentation', label: 'Support guide shared', complete: !!pilot?.documentationSharedAt },
    { id: 'test', label: 'Controlled pilot test passed', complete: hasPassedTest },
    { id: 'cycle-one', label: 'First accounting cycle monitored', complete: !!pilot?.firstCycleCompletedAt },
    { id: 'cycle-two', label: 'Second accounting cycle monitored', complete: !!pilot?.secondCycleCompletedAt },
    { id: 'issues', label: 'No unresolved sync issues', complete: issueCount === 0 },
  ];
  return { ready: checks.every((check) => check.complete), completed: checks.filter((check) => check.complete).length, total: checks.length, checks };
}
