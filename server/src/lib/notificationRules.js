const DAY = 86400000;
export const NOTIFICATION_DEFAULTS = {
  inquiryEmailEnabled: true,
  inquiryReminderEnabled: true,
  invoiceRemindersEnabled: true,
  invoiceReminderRecipient: 'owner',
  invoiceFirstReminderDays: 3,
  invoiceDepositReminderDays: 7,
  invoiceRepeatDays: 7,
};
export function notificationSettings(saved = {}) {
  const result = { ...NOTIFICATION_DEFAULTS };
  for (const [key, fallback] of Object.entries(result)) {
    const value = saved?.[key];
    if (typeof fallback === 'boolean' && typeof value === 'boolean') result[key] = value;
    if (typeof fallback === 'number' && Number.isInteger(value) && value >= (key === 'invoiceRepeatDays' ? 1 : 0) && value <= 90) result[key] = value;
  }
  if (['owner', 'client', 'both'].includes(saved?.invoiceReminderRecipient)) result.invoiceReminderRecipient = saved.invoiceReminderRecipient;
  return result;
}
export function invoiceReminderStart(invoice, booking, settings) {
  if (!['sent', 'partial'].includes(invoice.status)) return null;
  if (booking && (booking.deletedAt || booking.bookingStatus === 'cancelled')) return null;
  const depositPaid = invoice.paidAmount > 0 || invoice.status === 'partial' || booking?.depositPaid;
  // A deposited booking without a balance due date must not get premature demands.
  if (depositPaid && !invoice.dueDate) return null;
  const base = new Date(invoice.dueDate || invoice.sentAt);
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + (invoice.dueDate
    ? -(depositPaid ? settings.invoiceDepositReminderDays : settings.invoiceFirstReminderDays)
    : settings.invoiceFirstReminderDays) * DAY);
}
export function nextInvoiceReminder(start, lastSentAt, repeatDays) {
  return new Date(Math.max(start.getTime(), lastSentAt ? new Date(lastSentAt).getTime() + repeatDays * DAY : 0));
}
