import { prisma } from './prisma.js';
import { getAnthropicClient } from './anthropic.js';
import { invoiceTotal } from '../routes/invoices.js';

// General-reasoning model — unlike emailReplyClassifier.js's bounded 3-way
// classification, these answers touch real scheduling and pricing
// decisions the business owner acts on, so the stronger model is worth it.
const MODEL = 'claude-sonnet-5';

// Bounds cost/latency on a single question — after this many tool round
// trips, the next call omits tools and forces a final answer from whatever
// was gathered, so a confused loop can't run away.
const MAX_TOOL_ROUNDS = 4;

function computeOfferingTotal(offering) {
  if (!offering) return 0;
  if (offering.type === 'perUnit') return (Number(offering.unitCount) || 0) * (Number(offering.ratePerUnit) || 0);
  return Number(offering.amount) || 0;
}

// ---- Read-only tools for the Q&A loop ----
// Every tool is scoped to accountId internally — the model never sees or
// controls that, it only ever picks a tool name + the tool's own params.

const TOOLS = [
  {
    name: 'get_upcoming_schedule',
    description: "List the account's upcoming bookings within a number of days from today.",
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'How many days ahead to look. Defaults to 14.' } },
    },
  },
  {
    name: 'get_open_proposals',
    description: 'List proposals that have been sent to a client but have not yet received a response.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_overdue_invoices',
    description: 'List invoices that are sent or partially paid and past their due date.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_client',
    description: "Search the account's clients by name, email, or phone.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name, email, or phone fragment to search for.' } },
      required: ['query'],
    },
  },
  {
    name: 'get_client_summary',
    description: "Get one client's booking history, notes, and the status of their proposals/contracts/invoices.",
    input_schema: {
      type: 'object',
      properties: { clientId: { type: 'string' } },
      required: ['clientId'],
    },
  },
];

async function runTool(name, input, accountId) {
  const today = new Date().toISOString().slice(0, 10);
  const nowISO = new Date().toISOString();

  if (name === 'get_upcoming_schedule') {
    const days = Number(input?.days) > 0 ? Number(input.days) : 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    const bookings = await prisma.booking.findMany({
      where: { accountId, deletedAt: null, completedAt: null, eventDate: { gte: today, lte: cutoffISO } },
      select: { id: true, eventName: true, eventDate: true, eventType: true, bookingStatus: true, clientId: true },
      orderBy: { eventDate: 'asc' },
      take: 25,
    });
    const clients = await prisma.client.findMany({ where: { id: { in: bookings.map((b) => b.clientId).filter(Boolean) } }, select: { id: true, firstName: true, lastName: true } });
    const clientById = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
    return bookings.map((b) => ({ eventName: b.eventName, eventDate: b.eventDate, eventType: b.eventType, status: b.bookingStatus, client: clientById.get(b.clientId) || null }));
  }

  if (name === 'get_open_proposals') {
    const rows = await prisma.proposalResponse.findMany({
      where: { accountId, status: 'sent' },
      select: { bookingId: true, recipientName: true, recipientEmail: true, sentAt: true },
      orderBy: { sentAt: 'asc' },
      take: 25,
    });
    return rows.map((r) => ({ recipient: r.recipientName || r.recipientEmail, sentAt: r.sentAt }));
  }

  if (name === 'get_overdue_invoices') {
    const rows = await prisma.invoice.findMany({
      where: { accountId, status: { in: ['sent', 'partial'] }, dueDate: { lt: nowISO } },
      select: { recipientName: true, dueDate: true, snapshot: true, status: true, paidAmount: true },
      orderBy: { dueDate: 'asc' },
      take: 25,
    });
    return rows.map((inv) => ({ recipient: inv.recipientName, dueDate: inv.dueDate, status: inv.status, total: invoiceTotal(inv), paidAmount: inv.paidAmount ?? 0 }));
  }

  if (name === 'find_client') {
    const q = String(input?.query || '').trim();
    if (!q) return [];
    const matches = await prisma.client.findMany({
      where: { accountId, OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { nameNormalized: { contains: q.toLowerCase() } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      take: 10,
    });
    return matches.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email, phone: c.phone }));
  }

  if (name === 'get_client_summary') {
    const clientId = String(input?.clientId || '');
    const client = await prisma.client.findFirst({ where: { id: clientId, accountId } });
    if (!client) return { error: 'Client not found.' };
    const bookings = await prisma.booking.findMany({
      where: { accountId, clientId, deletedAt: null },
      select: { id: true, eventName: true, eventDate: true, bookingStatus: true },
      orderBy: { eventDate: 'desc' },
      take: 10,
    });
    const bookingIds = bookings.map((b) => b.id);
    const [proposals, contracts, invoices] = await Promise.all([
      prisma.proposalResponse.findMany({ where: { accountId, bookingId: { in: bookingIds } }, select: { bookingId: true, status: true, sentAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.contract.findMany({ where: { accountId, bookingId: { in: bookingIds } }, select: { bookingId: true, status: true, sentAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.invoice.findMany({ where: { accountId, bookingId: { in: bookingIds } }, select: { bookingId: true, status: true, snapshot: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      name: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email,
      phone: client.phone,
      notes: client.notes || null,
      bookings: bookings.map((b) => ({
        eventName: b.eventName,
        eventDate: b.eventDate,
        status: b.bookingStatus,
        latestProposalStatus: proposals.find((p) => p.bookingId === b.id)?.status || null,
        latestContractStatus: contracts.find((c) => c.bookingId === b.id)?.status || null,
        latestInvoice: (() => {
          const inv = invoices.find((i) => i.bookingId === b.id);
          return inv ? { status: inv.status, total: invoiceTotal(inv) } : null;
        })(),
      })),
    };
  }

  return { error: `Unknown tool: ${name}` };
}

const SYSTEM_PROMPT = "You are the GigWorks Assistant, helping an event/gig business owner manage their bookings. Answer using only the tools provided — never guess at schedule, proposal, invoice, or client data. Keep answers short and concrete (dates, names, amounts), not generic advice. If a tool returns nothing relevant, say so plainly rather than speculating.";

export async function answerAssistantQuestion(accountId, question, history = []) {
  const anthropic = getAnthropicClient();
  const messages = [
    ...history.filter((m) => m?.role && m?.content).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const useTools = round < MAX_TOOL_ROUNDS;
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      ...(useTools ? { tools: TOOLS } : {}),
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0 || !useTools) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return text || "I wasn't able to find an answer for that.";
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = await Promise.all(toolUses.map(async (block) => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(await runTool(block.name, block.input, accountId)),
    })));
    messages.push({ role: 'user', content: toolResults });
  }

  return "I wasn't able to find an answer for that.";
}

// ---- Structured proposal drafting (single forced tool-call) ----

const DRAFT_TOOL = {
  name: 'draft_proposal',
  description: "Draft a structured event proposal from a client's inquiry.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short proposal title, e.g. "Wedding Reception Package".' },
      hours: { type: 'number', description: 'Estimated hours of service, only if determinable from the inquiry.' },
      matchedOfferingNames: {
        type: 'array',
        items: { type: 'string' },
        description: "Names of items from the provided catalog list that match what the client is asking for. Must exactly match a name from that list — never invent a catalog name.",
      },
      customLineItems: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'number' } }, required: ['name', 'amount'] },
        description: "Extra priced items not in the catalog, with a reasonable estimated price given the catalog's general price range.",
      },
      summary: { type: 'string', description: 'A 2-3 sentence note to the business owner: what was drafted, and which parts (if any) are estimates rather than real catalog prices.' },
    },
    required: ['title', 'matchedOfferingNames', 'customLineItems', 'summary'],
  },
};

export async function draftProposalFromInquiry(accountId, { bookingId, inquiryText }) {
  const trimmed = (inquiryText || '').trim();
  if (!trimmed) throw new Error('Inquiry text is required.');

  const booking = bookingId ? await prisma.booking.findFirst({ where: { id: bookingId, accountId } }) : null;
  const offerings = await prisma.offering.findMany({ where: { accountId }, select: { id: true, name: true, type: true, amount: true, unitCount: true, ratePerUnit: true } });
  const catalogLines = offerings.map((o) => `- ${o.name} ($${computeOfferingTotal(o).toFixed(2)}${o.type === 'perUnit' ? ` @ ${o.unitCount} units` : ''})`).join('\n') || '(no catalog items on file)';
  const bookingContext = booking ? `Event: ${booking.eventName || 'Untitled'}${booking.eventDate ? `, ${booking.eventDate}` : ''}${booking.eventType ? `, ${booking.eventType}` : ''}` : null;

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [DRAFT_TOOL],
    tool_choice: { type: 'tool', name: 'draft_proposal' },
    messages: [{
      role: 'user',
      content: `Draft a proposal from this client inquiry.\n\n${bookingContext ? `${bookingContext}\n\n` : ''}This account's pricing catalog:\n${catalogLines}\n\nClient inquiry:\n"""\n${trimmed}\n"""`,
    }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  const draft = toolUse?.input || {};
  const matchedNames = new Set((draft.matchedOfferingNames || []).map((n) => String(n).trim().toLowerCase()));
  const matchedOfferings = offerings.filter((o) => matchedNames.has(o.name.trim().toLowerCase()));

  return {
    title: draft.title || 'Event Proposal',
    hours: typeof draft.hours === 'number' ? draft.hours : null,
    offerings: matchedOfferings,
    lineItems: (draft.customLineItems || []).map((li) => ({ name: li.name, amount: Number(li.amount) || 0 })),
    summary: draft.summary || '',
  };
}
