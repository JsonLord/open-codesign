import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  it('creates a workspace with an App.jsx entry', async () => {
    const root = await temporaryRoot();
    const design = await createDesign(root, 'Launch page');

    expect(await listDesigns(root)).toEqual([design]);
    expect((await readEntry(root, design.id)).content).toContain('OPEN CODESIGN WEB');
  });

  it('writes source without allowing arbitrary design paths', async () => {
    const root = await temporaryRoot();
    const design = await createDesign(root, 'Editor');

    await writeEntry(root, design.id, 'export default function App() { return <p>Saved</p>; }');
    expect(await readFile(path.join(root, 'designs', design.id, 'App.jsx'), 'utf8')).toContain(
      'Saved',
    );
    await expect(readEntry(root, '../../etc')).rejects.toThrow('Invalid design id');
  });
});
