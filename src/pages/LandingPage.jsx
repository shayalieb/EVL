import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import { joinWaitlist, sendContactMessage } from '../lib/landing';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const PAIN_POINTS = [
  {
    title: 'Confirmed? Tentative? Ghosted?',
    problem: "Chasing contractors for a yes/no by text, with no single place to see who's actually locked in for Saturday.",
    fix: "Every contractor's status is tracked per event, and they can confirm or decline from a link on their own phone — no more guessing.",
  },
  {
    title: 'The stage plot lives in a different app than the gig.',
    problem: 'Building it separately, emailing it around, hoping it reaches the sound engineer before load-in.',
    fix: "A stage plot builder tied directly to the event and the real lineup booked on it — not a disconnected file.",
  },
  {
    title: 'Set lists get retyped for every gig.',
    problem: 'Copy-pasting the same songs into a new doc each time, then emailing a PDF with no real way to grab the sheet music.',
    fix: 'A saved set list library, pulled into any gig in one click, emailed with real downloadable links.',
  },
  {
    title: 'Deposits tracked in a notebook (or not at all).',
    problem: 'Proposals and contracts scattered across email threads, payments collected however works that week.',
    fix: 'E-sign proposals and contracts, invoicing with real payment collection — all attached to the booking itself.',
  },
  {
    title: "No idea what's actually at risk until it's too late.",
    problem: 'Realizing three days out that a client went quiet or a vendor never confirmed.',
    fix: 'A real dashboard and automatic reminders that surface it before it becomes a crisis, not after.',
  },
];

const FEATURE_GROUPS = [
  {
    title: 'For your clients',
    icon: '🤝',
    items: ['Inquiry-to-booking pipeline', 'Proposals with e-signature', 'Contracts with e-signature', 'Invoicing with built-in payments'],
  },
  {
    title: 'For your roster',
    icon: '🧰',
    items: ['Contractor roster & availability', 'Per-event confirm/decline tracking', 'A home-screen link every contractor can check themselves'],
  },
  {
    title: 'For the day of',
    icon: '🎵',
    items: ['Stage plots', 'Set lists with email + PDF export', 'Floor plans', 'Prep sheets & crew schedules'],
  },
];

function FieldError({ children }) {
  if (!children) return null;
  return <p className="text-xs text-red-600">{children}</p>;
}

export default function LandingPage() {
  const [waitlistForm, setWaitlistForm] = useState({ name: '', email: '', businessName: '' });
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');
  const [waitlistDone, setWaitlistDone] = useState(false);

  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactDone, setContactDone] = useState(false);

  async function handleWaitlistSubmit(e) {
    e.preventDefault();
    setWaitlistError('');
    if (!waitlistForm.name.trim() || !waitlistForm.email.trim()) {
      setWaitlistError('Name and email are required.');
      return;
    }
    setWaitlistSubmitting(true);
    try {
      await joinWaitlist(waitlistForm);
      setWaitlistDone(true);
    } catch (err) {
      setWaitlistError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setWaitlistSubmitting(false);
    }
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    setContactError('');
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactError('Name, email, and a short message are required.');
      return;
    }
    setContactSubmitting(true);
    try {
      await sendContactMessage(contactForm);
      setContactDone(true);
    } catch (err) {
      setContactError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setContactSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo className="h-8 w-auto" />
          <Link to="/auth" data-testid="landing-login-link" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Log In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-4">
          For bands, DJs &amp; orchestras booking out a roster
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 leading-tight max-w-3xl mx-auto">
          Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.
        </h1>
        <p className="mt-5 text-lg text-slate-500 max-w-2xl mx-auto">
          GigWorks is the business software for entertainment agencies and bandleaders who book out multiple
          musicians — proposals, contracts, and invoicing for your clients, plus the day-of details (stage plots,
          set lists, floor plans) connected to who's actually on the gig.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a href="#waitlist" data-testid="landing-hero-waitlist-link" className="px-6 py-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            Get Waitlisted
          </a>
          <a href="#contact" data-testid="landing-hero-contact-link" className="px-6 py-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
            Get in Touch
          </a>
        </div>
      </section>

      {/* Founder story */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-4">Built from the gig, not a guess</h2>
          <p className="text-lg text-slate-700 leading-relaxed">
            I've been a gigging musician for over 20 years — playing my own gigs, working for other bandleaders and
            offices, and staffing musicians out to weddings and events booked through agencies. I've been on every
            side of this business: the player waiting to hear if a gig is actually confirmed, the bandleader chasing
            five people for a stage plot two days before a wedding, and the office trying to keep a whole roster
            straight through a busy season.
          </p>
          <p className="mt-4 text-lg text-slate-700 leading-relaxed">
            GigWorks is what I wished existed the entire time. Every feature in it came from a real pain point I've
            personally run into over two decades of doing this work — not a guess at what musicians need from someone
            who's never had to load in at 4pm and be ready by 6.
          </p>
        </div>
      </section>

      {/* Pain points */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center">Sound familiar?</h2>
        <p className="text-slate-500 text-center mt-2 mb-10 max-w-xl mx-auto">
          These aren't hypothetical problems — they're what running an entertainment business actually feels like
          without the right tools.
        </p>
        <div className="space-y-4">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} data-testid="landing-pain-point" className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-base">{p.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{p.problem}</p>
              <div className="mt-3 flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
                <span aria-hidden="true">→</span>
                <span>{p.fix}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature groups */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">One place for the whole gig</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title} data-testid="landing-feature-group" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="text-2xl mb-2">{g.icon}</div>
                <h3 className="font-semibold text-slate-800 mb-3">{g.title}</h3>
                <ul className="space-y-1.5 text-sm text-slate-500">
                  {g.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-indigo-500 mt-0.5" aria-hidden="true">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist + Contact */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div id="waitlist" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm scroll-mt-6">
            <h2 className="text-xl font-bold text-slate-900">Get Waitlisted</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              GigWorks is currently onboarding a small first group of agencies and bandleaders directly. Join the
              waitlist and I'll reach out personally.
            </p>
            {waitlistDone ? (
              <p data-testid="landing-waitlist-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-3">
                You're on the list — thanks for the interest. I'll be in touch soon.
              </p>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                <input
                  required placeholder="Your name" value={waitlistForm.name}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="landing-waitlist-name-input" className={inputClass}
                />
                <input
                  required type="email" placeholder="Email address" value={waitlistForm.email}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, email: e.target.value }))}
                  data-testid="landing-waitlist-email-input" className={inputClass}
                />
                <input
                  placeholder="Business or band name (optional)" value={waitlistForm.businessName}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, businessName: e.target.value }))}
                  data-testid="landing-waitlist-business-input" className={inputClass}
                />
                <FieldError>{waitlistError}</FieldError>
                <SubmitButton loading={waitlistSubmitting} testId="landing-waitlist-submit-button">
                  Join the Waitlist
                </SubmitButton>
              </form>
            )}
          </div>

          <div id="contact" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm scroll-mt-6">
            <h2 className="text-xl font-bold text-slate-900">Get in Touch</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              Have a question, or want to talk through whether this fits how your business runs? Send a message
              directly.
            </p>
            {contactDone ? (
              <p data-testid="landing-contact-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-3">
                Got it — thanks for reaching out. I'll reply personally as soon as I can.
              </p>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3">
                <input
                  required placeholder="Your name" value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="landing-contact-name-input" className={inputClass}
                />
                <input
                  required type="email" placeholder="Email address" value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  data-testid="landing-contact-email-input" className={inputClass}
                />
                <textarea
                  required rows={3} placeholder="What's on your mind?" value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  data-testid="landing-contact-message-textarea" className={inputClass}
                />
                <FieldError>{contactError}</FieldError>
                <SubmitButton loading={contactSubmitting} testId="landing-contact-submit-button">
                  Send Message
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Logo className="h-6 w-auto" />
          <p className="text-xs text-slate-400">GigWorks — built for the gig.</p>
        </div>
      </footer>
    </div>
  );
}
