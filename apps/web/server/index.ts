import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createDesign, listDesigns, readEntry, writeEntry } from './design-store.js';

const port = Number.parseInt(process.env['PORT'] ?? '7860', 10);
const host = process.env['HOST'] ?? '127.0.0.1';
const dataRoot = path.resolve(
  process.env['CODESIGN_PROJECTS_DIR'] ?? process.env['CODESIGN_DATA_DIR'] ?? '/app',
);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 2_100_000) throw new Error('Request body is too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    json(response, 200, { ok: true, mode: 'local-web' });
    return true;
  }
  if (url.pathname === '/api/designs' && request.method === 'GET') {
    json(response, 200, await listDesigns(dataRoot));
    return true;
  }
  if (url.pathname === '/api/designs' && request.method === 'POST') {
    const body = await readJson(request);
    json(
      response,
      201,
      await createDesign(dataRoot, typeof body['name'] === 'string' ? body['name'] : ''),
    );
    return true;
  }
  const entryMatch = url.pathname.match(/^\/api\/designs\/([^/]+)\/entry$/);
  if (entryMatch?.[1] && request.method === 'GET') {
    json(response, 200, await readEntry(dataRoot, entryMatch[1]));
    return true;
  }
  if (entryMatch?.[1] && request.method === 'PUT') {
    const body = await readJson(request);
    if (typeof body['content'] !== 'string') throw new Error('Source content is required');
    json(response, 200, await writeEntry(dataRoot, entryMatch[1], body['content']));
    return true;
  }
  return false;
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function staticFile(response: ServerResponse, pathname: string): Promise<void> {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const normalized = path.normalize(requested);
  let filePath = path.resolve(webRoot, normalized);
  if (!filePath.startsWith(`${webRoot}${path.sep}`)) throw new Error('Invalid path');
  try {
    const entry = await stat(filePath);
    if (!entry.isFile()) filePath = path.join(webRoot, 'index.html');
  } catch {
    filePath = path.join(webRoot, 'index.html');
  }
  response.writeHead(200, {
    'content-type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    // The shared sandbox preview transpiles workspace JSX with vendored Babel; the iframe remains
    // origin-isolated by its sandbox even though that runtime requires eval.
    'content-security-policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-src 'self' blob: data:; connect-src 'self'",
  });
  await pipeline(createReadStream(filePath), response);
}

await mkdir(dataRoot, { recursive: true });

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (await api(request, response, url)) return;
    if (url.pathname.startsWith('/api/')) {
      json(response, 404, { error: 'Not found' });
      return;
    }
    await staticFile(response, url.pathname);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected error';
    json(response, message.includes('ENOENT') ? 404 : 400, { error: message });
  }
}).listen(port, host, () => {
  process.stdout.write(`Open CoDesign Web listening on http://${host}:${port}\n`);
});
