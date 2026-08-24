import { createReadStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesign, listDesigns, readEntry, writeEntry } from './design-store.js';
import { generateSource, readModelConfig, runtimeStatus } from './model-runtime.js';

const port = Number.parseInt(process.env['PORT'] ?? '7860', 10);
const dataRoot = path.resolve(
  process.env['CODESIGN_PROJECTS_DIR'] ?? process.env['CODESIGN_DATA_DIR'] ?? '/app',
);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const modelConfig = readModelConfig();

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
    json(response, 200, {
      ok: true,
      mode: 'local-web',
      runtime: runtimeStatus(dataRoot, modelConfig),
    });
    return true;
  }
  if (url.pathname === '/api/runtime' && request.method === 'GET') {
    json(response, 200, runtimeStatus(dataRoot, modelConfig));
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
  const generateMatch = url.pathname.match(/^\/api\/designs\/([^/]+)\/generate$/);
  if (generateMatch?.[1] && request.method === 'POST') {
    if (!modelConfig) {
      json(response, 503, runtimeStatus(dataRoot, null));
      return true;
    }
    const body = await readJson(request);
    const prompt = typeof body['prompt'] === 'string' ? body['prompt'].trim() : '';
    if (!prompt || prompt.length > 20_000)
      throw new Error('Prompt must contain between 1 and 20000 characters');
    const current = await readEntry(dataRoot, generateMatch[1]);
    const content = await generateSource(modelConfig, prompt, current.content);
    json(response, 200, await writeEntry(dataRoot, generateMatch[1], content));
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
    await access(filePath);
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
  createReadStream(filePath).pipe(response);
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
    const message = error instanceof Error ? error.message : 'Unexpected error';
    json(response, message.includes('ENOENT') ? 404 : 400, { error: message });
  }
}).listen(port, '0.0.0.0', () => {
  process.stdout.write(`Open CoDesign Web listening on http://0.0.0.0:${port}\n`);
});
