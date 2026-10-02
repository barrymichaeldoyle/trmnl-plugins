import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const pending = new Map();

// Local previews cache the official assets. Exports use TRMNL's own framework.
export async function frameworkAsset(path) {
  if (!/^\/(\d+\.\d+\.\d+\/plugins\.(css|js)|fonts\/[A-Za-z0-9_-]+\.(woff2?|ttf))$/.test(path)) throw new Error('Unknown framework asset.');
  if (!pending.has(path)) {
    pending.set(path, (async () => {
      const cache = fileURLToPath(new URL(`../.cache${path}`, import.meta.url));
      let bytes;
      try { bytes = await readFile(cache); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const remote = path.startsWith('/fonts/') ? `https://trmnl.com${path}` : `https://trmnl.com/${path.endsWith('.css') ? 'css' : 'js'}${path}`;
        const response = await fetch(remote, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`TRMNL framework download failed (${response.status}). Retry when the connection is available.`);
        bytes = Buffer.from(await response.arrayBuffer());
        await mkdir(dirname(cache), { recursive: true });
        await writeFile(cache, bytes);
      }
      if (path.endsWith('.css')) bytes = Buffer.from(bytes.toString().replaceAll('url("/fonts/', 'url("/framework/fonts/'));
      const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.woff') ? 'font/woff' : 'font/ttf';
      return { bytes: gzipSync(bytes), type };
    })().catch(error => { pending.delete(path); throw error; }));
  }
  return pending.get(path);
}
