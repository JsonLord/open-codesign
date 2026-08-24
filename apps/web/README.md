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

Open <http://localhost:7860>. Designs persist in the `codesign-web-data` Docker volume. Stop the app
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
| `CODESIGN_DATA_DIR` | `./data` | Root for managed design workspaces |

The current image is intended for localhost or a trusted private network. Do not expose it directly
to the public internet: authentication, per-user authorization, isolated agent execution, and
encrypted provider credential storage are not included yet.
