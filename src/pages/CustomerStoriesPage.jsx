import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Logo from '../components/ui/Logo';
import { getLandingConfig } from '../lib/landing';

function Stars({ rating }) {
  return <div className="text-amber-400 tracking-wider" aria-label={`${rating} out of 5 stars`}>{'★'.repeat(rating)}<span className="text-slate-200">{'★'.repeat(5 - rating)}</span></div>;
}

export default function CustomerStoriesPage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const section = config.testimonials;
  const reviews = section?.reviews?.filter((review) => review.published) || [];
  if (!section?.enabled || !reviews.length) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between"><Link to="/"><Logo className="h-8 w-auto" /></Link><Link to="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">← Back to GigWorks</Link></div>
      </header>
      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-fuchsia-950 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-24 text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Real customers. Real gigs.</p><h1 className="text-4xl sm:text-5xl font-bold mt-4">{section.pageHeading}</h1><p className="max-w-2xl mx-auto text-lg text-indigo-200 mt-5">{section.pageDescription}</p></div>
        </section>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-20 space-y-8">
          {reviews.map((review) => {
            const hasStory = review.storyPublished && (review.storyTitle || review.storySummary || review.storyBody);
            return <article key={review.id} id={review.id} className="scroll-mt-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-9 shadow-sm">
              <Stars rating={review.rating} />
              <blockquote className="mt-4 text-xl sm:text-2xl font-medium leading-relaxed text-slate-800">“{review.quote}”</blockquote>
              <div className="mt-5"><p className="font-bold text-slate-900">{review.groupName}</p>{(review.reviewerName || review.groupType) && <p className="text-sm text-slate-500 mt-1">{[review.reviewerName, review.groupType].filter(Boolean).join(' · ')}</p>}</div>
              {hasStory && <div className="mt-8 pt-8 border-t border-slate-100"><h2 className="text-2xl font-bold text-slate-900">{review.storyTitle || `${review.groupName}'s story`}</h2>{review.storySummary && <p className="mt-3 text-lg font-medium text-indigo-700 leading-relaxed">{review.storySummary}</p>}<div className="mt-5 space-y-4 text-slate-600 leading-relaxed">{review.storyBody.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></div>}
            </article>;
          })}
        </section>
        <section className="bg-indigo-700 text-white"><div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-center"><h2 className="text-2xl font-bold">Ready to run your gigs in one place?</h2><p className="text-indigo-100 mt-2">Explore the workflow and choose the plan that fits your team.</p><Link to="/#pricing" className="inline-block mt-6 rounded-xl bg-white px-6 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50">View plans</Link></div></section>
      </main>
    </div>
  );
}
