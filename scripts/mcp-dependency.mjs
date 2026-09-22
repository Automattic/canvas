import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const adapterVersion = '0.6.1';
export const adapterURL = `https://github.com/WordPress/mcp-adapter/releases/download/v${adapterVersion}/mcp-adapter.zip`;
export async function adapterArchive(root) {
  const directory = new URL('.playground/dependencies/', root);
  const file = new URL(`mcp-adapter-${adapterVersion}.zip`, directory);
  await mkdir(directory, { recursive: true });
  try { await readFile(file); } catch {
    const response = await fetch(adapterURL, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`MCP Adapter download failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('MCP Adapter download is not a ZIP.');
    await writeFile(new URL(`${file.pathname}.tmp`, file), bytes);
    await rename(new URL(`${file.pathname}.tmp`, file), file);
  }
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digest !== '1c3cd47c32e99b4e7d8690a44a7890256e92a8b96f61776cbe1894e5483cf676') throw new Error('MCP Adapter checksum mismatch; remove the cached archive and retry.');
  return file;
}
