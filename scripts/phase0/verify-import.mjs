import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await fs.readFile('docs/phase0/import-provenance.json', 'utf8'));
const originalUI = manifest.files.filter(({ path }) => path.startsWith('src/') || path.startsWith('static/'));
const changed = [];
for (const entry of originalUI) {
  const bytes = await fs.readFile(entry.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== entry.upstreamSha256) changed.push(entry.path);
}
if (changed.length) {
  console.error('Original UI differences:', changed);
  process.exitCode = 1;
} else {
  console.log(`${originalUI.length} source/static files match upstream ${manifest.commit}.`);
}
