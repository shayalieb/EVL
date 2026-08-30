import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import SubmitButton from '../components/ui/SubmitButton';
import LandingDashboardPreview from '../components/LandingDashboardPreview';
import {
  FileIcon, UsersIcon, ClipboardIcon, BellIcon, ChevronDownIcon,
  CalendarIcon, ClockIcon, DollarIcon, WrenchIcon, AlertIcon, InfoIcon, MapPinIcon, NoteIcon, SearchIcon,
  StarIcon, ShieldIcon, ChartIcon, BoltIcon,
} from '../components/ui/icons';
import { getLandingConfig, joinWaitlist, sendContactMessage } from '../lib/landing';

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition';
const DEFAULT_PUBLIC_SIGNUPS_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUPS_ENABLED === 'true';

// Keyed the same way as server/src/lib/websiteConfig.js's ICON_KEYS, so an
// admin-picked icon key resolves to the same component on both sides.
const ICON_COMPONENTS = {
  file: FileIcon, users: UsersIcon, clipboard: ClipboardIcon, bell: BellIcon,
  calendar: CalendarIcon, clock: ClockIcon, dollar: DollarIcon, wrench: WrenchIcon,
  alert: AlertIcon, info: InfoIcon, mappin: MapPinIcon, note: NoteIcon, search: SearchIcon,
  star: StarIcon, shield: ShieldIcon, chart: ChartIcon, bolt: BoltIcon,
};

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
    id: 'clients',
    title: 'For your clients',
    icon: 'file',
    items: ['Inquiry-to-booking pipeline', 'Proposals your client accepts online', 'Contracts with e-signature', 'Invoicing with built-in Stripe payments'],
  },
  {
    id: 'roster',
    title: 'For your roster',
    icon: 'users',
    items: ['Contractor roster & availability', 'Per-event confirm/decline tracking', 'Ensembles — save a group once, add its whole lineup in one click', 'A home-screen link every contractor can check themselves'],
  },
  {
    id: 'dayOf',
    title: 'For the day of',
    icon: 'clipboard',
    items: ['Stage plots with a live drag-and-drop canvas', 'Set lists with email + PDF export', 'Backline & production lists', 'Prep sheets & crew schedules'],
  },
  {
    id: 'oversight',
    title: 'For staying on top of it',
    icon: 'bell',
    items: ['A dashboard that surfaces what actually needs attention', 'Automatic alerts for at-risk events and overdue invoices', 'Email templates with merge fields for real event details', 'Manual reminders tied to any client or contractor'],
  },
];

// "See it in action" showcase, right after the pain points make the case
// for why this exists — real screenshots of the actual app (captured from
// a seeded demo account, not stock photography or mockups), so what a
// visitor sees here is exactly what they'd see after signing up.
const SCREENSHOTS = [
  { src: '/landing/home-dashboard.png', caption: 'The Home dashboard — upcoming events and at-risk alerts, at a glance' },
  { src: '/landing/event-roster.png', caption: "An event's roster, with each contractor's confirm status tracked live" },
  { src: '/landing/stage-plot.png', caption: 'The stage plot builder — drag-and-drop, tied to the real lineup' },
  { src: '/landing/contractors-list.png', caption: 'Your full contractor roster — searchable, with rates on file' },
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
    a: '',
  },
];

function signupHref(plan = 'team', interval = 'month', groupCount) {
  return `/auth?mode=signup&plan=${plan}&interval=${interval}${plan === 'agency' ? `&groups=${groupCount || 2}` : ''}`;
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

function ReviewSlider({ section }) {
  const reviews = section.reviews.filter((review) => review.published && review.featured);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reviews.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % reviews.length), 6500);
    return () => window.clearInterval(timer);
  }, [reviews.length]);

  if (!reviews.length) return null;
  const review = reviews[activeIndex % reviews.length];
  const storyHref = `/customer-stories#${review.id}`;

  return (
    <section className="overflow-hidden bg-indigo-950 text-white" aria-label="Customer reviews">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">Customer reviews</p>
          <h2 className="text-2xl sm:text-3xl font-bold mt-3">{section.heading}</h2>
          <p className="text-indigo-200 mt-3">{section.description}</p>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          {reviews.length > 1 && <button type="button" onClick={() => setActiveIndex((activeIndex - 1 + reviews.length) % reviews.length)} className="shrink-0 h-10 w-10 rounded-full border border-white/20 hover:bg-white/10" aria-label="Previous review">←</button>}
          <Link to={storyHref} className="group min-w-0 flex-1 rounded-3xl border border-white/15 bg-white/[0.08] px-6 py-7 sm:px-10 sm:py-9 text-center shadow-xl hover:bg-white/[0.12] transition-colors">
            <div className="text-amber-400 text-xl tracking-wider" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}<span className="text-white/20">{'★'.repeat(5 - review.rating)}</span></div>
            <blockquote className="mt-5 text-xl sm:text-2xl font-medium leading-relaxed">“{review.quote}”</blockquote>
            <div className="mt-6"><p className="font-bold">{review.groupName}</p>{(review.reviewerName || review.groupType) && <p className="text-sm text-indigo-200 mt-1">{[review.reviewerName, review.groupType].filter(Boolean).join(' · ')}</p>}</div>
            <span className="inline-block mt-5 text-sm font-semibold text-indigo-200 group-hover:text-white">Read customer stories →</span>
          </Link>
          {reviews.length > 1 && <button type="button" onClick={() => setActiveIndex((activeIndex + 1) % reviews.length)} className="shrink-0 h-10 w-10 rounded-full border border-white/20 hover:bg-white/10" aria-label="Next review">→</button>}
        </div>
        {reviews.length > 1 && <div className="flex justify-center gap-2 mt-6">{reviews.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`Show review ${index + 1}`} aria-current={index === activeIndex ? 'true' : undefined} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-white' : 'w-2 bg-white/35'}`} />)}</div>}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [waitlistForm, setWaitlistForm] = useState({ name: '', email: '', businessName: '', selectedPlan: '', billingInterval: '' });
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');
  const [waitlistDone, setWaitlistDone] = useState(false);

  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '', selectedPlan: '' });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactDone, setContactDone] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [pricingInterval, setPricingInterval] = useState('year');
  const [agencyGroupCount, setAgencyGroupCount] = useState(2);
  const [websiteConfig, setWebsiteConfig] = useState(null);
  const publicSignupsEnabled = websiteConfig?.publicSignupsEnabled ?? DEFAULT_PUBLIC_SIGNUPS_ENABLED;
  const navigation = websiteConfig?.navigation;
  const hero = websiteConfig?.hero;
  const story = websiteConfig?.story;
  const painSection = websiteConfig?.painPoints;
  const painPoints = painSection?.items || PAIN_POINTS;
  const featureSection = websiteConfig?.features;
  const agencySection = websiteConfig?.agency;
  const featureGroups = featureSection?.groups || FEATURE_GROUPS;
  const featureComparison = featureSection?.comparison;
  const pricing = websiteConfig?.pricing;
  const testimonials = websiteConfig?.testimonials;
  const includedFeatures = pricing?.includedFeatures || INCLUDED_FEATURES;
  const faqSection = websiteConfig?.faq;
  const faqs = faqSection?.items?.map((item) => ({ q: item.question, a: item.answer })) || FAQS;
  const waitlistContent = websiteConfig?.waitlist;
  const contactContent = websiteConfig?.contact;
  const footerContent = websiteConfig?.footer;
  const navLinks = [
    { href: '#story', label: navigation?.story || NAV_LINKS[0].label },
    { href: '#features', label: navigation?.features || NAV_LINKS[1].label },
    { href: '#pricing', label: navigation?.pricing || NAV_LINKS[2].label },
    { href: '#faq', label: navigation?.faq || NAV_LINKS[3].label },
  ];
  const pricingTiers = pricing?.tiers?.map((tier) => ({
    id: tier.id,
    name: tier.name,
    seats: tier.id === 'agency' ? `${tier.includedGroupCount || 2} managed groups included` : tier.seatLimit === 1 ? '1 team member' : `Up to ${tier.seatLimit} team members`,
    monthly: tier.monthlyAmountCents / 100,
    annualMonthly: Math.round(tier.annualAmountCents / 12) / 100,
    annualTotal: tier.annualAmountCents / 100,
    description: tier.description,
    featured: tier.featured,
    includedGroupCount: tier.includedGroupCount,
    monthlyAdditionalGroupCents: tier.monthlyAdditionalGroupCents,
    annualAdditionalGroupCents: tier.annualAdditionalGroupCents,
  })) || PRICING_TIERS;
  const trialDays = pricing?.trialDays ?? 14;
  const trustStats = [
    { value: '20+', label: 'Years actually gigging' },
    { value: 'All-in-One', label: 'From first inquiry to load-out' },
    { value: `${trialDays}-Day`, label: 'Free trial, no card needed' },
    { value: '100%', label: 'Your money, straight via Stripe' },
  ];
  useEffect(() => {
    getLandingConfig().then((data) => setWebsiteConfig(data.config)).catch(() => {});
  }, []);

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
            {navLinks.map((l) => (
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
              {navigation?.login || 'Log In'}
            </Link>
            {publicSignupsEnabled ? (
              <a href="#pricing" data-testid="landing-nav-plans-link" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">{navigation?.signup || 'View Plans'}</a>
            ) : (
              <a href="#waitlist" data-testid="landing-nav-waitlist-link" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">{navigation?.waitlist || 'Join Waitlist'}</a>
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
          <div className="sm:hidden border-t border-slate-100 px-4 py-3 space-y-1 bg-white shadow-lg">
            {navLinks.map((l) => (
              <a
                key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {l.label}
              </a>
            ))}
            <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              {navigation?.login || 'Log In'}
            </Link>
            {publicSignupsEnabled ? (
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">{navigation?.signup || 'View Plans'}</a>
            ) : (
              <a href="#waitlist" onClick={() => setMobileMenuOpen(false)} className="block text-center mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">{navigation?.waitlist || 'Join Waitlist'}</a>
            )}
          </div>
        )}
      </header>

      {/* Hero — the whole first screen, full-bleed dark and immersive
          instead of a short band that hands off to white almost
          immediately. Two-column on desktop (copy + CTAs left, product
          preview right) so the product itself is part of the first
          impression, not something scrolled to. Trust stats live inside
          this same dark panel (not a separate white strip right after) so
          the bold first impression carries all the way to the fold. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-950 via-indigo-900 to-indigo-950 flex flex-col min-h-[calc(100vh-4rem)]">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute left-1/2 top-[-8rem] w-[50rem] h-[50rem] -translate-x-1/2 rounded-full bg-indigo-500/35 blur-3xl" />
          <div className="absolute right-[-10rem] top-[2rem] w-[30rem] h-[30rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute left-[-10rem] bottom-[6rem] w-[28rem] h-[28rem] rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute left-[-8rem] top-[10rem] w-[24rem] h-[24rem] rounded-full bg-indigo-300/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '56px 56px' }}
          />
        </div>

        <div className="flex-1 flex items-center">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-12 w-full">
            <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-10 items-center">
              <Reveal className="text-center lg:text-left">
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 backdrop-blur px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-200 mb-5">
                  {hero?.eyebrow || 'For bands, DJs & orchestras booking out a roster'}
                </span>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1] max-w-3xl mx-auto lg:mx-0">
                  {hero?.headline || 'Built by a musician who spent 20 years chasing confirmations instead of chasing gigs.'}
                </h1>
                <p className="mt-5 text-lg text-indigo-200 max-w-2xl mx-auto lg:mx-0">
                  {hero?.description || "GigWorks is the business software for entertainment agencies and bandleaders who book out multiple musicians — proposals, contracts, and invoicing for your clients, plus the day-of details connected to who's actually on the gig."}
                </p>
                <div className="mt-7 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
                  {publicSignupsEnabled ? (
                    <a href="#pricing" data-testid="landing-hero-plans-link" className="px-7 py-3.5 rounded-xl bg-white text-indigo-700 text-base font-semibold shadow-lg shadow-black/20 hover:shadow-xl hover:-translate-y-0.5 hover:bg-indigo-50 transition-all">{navigation?.signup || 'View Plans'}</a>
                  ) : (
                    <a href="#waitlist" data-testid="landing-hero-waitlist-link" className="px-7 py-3.5 rounded-xl bg-white text-indigo-700 text-base font-semibold shadow-lg shadow-black/20 hover:shadow-xl hover:-translate-y-0.5 hover:bg-indigo-50 transition-all">{navigation?.waitlist || 'Join Waitlist'}</a>
                  )}
                  <a href="#contact" data-testid="landing-hero-contact-link" className="px-7 py-3.5 rounded-xl border border-white/30 text-white text-base font-semibold hover:bg-white/10 hover:-translate-y-0.5 transition-all">
                    {hero?.contactButton || 'Get in Touch'}
                  </a>
                </div>
              </Reveal>
              <Reveal delay={150} className="w-full max-w-lg mx-auto lg:mx-0 lg:max-w-none">
                <div className="relative">
                  <div className="absolute -inset-6 bg-gradient-to-br from-indigo-400/30 via-fuchsia-400/10 to-transparent blur-2xl -z-10 rounded-[2rem]" aria-hidden="true" />
                  <LandingDashboardPreview />
                </div>
              </Reveal>
            </div>
          </div>
        </div>

        {/* Trust stats, folded into the hero itself */}
        <div className="border-t border-white/10 bg-white/[0.03]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4 text-center">
              {trustStats.map((s) => (
                <div key={s.label}>
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{s.value}</div>
                  <div className="text-xs sm:text-sm text-indigo-200 mt-1 leading-snug">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Founder story */}
      <section id="story" className="bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <Reveal className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <h2 className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide mb-6">{story?.label || 'Built from the gig, not a guess'}</h2>
          <div className="relative pl-6 sm:pl-8">
            <span className="absolute left-0 top-0 text-5xl sm:text-6xl leading-none text-indigo-200 font-serif select-none" aria-hidden="true">&ldquo;</span>
            {(story?.paragraphs || []).map((paragraph, index) => <p key={index} className={`${index ? 'mt-4 ' : ''}text-lg text-slate-700 leading-relaxed`}>{paragraph}</p>)}
          </div>
        </Reveal>
      </section>

      {/* Pain points — numbered 2-up grid instead of one long stacked list,
          so all six are scannable in a couple of eye-sweeps instead of a
          full-page scroll. */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-center">{painSection?.heading || 'Sound familiar?'}</h2>
        <p className="text-slate-500 text-center mt-2 mb-10 max-w-xl mx-auto">{painSection?.description}</p>
        <div className="grid sm:grid-cols-2 gap-5">
          {painPoints.map((p, i) => (
            <Reveal
              key={p.title} delay={i * 60} data-testid="landing-pain-point"
              className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="absolute -top-2 right-3 text-6xl font-black text-slate-50 select-none" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="relative font-semibold text-slate-800 text-base pr-10">{p.title}</h3>
              <p className="relative text-sm text-slate-500 mt-2">{p.problem}</p>
              <div className="relative mt-4 flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
                <span aria-hidden="true">→</span>
                <span>{p.fix}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* See it in action — real screenshots (public/landing/*.png,
          captured from a seeded demo account, not mockups or stock photos)
          so a visitor sees the actual app before reading a feature-by-
          feature breakdown. */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-3">See it in action</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">This is what running a gig actually looks like</h2>
          <p className="text-slate-500 mt-3">Real screens from the app, not mockups — four you'll actually use.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-8 sm:gap-10">
          {SCREENSHOTS.map((s, i) => (
            <Reveal key={s.caption} delay={i * 90} data-testid="landing-screenshot" className="group min-w-0">
              <div className="rounded-2xl border border-slate-200 shadow-sm group-hover:shadow-lg transition-all duration-300 ease-out group-hover:-translate-y-1.5 overflow-hidden bg-white">
                <img src={s.src} alt={s.caption} className="w-full h-auto block" loading="lazy" />
              </div>
              <p className="mt-4 text-center text-sm font-semibold text-slate-700">{s.caption}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Feature cards — an admin-manageable grid (src/pages/admin/
          AdminWebsitePage.jsx's Features tab can add/remove cards, so the
          count here isn't fixed at 4). Every card uses the same rich
          styling regardless of whether it's one of the originals or
          admin-added, rather than pairing a fixed set of bespoke app-mockup
          previews with plain admin-added ones. */}
      <section id="features" className="bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-center mb-14">{featureSection?.heading || 'One place for the whole gig'}</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {featureGroups.map((g, i) => {
              const GroupIcon = ICON_COMPONENTS[g.icon] || FileIcon;
              const accent = i % 2 === 0 ? 'indigo' : 'fuchsia';
              return (
                <Reveal
                  key={g.id || g.title} delay={i * 90} data-testid="landing-feature-group"
                  className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                >
                  <div
                    className={`pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl -z-10 ${accent === 'indigo' ? 'bg-indigo-200/40' : 'bg-fuchsia-200/40'}`}
                    aria-hidden="true"
                  />
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 shadow-sm ${accent === 'indigo' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white' : 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 text-white'}`}>
                    <GroupIcon className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-xl mb-3">{g.title}</h3>
                  <ul className="space-y-2 text-sm text-slate-500">
                    {g.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className={`mt-0.5 ${accent === 'indigo' ? 'text-indigo-500' : 'text-fuchsia-500'}`} aria-hidden="true">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Detailed feature comparison */}
      {featureComparison && (
        <section className="bg-white border-b border-slate-100">
          <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-3">{featureComparison.eyebrow}</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{featureComparison.heading}</h2>
              <p className="text-slate-500 mt-3">{featureComparison.description}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="sticky left-0 z-10 bg-slate-50 text-left px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500 w-[46%]">{featureComparison.featureColumnLabel}</th>
                      {pricingTiers.map((tier) => <th key={tier.id} className={`px-4 py-4 text-center font-bold ${tier.featured ? 'text-indigo-700 bg-indigo-50/70' : 'text-slate-700'}`}>{tier.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {featureComparison.categories.map((category) => (
                      <Fragment key={category.id}>
                        <tr><th colSpan={pricingTiers.length + 1} className="bg-slate-100 px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600">{category.name}</th></tr>
                        {category.rows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <th className="sticky left-0 z-10 bg-white px-5 py-3.5 text-left font-medium text-slate-700">{row.feature}</th>
                            {pricingTiers.map((tier) => <td key={tier.id} className={`px-4 py-3.5 text-center ${tier.featured ? 'bg-indigo-50/30' : ''}`}>{String(row[tier.id] || 'Included').toLowerCase() === 'included' ? <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><span aria-hidden="true">✓</span><span>Included</span></span> : <span className="text-slate-600">{row[tier.id]}</span>}</td>)}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-center text-xs text-slate-400 mt-5">{featureComparison.footer}</p>
          </Reveal>
        </section>
      )}

      {testimonials?.enabled && <ReviewSlider section={testimonials} />}

      {agencySection?.enabled && <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #6366f1 0, transparent 35%), radial-gradient(circle at 80% 70%, #d946ef 0, transparent 35%)' }} aria-hidden="true" />
        <Reveal className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">{agencySection.label}</p><h2 className="text-3xl sm:text-4xl font-bold mt-4 leading-tight">{agencySection.heading}</h2><p className="text-slate-300 mt-5 leading-relaxed">{agencySection.description}</p><a href="#pricing" className="inline-flex mt-7 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 hover:bg-indigo-50">{agencySection.ctaLabel}</a></div>
            <div className="grid sm:grid-cols-2 gap-3">{agencySection.features.map((feature, index) => <div key={feature} className={`rounded-2xl border border-white/10 bg-white/[0.07] p-5 ${index === agencySection.features.length - 1 && agencySection.features.length % 2 ? 'sm:col-span-2' : ''}`}><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/25 text-indigo-200 font-bold">{index + 1}</span><p className="mt-3 font-semibold text-slate-100">{feature}</p></div>)}</div>
          </div>
        </Reveal>
      </section>}

      {/* Pricing is visible during early access; only the action changes at launch. */}
      <section id="pricing" className="bg-white scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-3">{pricing?.label || 'Simple pricing'}</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{pricing?.heading || 'Every plan runs the whole gig'}</h2>
            <p className="text-slate-500 mt-3">{pricing?.description || 'Choose based on the size of your team—not which tools you’re allowed to use.'}</p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 mt-7" aria-label="Billing interval">
              <button type="button" onClick={() => setPricingInterval('month')} data-testid="landing-pricing-month" className={`px-4 py-2 rounded-lg text-sm font-semibold ${pricingInterval === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{pricing?.monthlyLabel || 'Monthly'}</button>
              <button type="button" onClick={() => setPricingInterval('year')} data-testid="landing-pricing-year" className={`px-4 py-2 rounded-lg text-sm font-semibold ${pricingInterval === 'year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{pricing?.annualLabel || 'Annual'} <span className="text-emerald-600">{pricing?.annualSavingsLabel || 'Save up to 20%'}</span></button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10 items-stretch">
            {pricingTiers.map((tier) => (
              <Reveal
                key={tier.id}
                className={`relative rounded-2xl p-6 flex flex-col transition-all duration-200 ${
                  tier.featured
                    ? 'border-2 border-indigo-500 shadow-xl shadow-indigo-500/20 bg-gradient-to-b from-indigo-50/60 to-white lg:scale-[1.03]'
                    : 'border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5'
                }`}
                data-testid={`landing-pricing-${tier.id}`}
              >
                {tier.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">{pricing?.featuredLabel || 'Most popular'}</span>}
                <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                <p className="text-sm text-slate-500 mt-1 min-h-10">{tier.description}</p>
                {tier.id === 'agency' && <label className="mt-5 block text-xs font-semibold text-slate-500">Number of managed groups<select value={agencyGroupCount} onChange={(e) => setAgencyGroupCount(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">{Array.from({ length: 49 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} groups</option>)}</select></label>}
                <div className={tier.id === 'agency' ? 'mt-3' : 'mt-5'}><span className="text-4xl font-bold text-slate-900">${tier.id === 'agency' ? pricingInterval === 'year' ? Math.round((tier.annualTotal + Math.max(0, agencyGroupCount - tier.includedGroupCount) * tier.annualAdditionalGroupCents / 100) / 12 * 100) / 100 : tier.monthly + Math.max(0, agencyGroupCount - tier.includedGroupCount) * tier.monthlyAdditionalGroupCents / 100 : pricingInterval === 'year' ? tier.annualMonthly : tier.monthly}</span><span className="text-sm text-slate-500"> {pricing?.perMonthLabel || '/month'}</span></div>
                <p className="text-xs text-slate-400 mt-1 h-5">{tier.id === 'agency' ? `${tier.includedGroupCount} groups included · ${pricingInterval === 'year' ? `$${tier.annualAdditionalGroupCents / 100}/year` : `$${tier.monthlyAdditionalGroupCents / 100}/month`} each additional` : pricingInterval === 'year' ? `$${tier.annualTotal} ${pricing?.billedAnnuallyLabel || 'billed annually'}` : (pricing?.billedMonthlyLabel || 'Billed monthly')}</p>
                <p className="text-sm font-semibold text-indigo-700 mt-5">{tier.seats}</p>
                <ul className="space-y-2 mt-5 mb-6 text-sm text-slate-600 flex-1">
                  {includedFeatures.map((feature) => <li key={feature} className="flex gap-2"><span className="text-emerald-500" aria-hidden="true">✓</span><span>{feature}</span></li>)}
                </ul>
                {publicSignupsEnabled ? (
                  <Link to={signupHref(tier.id, pricingInterval, agencyGroupCount)} className={`text-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${tier.featured ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 hover:shadow-lg' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>{(pricing?.trialButtonLabel || 'Start {days}-day free trial').replace('{days}', trialDays)}</Link>
                ) : (
                  <a href="#waitlist" onClick={() => setWaitlistForm((current) => ({ ...current, selectedPlan: tier.id, billingInterval: pricingInterval, groupCount: tier.id === 'agency' ? agencyGroupCount : undefined }))} className={`text-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${tier.featured ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 hover:shadow-lg' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>Join the waitlist</a>
                )}
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">{(pricing?.trialFooterLabel || '{days}-day free trial at launch.').replace('{days}', trialDays)} {pricing?.footer || 'Cancel anytime. Secure billing through Stripe.'}</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24 scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-center mb-2">{faqSection?.heading || 'Questions bandleaders actually ask'}</h2>
        <p className="text-slate-500 text-center mb-10">{faqSection?.description || 'Most critical first — scroll down for the smaller stuff.'}</p>
        <Reveal className="bg-white border border-slate-200 rounded-2xl px-5 sm:px-6 shadow-sm divide-y divide-slate-100">
          {faqs.map((item, i) => (
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

      {/* Closing CTA — a bold bookend to the hero, right before the actual
          conversion forms below. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-fuchsia-600">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 w-[42rem] h-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Stop chasing confirmations. Start running the gig.</h2>
          <p className="mt-3 text-indigo-100 max-w-xl mx-auto">Built by someone who's actually done this job for two decades — see if it fits how you book gigs.</p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            {publicSignupsEnabled ? (
              <a href="#pricing" data-testid="landing-cta-plans-link" className="px-6 py-3 rounded-xl bg-white text-indigo-700 text-sm font-semibold shadow-lg shadow-black/10 hover:shadow-xl hover:-translate-y-0.5 transition-all">{navigation?.signup || 'View Plans'}</a>
            ) : (
              <a href="#waitlist" data-testid="landing-cta-waitlist-link" className="px-6 py-3 rounded-xl bg-white text-indigo-700 text-sm font-semibold shadow-lg shadow-black/10 hover:shadow-xl hover:-translate-y-0.5 transition-all">{navigation?.waitlist || 'Join Waitlist'}</a>
            )}
            <a href="#contact" data-testid="landing-cta-contact-link" className="px-6 py-3 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10 hover:-translate-y-0.5 transition-all">
              {hero?.contactButton || 'Get in Touch'}
            </a>
          </div>
        </div>
      </section>

      {/* Waitlist + Contact */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div id="waitlist" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow scroll-mt-20">
            <h2 className="text-xl font-bold text-slate-900">{waitlistContent?.heading || 'Get Waitlisted'}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">{waitlistContent?.description}</p>
            {waitlistForm.selectedPlan && !waitlistDone && (
              <p className="text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mb-3">
                Interested in {pricingTiers.find((tier) => tier.id === waitlistForm.selectedPlan)?.name}{waitlistForm.selectedPlan === 'agency' ? ` · ${waitlistForm.groupCount} groups` : ''} · {waitlistForm.billingInterval === 'year' ? 'Annual' : 'Monthly'}
              </p>
            )}
            {waitlistDone ? (
              <p data-testid="landing-waitlist-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-3">
                {waitlistContent?.success || "You're on the list — thanks for the interest. I'll be in touch soon."}
              </p>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                <input
                  required placeholder={waitlistContent?.namePlaceholder || 'Your name'} value={waitlistForm.name}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="landing-waitlist-name-input" className={inputClass}
                />
                <input
                  required type="email" placeholder={waitlistContent?.emailPlaceholder || 'Email address'} value={waitlistForm.email}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, email: e.target.value }))}
                  data-testid="landing-waitlist-email-input" className={inputClass}
                />
                <input
                  placeholder={waitlistContent?.businessPlaceholder || 'Business or band name (optional)'} value={waitlistForm.businessName}
                  onChange={(e) => setWaitlistForm((f) => ({ ...f, businessName: e.target.value }))}
                  data-testid="landing-waitlist-business-input" className={inputClass}
                />
                <FieldError>{waitlistError}</FieldError>
                <SubmitButton loading={waitlistSubmitting} testId="landing-waitlist-submit-button">
                  {waitlistContent?.submitLabel || 'Join the Waitlist'}
                </SubmitButton>
              </form>
            )}
          </div>

          <div id="contact" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow scroll-mt-20">
            <h2 className="text-xl font-bold text-slate-900">{contactContent?.heading || 'Get in Touch'}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">{contactContent?.description}</p>
            {contactDone ? (
              <p data-testid="landing-contact-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-3">
                {contactContent?.success || "Got it — thanks for reaching out. I'll reply personally as soon as I can."}
              </p>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3">
                {contactForm.selectedPlan === 'agency' && <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Agency plan inquiry</div>}
                <input
                  required placeholder={contactContent?.namePlaceholder || 'Your name'} value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="landing-contact-name-input" className={inputClass}
                />
                <input
                  required type="email" placeholder={contactContent?.emailPlaceholder || 'Email address'} value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  data-testid="landing-contact-email-input" className={inputClass}
                />
                <textarea
                  required rows={3} placeholder={contactContent?.messagePlaceholder || "What's on your mind?"} value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  data-testid="landing-contact-message-textarea" className={inputClass}
                />
                <FieldError>{contactError}</FieldError>
                <SubmitButton loading={contactSubmitting} testId="landing-contact-submit-button">
                  {contactContent?.submitLabel || 'Send Message'}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <Logo className="h-6 w-auto" />
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="text-sm font-medium text-slate-500 hover:text-indigo-700 transition-colors">{l.label}</a>
              ))}
              <Link to="/auth" className="text-sm font-medium text-slate-500 hover:text-indigo-700 transition-colors">{navigation?.login || 'Log In'}</Link>
            </nav>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p>{footerContent?.tagline || 'GigWorks — built for the gig.'}</p>
            <p>© {new Date().getFullYear()} GigWorks. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
