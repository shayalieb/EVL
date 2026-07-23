import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { attachMembership } from '../lib/membership.js';
import { sendMail, buildFromHeader } from '../lib/mailer.js';
import { hashToken, generateToken } from '../lib/resetToken.js';
import { getStripeClient } from '../lib/stripe.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Mirrors src/lib/offerings.js's computeOfferingTotal/computeOfferingsTotal
// exactly — duplicated here (not imported, frontend and backend are
// separate bundles) as a server-side sanity check before real money moves,
// rather than trusting the client-supplied snapshot's total blindly.
// Exported so stripeWebhooks.js can compute the same total when a webhook
// marks an invoice paid, without a second copy of this math.
export function lineItemTotal(item) {
  if (item?.type === 'perUnit') {
    return (Number(item.unitCount) || 0) * (Number(item.ratePerUnit) || 0);
  }
  return Number(item?.amount) || 0;
}
export function invoiceTotal(invoice) {
  return (invoice.snapshot?.lineItems || []).reduce((sum, item) => sum + lineItemTotal(item), 0);
}

function serializeForOwner(invoice) {
  return {
    id: invoice.id,
    bookingId: invoice.bookingId,
    snapshot: invoice.snapshot,
    dueDate: invoice.dueDate,
    memo: invoice.memo,
    status: invoice.status,
    recipientEmail: invoice.recipientEmail,
    recipientName: invoice.recipientName,
    total: invoiceTotal(invoice),
    paidAmount: invoice.paidAmount ?? 0,
    sentAt: invoice.sentAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    createdAt: invoice.createdAt,
  };
}

function serializeForPublic(invoice) {
  return {
    snapshot: invoice.snapshot,
    dueDate: invoice.dueDate,
    memo: invoice.memo,
    status: invoice.status,
    recipientName: invoice.recipientName,
    total: invoiceTotal(invoice),
    paidAmount: invoice.paidAmount ?? 0,
    paidAt: invoice.paidAt,
  };
}

// ---- Authenticated (owner-side) ----
// Same permission model as contracts.js — any member of the account can
// create/send/void invoices, no extra role/permission gate beyond having
// account access at all. Connect *setup* (billing.js) is owner/admin-only
// separately; day-to-day invoicing isn't.

router.use(requireAuth, asyncHandler(attachMembership));

router.get('/', asyncHandler(async (req, res) => {
  const { bookingId } = req.query;
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });

  const invoices = await prisma.invoice.findMany({
    where: { accountId: req.membership.accountId, bookingId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ invoices: invoices.map(serializeForOwner) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { bookingId, recipientEmail, recipientName, snapshot, dueDate, memo } = req.body || {};
  if (!bookingId?.trim() || !recipientEmail?.trim() || !snapshot) {
    return res.status(400).json({ error: 'bookingId, recipientEmail, and snapshot are required.' });
  }

  const owner = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { email: true } });
  const invoice = await prisma.invoice.create({
    data: {
      accountId: req.membership.accountId,
      bookingId,
      snapshot,
      dueDate: dueDate ? new Date(dueDate) : null,
      memo: memo || null,
      status: 'draft',
      recipientEmail,
      recipientName: recipientName || null,
      ownerEmail: owner.email,
    },
  });
  res.status(201).json({ invoice: serializeForOwner(invoice) });
}));

// Snapshot/dueDate/memo/recipient stay editable only while still a draft —
// once sent, a pay link is out in the world pointing at this exact content.
router.patch('/:id', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  if (invoice.status !== 'draft') {
    return res.status(400).json({ error: 'Only draft invoices can be edited.' });
  }

  const { recipientEmail, recipientName, snapshot, dueDate, memo } = req.body || {};
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      ...(recipientEmail !== undefined ? { recipientEmail } : {}),
      ...(recipientName !== undefined ? { recipientName: recipientName || null } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(memo !== undefined ? { memo: memo || null } : {}),
    },
  });
  res.json({ invoice: serializeForOwner(updated) });
}));

router.post('/:id/send', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  if (invoice.status !== 'draft') {
    return res.status(400).json({ error: 'This invoice has already been sent.' });
  }
  if (invoiceTotal(invoice) <= 0) {
    return res.status(400).json({ error: 'Add at least one line item before sending.' });
  }

  const account = await prisma.account.findUnique({ where: { id: req.membership.accountId } });
  if (!account.stripeChargesEnabled) {
    return res.status(400).json({ error: 'Connect your Stripe account in Settings → Billing before sending invoices.' });
  }

  const payToken = generateToken();
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'sent', sentAt: new Date(), payTokenHash: hashToken(payToken) },
  });

  const payUrl = `${frontendUrl()}/invoice/${payToken}`;
  const fromName = invoice.snapshot?.businessInfo?.name || 'GigWorks';
  const total = invoiceTotal(invoice);
  const totalLabel = total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  // Same best-effort pattern as contracts.js's POST / — the invoice already
  // exists and its pay link works even if this send fails; surface a soft
  // error rather than failing the whole request.
  let emailError = null;
  try {
    await sendMail({
      from: buildFromHeader(fromName),
      to: invoice.recipientEmail,
      subject: `Invoice for ${totalLabel} from ${fromName}`,
      html: `<p>Hi ${invoice.recipientName || 'there'},</p><p>You have a new invoice for ${totalLabel}${invoice.dueDate ? ` due ${new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.</p><p><a href="${payUrl}">${payUrl}</a></p><p>${fromName}</p>`,
    });
  } catch {
    emailError = 'Invoice was sent, but the email could not be delivered — copy the link below to share it manually.';
  }

  res.json({ invoice: serializeForOwner(updated), payLink: payUrl, emailError });
}));

// Manual payment-status override for money collected outside Stripe (cash,
// check, wire, etc.) — Stripe's own webhook (stripeWebhooks.js) sets 'paid'
// automatically when the online pay link is used, this covers everything
// else. Source status must already be sent/partial/paid (not draft/void) —
// there's nothing to record a payment against otherwise.
router.post('/:id/mark-payment', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  if (!['sent', 'partial', 'paid'].includes(invoice.status)) {
    return res.status(400).json({ error: 'Only a sent invoice can have its payment status updated.' });
  }

  const { status } = req.body || {};
  const total = invoiceTotal(invoice);
  let data;
  if (status === 'paid') {
    data = { status: 'paid', paidAmount: total, paidAt: new Date() };
  } else if (status === 'partial') {
    const amount = Number(req.body?.paidAmount);
    if (!(amount > 0) || amount >= total) {
      return res.status(400).json({ error: 'Partial amount must be greater than $0 and less than the invoice total.' });
    }
    data = { status: 'partial', paidAmount: amount, paidAt: null };
  } else if (status === 'sent') {
    data = { status: 'sent', paidAmount: null, paidAt: null };
  } else {
    return res.status(400).json({ error: "status must be 'sent', 'partial', or 'paid'." });
  }

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data });
  res.json({ invoice: serializeForOwner(updated) });
}));

router.post('/:id/void', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.accountId !== req.membership.accountId) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  if (invoice.status === 'paid') {
    return res.status(400).json({ error: 'A paid invoice cannot be voided.' });
  }
  if (invoice.status === 'void') {
    return res.status(400).json({ error: 'This invoice is already void.' });
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'void', voidedAt: new Date() },
  });
  res.json({ invoice: serializeForOwner(updated) });
}));

// ---- Public (unauthenticated, token-based) ----
// Mounted separately in index.js under a distinct path prefix (see
// contracts.js/publicContractsRouter for the identical pattern) so it never
// passes through the requireAuth/attachMembership pair above.

export const publicInvoicesRouter = Router();

async function findByToken(token) {
  const hash = hashToken(token);
  return prisma.invoice.findFirst({ where: { payTokenHash: hash } });
}

function checkEmail(invoice, email) {
  return !!email?.trim() && email.trim().toLowerCase() === invoice.recipientEmail.toLowerCase();
}

publicInvoicesRouter.post('/:token/view', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  let invoice = await findByToken(req.params.token);
  if (!invoice) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (!checkEmail(invoice, email)) {
    return res.status(403).json({ error: "That email doesn't match this link." });
  }

  // The browser can land back here (from Stripe's success_url) before the
  // checkout.session.completed webhook has been processed — a stale status
  // here means "the client already paid, the business doesn't know yet",
  // so do a one-off live check rather than waiting on the webhook alone.
  const sessionId = req.query.session_id;
  if (sessionId && invoice.status === 'sent') {
    try {
      const account = await prisma.account.findUnique({ where: { id: invoice.accountId } });
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: account.stripeAccountId });
      if (session.payment_status === 'paid') {
        invoice = await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'paid', paidAmount: invoiceTotal(invoice), paidAt: new Date(), stripePaymentIntentId: session.payment_intent },
        });
      }
    } catch {
      // best effort — the webhook will still catch this shortly if this check fails
    }
  }

  res.json({ invoice: serializeForPublic(invoice) });
}));

publicInvoicesRouter.post('/:token/checkout', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  const invoice = await findByToken(req.params.token);
  if (!invoice) return res.status(404).json({ error: 'This link is invalid or has expired.' });
  if (!checkEmail(invoice, email)) {
    return res.status(403).json({ error: "That email doesn't match this link." });
  }
  if (invoice.status !== 'sent' && invoice.status !== 'partial') {
    return res.status(400).json({ error: 'This invoice is no longer payable.' });
  }

  const account = await prisma.account.findUnique({ where: { id: invoice.accountId } });
  if (!account.stripeChargesEnabled) {
    return res.status(400).json({ error: 'This business is not currently able to accept payment. Please contact them directly.' });
  }

  const stripe = getStripeClient();
  // A partial invoice has already had some amount recorded against it (e.g.
  // an offline deposit) — charge only what's left as a single lump-sum line
  // rather than the original itemized list, which would overcharge.
  const remaining = invoiceTotal(invoice) - (invoice.paidAmount || 0);
  const lineItems = invoice.status === 'partial'
    ? [{ price_data: { currency: 'usd', product_data: { name: 'Remaining balance' }, unit_amount: Math.round(remaining * 100) }, quantity: 1 }]
    : (invoice.snapshot.lineItems || []).map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name || 'Item',
            ...(item.details ? { description: item.details } : {}),
          },
          // Direct charge, created on the connected account itself — funds
          // land in that business's own Stripe balance/payouts, no platform
          // involvement in the money movement (no application_fee_amount set
          // anywhere — that's the one line to add later if a platform fee is
          // ever introduced).
          unit_amount: Math.round(lineItemTotal(item) * 100 / (item.type === 'perUnit' ? (Number(item.unitCount) || 1) : 1)),
        },
        quantity: item.type === 'perUnit' ? (Number(item.unitCount) || 1) : 1,
      }));
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    metadata: { invoiceId: invoice.id },
    success_url: `${frontendUrl()}/invoice/${req.params.token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/invoice/${req.params.token}`,
  }, { stripeAccount: account.stripeAccountId });

  await prisma.invoice.update({ where: { id: invoice.id }, data: { stripeCheckoutSessionId: session.id } });
  res.json({ url: session.url });
}));

export default router;
