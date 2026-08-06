import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { getRsvpByToken, submitRsvp } from '../lib/guests';
import { formatPhoneNumber, formatEmailInput, formatEventDate, formatEventTime } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptyRsvpForm() {
  return { name: '', email: '', phone: '', attending: null, partySize: 1, notes: '' };
}

// Same pattern as InquiryFormPage.jsx's BusinessLogo/PoweredByFooter — this
// page is a guest's first (and only) impression of the business itself, not
// of GigWorks, so it shows the business's own branding, not the platform's.
function BusinessLogo({ businessInfo, className = 'h-12 w-auto' }) {
  const [failed, setFailed] = useState(false);
  if (businessInfo?.logo && !failed) {
    return <img src={businessInfo.logo} alt={businessInfo.name || ''} className={className} onError={() => setFailed(true)} />;
  }
  if (businessInfo?.name) {
    return <div className="text-lg font-bold text-slate-800">{businessInfo.name}</div>;
  }
  return null;
}

function PoweredByFooter() {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-slate-400">
      <span>Powered by</span>
      <Logo className="h-4 w-auto" />
    </div>
  );
}

function EventSummary({ event }) {
  if (!event) return null;
  const venueLine = [event.venue?.name, event.venue?.city && event.venue?.state ? `${event.venue.city}, ${event.venue.state}` : '']
    .filter(Boolean).join(' — ');
  return (
    <div className="mb-6 pb-6 border-b border-slate-100">
      {event.name && <div className="text-lg font-bold text-slate-800">{event.name}</div>}
      <div className="text-sm text-slate-500">
        {event.eventDate ? formatEventDate(event.eventDate) : ''}
        {(event.startTime || event.endTime) ? ` · ${formatEventTime(event.startTime)} – ${formatEventTime(event.endTime)}` : ''}
      </div>
      {venueLine && <div className="text-sm text-slate-500">{venueLine}</div>}
    </div>
  );
}

export default function RsvpPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyRsvpForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRsvpByToken(token)
      .then((data) => { if (!cancelled) setMeta(data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'This link is invalid.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!form.name.trim()) {
      setSubmitError('Your name is required.');
      return;
    }
    if (form.attending === null) {
      setSubmitError('Please let us know if you can make it.');
      return;
    }
    setSubmitting(true);
    try {
      await submitRsvp(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        attending: form.attending,
        partySize: form.attending ? form.partySize : 1,
        notes: form.notes.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Logo className="h-10 w-auto" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <Logo className="h-10 w-auto mx-auto mb-4" />
          <p data-testid="rsvp-form-load-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-4">
            <BusinessLogo businessInfo={meta?.businessInfo} />
          </div>
          <p data-testid="rsvp-form-thankyou-banner" className="text-sm text-slate-600">
            {form.attending
              ? `Thanks${form.name ? `, ${form.name}` : ''}! We've got you down for a party of ${form.partySize}.`
              : `Thanks for letting us know, ${form.name || 'there'} — you'll be missed!`}
          </p>
          <PoweredByFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-8">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl p-5 sm:p-8">
        <div className="mb-2">
          <BusinessLogo businessInfo={meta?.businessInfo} />
        </div>
        <p className="text-sm text-slate-500 mb-6">RSVP for {meta?.businessInfo?.name || 'this event'}</p>

        <EventSummary event={meta?.event} />

        <form onSubmit={handleSubmit} className="space-y-5">
          {submitError && <div data-testid="rsvp-form-submit-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</div>}

          <div>
            <label className={labelClass}>Your Name *</label>
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} data-testid="rsvp-form-name-input" className={inputClass} />
          </div>

          <div>
            <label className={`${labelClass} mb-2`}>Will you be attending? *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update('attending', true)}
                data-testid="rsvp-form-attending-yes-button"
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-semibold ${
                  form.attending === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Yes, I'll be there
              </button>
              <button
                type="button"
                onClick={() => update('attending', false)}
                data-testid="rsvp-form-attending-no-button"
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-semibold ${
                  form.attending === false ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Can't make it
              </button>
            </div>
          </div>

          {form.attending === true && (
            <div>
              <label className={labelClass}>Party Size</label>
              <input
                type="number"
                min="1"
                value={form.partySize}
                onChange={(e) => update('partySize', e.target.value === '' ? '' : Number(e.target.value))}
                data-testid="rsvp-form-partysize-input"
                className={`${inputClass} max-w-[8rem]`}
              />
              <p className="mt-1 text-xs text-slate-400">Including yourself — count everyone in your group.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => update('email', formatEmailInput(e.target.value))} data-testid="rsvp-form-email-input" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Phone (optional)</label>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', formatPhoneNumber(e.target.value))} data-testid="rsvp-form-phone-input" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <textarea
              rows={3}
              placeholder="Dietary restrictions, allergies, anything else we should know?"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              data-testid="rsvp-form-notes-textarea"
              className={inputClass}
            />
          </div>

          <SubmitButton loading={submitting} testId="rsvp-form-submit-button">Submit RSVP</SubmitButton>
        </form>

        <PoweredByFooter />
      </div>
    </div>
  );
}
