export function checkoutSessionMatchesInvoice(session, invoice) {
  return !!session
    && session.id === invoice.stripeCheckoutSessionId
    && session.metadata?.invoiceId === invoice.id;
}

export function paidCheckoutSessionMatchesInvoice(session, invoice) {
  return session?.payment_status === 'paid' && checkoutSessionMatchesInvoice(session, invoice);
}
