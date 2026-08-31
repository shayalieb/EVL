export function contractorCalendarPaymentInfo(booking, expectedAmount, timing = {}) {
  const isPaid = booking?.paymentStatus === 'paid';
  return {
    paymentStatus: isPaid ? 'paid' : 'unpaid',
    expectedAmount: expectedAmount === null || expectedAmount === undefined ? null : expectedAmount,
    paymentDueDate: timing.effectiveDueDate || null,
    paymentDueDateIsDefault: !!timing.dueDateIsDefault,
    paidAmount: isPaid ? (booking.paidAmount ?? expectedAmount ?? null) : null,
    paidAt: isPaid ? (booking.paidAt ?? null) : null,
    paymentMethod: isPaid ? (booking.paymentMethod ?? null) : null,
    paymentReference: isPaid ? (booking.paymentReference ?? null) : null,
  };
}
