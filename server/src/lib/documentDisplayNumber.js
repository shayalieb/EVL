import { prisma } from './prisma.js';

// PostgreSQL allocates the next number atomically across every document type.
// Gaps after a failed create are acceptable; duplicate client references are not.
export async function nextDocumentDisplayNumber() {
  const [row] = await prisma.$queryRaw`SELECT nextval('"DocumentDisplayNumberSeq"') AS number`;
  const number = Number(row.number);
  if (!Number.isInteger(number) || number < 100000 || number > 999999) {
    throw new Error('The six-digit document number range has been exhausted.');
  }
  return number;
}
