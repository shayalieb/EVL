import { prisma } from './prisma.js';

// How far back to look, and how confident the pattern needs to be before
// suggesting it. Deliberately simple counting, no inference — see
// stagePlotEquipmentReference.js's header comment for why.
const RECENT_WINDOW = 10;
const MIN_OCCURRENCES = 3;
const MIN_RATIO = 0.5;

// Logs one row per distinct equipment type actually kept in this stage
// plot's confirmed items — called from stagePlots.js's /ai-items/confirm
// after the real StagePlotChannel/StagePlotBacklineItem rows are created,
// using only the subset of proposed items the user didn't remove first.
export async function logEquipmentUsage({ accountId, stagePlotId, confirmedItems }) {
  const seen = new Map(); // `${type}:${count}` -> { type, count }
  for (const item of confirmedItems) {
    if (!item.equipmentType || !Number.isInteger(item.equipmentCount)) continue;
    seen.set(`${item.equipmentType}:${item.equipmentCount}`, { type: item.equipmentType, count: item.equipmentCount });
  }
  if (!seen.size) return;
  await prisma.stagePlotEquipmentUsage.createMany({
    data: [...seen.values()].map(({ type, count }) => ({ accountId, stagePlotId, type, count })),
  });
}

// "You've added {label} to {occurrences} of your last {outOf} stage plots"
// — looks at the most recent RECENT_WINDOW *distinct* stage plots this
// account has logged any equipment usage for (not the last N usage rows,
// since one plot could log several types), and suggests any type that
// shows up in at least MIN_RATIO of them. Returns [] below MIN_OCCURRENCES
// of history — not enough signal yet to suggest anything.
export async function getEquipmentSuggestions(accountId) {
  const recentPlots = await prisma.stagePlotEquipmentUsage.findMany({
    where: { accountId },
    distinct: ['stagePlotId'],
    orderBy: { createdAt: 'desc' },
    take: RECENT_WINDOW,
    select: { stagePlotId: true },
  });
  const plotIds = recentPlots.map((p) => p.stagePlotId);
  if (plotIds.length < MIN_OCCURRENCES) return [];

  const usages = await prisma.stagePlotEquipmentUsage.findMany({
    where: { stagePlotId: { in: plotIds } },
    select: { stagePlotId: true, type: true, count: true },
  });

  const byType = new Map(); // type -> { plots: Set<stagePlotId>, counts: Map<count, occurrences> }
  for (const usage of usages) {
    if (!byType.has(usage.type)) byType.set(usage.type, { plots: new Set(), counts: new Map() });
    const entry = byType.get(usage.type);
    entry.plots.add(usage.stagePlotId);
    entry.counts.set(usage.count, (entry.counts.get(usage.count) || 0) + 1);
  }

  const suggestions = [];
  for (const [type, entry] of byType) {
    const occurrences = entry.plots.size;
    if (occurrences < MIN_OCCURRENCES || occurrences / plotIds.length < MIN_RATIO) continue;
    const mostCommonCount = [...entry.counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    suggestions.push({ type, count: mostCommonCount, occurrences, outOf: plotIds.length });
  }
  return suggestions;
}
