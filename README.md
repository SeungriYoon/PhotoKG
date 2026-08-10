# PhotoKG

PhotoKG is a plant-science knowledge-graph system for exploring relationships among photosynthesis concepts, papers, processes, structures, and evidence.

The repository contains a static D3.js frontend and an Express backend. The backend exposes one graph API façade; Neo4j is the default adapter and ArangoDB is an alternative adapter.

## Features

- Interactive graph exploration, search, subgraphs, and node/edge operations.
- CSV and PDF analysis through the database-neutral `/api/analysis/*` API.
- LLM providers: Gemini, OpenAI-compatible APIs, Ollama, and local HTTP servers.
- PlantConnectome and SciData import helpers.
- Common graph contract: `nodes`, `links`, stable `id`, and `attributes` for both databases.

## Architecture

```text
Browser UI
   │
   ├── /api/graph/*       GraphService façade
   │                          ├── Neo4jGraphService (default)
   │                          └── ArangoGraphService (optional)
   └── /api/analysis/*    LLM and file analysis
```

The frontend never needs to call a database-specific graph or AI endpoint.

## Requirements

- Node.js 16 or newer and npm
- Python 3.8 or newer for optional utilities
- Neo4j 5+ or ArangoDB when the corresponding backend is selected
- An optional LLM provider for model-backed analysis

## Quick start

```bash
git clone https://github.com/SeungriYoon/PhotoKG.git
cd PhotoKG
cd backend
npm install
```

Copy `.env.example` to `.env`, configure the selected services, then start the application:

```powershell
Copy-Item ..\.env.example ..\.env
npm start
```

Open [http://localhost:3015](http://localhost:3015). The backend serves both the API and the static frontend.

## Configuration

### Neo4j (default)

```env
GRAPH_BACKEND=neo4j
NEO4J_URL=http://localhost:7474
NEO4J_DATABASE=neo4j
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=replace-with-your-password
```

Example Docker command:

```bash
docker run --name photokg-neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/replace-with-your-password -d neo4j:5
```

### ArangoDB

```env
GRAPH_BACKEND=arango
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=replace-with-your-password
ARANGODB_DATABASE=knowledge_graph
```

Example Docker command:

```bash
docker run --name photokg-arangodb -p 8529:8529 \
  -e ARANGO_ROOT_PASSWORD=replace-with-your-password -d arangodb:latest
```

### LLM

```env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=replace-with-your-key
```

Supported providers are `openai_compatible`, `gemini`, `ollama`, and `local_http`. Check the configured provider with `GET /api/analysis/llm-health`.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/graph/health` | Selected graph backend health |
| GET | `/api/graph` | Graph data as `nodes` and `links` |
| GET | `/api/graph/search` | Node search |
| GET | `/api/graph/subgraph` | Depth-limited subgraph |
| POST | `/api/graph` | Create graph data |
| POST | `/api/graph/merge` | Merge graph data |
| POST | `/api/analysis/csv` | Analyze a CSV upload |
| POST | `/api/analysis/pdf` | Analyze a PDF upload |
| POST | `/api/analysis/metadata` | Analyze the submitted graph |
| POST | `/api/analysis/chat` | Chat through the configured LLM |
| GET | `/api/analysis/llm-health` | LLM health |

See [API_Guide.md](API_Guide.md) for the broader endpoint reference.

## Verification

Run static checks from the repository root:

```bash
git diff --check
node --check js/main.js
node --check js/backendAPI.js
```

Run the backend checks:

```bash
cd backend
npm test -- --runInBand --passWithNoTests
npm run test:contract:neo4j
npm run test:contract:arango
```

The two contract commands exercise the same lifecycle against the selected database adapter. Both database services must be running and configured before they can pass.

## Repository hygiene

Do not stage or commit `.env`, `*.log`, `.omx/`, AI Insights v2-v4, `graphrag-poc.html`, `plantconnectome_preview.json`, temporary JSON results, or other local experiment outputs. These are intentionally excluded from the GitHub release.

## License

See [LICENSE](LICENSE) if present in the repository.
