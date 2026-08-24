import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';
import { allPermissions } from '../src/lib/membership.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export const E2E = {
  email: 'owner@e2e.test',
  password: 'browser-test-password',
  proposalToken: 'e2e-proposal-token',
  contractToken: 'e2e-contract-token',
  invoiceToken: 'e2e-invoice-token',
  portalToken: 'e2e-portal-token',
};

export async function seedE2e() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Account", "Session", "BackgroundJobLease", "WaitlistEntry" RESTART IDENTITY CASCADE',
  );
  const account = await prisma.account.create({ data: { approvedAt: new Date() } });
  const user = await prisma.user.create({ data: {
    firstName: 'Browser', lastName: 'Owner', email: E2E.email,
    passwordHash: await bcrypt.hash(E2E.password, 4),
  } });
  await prisma.membership.create({ data: { userId: user.id, accountId: account.id, role: 'owner', permissions: allPermissions() } });
  await prisma.accountData.create({ data: { accountId: account.id, data: {
    businessInfo: { name: 'E2E Events', email: E2E.email },
    venues: [], contractorTypes: [], emailTemplates: [], offerings: [], proposalTemplates: [], contractTemplates: [], setListLibrary: [], contractorGroups: [],
    eventTypes: ['Wedding'],
    bookingStatuses: [{ id: 'new', label: 'New Lead', color: '#6366f1' }],
    eventStatuses: [{ id: 'confirmed', label: 'Confirmed', color: '#10b981' }],
    inquiryStatuses: [{ id: 'pending', label: 'Pending', bucket: 'pending', color: '#f59e0b' }],
  } } });
  const client = await prisma.client.create({ data: { id: 'e2e-client', accountId: account.id, firstName: 'Casey', lastName: 'Client', email: 'client@e2e.test' } });
  await prisma.clientPortalToken.create({ data: { clientId: client.id, tokenHash: hash(E2E.portalToken), expiresAt: new Date(Date.now() + 3_600_000) } });

  const snapshot = {
    businessInfo: { name: 'E2E Events', email: E2E.email },
    client: { firstName: 'Casey', lastName: 'Client', email: 'client@e2e.test' },
    booking: { eventName: 'Recipient Test', eventType: 'Wedding', eventDate: '2026-12-12', venue: { name: 'Test Hall' } },
    proposal: { lineItems: [{ name: 'Service', amount: 500 }], offerings: [], sections: [] },
  };
  await prisma.proposalResponse.create({ data: { accountId: account.id, bookingId: 'recipient-booking', snapshot, status: 'sent', tokenHash: hash(E2E.proposalToken), recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email } });
  await prisma.contract.create({ data: { accountId: account.id, bookingId: 'recipient-booking', snapshot, terms: 'These are the E2E contract terms.', status: 'sent', clientTokenHash: hash(E2E.contractToken), recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email } });
  await prisma.invoice.create({ data: { accountId: account.id, bookingId: 'recipient-booking', snapshot: { ...snapshot, event: snapshot.booking, lineItems: [{ name: 'Service', amount: 500 }] }, status: 'sent', acceptPayment: false, recipientEmail: 'client@e2e.test', recipientName: 'Casey Client', ownerEmail: E2E.email, payTokenHash: hash(E2E.invoiceToken), sentAt: new Date() } });
}
