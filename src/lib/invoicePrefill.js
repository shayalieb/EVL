import { computeOfferingsTotal } from './offerings';
import { contractReference } from './documentReferences';
import { formatVenueLine } from './format';

const money = (amount) => `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Invoice drafts use the signed document's frozen terms, rather than a booking
// or proposal that may have been edited since the client signed.
export function invoiceContextFromContract(contract, booking, client, businessInfo) {
  const snapshot = contract?.snapshot || {};
  const signedBooking = snapshot.booking || {};
  const signedClient = snapshot.client || {};
  const offerings = snapshot.offerings || [];
  const legacyItems = (snapshot.lineItems || []).map((item) => ({
    id: item.id || crypto.randomUUID(), name: item.name || 'Service', details: item.details || '',
    type: 'general', amount: Number(item.amount) || 0,
  }));
  const lineItems = [...legacyItems, ...offerings];
  const total = legacyItems.reduce((sum, item) => sum + item.amount, 0) + computeOfferingsTotal(offerings);
  const reference = contract ? contractReference(contract) : '';
  const event = {
    type: signedBooking.eventType || booking?.eventType || '',
    date: signedBooking.eventDate || booking?.eventDate || '',
    venue: formatVenueLine(signedBooking.venue || booking?.venue),
  };
  const recipientName = contract?.recipientName || [signedClient.firstName, signedClient.lastName].filter(Boolean).join(' ') || [client?.firstName, client?.lastName].filter(Boolean).join(' ');
  const recipientEmail = contract?.recipientEmail || signedClient.email || client?.email || '';
  const eventName = booking?.eventName || event.type || 'the event';
  const coveredItems = lineItems.map((item) => item.name).filter(Boolean).join(', ');
  return {
    businessInfo: snapshot.businessInfo || businessInfo,
    client: { ...signedClient, firstName: signedClient.firstName || client?.firstName || '', lastName: signedClient.lastName || client?.lastName || '', email: signedClient.email || recipientEmail },
    event, recipientName, recipientEmail, eventName, lineItems, total, reference,
    coveredItems, depositAmount: Number(signedBooking.depositAmount ?? booking?.depositAmount) || 0,
    depositDueDate: signedBooking.depositDueDate || booking?.depositDueDate || '',
  };
}

export function invoicePreset(context, kind, alreadyInvoiced = 0) {
  const prefix = context.reference ? `Contract #${context.reference}` : 'the event agreement';
  const occasion = [context.eventName, context.event.date].filter(Boolean).join(' · ');
  const coverage = context.coveredItems ? `Covers: ${context.coveredItems}.` : '';
  if (kind === 'deposit') {
    const amount = Math.min(context.depositAmount, Math.max(context.total - alreadyInvoiced, 0));
    return {
      lineItems: [{ id: crypto.randomUUID(), name: 'Deposit toward event services', details: `${prefix} · ${occasion}. ${coverage} Contract total ${money(context.total)}; this deposit is credited toward that total.`, type: 'general', amount }],
      dueDate: context.depositDueDate,
      memo: `Deposit toward ${prefix} for ${occasion}. The deposit is part of the ${money(context.total)} contract total, not an additional charge.`,
    };
  }
  if (kind === 'final') {
    const amount = Math.max(context.total - alreadyInvoiced, 0);
    return {
      lineItems: [{ id: crypto.randomUUID(), name: 'Remaining contract balance', details: `${prefix} · ${occasion}. ${coverage} Contract total ${money(context.total)} less ${money(alreadyInvoiced)} previously invoiced.`, type: 'general', amount }],
      dueDate: '', memo: `Remaining balance for ${prefix} for ${occasion}.`,
    };
  }
  return {
    lineItems: context.lineItems,
    dueDate: '', memo: `Event services under ${prefix} for ${occasion}.`,
  };
}
