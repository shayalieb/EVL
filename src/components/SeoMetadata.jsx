import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://www.gigworks.io';
const HOME = {
  title: 'GigWorks — Business Software for Bands, DJs & Orchestras',
  description: 'Run bookings, proposals, contracts, invoices, contractor staffing, stage plots, and set lists in one connected workspace.',
  path: '/',
};
const PUBLIC_PAGES = {
  '/': HOME,
  '/customer-stories': { title: 'Customer Stories | GigWorks', description: 'See how entertainment businesses use GigWorks to coordinate bookings, contractors, payments, and event production.', path: '/customer-stories' },
  '/privacy': { title: 'Privacy Policy | GigWorks', description: 'Learn how GigWorks collects, uses, protects, and retains account and business information.', path: '/privacy' },
  '/terms': { title: 'Terms of Service | GigWorks', description: 'Read the terms governing access to and use of the GigWorks entertainment-business platform.', path: '/terms' },
  '/cookies': { title: 'Cookie Policy | GigWorks', description: 'Learn how GigWorks uses essential cookies and local browser storage.', path: '/cookies' },
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
