import bcrypt from 'bcrypt';
import { normalizeValidEmail } from './emailAddress.js';
import { MIN_PASSWORD_LENGTH, passwordTooWeak } from './password.js';

export async function createTestAccount(prisma, input, actorUserId, permissions) {
  const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const lastName = typeof input.lastName === 'string' ? input.lastName.trim() : '';
  const email = normalizeValidEmail(input.email);
  if (!firstName || !lastName || !email) {
    throw Object.assign(new Error('First name, last name, and a valid email address are required.'), { status: 400 });
  }
  if (passwordTooWeak(input.password) || Buffer.byteLength(input.password, 'utf8') > 72) {
    throw Object.assign(new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters and at most 72 bytes.`), { status: 400 });
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { firstName, lastName, email, passwordHash } });
      const account = await tx.account.create({ data: { signupSource: 'test', approvedAt: new Date(), approvedById: actorUserId } });
      await tx.membership.create({ data: { userId: user.id, accountId: account.id, role: 'owner', permissions } });
      await tx.accountActivity.create({ data: { accountId: account.id, actorUserId, type: 'account_created', summary: 'Test account created by platform admin', metadata: { source: 'test' } } });
      return { id: account.id };
    });
  } catch (err) {
    if (err.code === 'P2002') throw Object.assign(new Error('An account with that email already exists.'), { status: 409 });
    throw err;
  }
}
