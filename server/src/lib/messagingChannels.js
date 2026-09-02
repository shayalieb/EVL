export const MESSAGING_CHANNELS = Object.freeze({
  email: { enabled: true, provider: 'resend' },
  sms: { enabled: false, provider: null, unavailableReason: 'coming_soon' },
  whatsapp: { enabled: false, provider: null, unavailableReason: 'coming_soon' },
});

export const DELIVERY_STATUSES = new Set(['queued', 'sent', 'delivered', 'failed', 'received']);

// Provider adapters will implement this contract when messaging is enabled.
// Keeping it provider-neutral prevents the contact history and UI from being
// coupled to Twilio or any other vendor.
export function disabledMessagingAdapter(channel) {
  return {
    channel,
    enabled: false,
    async send() {
      throw Object.assign(new Error(`${channel} messaging is not enabled.`), { status: 503, code: 'MESSAGING_NOT_ENABLED' });
    },
  };
}
