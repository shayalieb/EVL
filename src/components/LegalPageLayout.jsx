import { Link } from 'react-router-dom';
import Logo from './ui/Logo';

const LEGAL_LINKS = [
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/cookies', 'Cookie Policy'],
];

function friendlyDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Shared chrome for the three legal pages (src/pages/TermsOfServicePage.jsx,
// PrivacyPolicyPage.jsx, CookiePolicyPage.jsx) — same header/footer pattern
// as CustomerStoriesPage.jsx, plus cross-links between all three documents
// since each one references the others.
export default function LegalPageLayout({ config, title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo className="h-8 w-auto" /></Link>
          <Link to="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">← Back to GigWorks</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {friendlyDate(config.legal.effectiveDate) || config.legal.effectiveDate}</p>
        <div className="mt-8 space-y-6 text-slate-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:leading-relaxed [&_a]:text-indigo-600 [&_a]:font-semibold [&_a]:hover:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map(([href, label]) => (
              <Link key={href} to={href} className="font-medium text-slate-500 hover:text-indigo-700 transition-colors">{label}</Link>
            ))}
          </nav>
          <Link to="/" className="font-semibold text-indigo-600 hover:text-indigo-700">← Back to GigWorks</Link>
        </div>
      </footer>
    </div>
  );
}
