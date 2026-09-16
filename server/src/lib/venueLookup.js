const text = (value) => typeof value === 'string' ? value.trim() : '';

export function mapVenuePlace(place = {}) {
  return {
    placeId: text(place.place_id), name: text(place.name),
    address1: [text(place.housenumber), text(place.street)].filter(Boolean).join(' '),
    city: text(place.city), state: text(place.state_code || place.state), zip: text(place.postcode),
    contactPhone: text(place.contact?.phone), contactEmail: text(place.contact?.email),
    formattedAddress: text(place.formatted),
  };
}

export async function lookupVenue({ query, placeId }, { apiKey = process.env.GEOAPIFY_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw Object.assign(new Error('Venue lookup is not configured yet. Contact your administrator.'), { status: 503 });
  const url = new URL(placeId ? 'https://api.geoapify.com/v2/place-details' : 'https://api.geoapify.com/v1/geocode/search');
  url.searchParams.set('apiKey', apiKey);
  if (placeId) {
    url.searchParams.set('id', placeId);
    url.searchParams.set('features', 'details');
  } else {
    url.searchParams.set('text', query);
    url.searchParams.set('type', 'amenity');
    url.searchParams.set('limit', '5');
  }
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Provider unavailable');
    const data = await response.json();
    return (data.features || []).map((feature) => mapVenuePlace(feature.properties)).filter((place) => place.placeId && place.name);
  } catch {
    throw Object.assign(new Error('Venue lookup is temporarily unavailable. Please try again.'), { status: 502 });
  }
}
