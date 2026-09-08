// Hand-maintained equipment → production/backline row expansion, kept
// deliberately separate from any AI call: the model (stagePlotItemParser.js)
// only ever extracts { type, count } from natural language — this file is
// what actually decides the real channel list, so a request like "8pc drum
// mics" produces the same rows every time instead of the model's own
// unconstrained (and inconsistent) idea of what that means.
//
// Adding a new equipment type later is one more entry in EXPANDERS, not a
// rewrite of the parser or the routes that call this.

const MIN_DRUM_CHANNELS = 5;
const MAX_DRUM_CHANNELS = 10;

// Approved convention (confirmed with the user): 5 base channels (Kick In,
// Kick Out, Snare Top, Snare Bottom, Hi-Hat) + one channel per additional
// tom, named "Tom 1", "Tom 2", ... with the last tom always "Floor Tom". At
// count=8 this yields exactly: Kick In, Kick Out, Snare Top, Snare Bottom,
// Hi-Hat, Tom 1, Tom 2, Floor Tom. No separate overhead channels. Hi-Hat is
// the only channel marked phantomPower (small-condenser convention) —
// everything else here is a dynamic mic.
function drumKitChannels(count) {
  if (!Number.isInteger(count) || count < MIN_DRUM_CHANNELS || count > MAX_DRUM_CHANNELS) return null;
  const tomCount = count - MIN_DRUM_CHANNELS;
  const toms = Array.from({ length: tomCount }, (_, i) =>
    i === tomCount - 1 ? 'Floor Tom' : `Tom ${i + 1}`
  );
  const sources = ['Kick In', 'Kick Out', 'Snare Top', 'Snare Bottom', 'Hi-Hat', ...toms];
  return sources.map((source) => ({ source, phantomPower: source === 'Hi-Hat', powerNeeded: false }));
}

// `description` is what the AI parser sees for this type's enum value — it
// has to spell out the colloquial phrasing this maps to (not just repeat
// the key name), since "8pc drum mics" / "mic the 5 piece kit" / "drum mic
// package" all need to land on `drum_kit` with the right count.
const EQUIPMENT_TYPES = {
  drum_kit: {
    description: "A request to mic/instrument a drum kit — e.g. \"8pc drum mics\", \"mic the 5 piece kit\", \"drum mic package\", \"7 piece drum kit\". `count` is the number of mic channels being requested (commonly quoted as the kit's \"piece\" count, e.g. 8 for \"8pc\").",
    expand: (count) => {
      const channels = drumKitChannels(count);
      return channels ? { channels, backlineItems: [] } : null;
    },
  },
};

// The parser's tool schema enum (and each value's description) is built
// from this list, so the model can never name an equipment type this table
// doesn't actually support, and always sees a real explanation of what each
// type covers rather than just its key name.
export const KNOWN_EQUIPMENT_TYPES = Object.keys(EQUIPMENT_TYPES);
export function equipmentTypeDescription(type) { return EQUIPMENT_TYPES[type]?.description; }

// Returns { channels, backlineItems } or null if `type` is unknown or
// `count` is out of the type's supported range — callers should fall back
// to a raw/unmapped item rather than guessing further.
export function expandEquipmentRequest({ type, count }) {
  const entry = EQUIPMENT_TYPES[type];
  if (!entry) return null;
  return entry.expand(count);
}
