# Open CoDesign Web

The web sibling is a local-first TypeScript/React application served by a small Node.js server. Its
first increment provides persistent design workspaces, an `App.jsx` source editor, and the shared
Open CoDesign sandbox preview runtime. Agent generation and the full desktop `window.codesign` API
will move behind HTTP and event-stream adapters in later increments.

## Docker installation

From the repository root:

```bash
docker compose -f apps/web/compose.yaml up --build
```

Open <http://localhost:7860>. Projects persist in the `codesign-web-projects` Docker volume mounted
at `/app`. Any direct child folder in `/app` that contains an `App.jsx` file is registered in the
sidebar automatically within five seconds. Stop the app
without deleting its data:

```bash
docker compose -f apps/web/compose.yaml down
```

To also delete all web workspaces, deliberately remove the volume:

```bash
docker compose -f apps/web/compose.yaml down --volumes
```

## Local development

```bash
pnpm install
pnpm --filter @open-codesign/web dev
```

Vite runs on port 7860 and proxies API requests to the local Node server on port 7861.

## Production configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `7860` | HTTP listen port |
| `HOST` | `127.0.0.1` | Listen host; the Docker image explicitly uses `0.0.0.0` |
| `CODESIGN_PROJECTS_DIR` | `/app` | Root scanned for managed and existing `App.jsx` projects |

To use an existing host folder instead of the named volume, replace the Compose volume mapping with
an absolute bind mount:

```yaml
volumes:
  - /absolute/path/to/projects:/app
```

Each direct child folder containing `App.jsx` is represented by a pi JSONL session under
`/app/.codesign/sessions`; source files are not moved or renamed, and no parallel design registry is
created. `CODESIGN_DATA_DIR` remains accepted as a backward-compatible alias for the project root.

The development server binds both the Vite UI and its unauthenticated API to loopback. The Docker
image explicitly sets `HOST=0.0.0.0` so its published container port remains reachable. Do not set
an all-interface host for local development on an untrusted network.

The current image is intended for localhost or a trusted private network. Do not expose it directly
to the public internet: authentication, per-user authorization, isolated agent execution, and
encrypted provider credential storage are not included yet.
