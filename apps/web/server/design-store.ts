import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SOURCE = `export default function App() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', background: '#f5f3ff' }}>
      <section style={{ maxWidth: 620, padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#6d28d9', fontWeight: 700 }}>OPEN CODESIGN WEB</p>
        <h1 style={{ fontSize: 52, lineHeight: 1.05, margin: '16px 0' }}>Design in your browser.</h1>
        <p style={{ color: '#57534e', fontSize: 20 }}>Your source stays in a Docker-backed local workspace.</p>
      </section>
    </main>
  );
}
`;

function designDirectory(root: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid design id');
  return path.join(root, 'designs', id);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function listDesigns(root: string): Promise<DesignSummary[]> {
  const designsRoot = path.join(root, 'designs');
  await mkdir(designsRoot, { recursive: true });
  const entries = await readdir(designsRoot, { withFileTypes: true });
  const designs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^[0-9a-f-]{36}$/i.test(entry.name))
      .map(async (entry) => {
        const content = await readFile(path.join(designsRoot, entry.name, 'design.json'), 'utf8');
        return JSON.parse(content) as DesignSummary;
      }),
  );
  return designs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createDesign(root: string, name: string): Promise<DesignSummary> {
  const normalizedName = name.trim();
  if (normalizedName.length === 0 || normalizedName.length > 120) {
    throw new Error('Design name must contain between 1 and 120 characters');
  }
  const id = crypto.randomUUID();
  const directory = designDirectory(root, id);
  const now = new Date().toISOString();
  const design = { id, name: normalizedName, createdAt: now, updatedAt: now };
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'design.json'), design),
    writeFile(path.join(directory, 'App.jsx'), DEFAULT_SOURCE, 'utf8'),
  ]);
  return design;
}

export async function readEntry(
  root: string,
  id: string,
): Promise<{ path: string; content: string }> {
  const content = await readFile(path.join(designDirectory(root, id), 'App.jsx'), 'utf8');
  return { path: 'App.jsx', content };
}

export async function writeEntry(
  root: string,
  id: string,
  content: string,
): Promise<{ path: string; content: string }> {
  if (Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('Source is too large');
  const directory = designDirectory(root, id);
  const metadataPath = path.join(directory, 'design.json');
  const design = JSON.parse(await readFile(metadataPath, 'utf8')) as DesignSummary;
  design.updatedAt = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(directory, 'App.jsx'), content, 'utf8'),
    writeJsonAtomic(metadataPath, design),
  ]);
  return { path: 'App.jsx', content };
}
