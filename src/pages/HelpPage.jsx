import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HELP_CATEGORIES, HELP_ARTICLES_FLAT } from '../lib/helpArticles';
import HelpArticleContent from '../components/HelpArticleContent';
import HelpContactSupport from '../components/HelpContactSupport';

const CONTACT_ID = 'contact-support';
const DEFAULT_ARTICLE_ID = HELP_CATEGORIES[0].articles[0].id;

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
      .map((cat) => ({ ...cat, articles: cat.articles.filter((a) => `${a.title} ${a.summary}`.toLowerCase().includes(q)) }))
      .filter((cat) => cat.articles.length > 0);
  }, [query]);

  function selectArticle(id) {
    setSearchParams(id === DEFAULT_ARTICLE_ID ? {} : { article: id });
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Help Center</h2>
      <p className="text-sm text-slate-500 mb-5">Everything the app does, and how to actually do it.</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="w-full lg:w-64 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            data-testid="help-search-input"
            className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
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
