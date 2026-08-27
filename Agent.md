# Hugging Face Space Deployment & Operations Guide

This `Agent.md` file informs future agents and maintainers about deployment configurations, tricks, ongoing deployment best practices, and API endpoint documentation for running this codebase on Hugging Face Spaces.

## 1. Deployment Configuration

### Target Space
- **Profile:** `Leon4gr45`
- **Space:** `openui-cowork`
- **Full Identifier:** `Leon4gr45/openui-cowork`
- **Frontend Port:** `7860` (mandatory for Hugging Face Spaces)

### Deployment Method
- **Docker SDK** (uses root `Dockerfile`)

### HF Token Environment Variable
- The environment variable **`HF_TOKEN`** is provided at execution time.
- Never hardcode tokens in the codebase. Always read from the environment (`process.env.HF_TOKEN` or `os.environ["HF_TOKEN"]`).
- All log-streaming and monitoring operations use the authorization bearer token supplied in `HF_TOKEN`.

### Required Deployment Files
- `Dockerfile` (root configuration for container build)
- `README.md` (with Hugging Face Space YAML frontmatter):
  ```yaml
  ---
  title: openui-cowork
  sdk: docker
  app_port: 7860
  ---
  ```
- `.hfignore` (excludes local dependencies, logs, `.git`, build artifacts)
- `Agent.md` (this file, committed before deployment)

---

## 2. API Exposure and Documentation

### Mandatory Endpoints
- **`/health`**
  - **Method:** GET
  - **Purpose:** Health check returning HTTP 200 when ready. Required for Hugging Face Space readiness check.
  - **Request Example:** None
  - **Response Example:**
    ```json
    {
      "ok": true,
      "mode": "local-web",
      "runtime": {
        "dataRoot": "/app",
        "modelConfigured": false
      }
    }
    ```

- **`/api-docs`**
  - **Method:** GET
  - **Purpose:** Documents all available endpoints. Reachable at `https://Leon4gr45-openui-cowork.hf.space/api-docs`.
  - **Request Example:** None
  - **Response Example:**
    ```json
    {
      "title": "Open CoDesign Web API Documentation",
      "version": "0.1.0",
      "endpoints": [...]
    }
    ```

### Functional Endpoints

### `/api/runtime`
- **Method:** GET
- **Purpose:** Inspect model runtime availability and storage data root directory.
- **Request:** None
- **Response:**
  ```json
  {
    "dataRoot": "/app",
    "modelConfigured": false
  }
  ```

### `/api/designs`
- **Method:** GET
- **Purpose:** List all saved design workspaces.
- **Request:** None
- **Response:**
  ```json
  [
    {
      "id": "design-123",
      "name": "Landing Page",
      "updatedAt": "2026-08-24T08:00:00.000Z"
    }
  ]
  ```

### `/api/designs`
- **Method:** POST
- **Purpose:** Create a new design workspace.
- **Request:**
  ```json
  {
    "name": "New Web Prototype"
  }
  ```
- **Response:**
  ```json
  {
    "id": "design-456",
    "name": "New Web Prototype",
    "createdAt": "2026-08-24T08:00:00.000Z"
  }
  ```

### `/api/designs/:id/entry`
- **Method:** GET
- **Purpose:** Read code content of the entry file for a given design ID.
- **Request:** None
- **Response:**
  ```json
  {
    "id": "design-456",
    "content": "export default function App() { return <div>Hello World</div>; }"
  }
  ```

### `/api/designs/:id/entry`
- **Method:** PUT
- **Purpose:** Update code content of the entry file for a given design ID.
- **Request:**
  ```json
  {
    "content": "export default function App() { return <div>Updated Content</div>; }"
  }
  ```
- **Response:**
  ```json
  {
    "id": "design-456",
    "content": "export default function App() { return <div>Updated Content</div>; }"
  }
  ```

### `/api/designs/:id/generate`
- **Method:** POST
- **Purpose:** Generate design code source via model prompt.
- **Request:**
  ```json
  {
    "prompt": "Add a hero section with dark background and CTA button"
  }
  ```
- **Response:**
  ```json
  {
    "id": "design-456",
    "content": "export default function App() { ... }"
  }
  ```

---

## 3. Deployment Workflow & Monitoring

### Deployment Precondition
Check that the Space repository on Hugging Face hub is clean and delete any leftover non-project files.

### Standard Deployment Command
Upload the codebase to Hugging Face Spaces:

```bash
hf upload Leon4gr45/openui-cowork --repo-type=space
```

### Log Streaming & Deployment Monitoring

1. Stream build logs via Server-Sent Events (SSE):
   ```bash
   curl -N \
     -H "Authorization: Bearer $HF_TOKEN" \
     "https://huggingface.co/api/spaces/Leon4gr45/openui-cowork/logs/build"
   ```

2. Once build logs succeed, stream run logs via SSE:
   ```bash
   curl -N \
     -H "Authorization: Bearer $HF_TOKEN" \
     "https://huggingface.co/api/spaces/Leon4gr45/openui-cowork/logs/run"
   ```

3. Monitor status for up to 300 seconds. If any logs indicate build or runtime failure:
   - Identify failure cause from SSE log trace.
   - Fix issues in local codebase via code modifications.
   - Redeploy (`hf upload`) and repeat log monitoring cycle.
4. Verify HTTP GET `/health` and `/api-docs` return HTTP 200 and expected payloads once running.
