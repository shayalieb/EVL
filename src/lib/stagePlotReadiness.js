const ADVANCED_FIELDS = ['inputType', 'preferredDevice', 'substituteDevice', 'standType', 'connectionType', 'stageboxName', 'stageboxInput', 'providedBy', 'monitorMix', 'powerDetails', 'cableDetails'];

export function getStagePlotReadiness(plot = {}) {
  const channels = plot.channels || [];
  const backlineItems = plot.backlineItems || [];
  const elements = (plot.pages || []).flatMap((page) => page.scene?.elements || []);
  const elementIds = new Set(elements.map((element) => element.id));
  const issues = [];
  const add = (code, severity, title, detail, channelId = null, elementId = null) => issues.push({ code, severity, title, detail, channelId, elementId });

  if (!elements.length) add('empty-canvas', 'required', 'The stage canvas is empty', 'Place the performers and equipment that the venue needs to position.');
  if (!channels.length) add('empty-input-list', 'required', 'The Production List is empty', 'Add the inputs and performers the sound team needs to prepare for.');

  channels.forEach((channel) => {
    const label = `Channel ${channel.channelNumber}${channel.source ? ` — ${channel.source}` : ''}`;
    if (!channel.musicianName?.trim()) add('missing-musician', 'recommended', `${label} has no performer`, 'Add a musician or role so the engineer knows who this input belongs to.', channel.id, channel.elementId);
    if (!channel.elementId) add('unlinked-channel', 'recommended', `${label} is not placed on the canvas`, 'Link it to a stage icon if its physical position matters.', channel.id);
    else if (!elementIds.has(channel.elementId)) add('orphaned-channel', 'required', `${label} points to a missing icon`, 'Relink this row to an icon or remove the stale link.', channel.id);
  });

  const advancedInUse = channels.some((channel) => ADVANCED_FIELDS.some((field) => channel[field]));
  if (advancedInUse) {
    channels.forEach((channel) => {
      const label = `Channel ${channel.channelNumber}${channel.source ? ` — ${channel.source}` : ''}`;
      if (!channel.inputType) add('missing-input-type', 'recommended', `${label} has no input type`, 'Choose microphone, DI, line, playback, wireless, or other.', channel.id, channel.elementId);
      if (!channel.preferredDevice) add('missing-device', 'recommended', `${label} has no preferred mic or DI`, 'Name the preferred device, or leave Advanced Audio off when the venue may choose.', channel.id, channel.elementId);
      if (!channel.providedBy) add('missing-provider', 'recommended', `${label} has no equipment provider`, 'Specify whether the artist, venue, or rental company supplies it.', channel.id, channel.elementId);
    });

    const patches = new Map();
    channels.forEach((channel) => {
      if (!channel.stageboxName || !channel.stageboxInput) return;
      const key = `${channel.stageboxName.trim().toLowerCase()}::${channel.stageboxInput.trim().toLowerCase()}`;
      const previous = patches.get(key);
      if (previous) add('duplicate-patch', 'required', `Channels ${previous.channelNumber} and ${channel.channelNumber} share one stagebox input`, `${channel.stageboxName} / ${channel.stageboxInput} can only be patched once.`, channel.id, channel.elementId);
      else patches.set(key, channel);
    });
  }

  backlineItems.forEach((item) => {
    if (!item.providedBy) add('backline-provider', 'recommended', `${item.item || 'A backline item'} has no provider`, 'Choose artist, venue, rental company, or TBD so responsibility is clear.');
  });

  const requiredCount = issues.filter((issue) => issue.severity === 'required').length;
  const recommendedCount = issues.length - requiredCount;
  return { issues, requiredCount, recommendedCount, ready: requiredCount === 0 };
}
