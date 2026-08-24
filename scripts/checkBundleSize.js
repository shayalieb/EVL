import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const maxChunkBytes = 450 * 1024;
const files = (await readdir(assetsDir)).filter((file) => file.endsWith('.js'));
const chunks = await Promise.all(files.map(async (file) => ({
  file,
  bytes: (await stat(path.join(assetsDir, file))).size,
})));
const oversized = chunks.filter(({ bytes }) => bytes > maxChunkBytes);

if (oversized.length) {
  const details = oversized
    .sort((a, b) => b.bytes - a.bytes)
    .map(({ file, bytes }) => `${file}: ${(bytes / 1024).toFixed(1)} KiB`)
    .join('\n');
  throw new Error(`JavaScript chunks must not exceed 450 KiB:\n${details}`);
}

const largest = chunks.sort((a, b) => b.bytes - a.bytes)[0];
console.log(`Bundle budget passed. Largest chunk: ${largest.file} (${(largest.bytes / 1024).toFixed(1)} KiB).`);
