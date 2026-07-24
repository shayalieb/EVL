import { apiFetch } from '../context/AuthContext';

export async function listInvoices(bookingId) {
  const data = await apiFetch(`/invoices?bookingId=${encodeURIComponent(bookingId)}`);
  return data.invoices;
}

export async function createInvoice({ bookingId, recipientEmail, recipientName, snapshot, dueDate, memo, number }) {
  const data = await apiFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot, dueDate, memo, number }),
  });
  return data.invoice;
}

// The number/memo a new invoice's composer should start from — the
// account's running sequence and sticky footer memo, carried forward until
// edited (see POST / and PATCH /:id, which advance/update them).
export async function getNextInvoiceInfo() {
  return apiFetch('/invoices/next-number');
}

// Only works while the invoice is still a draft — locked once sent.
export async function updateInvoice(invoiceId, patch) {
  const data = await apiFetch(`/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.invoice;
}

export async function sendInvoice(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}/send`, { method: 'POST' });
}

// Manual payment-status override (open/partially paid/paid) for money
// collected outside Stripe — see server/src/routes/invoices.js's
// POST /:id/mark-payment for the source-status rules.
export async function markInvoicePayment(invoiceId, { status, paidAmount } = {}) {
  const data = await apiFetch(`/invoices/${invoiceId}/mark-payment`, {
    method: 'POST',
    body: JSON.stringify({ status, paidAmount }),
  });
  return data.invoice;
}

// Only meaningful once status is 'paid' — see the server route for the gate.
export async function sendReceipt(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}/send-receipt`, { method: 'POST' });
}

export async function voidInvoice(invoiceId) {
  const data = await apiFetch(`/invoices/${invoiceId}/void`, { method: 'POST' });
  return data.invoice;
}

// ---- Public (unauthenticated, token-based — used by InvoicePayPage) ----

export async function viewInvoiceByToken(token, email, sessionId) {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const data = await apiFetch(`/invoice-pay/${encodeURIComponent(token)}/view${query}`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.invoice;
}

export async function startInvoiceCheckout(token, email) {
  const data = await apiFetch(`/invoice-pay/${encodeURIComponent(token)}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data.url;
}
