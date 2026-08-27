import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface DesignMetadata extends DesignSummary {
  directory: string;
}

const REGISTRY_DIRECTORY = '.codesign-web';
const REGISTRY_FILE = 'projects.json';
const ENTRY_FILE = 'App.jsx';

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

function registryPath(root: string): string {
  return path.join(root, REGISTRY_DIRECTORY, REGISTRY_FILE);
}

function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'untitled-design';
}

function validateDirectory(directory: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(directory)) throw new Error('Invalid project directory');
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function readRegistry(root: string): Promise<DesignMetadata[]> {
  try {
    return JSON.parse(await readFile(registryPath(root), 'utf8')) as DesignMetadata[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function synchronizedProjects(root: string): Promise<DesignMetadata[]> {
  await mkdir(root, { recursive: true });
  const registered = await readRegistry(root);
  const byDirectory = new Map(registered.map((project) => [project.directory, project]));
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith('.') ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(entry.name)
    )
      continue;
    try {
      const entryStats = await stat(path.join(root, entry.name, ENTRY_FILE));
      if (!entryStats.isFile()) continue;
      const existing = byDirectory.get(entry.name);
      const timestamp = entryStats.mtime.toISOString();
      byDirectory.set(
        entry.name,
        existing ?? {
          id: crypto.randomUUID(),
          name: entry.name.replace(/-/g, ' '),
          directory: entry.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const projects = [...byDirectory.values()].filter((project) =>
    entries.some((entry) => entry.isDirectory() && entry.name === project.directory),
  );
  if (JSON.stringify(projects) !== JSON.stringify(registered)) {
    await writeJsonAtomic(registryPath(root), projects);
  }
  return projects;
}

async function findProject(root: string, id: string): Promise<DesignMetadata> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid design id');
  const project = (await synchronizedProjects(root)).find((candidate) => candidate.id === id);
  if (!project) throw Object.assign(new Error('Project not found'), { code: 'ENOENT' });
  validateDirectory(project.directory);
  return project;
}

export async function listDesigns(root: string): Promise<DesignSummary[]> {
  return (await synchronizedProjects(root))
    .map(({ directory: _directory, ...summary }) => summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createDesign(root: string, name: string): Promise<DesignSummary> {
  const normalizedName = name.trim();
  if (normalizedName.length === 0 || normalizedName.length > 120) {
    throw new Error('Design name must contain between 1 and 120 characters');
  }
  const projects = await synchronizedProjects(root);
  const base = slugify(normalizedName);
  let directory = base;
  let suffix = 2;
  while (projects.some((project) => project.directory === directory))
    directory = `${base}-${suffix++}`;
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    name: normalizedName,
    directory,
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(path.join(root, directory), { recursive: false });
  await writeFile(path.join(root, directory, ENTRY_FILE), DEFAULT_SOURCE, 'utf8');
  await writeJsonAtomic(registryPath(root), [project, ...projects]);
  const { directory: _directory, ...summary } = project;
  return summary;
}

export async function readEntry(
  root: string,
  id: string,
): Promise<{ path: string; content: string }> {
  const project = await findProject(root, id);
  return {
    path: ENTRY_FILE,
    content: await readFile(path.join(root, project.directory, ENTRY_FILE), 'utf8'),
  };
}

export async function writeEntry(
  root: string,
  id: string,
  content: string,
): Promise<{ path: string; content: string }> {
  if (Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('Source is too large');
  const projects = await synchronizedProjects(root);
  const project = projects.find((candidate) => candidate.id === id);
  if (!project) throw Object.assign(new Error('Project not found'), { code: 'ENOENT' });
  validateDirectory(project.directory);
  project.updatedAt = new Date().toISOString();
  await writeFile(path.join(root, project.directory, ENTRY_FILE), content, 'utf8');
  await writeJsonAtomic(registryPath(root), projects);
  return { path: ENTRY_FILE, content };
}
