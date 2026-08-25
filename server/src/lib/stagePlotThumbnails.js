import { prisma } from './prisma.js';
import { deleteFile } from './fileStorage.js';

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function decodeStagePlotThumbnail(dataUrl) {
  if (!/^data:image\/png;base64,/.test(dataUrl || '')) {
    const error = new Error('Stage plot thumbnail must be a PNG.');
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_THUMBNAIL_BYTES) {
    const error = new Error('Stage plot thumbnail is too large.');
    error.status = 413;
    throw error;
  }
  return buffer;
}

// Event and library pages deliberately share immutable thumbnail objects
// when a template is cloned. Remove an old object only after every DB
// reference to it is gone, so cleaning one copy cannot break another.
export async function deleteStagePlotThumbnailIfUnused(storageKey) {
  if (!storageKey) return;
  const [eventReferences, libraryReferences] = await Promise.all([
    prisma.stagePlotPage.count({ where: { thumbnailStorageKey: storageKey } }),
    prisma.stagePlotLibraryPage.count({ where: { thumbnailStorageKey: storageKey } }),
  ]);
  if (eventReferences + libraryReferences === 0) await deleteFile(storageKey);
}
