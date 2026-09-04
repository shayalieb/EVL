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

function isoDate(value) { return value ? new Date(value).toISOString().slice(0, 10) : undefined; }

export function quickBooksInvoicePayload({ invoice, customerId, serviceItemId, booking, groupReference }) {
  const lines = (invoice.snapshot?.lineItems || []).map((item) => {
    const quantity = item.type === 'perUnit' ? Number(item.unitCount) || 1 : 1;
    const amount = item.type === 'perUnit' ? quantity * (Number(item.ratePerUnit) || 0) : Number(item.amount) || 0;
    return { Amount: Number(amount.toFixed(2)), Description: [item.name, item.details].filter(Boolean).join(' — ') || 'Gig services', DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: serviceItemId }, Qty: quantity, UnitPrice: Number((amount / quantity).toFixed(2)), ...(groupReference?.type === 'class' ? { ClassRef: { value: groupReference.id } } : {}) } };
  }).filter((line) => line.Amount > 0);
  return { CustomerRef: { value: customerId }, DocNumber: invoice.number ? String(invoice.number) : undefined, TxnDate: isoDate(invoice.sentAt || invoice.createdAt), DueDate: isoDate(invoice.dueDate), PrivateNote: invoice.memo || undefined, Line: lines, ...(groupReference?.type === 'location' ? { DepartmentRef: { value: groupReference.id } } : {}), ...(booking?.eventName ? { CustomerMemo: { value: booking.eventName } } : {}) };
}
