import { seedE2e } from '../server/scripts/seedE2e.js';
import { prisma } from '../server/src/lib/prisma.js';

export default async function globalSetup() {
  await seedE2e();
  await prisma.$disconnect();
}
