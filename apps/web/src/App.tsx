import { buildPreviewDocument } from '@open-codesign/runtime';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
  const [status, setStatus] = useState('Loading local workspaces…');
  const [activeTab, setActiveTab] = useState<'source' | 'preview'>('preview');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void webApi
      .listDesigns()
      .then((rows) => {
        setDesigns(rows);
        setActiveId(rows[0]?.id ?? null);
        setStatus(rows.length === 0 ? 'Create your first browser workspace.' : 'Ready');
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!activeId) {
      setSource(EMPTY_SOURCE);
      return;
    }
    void webApi
      .readEntry(activeId)
      .then((entry) => setSource(entry.content))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [activeId]);

  const preview = useMemo(() => buildPreviewDocument(source, { path: 'App.jsx' }), [source]);

  async function createDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    try {
      const design = await webApi.createDesign(name);
      setDesigns((current) => [design, ...current]);
      setActiveId(design.id);
      event.currentTarget.reset();
      setStatus('Workspace created in /app');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function save() {
    if (!activeId) return;
    setIsSaving(true);
    try {
      await webApi.writeEntry(activeId, source);
      setStatus('Saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">LOCAL-FIRST</p>
          <h1>Open CoDesign</h1>
          <p className="muted">Projects in /app are discovered automatically</p>
        </div>
        <form onSubmit={(event) => void createDesign(event)}>
          <label htmlFor="design-name">New design</label>
          <div className="new-design">
            <input id="design-name" name="name" placeholder="Campaign concept" />
            <button type="submit">Create</button>
          </div>
        </form>
        <nav aria-label="Designs">
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
        <p className="status" aria-live="polite">
          {status}
        </p>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">APP.JSX</p>
            <h2>{designs.find((design) => design.id === activeId)?.name ?? 'Preview'}</h2>
          </div>
          <button disabled={!activeId || isSaving} onClick={() => void save()} type="button">
            {isSaving ? 'Saving…' : 'Save source'}
          </button>
        </header>
        <div className="tabs" role="tablist" aria-label="Workspace views">
          <button
            aria-selected={activeTab === 'source'}
            onClick={() => setActiveTab('source')}
            role="tab"
            type="button"
          >
            Source
          </button>
          <button
            aria-selected={activeTab === 'preview'}
            onClick={() => setActiveTab('preview')}
            role="tab"
            type="button"
          >
            Preview
          </button>
        </div>
        <div className="panes">
          <textarea
            aria-label="App.jsx source"
            className={activeTab === 'source' ? 'pane active-pane' : 'pane source-pane'}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            value={source}
          />
          <iframe
            className={activeTab === 'preview' ? 'pane active-pane' : 'pane preview-pane'}
            sandbox="allow-scripts"
            srcDoc={preview}
            title="Design preview"
          />
        </div>
      </section>
    </main>
  );
}
