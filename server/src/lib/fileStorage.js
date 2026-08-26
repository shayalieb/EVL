import { randomUUID } from 'crypto';
import {
  CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'documents';
const STORAGE_TIMEOUT_MS = 15000;
const SIGNED_URL_TTL_SECONDS = 60;

let supabaseClient = null;
let railwayClient = null;
let supabaseBucketReady = false;

function provider() {
  return (process.env.STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
}

function hasSupabaseFallback() {
  return provider() === 'railway' && process.env.STORAGE_FALLBACK_SUPABASE === 'true';
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase file storage is not configured.');
  supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) }) },
  });
  return supabaseClient;
}

function railwayBucket() {
  if (!process.env.AWS_S3_BUCKET_NAME) throw new Error('Railway file storage bucket is not configured.');
  return process.env.AWS_S3_BUCKET_NAME;
}

function getRailwayClient() {
  if (railwayClient) return railwayClient;
  railwayClient = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION || 'auto',
    forcePathStyle: process.env.AWS_S3_URL_STYLE === 'path',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return railwayClient;
}

async function ensureSupabaseBucket() {
  if (supabaseBucketReady) return;
  const supabase = getSupabaseClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (!buckets.some((bucket) => bucket.name === SUPABASE_BUCKET)) {
    const { error } = await supabase.storage.createBucket(SUPABASE_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  supabaseBucketReady = true;
}

function isS3NotFound(error) {
  return error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404;
}

async function railwayObjectExists(storageKey) {
  try {
    await getRailwayClient().send(new HeadObjectCommand({ Bucket: railwayBucket(), Key: storageKey }));
    return true;
  } catch (error) {
    if (isS3NotFound(error)) return false;
    throw error;
  }
}

async function supabaseDownload(storageKey) {
  const { data, error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).download(storageKey);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function putRailwayObject(storageKey, buffer, contentType) {
  await getRailwayClient().send(new PutObjectCommand({
    Bucket: railwayBucket(), Key: storageKey, Body: buffer, ContentType: contentType || 'application/octet-stream',
  }));
}

// Idempotent migration primitive: preserve the database's existing key so no
// row rewrite is needed, skip objects already copied, and verify byte length
// after upload before reporting success.
export async function copySupabaseObjectToRailway({ storageKey, contentType }) {
  if (await railwayObjectExists(storageKey)) return { copied: false };
  const buffer = await supabaseDownload(storageKey);
  await putRailwayObject(storageKey, buffer, contentType);
  const metadata = await getRailwayClient().send(new HeadObjectCommand({ Bucket: railwayBucket(), Key: storageKey }));
  if (Number(metadata.ContentLength) !== buffer.length) throw new Error(`Size verification failed for ${storageKey}.`);
  return { copied: true, size: buffer.length };
}

export async function uploadFile({ accountId, buffer, contentType }) {
  const storageKey = `${accountId}/${randomUUID()}`;
  if (provider() === 'railway') {
    await putRailwayObject(storageKey, buffer, contentType);
  } else {
    await ensureSupabaseBucket();
    const { error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).upload(storageKey, buffer, {
      contentType: contentType || 'application/octet-stream', upsert: false,
    });
    if (error) throw error;
  }
  return storageKey;
}

export async function createSignedUpload({ accountId, contentType }) {
  const storageKey = `${accountId}/${randomUUID()}`;
  if (provider() === 'railway') {
    const command = new PutObjectCommand({
      Bucket: railwayBucket(), Key: storageKey, ContentType: contentType || 'application/octet-stream',
    });
    return {
      storageKey,
      signedUrl: await getSignedUrl(getRailwayClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS }),
      uploadFormat: 'raw',
    };
  }
  await ensureSupabaseBucket();
  const { data, error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).createSignedUploadUrl(storageKey, { upsert: false });
  if (error) throw error;
  return { storageKey, signedUrl: data.signedUrl, token: data.token, uploadFormat: 'form' };
}

export async function uploadedFileSize(storageKey) {
  if (provider() === 'railway') {
    try {
      const data = await getRailwayClient().send(new HeadObjectCommand({ Bucket: railwayBucket(), Key: storageKey }));
      return Number(data.ContentLength || 0);
    } catch (error) {
      if (!isS3NotFound(error)) throw error;
      if (!hasSupabaseFallback()) return null;
    }
  }
  const { data, error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).info(storageKey);
  if (error) {
    if (error.status === 404 || error.statusCode === '404') return null;
    throw error;
  }
  return Number(data.metadata?.size ?? data.metadata?.contentLength ?? 0);
}

async function signedSupabaseUrl(storageKey, filename) {
  const options = filename ? { download: filename } : undefined;
  const { data, error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS, options);
  if (error) throw error;
  return data.signedUrl;
}

async function signedRailwayUrl(storageKey, filename) {
  const command = new GetObjectCommand({
    Bucket: railwayBucket(),
    Key: storageKey,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"` } : {}),
  });
  return getSignedUrl(getRailwayClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

export async function getSignedDownloadUrl(storageKey, filename) {
  if (provider() === 'railway') {
    if (await railwayObjectExists(storageKey)) return signedRailwayUrl(storageKey, filename);
    if (!hasSupabaseFallback()) throw new Error('Stored file was not found.');
  }
  return signedSupabaseUrl(storageKey, filename);
}

export async function getSignedPreviewUrl(storageKey) {
  if (provider() === 'railway') {
    if (await railwayObjectExists(storageKey)) return signedRailwayUrl(storageKey);
    if (!hasSupabaseFallback()) throw new Error('Stored file was not found.');
  }
  return signedSupabaseUrl(storageKey);
}

export async function downloadFileBuffer(storageKey) {
  if (provider() === 'railway') {
    try {
      const data = await getRailwayClient().send(new GetObjectCommand({ Bucket: railwayBucket(), Key: storageKey }));
      return Buffer.from(await data.Body.transformToByteArray());
    } catch (error) {
      if (!isS3NotFound(error) || !hasSupabaseFallback()) throw error;
    }
  }
  return supabaseDownload(storageKey);
}

export async function copyFile(sourceKey, accountId, contentType = 'application/octet-stream') {
  const destinationKey = `${accountId}/${randomUUID()}`;
  if (provider() === 'railway') {
    if (await railwayObjectExists(sourceKey)) {
      await getRailwayClient().send(new CopyObjectCommand({ Bucket: railwayBucket(), CopySource: `${railwayBucket()}/${sourceKey}`, Key: destinationKey }));
    } else if (hasSupabaseFallback()) {
      await putRailwayObject(destinationKey, await supabaseDownload(sourceKey), contentType);
    } else {
      throw new Error('Stored file was not found.');
    }
  } else {
    await ensureSupabaseBucket();
    const { error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).copy(sourceKey, destinationKey);
    if (error) throw error;
  }
  return destinationKey;
}

export async function deleteFile(storageKey) {
  const failures = [];
  if (provider() === 'railway') {
    try {
      await getRailwayClient().send(new DeleteObjectCommand({ Bucket: railwayBucket(), Key: storageKey }));
    } catch (error) {
      failures.push(error);
    }
  }
  if (provider() === 'supabase' || hasSupabaseFallback()) {
    try {
      const { error } = await getSupabaseClient().storage.from(SUPABASE_BUCKET).remove([storageKey]);
      if (error) throw error;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) console.error(`Failed to delete storage object ${storageKey}:`, failures[0]);
}
