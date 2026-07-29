import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { getInquiryByToken, submitInquiry } from '../lib/inquiryLinks';
import { formatPhoneNumber, formatEmailInput } from '../lib/format';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptyInquiryForm() {
  return {
    firstName: '', lastName: '', phone: '', email: '',
    eventDate: '', eventType: '',
    brideName: '', groomName: '',
    venueName: '', address1: '', address2: '', venueContactName: '', venueContactEmail: '',
  };
}

export default function InquiryFormPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyInquiryForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInquiryByToken(token)
      .then((data) => { if (!cancelled) setMeta(data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'This link is invalid or has already been used.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.eventDate) {
      setSubmitError('First name, last name, and date of event are required.');
      return;
    }
    setSubmitting(true);
    try {
      await submitInquiry(token, form);
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
          <p data-testid="inquiry-form-load-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
          <Logo className="h-10 w-auto mx-auto mb-4" />
          <p data-testid="inquiry-form-thankyou-banner" className="text-sm text-slate-600">
            Thanks{form.firstName ? `, ${form.firstName}` : ''}! {meta?.businessInfo?.name || 'We'} will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <Logo className="h-10 w-auto mb-2" />
        <p className="text-sm text-slate-500 mb-6">Tell {meta?.businessInfo?.name || 'us'} about your event</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && <div data-testid="inquiry-form-submit-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</div>}

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Your Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First Name *</label>
                <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} data-testid="inquiry-form-firstname-input" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} data-testid="inquiry-form-lastname-input" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="(555) 555-0100"
                  value={form.phone}
                  onChange={(e) => update('phone', formatPhoneNumber(e.target.value))}
                  data-testid="inquiry-form-phone-input"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', formatEmailInput(e.target.value))}
                  data-testid="inquiry-form-email-input"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Event Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date of Event *</label>
                <input required type="date" value={form.eventDate} onChange={(e) => update('eventDate', e.target.value)} data-testid="inquiry-form-eventdate-input" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Event Type</label>
                <select value={form.eventType} onChange={(e) => update('eventType', e.target.value)} data-testid="inquiry-form-eventtype-select" className={inputClass}>
                  <option value="">Select a type…</option>
                  {(meta?.eventTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Bride's Name</label>
                <input value={form.brideName} onChange={(e) => update('brideName', e.target.value)} data-testid="inquiry-form-bridename-input" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Groom's Name</label>
                <input value={form.groomName} onChange={(e) => update('groomName', e.target.value)} data-testid="inquiry-form-groomname-input" className={inputClass} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Location Info</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Name of Venue</label>
                <input value={form.venueName} onChange={(e) => update('venueName', e.target.value)} data-testid="inquiry-form-venuename-input" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Address 1</label>
                  <input value={form.address1} onChange={(e) => update('address1', e.target.value)} data-testid="inquiry-form-address1-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Address 2</label>
                  <input value={form.address2} onChange={(e) => update('address2', e.target.value)} data-testid="inquiry-form-address2-input" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Venue Contact</label>
                  <input value={form.venueContactName} onChange={(e) => update('venueContactName', e.target.value)} data-testid="inquiry-form-venuecontactname-input" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Venue Email</label>
                  <input
                    type="email"
                    value={form.venueContactEmail}
                    onChange={(e) => update('venueContactEmail', formatEmailInput(e.target.value))}
                    data-testid="inquiry-form-venuecontactemail-input"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          <SubmitButton loading={submitting} testId="inquiry-form-submit-button">Submit</SubmitButton>
        </form>
      </div>
    </div>
  );
}
