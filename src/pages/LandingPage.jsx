import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import LandingDashboardPreview from '../components/LandingDashboardPreview';
import { ClientsPipelinePreview, RosterConfirmPreview, DayOfPreview, StayOnTopPreview } from '../components/LandingFeaturePreviews';
import { FileIcon, UsersIcon, ClipboardIcon, BellIcon, ChevronDownIcon } from '../components/ui/icons';
import { joinWaitlist, sendContactMessage } from '../lib/landing';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const PUBLIC_SIGNUPS_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === 'true';

const PRICING_TIERS = [
  { id: 'solo', name: 'Solo', seats: '1 team member', monthly: 25, annualMonthly: 20, annualTotal: 240, description: 'For independent bandleaders and performers running their own calendar.' },
  { id: 'team', name: 'Team', seats: 'Up to 2 team members', monthly: 45, annualMonthly: 38, annualTotal: 456, description: 'For small teams sharing bookings, staffing, and client follow-up.', featured: true },
  { id: 'studio', name: 'Studio', seats: 'Up to 5 team members', monthly: 89, annualMonthly: 75, annualTotal: 900, description: 'For growing entertainment companies coordinating multiple people.' },
];

const INCLUDED_FEATURES = [
  'Unlimited clients, bookings, and events',
  'Proposals, e-sign contracts, and invoices',
  'Contractor confirmations and availability',
  'Stage plots, set lists, and production details',
  'Templates, reminders, and client payment tools',
];

const PAIN_POINTS = [
  {
    title: 'Confirmed? Tentative? Ghosted?',
    problem: "Chasing contractors for a yes/no by text, with no single place to see who's actually locked in for Saturday.",
    fix: "Every contractor's status is tracked per event, and they can confirm or decline from a link on their own phone — no more guessing.",
  },
  {
    title: 'The same quartet, rebuilt from scratch every single gig.',
    problem: 'Adding the same trio or quartet to the roster one contractor at a time, for every wedding they play.',
    fix: "Save it once as an Ensemble — add the whole group to any event's roster in one click, priced as a flat package or the sum of each member's own rate.",
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
    fix: 'Clients accept proposals and e-sign contracts online, invoicing with real payment collection — all attached to the booking itself.',
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
    Icon: FileIcon,
    Preview: ClientsPipelinePreview,
    items: ['Inquiry-to-booking pipeline', 'Proposals your client accepts online', 'Contracts with e-signature', 'Invoicing with built-in Stripe payments'],
  },
  {
    title: 'For your roster',
    Icon: UsersIcon,
    Preview: RosterConfirmPreview,
    items: ['Contractor roster & availability', 'Per-event confirm/decline tracking', 'Ensembles — save a group once, add its whole lineup in one click', 'A home-screen link every contractor can check themselves'],
  },
  {
    title: 'For the day of',
    Icon: ClipboardIcon,
    Preview: DayOfPreview,
    items: ['Stage plots with a live drag-and-drop canvas', 'Set lists with email + PDF export', 'Backline & production lists', 'Prep sheets & crew schedules'],
  },
  {
    title: 'For staying on top of it',
    Icon: BellIcon,
    Preview: StayOnTopPreview,
    items: ['A dashboard that surfaces what actually needs attention', 'Automatic alerts for at-risk events and overdue invoices', 'Email templates with merge fields for real event details', 'Manual reminders tied to any client or contractor'],
  },
];

const NAV_LINKS = [
  { href: '#story', label: 'Story' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

// Ordered most-critical-to-this-industry first: whether it's even for you,
// then the day-to-day roster/money/legal questions a bandleader or agency
// actually loses sleep over, ending with the least urgent (cost/access).
const FAQS = [
  {
    q: 'Who is GigWorks actually built for?',
    a: "Bands, DJs, orchestras, and the agencies or bandleaders who book them out — anyone staffing more than one musician against a calendar of gigs. If you're assembling a roster for each event rather than just showing up yourself, this is built around that specific problem.",
  },
  {
    q: 'How do my musicians confirm or decline a gig without me chasing them down?',
    a: "Every contractor gets their own gig calendar link — a bookmarkable page showing just their own upcoming gigs, no app account or login required. They can accept or decline right from their phone, and their status updates on your roster the moment they do.",
  },
  {
    q: "What happens if I need to swap a musician after the contract's already signed?",
    a: 'A signed contract lists an ensemble by instrumentation — "Sax, Drums, Keys" — never the specific musicians\' names. Swapping a player for a gig later never contradicts what the client actually agreed to.',
  },
  {
    q: 'Is the client-facing proposal and contract actually legally binding?',
    a: "The proposal is something a client reviews and accepts (or sends back with requested changes) — it's a decision, not a signature. The contract is the real e-signature step: both sides draw a signature and type a legal name, and an Electronic Signature Consent clause citing the U.S. E-SIGN Act is included automatically.",
  },
  {
    q: 'How does getting paid actually work — does GigWorks touch the money?',
    a: "Invoices are paid directly into your own bank account through Stripe Connect — GigWorks never touches the money. If a client pays outside the app instead (check, cash), you log that manually and it's tracked the same way.",
  },
  {
    q: 'Do I have to run every gig through the full proposal-and-contract pipeline?',
    a: "No. That pipeline is there for a formal booking with a paper trail, but you can also add an event directly for a one-off or word-of-mouth gig with no sales process attached at all.",
  },
  {
    q: 'When can I start using it, and what does it cost?',
    a: PUBLIC_SIGNUPS_ENABLED
      ? 'You can start with a 14-day free trial. Solo is $25/month, Team is $45/month, and Studio is $89/month, with lower effective monthly prices when billed annually. Cancel anytime.'
      : 'GigWorks is currently onboarding a small first group directly. Plans are Solo at $25/month, Team at $45/month, and Studio at $89/month, with annual savings. Join the waitlist and we’ll let you know when public signup opens.',
  },
];

function signupHref(plan = 'team', interval = 'month') {
  return `/auth?mode=signup&plan=${plan}&interval=${interval}`;
}

function FieldError({ children }) {
  if (!children) return null;
  return <p className="text-xs text-red-600">{children}</p>;
}

function FAQItem({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="landing-faq-question"
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="font-semibold text-slate-800 text-sm sm:text-base">{q}</span>
        <ChevronDownIcon className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <p data-testid="landing-faq-answer" className="text-sm text-slate-500 leading-relaxed pb-4 pr-8">
          {a}
        </p>
      )}
    </div>
  );
}

// Fades a section up into place the first time it scrolls into view — skips
// straight to visible (no observer, no motion) for anyone with reduced
// motion set, rather than just running the animation anyway.
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [pricingInterval, setPricingInterval] = useState('year');

  // Scoped to this page only (not a global app-wide CSS change) — added on
  // mount, removed on unmount, so an in-page "#waitlist" jump glides instead
  // of cutting, without affecting scroll behavior anywhere else in the app.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    document.documentElement.classList.add('scroll-smooth');
    return () => document.documentElement.classList.remove('scroll-smooth');
  }, []);

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
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo className="h-8 w-auto" />
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href} href={l.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden sm:flex items-center gap-4">
            <Link to="/auth" data-testid="landing-login-link" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
              Log In
            </Link>
            {PUBLIC_SIGNUPS_ENABLED ? (
              <Link to={signupHref()} data-testid="landing-nav-signup-link" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Start Free Trial</Link>
            ) : (
              <a href="#waitlist" data-testid="landing-nav-waitlist-link" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Join Waitlist</a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            data-testid="landing-mobile-menu-button"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="sm:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
              {mobileMenuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-100 px-4 py-3 space-y-1 bg-white">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {l.label}
              </a>
            ))}
            <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              Log In
            </Link>
            {PUBLIC_SIGNUPS_ENABLED ? (
              <Link to={signupHref()} onClick={() => setMobileMenuOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Start Free Trial</Link>
            ) : (
              <a href="#waitlist" onClick={() => setMobileMenuOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Join Waitlist</a>
            )}
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-950 via-indigo-900 to-white">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute left-1/2 top-[-8rem] w-[46rem] h-[46rem] -translate-x-1/2 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="absolute right-[-10rem] top-[2rem] w-[28rem] h-[28rem] rounded-full bg-fuchsia-400/10 blur-3xl" />
          <div className="absolute left-[-8rem] top-[10rem] w-[24rem] h-[24rem] rounded-full bg-indigo-300/10 blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-0 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300 mb-4">
            For bands, DJs &amp; orchestras booking out a roster
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.
          </h1>
          <p className="mt-5 text-lg text-indigo-200 max-w-2xl mx-auto">
            GigWorks is the business software for entertainment agencies and bandleaders who book out multiple
            musicians — proposals, contracts, and invoicing for your clients, plus the day-of details (stage plots,
            set lists, backline lists) connected to who's actually on the gig.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            {PUBLIC_SIGNUPS_ENABLED ? (
              <Link to={signupHref()} data-testid="landing-hero-signup-link" className="px-6 py-3 rounded-lg bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50">Start 14-Day Free Trial</Link>
            ) : (
              <a href="#waitlist" data-testid="landing-hero-waitlist-link" className="px-6 py-3 rounded-lg bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50">Join Waitlist</a>
            )}
            <a href="#contact" data-testid="landing-hero-contact-link" className="px-6 py-3 rounded-lg border border-white/30 text-white text-sm font-semibold hover:bg-white/10">
              Get in Touch
            </a>
          </div>
          <div className="mt-14 max-w-2xl mx-auto pb-16 sm:pb-24">
            <LandingDashboardPreview />
          </div>
        </div>
      </section>

      {/* Founder story */}
      <section id="story" className="bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <Reveal className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-4">Built from the gig, not a guess</h2>
          <div className="relative pl-6 sm:pl-8">
            <span className="absolute left-0 top-0 text-5xl sm:text-6xl leading-none text-indigo-200 font-serif select-none" aria-hidden="true">&ldquo;</span>
            <p className="text-lg text-slate-700 leading-relaxed">
              I've been a gigging musician for over 20 years — playing my own gigs, working for other bandleaders and
              offices, and staffing musicians out to weddings and events booked through agencies. I've been on every
              side of this business: the player waiting to hear if a gig is actually confirmed, the bandleader chasing
              five people for a stage plot two days before a wedding, and the office trying to keep a whole roster
              straight through a busy season.
            </p>
            <p className="mt-4 text-lg text-slate-700 leading-relaxed">
              GigWorks is what I wished existed the entire time. Every feature in it came from a real pain point I've
              personally run into over two decades of doing this work — not a guess at what musicians need from
              someone who's never had to load in at 4pm and be ready by 6.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Pain points */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center">Sound familiar?</h2>
        <p className="text-slate-500 text-center mt-2 mb-10 max-w-xl mx-auto">
          These aren't hypothetical problems — they're what running an entertainment business actually feels like
          without the right tools.
        </p>
        <div className="space-y-4">
          {PAIN_POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 60} data-testid="landing-pain-point" className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 text-base">{p.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{p.problem}</p>
              <div className="mt-3 flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
                <span aria-hidden="true">→</span>
                <span>{p.fix}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Feature groups */}
      <section id="features" className="bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-16">One place for the whole gig</h2>
          <div className="space-y-20">
            {FEATURE_GROUPS.map((g, i) => (
              <Reveal
                key={g.title} delay={i * 90} data-testid="landing-feature-group"
                className={`flex flex-col ${i % 2 === 1 ? 'sm:flex-row-reverse' : 'sm:flex-row'} items-center gap-8 sm:gap-12`}
              >
                <div className="flex-1 w-full max-w-sm">
                  <g.Preview />
                </div>
                <div className="flex-1 w-full max-w-sm">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                    <g.Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-lg mb-3">{g.title}</h3>
                  <ul className="space-y-1.5 text-sm text-slate-500">
                    {g.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="text-indigo-500 mt-0.5" aria-hidden="true">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing is visible during early access; only the action changes at launch. */}
      <section id="pricing" className="bg-white scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-3">Simple pricing</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Every plan runs the whole gig</h2>
            <p className="text-slate-500 mt-3">Choose based on the size of your team—not which tools you’re allowed to use.</p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 mt-7" aria-label="Billing interval">
              <button type="button" onClick={() => setPricingInterval('month')} data-testid="landing-pricing-month" className={`px-4 py-2 rounded-lg text-sm font-semibold ${pricingInterval === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Monthly</button>
              <button type="button" onClick={() => setPricingInterval('year')} data-testid="landing-pricing-year" className={`px-4 py-2 rounded-lg text-sm font-semibold ${pricingInterval === 'year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Annual <span className="text-emerald-600">Save up to 20%</span></button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10 items-stretch">
            {PRICING_TIERS.map((tier) => (
              <Reveal key={tier.id} className={`relative rounded-2xl p-6 flex flex-col ${tier.featured ? 'border-2 border-indigo-500 shadow-lg' : 'border border-slate-200 shadow-sm'}`} data-testid={`landing-pricing-${tier.id}`}>
                {tier.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full">Most popular</span>}
                <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                <p className="text-sm text-slate-500 mt-1 min-h-10">{tier.description}</p>
                <div className="mt-5"><span className="text-4xl font-bold text-slate-900">${pricingInterval === 'year' ? tier.annualMonthly : tier.monthly}</span><span className="text-sm text-slate-500"> /month</span></div>
                <p className="text-xs text-slate-400 mt-1 h-5">{pricingInterval === 'year' ? `$${tier.annualTotal} billed annually` : 'Billed monthly'}</p>
                <p className="text-sm font-semibold text-indigo-700 mt-5">{tier.seats}</p>
                <ul className="space-y-2 mt-5 mb-6 text-sm text-slate-600 flex-1">
                  {INCLUDED_FEATURES.map((feature) => <li key={feature} className="flex gap-2"><span className="text-emerald-500" aria-hidden="true">✓</span><span>{feature}</span></li>)}
                </ul>
                {PUBLIC_SIGNUPS_ENABLED ? (
                  <Link to={signupHref(tier.id, pricingInterval)} className={`text-center rounded-lg px-4 py-2.5 text-sm font-semibold ${tier.featured ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>Start 14-day free trial</Link>
                ) : (
                  <a href="#waitlist" className={`text-center rounded-lg px-4 py-2.5 text-sm font-semibold ${tier.featured ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>Join the waitlist</a>
                )}
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">14-day free trial at launch. Cancel anytime. Secure billing through Stripe.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 scroll-mt-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Questions bandleaders actually ask</h2>
        <p className="text-slate-500 text-center mb-10">Most critical first — scroll down for the smaller stuff.</p>
        <Reveal className="bg-white border border-slate-200 rounded-xl px-5 sm:px-6 shadow-sm divide-y divide-slate-100">
          {FAQS.map((item, i) => (
            <FAQItem
              key={item.q}
              q={item.q}
              a={item.a}
              open={openFaqIndex === i}
              onToggle={() => setOpenFaqIndex((prev) => (prev === i ? -1 : i))}
            />
          ))}
        </Reveal>
      </section>

      {/* Waitlist + Contact */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div id="waitlist" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm scroll-mt-20">
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

          <div id="contact" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 shadow-sm scroll-mt-20">
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
