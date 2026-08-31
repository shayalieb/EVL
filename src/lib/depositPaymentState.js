export function depositPaymentState({ amount, bookingPaid = false, invoices = [] } = {}) {
  const depositAmount = Math.max(0, Number(amount) || 0);
  const collectedFromInvoices = invoices
    .filter((invoice) => invoice?.status !== 'void')
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice?.paidAmount) || 0), 0);
  const paidViaInvoices = depositAmount > 0 && collectedFromInvoices + 0.005 >= depositAmount;
  return {
    paid: !!bookingPaid || paidViaInvoices,
    paidViaInvoices,
    collectedFromInvoices,
  };
}
