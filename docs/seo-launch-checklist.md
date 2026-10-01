# GigWorks SEO launch checklist

The application now emits crawlable HTML, canonical URLs, social preview metadata, structured product data, a current sitemap, server-level noindex headers for private pages, and a real 404 for unknown direct URLs.

## Google Search Console

1. Create a Domain property for `gigworks.io` in Google Search Console.
2. Add the TXT record Google provides at the DNS host for the domain.
3. Set the same verification value as `GOOGLE_SITE_VERIFICATION` in the Vercel production environment. The build inserts it into every public page as a second verification method.
4. Submit `https://www.gigworks.io/sitemap.xml`.
5. Inspect the homepage and each search landing page, then request indexing.

## Ongoing measurement

- Review indexed-page coverage, search queries, impressions, click-through rate, and Core Web Vitals monthly in Search Console.
- Compare search landing pages by query and conversion intent before changing titles or copy.
- Refresh sitemap `lastmod` values only when the page content changes.
- Add `aggregateRating` or `review` structured data only when the displayed rating comes from genuine, published customer reviews. Do not create placeholder ratings.

## Public pages

- `/band-management-software`
- `/entertainment-agency-software`
- `/dj-booking-software`
- `/musician-scheduling-software`
- `/contractor-management-software`
- `/stage-plot-software`
- `/proposal-contract-invoice-software`
