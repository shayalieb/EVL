import { apiFetch } from '../context/AuthContext';

export async function listInvoices(bookingId) {
  const data = await apiFetch(`/invoices?bookingId=${encodeURIComponent(bookingId)}`);
  return data.invoices;
}

export async function createInvoice({ bookingId, recipientEmail, recipientName, snapshot, dueDate, memo }) {
  const data = await apiFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify({ bookingId, recipientEmail, recipientName, snapshot, dueDate, memo }),
  });
  return data.invoice;
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
