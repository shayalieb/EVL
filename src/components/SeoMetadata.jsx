import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { HOME_SEO as HOME, LEGAL_SEO_PAGES, SEO_PAGE_BY_PATH, SITE_URL, SOCIAL_IMAGE } from '../lib/seoPages';

const PUBLIC_PAGES = {
  '/': HOME,
  ...Object.fromEntries(Object.entries(LEGAL_SEO_PAGES).map(([path, page]) => [path, { ...page, path }])),
  ...SEO_PAGE_BY_PATH,
};

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
}

export default function SeoMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = PUBLIC_PAGES[pathname];
    const indexable = !!page;
    const metadata = page || { ...HOME, title: 'GigWorks', description: 'Secure GigWorks application page.' };
    const canonical = `${SITE_URL}${metadata.path || '/'}`;

    document.title = metadata.title;
    upsertMeta('meta[name="description"]', { name: 'description', content: metadata.description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: indexable ? 'index, follow' : 'noindex, nofollow, noarchive' });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: SOCIAL_IMAGE });
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: 'GigWorks live entertainment booking and management software' });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: metadata.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: metadata.description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: SOCIAL_IMAGE });

    let canonicalLink = document.head.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;
  }, [pathname]);

  return null;
}
