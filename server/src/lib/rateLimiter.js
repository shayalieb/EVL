import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';

let client;
let connectPromise;

async function connectedRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    const candidate = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => (retries < 2 ? Math.min(retries * 100, 200) : new Error('Redis unavailable')),
      },
    });
    candidate.on('error', (error) => {
      console.error(JSON.stringify({ level: 'error', type: 'redis_error', error: error.message }));
    });
    client = candidate;
    connectPromise = candidate.connect().catch(async (error) => {
      if (client === candidate) {
        client = undefined;
        connectPromise = undefined;
      }
      if (candidate.isOpen) await candidate.disconnect().catch(() => {});
      throw error;
    });
  }
  await connectPromise;
  return client;
}

function sharedStore(name) {
  if (!process.env.REDIS_URL) return undefined;
  return new RedisStore({
    prefix: `evl:rate-limit:${name}:`,
    sendCommand: async (...args) => {
      const redis = await connectedRedis();
      return redis.sendCommand(args);
    },
  });
}

export function createRateLimiter(name, options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    ...options,
    store: sharedStore(name),
  });
}

export async function pingRedis() {
  const redis = await connectedRedis();
  if (!redis) return;
  await redis.ping();
}

export async function closeRedis() {
  if (!client) return;
  try {
    await connectPromise;
    if (client.isOpen) await client.quit();
  } finally {
    client = undefined;
    connectPromise = undefined;
  }
}

// One atomic, shared daily budget for the entire application. Fail closed when
// Redis is unavailable so restarts/replicas cannot reset the paid-search cap.
export async function reserveGoogleVenueSearch({ getRedis = connectedRedis, dailyLimit = process.env.GOOGLE_VENUE_DAILY_LIMIT || 25 } = {}) {
  const limit = Number(dailyLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw Object.assign(new Error('Google search is disabled by the daily budget setting.'), { status: 503 });
  try {
    const redis = await getRedis();
    if (!redis) throw new Error('Shared budget unavailable');
    const day = new Date().toISOString().slice(0, 10);
    const used = await redis.eval("local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 172800) end; return n", { keys: [`evl:google-venue-budget:${day}`], arguments: [] });
    if (Number(used) > limit) throw Object.assign(new Error('Today’s Google search limit has been reached. Use regular search, website import, or manual entry.'), { status: 429 });
  } catch (error) {
    if (error.status === 429) throw error;
    throw Object.assign(new Error('Google search is unavailable because its daily budget cannot be checked. Use regular search or website import.'), { status: 503 });
  }
}
