# Knowledge Graph Backend API

Advanced knowledge graph backend API server based on ArangoDB

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js 16.0 or higher**
- **ArangoDB 3.8 or higher** (Optional - system works without it)

### 2. ArangoDB Installation and Setup (Optional)

#### Windows (Docker Recommended)
```bash
# Run ArangoDB with Docker
docker run -p 8529:8529 -e ARANGO_ROOT_PASSWORD=yourpassword arangodb/arangodb:latest
```

#### Direct Installation
[ArangoDB Official Download](https://www.arangodb.com/download-major/)

**Note:** The system works without ArangoDB. Basic features (file upload, CSV/JSON processing, graph visualization) are available without database connection.

### 3. Project Setup

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env file to enter ArangoDB connection information (optional)

# Test database connection (optional)
npm run test-connection

# Initialize database (optional)
npm run init-db

# Start development server
npm run dev
```

### 4. Integrated Setup (Run all at once)
```bash
npm run setup
```

## 📋 Environment Variables

`.env` file example:
```env
# Server Configuration
PORT=3015
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ArangoDB Configuration (Optional)
ARANGODB_URL=http://localhost:8529
ARANGODB_DATABASE=knowledge_graph
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB

# API Security
API_SECRET=your-secret-key-here
JWT_SECRET=your-jwt-secret-here
```

## 📊 API Endpoints

### Graph Management (`/api/graph`)

#### Get All Graph Data
```http
GET /api/graph?limit=50&offset=0&filter={"nodeType":"concept"}
```

#### Get Subgraph
```http
GET /api/graph/subgraph/:nodeId?depth=2
```

#### Search Nodes
```http
GET /api/graph/search?query=photosynthesis&type=process&limit=20
```

#### Create Graph
```http
POST /api/graph
Content-Type: application/json

{
  "nodes": [
    {
      "id": "node1",
      "label": "Photosynthesis",
      "type": "process",
      "size": 30
    }
  ],
  "edges": [
    {
      "source": "node1",
      "target": "node2",
      "weight": 5,
      "relationship_type": "RELATED_TO"
    }
  ],
  "metadata": {
    "title": "My Knowledge Graph",
    "description": "Sample graph"
  }
}
```

### File Upload (`/api/upload`)

#### Single File Upload
```http
POST /api/upload/file
Content-Type: multipart/form-data

file: [CSV/JSON/PDF file]
options: {"maxKeywords": 10, "minFrequency": 2}
```

#### Multiple File Upload
```http
POST /api/upload/files
Content-Type: multipart/form-data

files: [Multiple files]
```

#### Process File from URL
```http
POST /api/upload/url
Content-Type: application/json

{
  "url": "https://example.com/data.csv",
  "options": {
    "maxKeywords": 15
  }
}
```

### Analysis Features (`/api/analysis`)

#### Structure Analysis
```http
POST /api/analysis/structure
Content-Type: application/json

{
  "graphId": "graph_id",
  "analysisOptions": {
    "includeCentrality": true,
    "includeModularity": true
  }
}
```

#### Community Detection
```http
POST /api/analysis/communities
Content-Type: application/json

{
  "graphId": "graph_id",
  "algorithm": "modularity"
}
```

#### Similarity Calculation
```http
POST /api/analysis/similarity
Content-Type: application/json

{
  "nodeId1": "node1",
  "nodeId2": "node2",
  "method": "semantic"
}
```

## 🗂️ Data Structure

### Node Schema
```javascript
{
  "_key": "unique_id",
  "label": "Node Label",
  "size": 30,
  "type": "concept|process|material|measurement",
  "attributes": {
    "total_citations": 150,
    "importance_score": 4.5,
    "bert_confidence": 0.95
  },
  "created_at": "2025-01-13T..."
}
```

### Edge Schema
```javascript
{
  "_from": "nodes/node1",
  "_to": "nodes/node2",
  "weight": 5,
  "relationship_type": "INFLUENCES|CAUSES|PART_OF",
  "confidence": 0.8,
  "evidence": "Supporting text...",
  "created_at": "2025-01-13T..."
}
```

## 🔧 Development Commands

```bash
# Development server (auto-restart)
npm run dev

# Production server
npm start

# Test connection
npm run test-connection

# Initialize database
npm run init-db

# Run tests
npm test
```

## 📈 Performance Optimization

### 1. Index Usage
- Nodes: Index `label`, `type`, `size` fields
- Edges: Index `relationship_type`, `weight` fields
- Composite index: `type + graph_id`

### 2. Query Optimization
- Process large datasets with pagination
- Minimize network traffic with subgraph queries
- Exclude unnecessary data with filtering

### 3. Memory Management
- File upload size limit (50MB)
- Optimize memory usage with streaming processing

## 🚨 Troubleshooting

### ArangoDB Connection Failure
```bash
# 1. Check ArangoDB status
docker ps  # If using Docker
# Or check service status

# 2. Test connection
npm run test-connection

# 3. Check logs
tail -f logs/app.log  # If log file exists
```

**Note:** The server will continue running even if ArangoDB is not connected. Basic features work without database.

### File Upload Failure
- Check if file size exceeds 50MB
- Verify file format is supported (CSV, JSON, PDF)
- Check upload directory permissions

### Memory Insufficient
- Increase Node.js heap memory: `node --max-old-space-size=4096 server.js`
- Adjust batch processing size
- Clean up unnecessary data

## 📚 Additional Resources

- [ArangoDB Documentation](https://www.arangodb.com/docs/)
- [Graph Theory Basics](https://en.wikipedia.org/wiki/Graph_theory)
- [Introduction to Knowledge Graphs](https://ai.googleblog.com/2012/05/introducing-knowledge-graph-things-not.html)

## 🤝 Contributing

1. Create an issue or propose a feature
2. Fork and create a branch
3. Commit your changes
4. Create a pull request

## 📄 License

MIT License
