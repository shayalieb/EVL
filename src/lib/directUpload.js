export async function uploadToSignedUrl(signedUrl, file) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body,
  });
  if (!response.ok) throw new Error('Failed to upload document to storage.');
}
