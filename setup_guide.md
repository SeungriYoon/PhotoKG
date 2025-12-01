# OpenAI-Based System Setup Guide

## 1. Environment Setup

### Python Environment Setup
```bash
# Create Python virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### Node.js Backend Setup
```bash
# Navigate to backend directory
cd backend

# Install packages
npm install

# Additional packages (if needed)
npm install express cors helmet morgan multer dotenv
```

## 2. Environment Variables Configuration

### Create .env File
```bash
# Copy .env.example to create .env file
cp .env.example .env
```

### Required Environment Variables
Open the `.env` file and set the following values:

```env
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-your-actual-openai-api-key

# Database Configuration
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=your_db_password
ARANGODB_DATABASE=knowledge_graph

# Server Ports
PORT=3015
PYTHON_SERVICE_URL=http://localhost:8000
```

### How to Get OpenAI API Key
1. Visit [OpenAI Website](https://platform.openai.com/)
2. Login or create an account
3. Go to API Keys section and create a new key
4. Save the generated key in the `.env` file

## 3. Database Setup

### ArangoDB Installation and Execution
```bash
# Windows (Chocolatey)
choco install arangodb

# Linux (Ubuntu)
curl -OL https://download.arangodb.com/arangodb310/DEBIAN/Release.key
sudo apt-key add - < Release.key
sudo apt-get update
sudo apt-get install arangodb3

# Using Docker (Recommended)
docker run -e ARANGO_ROOT_PASSWORD=mypassword -p 8529:8529 -d arangodb:latest
```

**Note:** ArangoDB is optional. The system works without it for basic features.

### Database Initialization
```bash
# Run from backend directory
cd backend
node scripts/init-database.js
```

## 4. Service Execution

### Step 1: Run ArangoDB (Optional)
```bash
# If installed locally
sudo systemctl start arangodb3

# If using Docker
docker start <container_id>

# Verify ArangoDB web interface
# http://localhost:8529
```

### Step 2: Run Python Analysis Service (Optional)
```bash
# From project root
python openai_analyzer.py

# Or use uvicorn directly
uvicorn openai_analyzer:app --host 0.0.0.0 --port 8000 --reload

# Check service status
curl http://localhost:8000/health
```

### Step 3: Run Node.js Backend
```bash
# From backend directory
cd backend
npm run dev

# Or production mode
npm start

# Check service status
curl http://localhost:3015/api/health
```

### Step 4: Run Frontend
```bash
# From project root directory
# Use Live Server or simple HTTP server
python -m http.server 3000

# Access in browser
# http://localhost:3000
```

## 5. System Verification

### Connection Test
1. **Frontend**: Open http://localhost:3000 and click "Test Connection" button
2. **Backend API**: Access http://localhost:3015/api/health
3. **Python Service**: Access http://localhost:8000/health (if running)
4. **ArangoDB**: Access http://localhost:8529 web interface (if running)

### Analysis Feature Test
1. Upload a sample CSV file
2. Click "Upload CSV" button
3. Check OpenAI analysis results
4. Verify knowledge graph visualization

## 6. Troubleshooting

### Common Errors and Solutions

#### OpenAI API Error
```
Error: OpenAI API key not found
```
**Solution**: Verify correct API key is set in `.env` file

#### Connection Error
```
Error: Connection refused to localhost:8000
```
**Solution**: Check if Python analysis service is running

#### CORS Error
```
Error: CORS policy blocked
```
**Solution**: Add frontend domain to allowed list in backend

#### File Upload Error
```
Error: File too large
```
**Solution**: Check `MAX_FILE_SIZE` setting in `.env`

### Log Checking Methods
```bash
# Python service logs
tail -f logs/openai_analyzer.log

# Node.js backend logs
tail -f logs/backend.log

# Check network tab in browser developer tools
```

## 7. Development Mode Setup

### Auto-restart Configuration
```bash
# Python service (uvicorn reload)
uvicorn openai_analyzer:app --reload

# Node.js backend (nodemon)
npm run dev

# Frontend (Live Server)
# Use VS Code Live Server extension
```

### Debugging Configuration
```bash
# Python debug mode
export LOG_LEVEL=debug
python openai_analyzer.py

# Node.js debug mode
DEBUG=* npm run dev
```

## 8. Production Deployment

### Using Docker Compose (Recommended)
```yaml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:80"
    depends_on:
      - backend
      
  backend:
    build: ./backend
    ports:
      - "3015:3015"
    environment:
      - NODE_ENV=production
    depends_on:
      - python-service
      - arangodb
      
  python-service:
    build: .
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      
  arangodb:
    image: arangodb:latest
    ports:
      - "8529:8529"
    environment:
      - ARANGO_ROOT_PASSWORD=${DB_PASSWORD}
```

### Environment-specific Configuration
```bash
# Development environment
cp .env.example .env.development

# Test environment  
cp .env.example .env.test

# Production environment
cp .env.example .env.production
```

## 9. Performance Optimization

### Caching Configuration
```bash
# Install Redis (Optional)
docker run -d -p 6379:6379 redis:alpine

# Enable caching
export ENABLE_CACHE=true
export REDIS_URL=redis://localhost:6379
```

### Monitoring Configuration
```bash
# Enable Prometheus metrics
export ENABLE_METRICS=true

# Adjust log level
export LOG_LEVEL=info
```

The new OpenAI-based system is now ready! 🚀
