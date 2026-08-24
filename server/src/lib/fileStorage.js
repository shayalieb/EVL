import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

// Constructed lazily (not at module load) — same reasoning as
// server/src/lib/resend.js: a missing key would otherwise crash the entire
// server on boot, not just the file-upload feature.
let client = null;

// A hung Supabase Storage call shouldn't hold a request handler's DB
// connection open indefinitely under load — supabase-js has no direct
// timeout option, so this injects a custom fetch that aborts after 15s
// (the officially documented way to customize its transport).
const STORAGE_TIMEOUT_MS = 15000;

function getClient() {
  if (client) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('File storage is not configured yet (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing).');
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) }) },
  });
  return client;
}

let bucketReady = false;

// Private bucket, created on first use — mirrors the get-or-create pattern
// already used for the account's reusable inquiry link (server/src/routes/
// inquiryLinks.js) rather than requiring a manual one-time dashboard step.
async function ensureBucket() {
  if (bucketReady) return;
  const supabase = getClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
    // A concurrent request may have created it first — that's fine.
    if (createError && !/already exists/i.test(createError.message)) throw createError;
  }
  bucketReady = true;
}

// Key is not derived from the filename — the human-readable name stays in
// the DB row (as it always has), the storage key just needs to be unique.
export async function uploadFile({ accountId, buffer, contentType }) {
  await ensureBucket();
  const key = `${accountId}/${randomUUID()}`;
  const { error } = await getClient().storage.from(BUCKET).upload(key, buffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return key;
}

// Lets browsers send large document bytes straight to object storage. The
// API still chooses the account-scoped key and later creates the database
// row, but never buffers or proxies the file contents itself.
export async function createSignedUpload({ accountId }) {
  await ensureBucket();
  const storageKey = `${accountId}/${randomUUID()}`;
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUploadUrl(storageKey, { upsert: false });
  if (error) throw error;
  return { storageKey, signedUrl: data.signedUrl, token: data.token };
}

export async function uploadedFileSize(storageKey) {
  const { data, error } = await getClient().storage.from(BUCKET).info(storageKey);
  if (error) {
    if (error.status === 404 || error.statusCode === '404') return null;
    throw error;
  }
  return Number(data.metadata?.size ?? data.metadata?.contentLength ?? 0);
}

// Short-lived — minted fresh on every download click rather than stored,
// same reasoning as every other one-time link in this codebase. Supabase
// serves the original contentType and sets the download filename itself, so
// callers just redirect the browser here.
export async function getSignedDownloadUrl(storageKey, filename) {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storageKey, 60, { download: filename });
  if (error) throw error;
  return data.signedUrl;
}

// Same as getSignedDownloadUrl but WITHOUT Supabase's `download` option —
// that option forces Content-Disposition: attachment, which makes a browser
// download the file instead of rendering it, so it's wrong for anything
// meant to display inline (an <iframe>/<img> preview). Still short-lived
// and safe to redirect a browser to directly (see eventDocuments.js's
// /:id/preview route) — unlike a credentialed fetch() of a download URL,
// simple resource loads like iframe/img navigation aren't affected by
// Supabase's signed-URL CORS headers.
export async function getSignedPreviewUrl(storageKey) {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storageKey, 60);
  if (error) throw error;
  return data.signedUrl;
}

// Server-side copy (bytes never leave Supabase, let alone round-trip
// through this process) — used when a Set List library song's PDF gets
// pulled into a specific event: the event's copy needs its own independent
// storage object so deleting it (or the library original) never affects
// the other, matching how every other field on a pulled set list is a full
// deep clone, not a shared reference. See SetListsEditorPage.jsx's
// pullFromLibrary.
export async function copyFile(sourceKey, accountId) {
  await ensureBucket();
  const destKey = `${accountId}/${randomUUID()}`;
  const { error } = await getClient().storage.from(BUCKET).copy(sourceKey, destKey);
  if (error) throw error;
  return destKey;
}

export async function downloadFileBuffer(storageKey) {
  const { data, error } = await getClient().storage.from(BUCKET).download(storageKey);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

// Best-effort — a storage hiccup should never block the DB delete the user
// actually asked for (same reasoning as support.js's notifyAdmin).
export async function deleteFile(storageKey) {
  try {
    const { error } = await getClient().storage.from(BUCKET).remove([storageKey]);
    if (error) throw error;
  } catch (err) {
    console.error(`Failed to delete storage object ${storageKey}:`, err);
  }
}
