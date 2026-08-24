import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type SessionInfo, SessionManager } from '@mariozechner/pi-coding-agent';

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface RegisteredDesign {
  directory: string;
  sessionFile: string;
  summary: DesignSummary;
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

let registrationQueue: Promise<void> = Promise.resolve();

function sessionDirectory(root: string): string {
  return path.join(root, '.codesign', 'sessions');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function projectDirectories(root: string): Promise<string[]> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(root, entry.name));
  const renderable = await Promise.all(
    candidates.map(async (directory) =>
      (await pathExists(path.join(directory, 'App.jsx'))) ? directory : null,
    ),
  );
  return renderable.filter((directory): directory is string => directory !== null);
}

function flushSession(manager: SessionManager): Promise<void> {
  const file = manager.getSessionFile();
  const header = manager.getHeader();
  if (!file || !header) throw new Error('Pi session file unavailable');
  const content = [header, ...manager.getEntries()]
    .map((entry) => JSON.stringify(entry))
    .join('\n');
  return writeFile(file, `${content}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function createProjectSession(
  root: string,
  directory: string,
  name: string,
): Promise<SessionInfo> {
  const sessions = sessionDirectory(root);
  await mkdir(sessions, { recursive: true });
  const manager = SessionManager.create(directory, sessions);
  manager.appendSessionInfo(name);
  await flushSession(manager);
  const file = manager.getSessionFile();
  if (!file) throw new Error('Pi session file unavailable');
  const created = (await SessionManager.list(root, sessions)).find(
    (session) => session.path === file,
  );
  if (!created) throw new Error('Created pi session could not be loaded');
  return created;
}

async function synchronizeSessions(root: string): Promise<SessionInfo[]> {
  const operation = registrationQueue.then(async () => {
    const sessions = sessionDirectory(root);
    await mkdir(sessions, { recursive: true });
    const [directories, existing] = await Promise.all([
      projectDirectories(root),
      SessionManager.list(root, sessions),
    ]);
    const registeredCwds = new Set(existing.map((session) => path.resolve(session.cwd)));
    for (const directory of directories) {
      if (!registeredCwds.has(path.resolve(directory))) {
        await createProjectSession(root, directory, path.basename(directory));
        registeredCwds.add(path.resolve(directory));
      }
    }
  });
  registrationQueue = operation.catch(() => undefined);
  await operation;
  return SessionManager.list(root, sessionDirectory(root));
}

function registeredDesign(session: SessionInfo): RegisteredDesign {
  return {
    directory: path.resolve(session.cwd),
    sessionFile: session.path,
    summary: {
      id: session.id,
      name: session.name?.trim() || path.basename(session.cwd),
      createdAt: session.created.toISOString(),
      updatedAt: session.modified.toISOString(),
    },
  };
}

async function registeredDesigns(root: string): Promise<RegisteredDesign[]> {
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  const sessions = await synchronizeSessions(root);
  const candidates = sessions
    .filter((session) => path.resolve(session.cwd).startsWith(rootPrefix))
    .map(registeredDesign);
  const valid = await Promise.all(
    candidates.map(async (design) =>
      (await pathExists(path.join(design.directory, 'App.jsx'))) ? design : null,
    ),
  );
  return valid.filter((design): design is RegisteredDesign => design !== null);
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

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, filePath);
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
  const directory = path.join(
    root,
    `${projectSlug(normalizedName)}-${crypto.randomUUID().slice(0, 8)}`,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'App.jsx'), DEFAULT_SOURCE, {
    encoding: 'utf8',
    flag: 'wx',
  });
  const session = await createProjectSession(root, directory, normalizedName);
  return registeredDesign(session).summary;
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
  await writeAtomic(path.join(design.directory, 'App.jsx'), content);
  return { path: 'App.jsx', content };
}
