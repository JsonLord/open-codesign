import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface RegisteredDesign {
  directory: string;
  summary: DesignSummary;
}

const METADATA_PATH = path.join('.codesign', 'web.json');
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

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isDesignSummary(value: unknown): value is DesignSummary {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'string' &&
    /^[0-9a-f-]{36}$/i.test(row['id']) &&
    typeof row['name'] === 'string' &&
    typeof row['createdAt'] === 'string' &&
    typeof row['updatedAt'] === 'string'
  );
}

async function registerDirectory(directory: string): Promise<RegisteredDesign | null> {
  const entryPath = path.join(directory, 'App.jsx');
  if (!(await pathExists(entryPath))) return null;

  const metadataPath = path.join(directory, METADATA_PATH);
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown;
    if (isDesignSummary(parsed)) return { directory, summary: parsed };
  } catch {
    // A missing or invalid local registration is repaired from the workspace itself below.
  }

  const entryStat = await stat(entryPath);
  const summary: DesignSummary = {
    id: crypto.randomUUID(),
    name: path.basename(directory),
    createdAt: entryStat.birthtime.toISOString(),
    updatedAt: entryStat.mtime.toISOString(),
  };
  await writeJsonAtomic(metadataPath, summary);
  return { directory, summary };
}

async function registeredDesigns(root: string): Promise<RegisteredDesign[]> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const registered = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => registerDirectory(path.join(root, entry.name))),
  );
  return registered.filter((design): design is RegisteredDesign => design !== null);
}

async function requireDesign(root: string, id: string): Promise<RegisteredDesign> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid design id');
  const design = (await registeredDesigns(root)).find((candidate) => candidate.summary.id === id);
  if (!design) throw new Error('Design not found');
  return design;
}

function projectSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .toLowerCase();
  return slug.slice(0, 48) || 'untitled-design';
}

export async function listDesigns(root: string): Promise<DesignSummary[]> {
  const designs = await registeredDesigns(root);
  return designs
    .map((design) => design.summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createDesign(root: string, name: string): Promise<DesignSummary> {
  const normalizedName = name.trim();
  if (normalizedName.length === 0 || normalizedName.length > 120) {
    throw new Error('Design name must contain between 1 and 120 characters');
  }
  const id = crypto.randomUUID();
  const directory = path.join(root, `${projectSlug(normalizedName)}-${id.slice(0, 8)}`);
  const now = new Date().toISOString();
  const design = { id, name: normalizedName, createdAt: now, updatedAt: now };
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeJsonAtomic(path.join(directory, METADATA_PATH), design),
    writeFile(path.join(directory, 'App.jsx'), DEFAULT_SOURCE, 'utf8'),
  ]);
  return design;
}

export async function readEntry(
  root: string,
  id: string,
): Promise<{ path: string; content: string }> {
  const design = await requireDesign(root, id);
  const content = await readFile(path.join(design.directory, 'App.jsx'), 'utf8');
  return { path: 'App.jsx', content };
}

export async function writeEntry(
  root: string,
  id: string,
  content: string,
): Promise<{ path: string; content: string }> {
  if (Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('Source is too large');
  const design = await requireDesign(root, id);
  design.summary.updatedAt = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(design.directory, 'App.jsx'), content, 'utf8'),
    writeJsonAtomic(path.join(design.directory, METADATA_PATH), design.summary),
  ]);
  return { path: 'App.jsx', content };
}
