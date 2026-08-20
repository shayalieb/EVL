// One-off, idempotent: hashes every EventDocument row's existing plaintext
// shareToken into the new shareTokenHash column (see
// server/prisma/schema.prisma's EventDocument.shareTokenHash comment and
// server/src/routes/eventDocuments.js's publicSongSheetsRouter, which now
// looks documents up by shareTokenHash instead of the plaintext column).
// Only touches rows where shareTokenHash is still null — safe to re-run.
//
// Usage: npm run backfill:share-token-hash   (from server/)
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { hashToken } from '../src/lib/resetToken.js';

async function main() {
  const rows = await prisma.eventDocument.findMany({
    where: { shareToken: { not: null }, shareTokenHash: null },
    select: { id: true, shareToken: true },
  });
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.eventDocument.update({ where: { id: row.id }, data: { shareTokenHash: hashToken(row.shareToken) } });
  }
  return rows.length;
}

main()
  .then((count) => {
    console.log(`Backfilled shareTokenHash for ${count} EventDocument row(s).`);
    return prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
