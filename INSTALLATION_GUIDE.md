# PhotoKG Installation Guide

This guide describes the current PhotoKG setup: an Express backend, a static D3.js frontend, an LLM provider, and an optional graph database. The backend defaults to Neo4j; ArangoDB remains available as a compatibility mode.

## 1. Prerequisites

Install the following tools before starting:

- Node.js 16 or newer and npm
- Python 3.8 or newer for the optional Python environment or a separate static frontend server
- Git
- Docker, if you plan to run Neo4j or ArangoDB in containers

Check the versions:

~~~bash
node --version
npm --version
python --version
git --version
~~~

## 2. Clone the project

~~~bash
git clone https://github.com/SeungriYoon/PhotoKG.git
cd PhotoKG
~~~

## 3. Install dependencies

Install the backend dependencies:

~~~bash
cd backend
npm install
cd ..
~~~

The frontend is static and does not require a bundler. The root package.json only provides helper commands such as the Python server and PlantConnectome conversion.

### Optional Python environment

The repository also contains Python utilities and dependency metadata. Create the environment only if your workflow needs them:

Windows PowerShell:

~~~powershell
python -m venv venv
venv/Scripts/Activate.ps1
python -m pip install -r requirements.txt
~~~

macOS/Linux:

~~~bash
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
~~~

## 4. Configure .env

Copy the safe template:

Windows PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

macOS/Linux:

~~~bash
cp .env.example .env
~~~

Edit .env. A minimal Neo4j + OpenAI-compatible configuration is:

~~~env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=replace-with-your-key

GRAPH_BACKEND=neo4j
NEO4J_URL=http://localhost:7474
NEO4J_DATABASE=neo4j
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=replace-with-your-password

PORT=3015
NODE_ENV=development
~~~

The backend reads .env from the repository root. Never commit .env, API keys, passwords, or local logs. .gitignore intentionally excludes .env and *.log; verify them before staging with:

~~~bash
git status --short --ignored
git diff --cached --name-only
~~~

## 5. Configure an LLM provider

Choose one provider. The supported values are gemini, openai_compatible, ollama, and local_http.

### OpenAI-compatible API

~~~env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=replace-with-your-key
LLM_TIMEOUT_MS=60000
LLM_TEMPERATURE=0
LLM_MAX_TOKENS=2048
~~~

### Gemini

~~~env
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
LLM_API_KEY=replace-with-your-key
~~~

GEMINI_API_KEY is also accepted for Gemini configuration.

### Ollama

Start Ollama and make sure the selected model is available:

~~~bash
ollama pull llama3.1
~~~

Then set:

~~~env
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.1
~~~

### Local OpenAI-compatible server

~~~env
LLM_PROVIDER=local_http
LLM_BASE_URL=http://127.0.0.1:8000/v1
LLM_MODEL=your-local-model
~~~

Verify the provider after starting the backend at GET /api/analysis/llm-health.

## 6. Configure the graph database

### Option A: Neo4j (default)

Run Neo4j with Docker:

~~~bash
docker run --name photokg-neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/replace-with-your-password -d neo4j:5
~~~

Set the corresponding values in .env:

~~~env
GRAPH_BACKEND=neo4j
NEO4J_URL=http://localhost:7474
NEO4J_DATABASE=neo4j
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=replace-with-your-password
~~~

Test the connection:

~~~bash
cd backend
npm run test:neo4j
~~~

The same adapter contract can be run against both databases after each service is started:

~~~bash
cd backend
npm run test:contract:neo4j
npm run test:contract:arango
~~~

The shared graph response uses `nodes` and `links`; each record has a stable `id` and an `attributes` object. The database-neutral health endpoint is `GET /api/graph/health`.

### Option B: ArangoDB compatibility mode

Run ArangoDB:

~~~bash
docker run --name photokg-arangodb -p 8529:8529 -e ARANGO_ROOT_PASSWORD=replace-with-your-password -d arangodb:latest
~~~

Use these settings:

~~~env
GRAPH_BACKEND=arango
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=replace-with-your-password
ARANGODB_DATABASE=knowledge_graph
~~~

Initialize and test ArangoDB:

~~~bash
cd backend
npm run test-connection
npm run init-db
~~~

## 7. Start PhotoKG

### Recommended: backend serves the frontend

The Express server serves both the API and the project root:

~~~bash
cd backend
npm start
~~~

Open:

- Application: http://localhost:3015
- API health: http://localhost:3015/api/health
- LLM health: http://localhost:3015/api/analysis/llm-health
- Selected graph backend health: http://localhost:3015/api/graph/health

### Frontend development server

Run the backend and frontend in separate terminals:

~~~bash
# Terminal 1
cd backend
npm run dev

# Terminal 2, from the project root
python -m http.server 3000
~~~

Open http://localhost:3000. The frontend calls the backend at http://localhost:3015.

If the backend is unavailable, the interface loads a local sample graph. Uploading files, querying stored graphs, and server-side analysis require the backend.

## 8. First-run checks

1. Open the application and confirm the console reports that the frontend initialized.
2. Confirm /api/health returns a successful response.
3. Confirm /api/analysis/llm-health reports the selected provider.
4. Confirm /api/graph/health succeeds when a graph database is configured.
5. Upload a small CSV or PDF and verify that nodes and relationships appear in the graph.
6. Open PEO Analysis, Network Analysis, and AI Insights to verify the analysis panels.

## 9. Data import workflows

### PlantConnectome CSV

Convert a large CSV into the normalized graph JSON format:

~~~bash
npm run convert:plantconnectome -- input.csv output.json 20000
~~~

The optional final argument limits rows; the default is 20,000. Keep generated preview files outside the committed source tree unless they are intentional release assets.

### SciData JSONL

Preview the import without writing to the database:

~~~bash
cd backend
node scripts/import-scidata.js --source "path/to/scidata/data" --dry-run
~~~

Import the data after the graph backend is ready:

~~~bash
npm run import:scidata -- --source "path/to/scidata/data"
~~~

## 10. Troubleshooting

### The UI loads but the graph request fails

- Confirm that the backend is running on port 3015.
- Open /api/health directly.
- Check the selected GRAPH_BACKEND value.
- For Neo4j, check /api/graph/health and confirm the HTTP URL, database, username, and password.
- For ArangoDB, run npm run test-connection from backend.

### LLM health reports a configuration error

- Confirm LLM_PROVIDER, LLM_BASE_URL, and LLM_MODEL.
- Confirm the API key is present for Gemini and OpenAI-compatible services.
- For Ollama or local_http, confirm the local service is running and the model exists.
- Restart the backend after changing .env.

### File upload or PDF analysis fails

- Confirm the backend is running and the selected file type is supported.
- Check the file size against MAX_FILE_SIZE.
- Check the backend console for parser or LLM errors.
- For long PDFs, increase LLM_TIMEOUT_MS and ANALYSIS_TIMEOUT if the provider requires more time.

### Port 3015 or 3000 is already in use

Change PORT in .env for the backend. If the frontend is served separately, start Python's server on another port:

~~~bash
python -m http.server 3001
~~~

When changing the backend port, update the frontend API base URL in js/backendAPI.js or serve the frontend through the backend to keep the default configuration.

### Browser console or CORS errors

- Prefer opening the frontend through http://localhost:3015 for a same-origin setup.
- If using port 3000, confirm that the backend is running and that the browser is not blocking the request.
- Do not open the HTML file directly from an untrusted location when testing API calls.

## 11. Validation commands

From the repository root:

~~~bash
git diff --check
node --check js/main.js
node --check js/analysisPanel.js
node --check js/backendAPI.js
~~~

From backend:

~~~bash
npm run lint
npm test
~~~

The current lint command is a placeholder, and the root test command is not configured. Use the database connection commands above for environment-level verification.

## 12. Keeping the checkout clean

Before committing or pushing:

~~~bash
git status --short
git diff --check
git diff --cached --name-only
~~~

Do not stage or publish:

- .env and any file containing credentials
- *.log
- uploads/
- .omx/ runtime state
- temporary result JSON files
- large local datasets or generated previews
- UI prototypes that are not part of the selected release

Use .env.example as the shareable configuration template.
