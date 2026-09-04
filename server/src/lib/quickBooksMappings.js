export const QUICKBOOKS_MAPPING_FIELDS = [
  ['incomeAccountId', 'Income account'],
  ['contractorExpenseAccountId', 'Contractor expense account'],
  ['otherExpenseAccountId', 'Other expense account'],
  ['accountsReceivableId', 'Accounts receivable'],
  ['accountsPayableId', 'Accounts payable'],
  ['serviceItemId', 'Invoice service item'],
];

export const GIGWORKS_EXPENSE_CATEGORIES = ['contractor_payment', 'production', 'backline', 'travel', 'processing_fee', 'agency_commission', 'tax', 'reimbursement', 'other_expense'];

const ALLOWED_TYPES = {
  incomeAccountId: ['Income', 'Other Income'],
  contractorExpenseAccountId: ['Expense', 'Cost of Goods Sold', 'Other Expense'],
  otherExpenseAccountId: ['Expense', 'Cost of Goods Sold', 'Other Expense'],
  accountsReceivableId: ['Accounts Receivable'],
  accountsPayableId: ['Accounts Payable'],
  serviceItemId: ['Service', 'NonInventory'],
};

function list(value) { return Array.isArray(value) ? value : []; }

export function normalizeQuickBooksReference(entity) {
  return { id: String(entity.Id), name: String(entity.Name || entity.FullyQualifiedName || 'Unnamed'), fullyQualifiedName: String(entity.FullyQualifiedName || entity.Name || 'Unnamed'), type: String(entity.AccountType || ''), subtype: String(entity.AccountSubType || ''), active: entity.Active !== false };
}

export function normalizeQuickBooksItem(entity) {
  return { id: String(entity.Id), name: String(entity.Name || 'Unnamed'), fullyQualifiedName: String(entity.FullyQualifiedName || entity.Name || 'Unnamed'), type: String(entity.Type || ''), active: entity.Active !== false };
}

export function suggestedQuickBooksMappings(accounts, items = []) {
  const active = list(accounts).filter((account) => account.active !== false);
  const find = (types, names = []) => active.find((account) => types.includes(account.type) && names.some((name) => account.name.toLowerCase().includes(name))) || active.find((account) => types.includes(account.type));
  return {
    incomeAccountId: find(ALLOWED_TYPES.incomeAccountId, ['service', 'sales', 'income'])?.id || '',
    contractorExpenseAccountId: find(ALLOWED_TYPES.contractorExpenseAccountId, ['contractor', 'subcontractor', 'cost of labor', 'labor'])?.id || '',
    otherExpenseAccountId: find(ALLOWED_TYPES.otherExpenseAccountId, ['other business', 'general', 'expense'])?.id || '',
    accountsReceivableId: find(ALLOWED_TYPES.accountsReceivableId, ['accounts receivable'])?.id || '',
    accountsPayableId: find(ALLOWED_TYPES.accountsPayableId, ['accounts payable'])?.id || '',
    serviceItemId: list(items).find((item) => item.active !== false && ALLOWED_TYPES.serviceItemId.includes(item.type))?.id || '',
    agencyTrackingMode: 'none',
    categoryMappings: {},
    groupMappings: {},
  };
}

export function validateQuickBooksMappings(input, accounts, classes = [], locations = [], agencyGroups = [], items = []) {
  const accountById = new Map(list(accounts).map((account) => [account.id, account]));
  const itemById = new Map(list(items).map((item) => [item.id, item]));
  const errors = [];
  const mappings = { agencyTrackingMode: ['none', 'class', 'location'].includes(input?.agencyTrackingMode) ? input.agencyTrackingMode : 'none', categoryMappings: {}, groupMappings: {} };
  for (const [key, label] of QUICKBOOKS_MAPPING_FIELDS) {
    const id = String(input?.[key] || '');
    const account = key === 'serviceItemId' ? itemById.get(id) : accountById.get(id);
    if (!account || account.active === false) errors.push(`${label} is required.`);
    else if (!ALLOWED_TYPES[key].includes(account.type)) errors.push(`${label} must use a compatible QuickBooks account type.`);
    mappings[key] = id;
  }
  for (const category of GIGWORKS_EXPENSE_CATEGORIES) {
    const fallback = category === 'contractor_payment' ? mappings.contractorExpenseAccountId : mappings.otherExpenseAccountId;
    const id = String(input?.categoryMappings?.[category] || fallback || '');
    const account = accountById.get(id);
    if (!account || !ALLOWED_TYPES.otherExpenseAccountId.includes(account.type)) errors.push(`Choose a valid expense account for ${category.replaceAll('_', ' ')}.`);
    mappings.categoryMappings[category] = id;
  }
  if (mappings.agencyTrackingMode === 'class' && !list(classes).length) errors.push('No active QuickBooks classes are available.');
  if (mappings.agencyTrackingMode === 'location' && !list(locations).length) errors.push('No active QuickBooks locations are available.');
  if (mappings.agencyTrackingMode !== 'none') {
    const available = new Set((mappings.agencyTrackingMode === 'class' ? list(classes) : list(locations)).map((item) => item.id));
    for (const group of list(agencyGroups)) {
      const referenceId = String(input?.groupMappings?.[group.id] || '');
      if (!available.has(referenceId)) errors.push(`Choose a QuickBooks ${mappings.agencyTrackingMode} for ${group.name}.`);
      mappings.groupMappings[group.id] = referenceId;
    }
  }
  return { mappings, errors: [...new Set(errors)] };
}

export function quickBooksSetupReadiness(connection, agencyGroups = []) {
  const accounts = list(connection?.accountsSnapshot);
  const mappings = connection?.accountingMappings && typeof connection.accountingMappings === 'object' ? connection.accountingMappings : {};
  const validation = validateQuickBooksMappings(mappings, accounts, connection?.classesSnapshot, connection?.locationsSnapshot, agencyGroups, connection?.itemsSnapshot);
  return { ready: !!connection?.referenceDataRefreshedAt && !!connection?.setupCompletedAt && validation.errors.length === 0, checks: [
    { id: 'connected', complete: connection?.status === 'active', label: 'QuickBooks company connected' },
    { id: 'accounts', complete: accounts.length > 0, label: 'Chart of accounts imported' },
    { id: 'mappings', complete: !!connection?.setupCompletedAt && validation.errors.length === 0, label: 'Mappings reviewed and saved' },
  ], errors: validation.errors };
}
