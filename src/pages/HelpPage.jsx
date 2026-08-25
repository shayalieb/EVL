import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HELP_CATEGORIES, HELP_ARTICLES_FLAT } from '../lib/helpArticles';
import HelpArticleContent from '../components/HelpArticleContent';
import HelpContactSupport from '../components/HelpContactSupport';
import SearchInput from '../components/ui/SearchInput';

const CONTACT_ID = 'contact-support';
const DEFAULT_ARTICLE_ID = HELP_CATEGORIES[0].articles[0].id;
const START_HERE = [
  { id: 'welcome', label: 'How GigWorks works' },
  { id: 'setup', label: 'Set up your business' },
  { id: 'bookings-vs-events', label: 'Bookings vs. Events' },
];

function searchableArticleText(article) {
  const blockText = (article.blocks || []).flatMap((block) => [block.text, ...(block.items || [])]).filter(Boolean);
  return [article.title, article.summary, ...blockText].join(' ').toLowerCase();
}

const navLinkClass = (active) => `block w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
  active ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
}`;

// A self-serve article browser (left: search + category nav, right: the
// selected article) with the existing "message us directly" ticket flow
// (HelpContactSupport) kept as an escape hatch, not the only option — see
// that component's own comment for why it moved out of this file.
// Selection lives in the URL (?article=slug) rather than local-only state so
// a specific article can be linked/bookmarked, e.g. from a support reply
// ("see the Contracts & E-Signatures article").
export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const activeId = searchParams.get('article') || DEFAULT_ARTICLE_ID;
  const activeArticle = useMemo(() => HELP_ARTICLES_FLAT.find((a) => a.id === activeId), [activeId]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_CATEGORIES;
    return HELP_CATEGORIES
      .map((cat) => ({ ...cat, articles: cat.articles.filter((a) => searchableArticleText(a).includes(q)) }))
      .filter((cat) => cat.articles.length > 0);
  }, [query]);

  function selectArticle(id) {
    setSearchParams(id === DEFAULT_ARTICLE_ID ? {} : { article: id });
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Help Center</h2>
      <p className="text-sm text-slate-500 mb-5">Everything the app does, and how to actually do it.</p>

      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-indigo-700 mb-2">New to GigWorks? Start here</div>
        <div className="flex flex-wrap gap-2">
          {START_HERE.map((article) => (
            <button key={article.id} type="button" onClick={() => selectArticle(article.id)} className="min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
              {article.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="w-full lg:w-64 shrink-0" aria-label="Help topics">
          <SearchInput value={query} onChange={setQuery} placeholder="Search all help content…" className="w-full mb-4" testId="help-search-input" />
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
            {filteredCategories.length === 0 && (
              <p className="text-sm text-slate-400">No articles match "{query}."</p>
            )}
            {filteredCategories.map((cat) => (
              <div key={cat.id}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5 px-3">{cat.title}</div>
                <div className="space-y-0.5">
                  {cat.articles.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectArticle(a.id)}
                      data-testid="help-article-nav-link"
                      className={navLinkClass(activeId === a.id)}
                    >
                      {a.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => selectArticle(CONTACT_ID)}
              data-testid="help-contact-support-nav-link"
              className={navLinkClass(activeId === CONTACT_ID)}
            >
              💬 Contact Support
            </button>
          </div>
        </nav>

        <div className="flex-1 min-w-0 max-w-2xl">
          {activeId === CONTACT_ID ? (
            <>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Contact Support</h3>
              <p className="text-sm text-slate-500 mb-4">Send us a message directly and we'll get back to you.</p>
              <HelpContactSupport />
            </>
          ) : activeArticle ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="help-article-panel">
              <div className="text-xs font-semibold text-indigo-600 mb-1">{activeArticle.categoryTitle}</div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">{activeArticle.title}</h3>
              <p className="text-sm text-slate-500 mb-5">{activeArticle.summary}</p>
              <HelpArticleContent blocks={activeArticle.blocks} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Pick an article from the list to get started.</p>
          )}
        </div>
      </div>
    </div>
  );
}
