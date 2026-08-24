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
