export async function uploadToSignedUrl(upload, file) {
  if (upload.uploadFormat === 'raw') {
    const response = await fetch(upload.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!response.ok) throw new Error('Failed to upload document to storage.');
    return;
  }

  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body,
  });
  if (!response.ok) throw new Error('Failed to upload document to storage.');
}
