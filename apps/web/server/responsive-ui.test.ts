import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appSourceUrl = new URL('../src/App.tsx', import.meta.url);
const stylesUrl = new URL('../src/styles.css', import.meta.url);

describe('responsive web workspace', () => {
  it('provides accessible source and preview tabs for narrow viewports', async () => {
    const source = await readFile(appSourceUrl, 'utf8');

    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={mobilePanel');
    expect(source).toContain('data-active={mobilePanel');
    expect(source).toContain('sourceDesignId !== activeId');
    expect(source).toContain('if (cancelled) return');
    expect(source).toContain('const formElement = event.currentTarget');
  });

  it('covers compact desktop, tablet, and phone layouts', async () => {
    const css = await readFile(stylesUrl, 'utf8');

    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('@media (max-width: 800px)');
    expect(css).toContain('@media (max-width: 520px)');
    expect(css).toContain('.panel[data-active="false"]');
    expect(css).toContain('overflow-x: auto');
  });
});
