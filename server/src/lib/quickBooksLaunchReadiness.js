const REQUIRED_FLOW_TYPES = ['customer', 'invoice', 'payment', 'vendor', 'bill', 'bill_payment'];

export function quickBooksEnvironment(env = process.env) {
  return env.QUICKBOOKS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
}

export function quickBooksLaunchReadiness({ configured, connection, setupReady, syncedCounts = {}, issueCount = 0, environment = 'production', now = new Date() }) {
  const healthRecent = !!connection?.lastHealthCheckAt && now.getTime() - new Date(connection.lastHealthCheckAt).getTime() < 24 * 3600000;
  const reconciliationRecent = !!connection?.lastReconciliationAt && now.getTime() - new Date(connection.lastReconciliationAt).getTime() < Math.max(24, connection.reconciliationFrequencyHours || 24) * 2 * 3600000;
  const paymentAccountReady = !!connection?.accountingMappings?.contractorPaymentAccountId;
  const checks = [
    { id: 'credentials', complete: configured, required: true, label: `${environment === 'sandbox' ? 'Sandbox' : 'Production'} Intuit credentials configured`, help: 'Add the matching Intuit app credentials and redirect URL.' },
    { id: 'connection', complete: connection?.status === 'active' && healthRecent, required: true, label: 'Connection checked within 24 hours', help: 'Use Check connection before launch.' },
    { id: 'mappings', complete: setupReady, required: true, label: 'Accounting mappings completed', help: 'Import and save the chart-of-accounts mappings.' },
    { id: 'payment-account', complete: paymentAccountReady, required: true, label: 'Contractor payment account selected', help: 'Choose the bank or credit-card account used for contractor payments.' },
    ...REQUIRED_FLOW_TYPES.map((type) => ({ id: `flow-${type}`, complete: Number(syncedCounts[type] || 0) > 0, required: true, label: `Test ${type.replace('_', ' ')} synchronized`, help: 'Complete one reviewed sample in the Intuit sandbox.' })),
    { id: 'monitoring', complete: !!connection?.reconciliationEnabled && reconciliationRecent && connection?.lastReconciliationStatus === 'healthy', required: true, label: 'Reconciliation monitoring verified', help: 'Enable monitoring and run Check now after the sample workflows.' },
    { id: 'issues', complete: issueCount === 0, required: true, label: 'No unresolved sync issues', help: 'Resolve failed or review-needed records in QuickBooks activity.' },
  ];
  return { environment, ready: checks.filter((check) => check.required).every((check) => check.complete), completed: checks.filter((check) => check.complete).length, total: checks.length, checks };
}
