import { Link, Navigate, useLocation } from 'react-router-dom';
import { SEO_PAGE_BY_PATH } from '../lib/seoPages';

function labelFor(path) {
  return SEO_PAGE_BY_PATH[path]?.headline || path;
}

export default function SeoLandingPage() {
  const { pathname } = useLocation();
  const page = SEO_PAGE_BY_PATH[pathname];
  if (!page) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-indigo-700">GigWorks</Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link to="/auth" className="text-slate-600 hover:text-indigo-700">Log in</Link>
            <Link to="/#pricing" className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">View plans</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 text-white">
          <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-200">{page.eyebrow}</p>
            <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">{page.headline}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-indigo-100">{page.summary}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/#pricing" className="rounded-xl bg-white px-6 py-3 font-semibold text-indigo-700">View plans</Link>
              <Link to="/#contact" className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white">Contact GigWorks</Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">What you can manage</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">One source of truth for the work behind the event</h2>
            <ul className="mt-7 space-y-4">
              {page.benefits.map((benefit) => <li key={benefit} className="flex gap-3 text-lg text-slate-700"><span className="font-bold text-indigo-600">✓</span><span>{benefit}</span></li>)}
            </ul>
          </div>
          <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-8">
            <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">A clearer workflow</p>
            <ol className="mt-6 space-y-5">
              {page.workflow.map((step, index) => <li key={step} className="flex items-center gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">{index + 1}</span><span className="font-semibold text-slate-800">{step}</span></li>)}
            </ol>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Explore more GigWorks workflows</h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {page.related.map((path) => <Link key={path} to={path} className="rounded-2xl border border-slate-200 bg-white p-5 font-semibold text-indigo-700 shadow-sm hover:border-indigo-300">{labelFor(path)} →</Link>)}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 md:py-24">
          <h2 className="text-3xl font-bold tracking-tight">Keep the whole gig in one workspace</h2>
          <p className="mt-4 text-lg text-slate-600">See how GigWorks brings inquiries, bookings, people, documents, payments, and production details together.</p>
          <Link to="/#pricing" className="mt-7 inline-flex rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700">See plans and pricing</Link>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm sm:px-6">
          <span>© {new Date().getFullYear()} GigWorks</span>
          <div className="flex flex-wrap gap-4"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link></div>
        </div>
      </footer>
    </div>
  );
}
