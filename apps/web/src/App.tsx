import { buildPreviewDocument } from '@open-codesign/runtime';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type DesignSummary, webApi } from './api';

const EMPTY_SOURCE = `export default function App() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', background: '#f5f3ff' }}>
      <section style={{ maxWidth: 620, padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#6d28d9', fontWeight: 700 }}>OPEN CODESIGN WEB</p>
        <h1 style={{ fontSize: 52, lineHeight: 1.05, margin: '16px 0' }}>Design in your browser.</h1>
        <p style={{ color: '#57534e', fontSize: 20 }}>Your source stays in a Docker-backed local workspace.</p>
      </section>
    </main>
  );
}`;

export function App() {
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [sourceDesignId, setSourceDesignId] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [status, setStatus] = useState('Loading local workspaces…');
  const [mobilePanel, setMobilePanel] = useState<'source' | 'preview'>('preview');

  const loadDesigns = useCallback(async (announce: boolean) => {
    try {
      const rows = await webApi.listDesigns();
      setDesigns(rows);
      setActiveId((current) =>
        current && rows.some((design) => design.id === current) ? current : (rows[0]?.id ?? null),
      );
      if (announce) {
        setStatus(rows.length === 0 ? 'Create your first browser workspace.' : 'Ready');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadDesigns(true);
    const interval = window.setInterval(() => void loadDesigns(false), 5_000);
    return () => window.clearInterval(interval);
  }, [loadDesigns]);

  useEffect(() => {
    if (!activeId) {
      setSource(EMPTY_SOURCE);
      setSourceDesignId(null);
      setSourceLoading(false);
      return;
    }
    const requestedId = activeId;
    let cancelled = false;
    setSource('');
    setSourceDesignId(null);
    setSourceLoading(true);
    void webApi.readEntry(requestedId).then(
      (entry) => {
        if (cancelled) return;
        setSource(entry.content);
        setSourceDesignId(requestedId);
        setSourceLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setSourceLoading(false);
        setStatus(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const preview = useMemo(() => buildPreviewDocument(source, { path: 'App.jsx' }), [source]);

  async function createDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    try {
      const design = await webApi.createDesign(name);
      setDesigns((current) => [design, ...current]);
      setActiveId(design.id);
      formElement.reset();
      setStatus('Workspace created');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function save() {
    if (!activeId || sourceDesignId !== activeId || sourceLoading) return;
    try {
      await webApi.writeEntry(sourceDesignId, source);
      setStatus('Saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">LOCAL-FIRST</p>
          <h1>Open CoDesign</h1>
          <p className="muted">Web workspace preview</p>
        </div>
        <form onSubmit={(event) => void createDesign(event)}>
          <label htmlFor="design-name">New design</label>
          <div className="new-design">
            <input id="design-name" name="name" placeholder="Campaign concept" />
            <button type="submit">Create</button>
          </div>
        </form>
        <nav aria-label="Projects" className="project-tabs">
          {designs.map((design) => (
            <button
              className={design.id === activeId ? 'design active' : 'design'}
              key={design.id}
              onClick={() => setActiveId(design.id)}
              type="button"
            >
              {design.name}
            </button>
          ))}
        </nav>
        <p className="status">{status}</p>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">APP.JSX</p>
            <h2>{designs.find((design) => design.id === activeId)?.name ?? 'Preview'}</h2>
          </div>
          <button
            disabled={!activeId || sourceDesignId !== activeId || sourceLoading}
            onClick={() => void save()}
            type="button"
          >
            {sourceLoading ? 'Loading…' : 'Save source'}
          </button>
        </header>
        <div aria-label="Workspace view" className="view-tabs" role="tablist">
          <button
            aria-selected={mobilePanel === 'source'}
            onClick={() => setMobilePanel('source')}
            role="tab"
            type="button"
          >
            Source
          </button>
          <button
            aria-selected={mobilePanel === 'preview'}
            onClick={() => setMobilePanel('preview')}
            role="tab"
            type="button"
          >
            Preview
          </button>
        </div>
        <div className="panes">
          <textarea
            aria-label="App.jsx source"
            className="panel source-panel"
            data-active={mobilePanel === 'source'}
            disabled={sourceLoading || sourceDesignId !== activeId}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            value={source}
            wrap="off"
          />
          <iframe
            className="panel preview-panel"
            data-active={mobilePanel === 'preview'}
            sandbox="allow-scripts"
            srcDoc={preview}
            title="Design preview"
          />
        </div>
      </section>
    </main>
  );
}
