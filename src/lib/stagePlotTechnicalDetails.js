const LABELS = {
  mic: 'Microphone',
  di: 'DI box',
  line: 'Line input',
  playback: 'Playback',
  wireless: 'Wireless',
  straight: 'Straight stand',
  boom: 'Boom stand',
  'short-boom': 'Short boom stand',
  clip: 'Clip / mount',
  none: 'No stand',
  xlr: 'XLR',
  trs: '¼-inch TRS',
  ts: '¼-inch TS',
  usb: 'USB',
  ethernet: 'Network / Ethernet',
  'stereo-left': 'Stereo left',
  'stereo-right': 'Stereo right',
  'stereo-pair': 'Stereo pair',
  artist: 'Artist',
  venue: 'Venue',
  rental: 'Rental company',
};

const label = (value) => LABELS[value] || value;

// A single channel owns its technical requirements. Consumers use these
// labeled lines inside that channel's row rather than rendering a second
// table that can be mistaken for additional input channels.
export function getStagePlotTechnicalDetailLines(channel = {}) {
  const format = channel.channelFormat && channel.channelFormat !== 'mono' ? label(channel.channelFormat) : '';
  return [
    [channel.inputType || channel.preferredDevice || channel.substituteDevice, 'Input', [label(channel.inputType), channel.preferredDevice, channel.substituteDevice ? `alternate ${channel.substituteDevice}` : ''].filter(Boolean).join(' · ')],
    [channel.standType || channel.connectionType || format, 'Connection', [label(channel.standType), label(channel.connectionType), format].filter(Boolean).join(' · ')],
    [channel.stageboxName || channel.stageboxInput, 'Patch', [channel.stageboxName, channel.stageboxInput].filter(Boolean).join(' / ')],
    [channel.monitorMix, 'Monitor', channel.monitorMix],
    [channel.providedBy, 'Provided by', label(channel.providedBy)],
    [channel.powerDetails || channel.cableDetails, 'Utility', [channel.powerDetails, channel.cableDetails].filter(Boolean).join(' · ')],
  ].filter(([present]) => present).map(([, heading, value]) => ({ heading, value }));
}
