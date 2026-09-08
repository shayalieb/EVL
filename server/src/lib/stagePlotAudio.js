const FIELDS = ['inputType', 'preferredDevice', 'substituteDevice', 'standType', 'connectionType', 'channelFormat', 'stageboxName', 'stageboxInput', 'providedBy', 'monitorMix', 'powerDetails', 'cableDetails'];

// Stage-plot audio details are optional, bounded plain text. Keeping the
// normalizer shared ensures event plots and library templates accept and
// clone exactly the same durable shape.
export function stagePlotAudioData(value = {}) {
  return Object.fromEntries(FIELDS.filter((key) => value[key] !== undefined).map((key) => {
    const text = String(value[key] ?? '').trim().slice(0, 300);
    return [key, text || (key === 'channelFormat' ? 'mono' : null)];
  }));
}
