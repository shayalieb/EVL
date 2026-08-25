const MAX_ATTEMPTS = 3;

export async function withSerializableTransaction(database, work, maxAttempts = MAX_ATTEMPTS) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await database.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error?.code !== 'P2034' || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('Serializable transaction retry limit reached.');
}
