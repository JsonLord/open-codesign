export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeStatus {
  ready: boolean;
  storageRoot: string;
  model?: { provider: string; model: string };
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const webApi = {
  runtime: () => request<RuntimeStatus>('/api/runtime'),
  listDesigns: () => request<DesignSummary[]>('/api/designs'),
  createDesign: (name: string) =>
    request<DesignSummary>('/api/designs', { method: 'POST', body: JSON.stringify({ name }) }),
  readEntry: (designId: string) =>
    request<{ path: string; content: string }>(`/api/designs/${designId}/entry`),
  writeEntry: (designId: string, content: string) =>
    request<{ path: string; content: string }>(`/api/designs/${designId}/entry`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  generate: (designId: string, prompt: string) =>
    request<{ path: string; content: string }>(`/api/designs/${designId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
};
