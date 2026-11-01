// An invoice that is not paid online still has to tell the client how to pay. The owner's payment
// instructions (Settings > Business Info) are used when set; otherwise the client is pointed at the
// business's own contact details, so the invoice is never a total with no way to settle it.
export function offlinePaymentText(businessInfo) {
  const instructions = (businessInfo?.paymentInstructions || '').trim();
  if (instructions) return instructions;
  const contact = [businessInfo?.email, businessInfo?.phone].filter(Boolean).join(' or ');
  return `Please contact ${businessInfo?.name || 'the sender'}${contact ? ` at ${contact}` : ''} to arrange payment.`;
}

// Shown only while there is still something to pay and online payment is off.
export function showsOfflinePayment({ acceptPayment, status }) {
  return acceptPayment === false && (status === 'sent' || status === 'partial');
}
