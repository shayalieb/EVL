const failure = (message, status) => Object.assign(new Error(message), { status });
export async function lookupGoogleVenues({ query, country }, { apiKey = process.env.GOOGLE_PLACES_API_KEY, reserve, fetchImpl = fetch } = {}) {
  if (!apiKey) throw failure('Google search is not configured yet. Your administrator needs to connect Google Places.', 503);
  await reserve();
  try {
    const region = new Intl.DisplayNames(['en'], { type: 'region' }).of(country.toUpperCase());
    const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.googleMapsUri,places.attributions' },
      body: JSON.stringify({ textQuery: `${query}, ${region}`, regionCode: country.toUpperCase(), pageSize: 10 }),
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const data = await response.json();
    return (data.places || []).filter((place) => place.addressComponents?.some((part) => part.types?.includes('country') && part.shortText?.toLowerCase() === country)).map((place) => ({
      placeId: place.id, name: place.displayName?.text || '', formattedAddress: place.formattedAddress || '',
      mapsUrl: /^https:\/\/(?:www\.)?google\.com\//.test(place.googleMapsUri || '') ? place.googleMapsUri : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(place.id)}`,
      attributions: (place.attributions || []).map((item) => ({ name: item.provider || '', url: /^https:\/\//.test(item.providerUri || '') ? item.providerUri : '' })),
    }));
  } catch {
    throw failure('Google search is temporarily unavailable. Try the regular search or enter the venue manually.', 502);
  }
}
