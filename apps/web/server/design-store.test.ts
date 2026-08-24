import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesign, listDesigns, readEntry, writeEntry } from './design-store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codesign-web-'));
  roots.push(root);
  return root;
}

describe('web design store', () => {
  it('creates a named project folder with an App.jsx entry', async () => {
    const root = await temporaryRoot();
    const design = await createDesign(root, 'Launch Page');
    const projects = (await readdir(root)).filter((entry) => !entry.startsWith('.'));

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatch(/^launch-page-/);
    expect(await listDesigns(root)).toEqual([design]);
    expect((await readEntry(root, design.id)).content).toContain('OPEN CODESIGN WEB');
  });

  it('automatically registers App.jsx projects already present in the root', async () => {
    const root = await temporaryRoot();
    const project = path.join(root, 'existing-project');
    await mkdir(project);
    await writeFile(path.join(project, 'App.jsx'), 'export default () => <p>Existing</p>;', 'utf8');

    const [design] = await listDesigns(root);

    expect(design?.name).toBe('existing-project');
    expect(design?.id).toMatch(/^[0-9a-f-]{36}$/i);
    const sessionFiles = await readdir(path.join(root, '.codesign', 'sessions'));
    expect(sessionFiles).toHaveLength(1);
    const session = await readFile(
      path.join(root, '.codesign', 'sessions', sessionFiles[0] ?? ''),
      'utf8',
    );
    expect(session).toContain('"type":"session"');
    expect(session).toContain('"type":"session_info"');
    expect(session).toContain('existing-project');
    expect(await listDesigns(root)).toEqual([design]);
  });

  it('ignores unrelated folders without App.jsx', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'README.md'), 'notes', 'utf8');

    expect(await listDesigns(root)).toEqual([]);
  });

  it('writes source without allowing arbitrary design paths', async () => {
    const root = await temporaryRoot();
    const design = await createDesign(root, 'Editor');

    await writeEntry(root, design.id, 'export default function App() { return <p>Saved</p>; }');
    expect((await readEntry(root, design.id)).content).toContain('Saved');
    await expect(readEntry(root, '../../etc')).rejects.toThrow('Invalid design id');
  });

  it('keeps concurrent source writes atomic', async () => {
    const root = await temporaryRoot();
    const design = await createDesign(root, 'Concurrent editor');
    const first = `export default () => <p>${'A'.repeat(20_000)}</p>;`;
    const second = `export default () => <p>${'B'.repeat(20_000)}</p>;`;

    await Promise.all([writeEntry(root, design.id, first), writeEntry(root, design.id, second)]);

    expect([first, second]).toContain((await readEntry(root, design.id)).content);
  });
});
