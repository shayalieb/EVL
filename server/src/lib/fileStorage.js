import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';

// Constructed lazily (not at module load) — same reasoning as
// server/src/lib/resend.js: a missing key would otherwise crash the entire
// server on boot, not just the file-upload feature.
let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('File storage is not configured yet (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing).');
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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

// Short-lived — minted fresh on every download click rather than stored,
// same reasoning as every other one-time link in this codebase. Supabase
// serves the original contentType and sets the download filename itself, so
// callers just redirect the browser here.
export async function getSignedDownloadUrl(storageKey, filename) {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(storageKey, 60, { download: filename });
  if (error) throw error;
  return data.signedUrl;
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
