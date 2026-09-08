import { getAnthropicClient } from './anthropic.js';
import { KNOWN_EQUIPMENT_TYPES, equipmentTypeDescription, expandEquipmentRequest } from './stagePlotEquipmentReference.js';

// Cheap/fast model — bounded extraction into a closed schema, not
// open-ended generation, same reasoning as emailReplyClassifier.js.
const MODEL = 'claude-haiku-4-5-20251001';

// The enum is built FROM the reference table's known keys (plus 'unknown')
// so the model can never name equipment the table doesn't actually support
// — it can only ever point at something expandEquipmentRequest() knows how
// to turn into real rows, or admit it doesn't recognize the request. Each
// enum value's own description (not just its key name) is what actually
// teaches the model the colloquial phrasing it maps to — see each type's
// `description` in stagePlotEquipmentReference.js.
const TYPE_ENUM_DESCRIPTION = KNOWN_EQUIPMENT_TYPES
  .map((type) => `"${type}": ${equipmentTypeDescription(type)}`)
  .concat('"unknown": the request does not clearly match any of the above.')
  .join(' | ');

const EXTRACT_TOOL = {
  name: 'extract_stage_plot_equipment',
  description: 'Extract one or more pieces of stage/production equipment mentioned in a request to add items to a stage plot\'s production (input/channel) list or backline (physical gear) list.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...KNOWN_EQUIPMENT_TYPES, 'unknown'],
              description: TYPE_ENUM_DESCRIPTION,
            },
            count: {
              type: 'integer',
              description: "The number mentioned for this item (e.g. 8 for '8pc drum mics', or 5 for a '5 piece kit'). Omit if no number was given.",
            },
            rawText: {
              type: 'string',
              description: "The user's own words describing this specific item, verbatim or near-verbatim — always required, even when type is known, so there's a fallback description.",
            },
          },
          required: ['type', 'rawText'],
        },
      },
    },
    required: ['items'],
  },
};

// Returns an array of proposed items, each either a fully-expanded known
// equipment request ({ listType, source/item, phantomPower, powerNeeded })
// or a single unmapped fallback ({ listType: 'channel', source: rawText,
// unmapped: true }) — never a hallucinated guess at what an unrecognized
// request should contain.
export async function parseStagePlotEquipmentPrompt({ prompt }) {
  const trimmed = (prompt || '').trim();
  if (!trimmed) return [];

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_stage_plot_equipment' },
    messages: [{
      role: 'user',
      content: `A user is adding equipment to a stage plot's production/backline lists. Extract each distinct piece of equipment they're asking to add.\n\nThe same equipment is often mentioned twice in one request — once as the actual ask, once as context/justification (e.g. "Add 8pc drum mics, since this gig has an 8 piece drum set" is ONE request, not two). Only extract it once per distinct piece of equipment being added.\n\nRequest:\n"""\n${trimmed}\n"""`,
    }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  const extracted = Array.isArray(toolUse?.input?.items) ? toolUse.input.items : [];

  const proposed = [];
  for (const raw of extracted) {
    const type = typeof raw?.type === 'string' ? raw.type : 'unknown';
    const count = Number.isInteger(raw?.count) ? raw.count : undefined;
    const rawText = typeof raw?.rawText === 'string' && raw.rawText.trim() ? raw.rawText.trim() : null;

    const expanded = type !== 'unknown' ? expandEquipmentRequest({ type, count }) : null;
    if (expanded) {
      for (const channel of expanded.channels) {
        proposed.push({ listType: 'channel', source: channel.source, phantomPower: channel.phantomPower, powerNeeded: channel.powerNeeded });
      }
      for (const item of expanded.backlineItems) {
        proposed.push({ listType: 'backline', item: item.item, quantity: item.quantity || 1 });
      }
      continue;
    }

    // Unknown type, or a known type with an unsupported count — surface
    // exactly what the user typed as a single plain row instead of
    // silently dropping it or guessing at an expansion.
    if (rawText) proposed.push({ listType: 'channel', source: rawText, unmapped: true });
  }

  return proposed;
}
