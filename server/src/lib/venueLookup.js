const text = (value) => typeof value === 'string' ? value.trim() : '';

export function mapVenuePlace(place = {}) {
  return {
    placeId: text(place.place_id), name: text(place.name), countryCode: text(place.country_code).toLowerCase(),
    address1: [text(place.housenumber), text(place.street)].filter(Boolean).join(' '),
    city: text(place.city), state: text(place.state_code || place.state), zip: text(place.postcode),
    contactPhone: text(place.contact?.phone), contactEmail: text(place.contact?.email),
    formattedAddress: text(place.formatted),
  };
}

const countryBoundaries = new Map();
export async function lookupVenue({ query, placeId, country = 'us' }, { apiKey = process.env.GEOAPIFY_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw Object.assign(new Error('Venue lookup is not configured yet. Contact your administrator.'), { status: 503 });
  const url = new URL(placeId ? 'https://api.geoapify.com/v2/place-details' : 'https://api.geoapify.com/v2/places');
  url.searchParams.set('apiKey', apiKey);
  if (placeId) {
    url.searchParams.set('id', placeId);
    url.searchParams.set('features', 'details');
  } else {
    url.searchParams.set('name', query.replace(/\s+v\d+$/i, '').trim());
    url.searchParams.set('categories', 'accommodation,activity,catering,entertainment,leisure,religion');
    url.searchParams.set('limit', '20');
  }
  try {
    if (!placeId) {
      // Places requires a boundary; its countrycode filter is not yet supported.
      let boundary = fetchImpl === fetch ? countryBoundaries.get(country) : null;
      if (!boundary) {
        const countryUrl = new URL('https://api.geoapify.com/v1/geocode/search');
        countryUrl.search = new URLSearchParams({ apiKey, text: new Intl.DisplayNames(['en'], { type: 'region' }).of(country.toUpperCase()), type: 'country', filter: `countrycode:${country}`, limit: '1' }).toString();
        const response = await fetchImpl(countryUrl, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Country lookup unavailable');
        const data = await response.json();
        boundary = data.features?.find((item) => item.properties?.country_code?.toLowerCase() === country)?.properties?.place_id;
        if (!boundary) throw new Error('Country boundary unavailable');
        if (fetchImpl === fetch) countryBoundaries.set(country, boundary);
      }
      url.searchParams.set('filter', `place:${boundary}`);
    }
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Provider unavailable');
    const data = await response.json();
    return (data.features || []).map((feature) => mapVenuePlace(feature.properties)).filter((place) => place.placeId && place.name && place.countryCode === country);
  } catch {
    throw Object.assign(new Error('Venue lookup is temporarily unavailable. Please try again.'), { status: 502 });
  }
}
