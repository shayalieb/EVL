function normalized(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }
function digits(value) { return String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); }

export function quickBooksCustomerCandidate(client, customer) {
  const clientName = normalized(`${client.firstName} ${client.lastName}`);
  const customerName = normalized(customer.DisplayName || `${customer.GivenName || ''} ${customer.FamilyName || ''}`);
  const emailExact = !!client.email && normalized(client.email) === normalized(customer.PrimaryEmailAddr?.Address);
  const phoneExact = !!client.phone && digits(client.phone) === digits(customer.PrimaryPhone?.FreeFormNumber);
  const nameExact = !!clientName && clientName === customerName;
  const nameSimilar = !!clientName && !!customerName && (clientName.includes(customerName) || customerName.includes(clientName));
  const score = emailExact ? 100 : phoneExact ? 95 : nameExact ? 85 : nameSimilar ? 60 : 0;
  return { id: String(customer.Id), displayName: customer.DisplayName || customerName, email: customer.PrimaryEmailAddr?.Address || null, phone: customer.PrimaryPhone?.FreeFormNumber || null, score, reasons: { emailExact, phoneExact, nameExact, nameSimilar } };
}

export function quickBooksCustomerPayload(client) {
  const displayName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
  return {
    DisplayName: displayName,
    GivenName: client.firstName || undefined,
    FamilyName: client.lastName || undefined,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.address1 ? { Line1: client.address1, Line2: client.address2 || undefined, City: client.city || undefined, CountrySubDivisionCode: client.state || undefined, PostalCode: client.zip || undefined } : undefined,
  };
}

export function quickBooksVendorCandidate(contractor, vendor) {
  const contractorName = normalized(`${contractor.firstName} ${contractor.lastName}`);
  const vendorName = normalized(vendor.DisplayName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`);
  const emailExact = !!contractor.email && normalized(contractor.email) === normalized(vendor.PrimaryEmailAddr?.Address);
  const phoneExact = !!contractor.phone && digits(contractor.phone) === digits(vendor.PrimaryPhone?.FreeFormNumber);
  const nameExact = !!contractorName && contractorName === vendorName;
  const nameSimilar = !!contractorName && !!vendorName && (contractorName.includes(vendorName) || vendorName.includes(contractorName));
  const score = emailExact ? 100 : phoneExact ? 95 : nameExact ? 85 : nameSimilar ? 60 : 0;
  return { id: String(vendor.Id), displayName: vendor.DisplayName || vendorName, email: vendor.PrimaryEmailAddr?.Address || null, phone: vendor.PrimaryPhone?.FreeFormNumber || null, score, reasons: { emailExact, phoneExact, nameExact, nameSimilar } };
}

export function quickBooksVendorPayload(contractor) {
  const displayName = `${contractor.firstName || ''} ${contractor.lastName || ''}`.trim();
  return {
    DisplayName: displayName,
    GivenName: contractor.firstName || undefined,
    MiddleName: contractor.middleName || undefined,
    FamilyName: contractor.lastName || undefined,
    PrimaryEmailAddr: contractor.email ? { Address: contractor.email } : undefined,
    PrimaryPhone: contractor.phone ? { FreeFormNumber: contractor.phone } : undefined,
  };
}

export function contractorBillEligibility({ assignment, inquiryStatus, amount }) {
  const label = String(inquiryStatus?.label || '').toLowerCase();
  const confirmed = inquiryStatus?.isConfirmed === true || /confirm|booked|accepted/.test(label);
  if (!confirmed) return { eligible: false, reason: 'Contractor is not confirmed for this gig.' };
  if (!Number.isFinite(amount) || amount <= 0) return { eligible: false, reason: 'Add a valid contractor rate before creating the bill.' };
  if (!assignment?.contractorId) return { eligible: false, reason: 'This assignment has no contractor.' };
  return { eligible: true, reason: null };
}

export function contractorBillLocalId(eventId, assignment) {
  return `${eventId}:${assignment.id || assignment.contractorId}`;
}

export function quickBooksBillPayload({ event, assignment, contractor, vendorId, expenseAccountId, accountsPayableId, amount, groupReference }) {
  const schedule = [assignment.startTime, assignment.endTime].filter(Boolean).join('–');
  const description = [`${contractor.firstName || ''} ${contractor.lastName || ''}`.trim(), event.name || 'Gig', schedule].filter(Boolean).join(' — ');
  const expenseDetail = { AccountRef: { value: expenseAccountId }, ...(groupReference?.type === 'class' ? { ClassRef: { value: groupReference.id } } : {}) };
  return {
    VendorRef: { value: vendorId },
    TxnDate: isoDate(event.eventDate || event.createdAt),
    DueDate: isoDate(assignment.paymentDueDate || event.eventDate),
    APAccountRef: accountsPayableId ? { value: accountsPayableId } : undefined,
    PrivateNote: `GigWorks contractor assignment: ${event.name || event.id}`,
    Line: [{ Amount: Number(Number(amount).toFixed(2)), Description: description, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: expenseDetail }],
    ...(groupReference?.type === 'location' ? { DepartmentRef: { value: groupReference.id } } : {}),
  };
}

function isoDate(value) { return value ? new Date(value).toISOString().slice(0, 10) : undefined; }

export function quickBooksInvoicePayload({ invoice, customerId, serviceItemId, booking, groupReference }) {
  const lines = (invoice.snapshot?.lineItems || []).map((item) => {
    const quantity = item.type === 'perUnit' ? Number(item.unitCount) || 1 : 1;
    const amount = item.type === 'perUnit' ? quantity * (Number(item.ratePerUnit) || 0) : Number(item.amount) || 0;
    return { Amount: Number(amount.toFixed(2)), Description: [item.name, item.details].filter(Boolean).join(' — ') || 'Gig services', DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: serviceItemId }, Qty: quantity, UnitPrice: Number((amount / quantity).toFixed(2)), ...(groupReference?.type === 'class' ? { ClassRef: { value: groupReference.id } } : {}) } };
  }).filter((line) => line.Amount > 0);
  return { CustomerRef: { value: customerId }, DocNumber: invoice.number ? String(invoice.number) : undefined, TxnDate: isoDate(invoice.sentAt || invoice.createdAt), DueDate: isoDate(invoice.dueDate), PrivateNote: invoice.memo || undefined, Line: lines, ...(groupReference?.type === 'location' ? { DepartmentRef: { value: groupReference.id } } : {}), ...(booking?.eventName ? { CustomerMemo: { value: booking.eventName } } : {}) };
}

export function quickBooksPaymentPayload({ transaction, customerId, quickBooksInvoiceId }) {
  const amount = Number((Math.abs(transaction.amountCents) / 100).toFixed(2));
  return {
    CustomerRef: { value: customerId },
    TxnDate: isoDate(transaction.occurredAt),
    TotalAmt: amount,
    PaymentRefNum: transaction.reference || undefined,
    PrivateNote: transaction.memo || transaction.description || undefined,
    Line: [{ Amount: amount, LinkedTxn: [{ TxnId: quickBooksInvoiceId, TxnType: 'Invoice' }] }],
  };
}

export function paymentSyncEligibility(transaction) {
  if (!transaction?.invoiceId) return { eligible: false, reason: 'Payment is not linked to an invoice.' };
  if (transaction.category !== 'client_payment' || transaction.amountCents <= 0 || transaction.reversalOfId) return { eligible: false, reason: 'Correction or reversal requires manual reconciliation.' };
  return { eligible: true, reason: null };
}
