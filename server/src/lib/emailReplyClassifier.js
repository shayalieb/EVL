import { getAnthropicClient } from './anthropic.js';

// Cheap/fast model — this is a bounded 3-way classification on a short
// snippet of text, not open-ended generation, so there's no reason to reach
// for a larger model.
const MODEL = 'claude-haiku-4-5-20251001';

// Forcing a tool call (rather than parsing free-text output) means the
// result is always exactly one of these three values — no prompt-injection
// or verbosity in the reply text can make the model wander off-schema.
const CLASSIFY_TOOL = {
  name: 'classify_availability_reply',
  description: "Classify a contractor's email reply to a gig booking availability inquiry.",
  input_schema: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['confirmed', 'declined', 'ambiguous'],
        description:
          "'confirmed' if the contractor clearly states they are available and accepting the gig. " +
          "'declined' if they clearly state they are not available or are turning down the gig. " +
          "'ambiguous' for anything else — questions, requested changes, partial availability, " +
          "noncommittal replies, or anything that doesn't clearly resolve to one of the above.",
      },
    },
    required: ['classification'],
  },
};

const VALID = new Set(['confirmed', 'declined', 'ambiguous']);

// replyText should already be quote-stripped (see emailQuoteStrip.js) —
// otherwise the account's own outbound "are you available?" question, echoed
// back in the quoted thread, gets fed in alongside the actual answer.
export async function classifyContractorReply({ replyText, contractorName, eventName, eventDate }) {
  const trimmed = (replyText || '').trim();
  if (!trimmed) return 'ambiguous';

  const anthropic = getAnthropicClient();
  const context = [
    contractorName ? `Contractor: ${contractorName}` : null,
    eventName ? `Gig: ${eventName}` : null,
    eventDate ? `Date: ${eventDate}` : null,
  ].filter(Boolean).join('\n');

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_availability_reply' },
    messages: [{
      role: 'user',
      content: `A contractor was asked whether they're available for a gig. Below is their email reply. Classify it.\n\n${context ? `${context}\n\n` : ''}Reply:\n"""\n${trimmed}\n"""`,
    }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  const value = toolUse?.input?.classification;
  return VALID.has(value) ? value : 'ambiguous';
}
