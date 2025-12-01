# 🧠 PhotoRAG Knowledge Graph System - Installation Guide

Welcome to PhotoRAG, an advanced knowledge graph system for scientific research analysis! This guide provides two installation paths tailored to different user needs and technical expertise levels.

## 📋 Prerequisites

Before starting, ensure you have the following installed on your system:

- **Node.js** (v16.0.0 or higher) - [Download here](https://nodejs.org/)
- **Python** (v3.8 or higher) - [Download here](https://python.org/)
- **Git** - [Download here](https://git-scm.com/)

## 🚀 Quick Start (Simplified Version)

Perfect for users who want to get up and running immediately without complex database setup.

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd PhotoRAG
```

### Step 2: Install Dependencies

#### Backend Dependencies
```bash
cd backend
npm install
cd ..
```

#### Python Dependencies
```bash
# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install Python packages
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```env
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# Server Configuration
PORT=3015
NODE_ENV=development
```

**🔑 Getting Your OpenAI API Key:**
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to "API Keys" section
4. Create a new API key
5. Copy the key and paste it in your `.env` file

### Step 4: Start the System

#### Option A: Start Backend Only (Recommended for Quick Start)
```bash
cd backend
npm start
```

The system will run in **simplified mode** with in-memory processing. You can:
- Upload CSV/PDF files
- Generate knowledge graphs using AI
- Visualize and analyze data
- Export results

#### Option B: Start with Live Server (For Frontend Development)
```bash
# Terminal 1: Start Backend
cd backend
npm start

# Terminal 2: Start Frontend Server
# Using Python's built-in server
python -m http.server 3000

# Or using Node.js http-server (if installed)
npx http-server -p 3000
```

### Step 5: Access the Application

Open your browser and navigate to:
- **Main Application**: `http://localhost:3000`
- **Backend API**: `http://localhost:3015/api/health`

### Step 6: Test the System

1. **Upload a Sample File**: Try uploading a CSV file with research data
2. **Check AI Analysis**: Verify that OpenAI analysis is working
3. **Explore Visualization**: Interact with the generated knowledge graph

---

## 🔧 Advanced Setup (Comprehensive Version)

For users who need full database integration, advanced analytics, and production-ready features.

### Step 1: Complete Basic Setup

Follow Steps 1-3 from the Quick Start section above.

### Step 2: Install ArangoDB

#### Option A: Using Docker (Recommended)
```bash
# Pull and run ArangoDB container
docker run -e ARANGO_ROOT_PASSWORD=your_secure_password -p 8529:8529 -d --name arangodb arangodb:latest

# Verify ArangoDB is running
docker ps
```

#### Option B: Native Installation

**Windows:**
```bash
# Using Chocolatey
choco install arangodb

# Or download from official website
# https://www.arangodb.com/download/
```

**macOS:**
```bash
# Using Homebrew
brew install arangodb

# Start ArangoDB
brew services start arangodb
```

**Linux (Ubuntu/Debian):**
```bash
# Add ArangoDB repository
curl -OL https://download.arangodb.com/arangodb310/DEBIAN/Release.key
sudo apt-key add - < Release.key
echo 'deb https://download.arangodb.com/arangodb310/DEBIAN/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt-get update

# Install ArangoDB
sudo apt-get install arangodb3

# Start ArangoDB
sudo systemctl start arangodb3
```

### Step 3: Configure Advanced Environment

Update your `.env` file with database settings:

```env
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# ArangoDB Configuration
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=your_secure_password
ARANGODB_DATABASE=knowledge_graph

# Server Configuration
PORT=3015
NODE_ENV=development

# Optional: Advanced Features
ENABLE_CACHE=true
LOG_LEVEL=info
MAX_FILE_SIZE=52428800
```

### Step 4: Initialize Database

```bash
cd backend

# Test database connection
npm run test-connection

# Initialize database schema
npm run init-db

# (Optional) Migrate existing data
npm run migrate
```

### Step 5: Start All Services

#### Development Mode (with auto-reload)
```bash
# Terminal 1: Start ArangoDB (if not using Docker)
sudo systemctl start arangodb3

# Terminal 2: Start Backend with Database
cd backend
npm run dev

# Terminal 3: Start Frontend
python -m http.server 3000
```

#### Production Mode
```bash
# Start ArangoDB
sudo systemctl start arangodb3

# Start Backend
cd backend
npm start

# Start Frontend (using a production server)
npx serve -s . -l 3000
```

### Step 6: Verify Advanced Features

1. **Database Integration**: Check that data is being stored in ArangoDB
2. **Advanced Analytics**: Test PEO analysis and network metrics
3. **Data Persistence**: Verify that uploaded data persists between sessions
4. **Performance Monitoring**: Check the performance dashboard

---

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### OpenAI API Errors
```
Error: OpenAI API key not found
```
**Solution**: Verify your API key in the `.env` file and ensure it starts with `sk-`

#### Database Connection Issues
```
Error: Connection refused to localhost:8529
```
**Solution**: 
- Ensure ArangoDB is running: `docker ps` or `sudo systemctl status arangodb3`
- Check your database credentials in `.env`
- Verify the database URL is correct

#### Port Already in Use
```
Error: Port 3015 is already in use
```
**Solution**: 
- Change the port in `.env`: `PORT=3016`
- Or kill the process using the port: `lsof -ti:3015 | xargs kill -9`

#### File Upload Errors
```
Error: File too large
```
**Solution**: 
- Check file size (max 50MB)
- Verify `MAX_FILE_SIZE` in `.env` if using advanced setup

### Log Files and Debugging

#### Backend Logs
```bash
# View backend logs
cd backend
npm run dev  # Shows logs in console

# Or check system logs
tail -f /var/log/arangodb3/arangod.log
```

#### Frontend Debugging
1. Open browser Developer Tools (F12)
2. Check Console tab for JavaScript errors
3. Check Network tab for API call failures

### Performance Optimization

#### For Large Datasets
```env
# Increase memory limits
NODE_OPTIONS="--max-old-space-size=4096"
MAX_FILE_SIZE=104857600  # 100MB
```

#### For Production
```env
# Enable caching
ENABLE_CACHE=true
REDIS_URL=redis://localhost:6379

# Set log level
LOG_LEVEL=warn
```

---

## 🧪 Evaluation Assets (Optional)

If you plan to validate extraction quality or reproduce our paper benchmarks, include the `Evaluation/` folder when cloning or syncing:

- `01. Ground Truth/` — curated annotations for five reference documents.
- `02.~05./` — JSON outputs grouped by provider/model (Gemini-2.5-flash, Gemini-1.5-flash, GPT-4o-mini, GPT-4.1-nano).

You can extend these sets with your own runs and compare against ground truth in any evaluation notebook.

---

## 📚 Additional Resources

### API Documentation
- **Backend API**: `http://localhost:3015/api/health`
- **Graph Endpoints**: `http://localhost:3015/api/graph`
- **Analysis Endpoints**: `http://localhost:3015/api/analysis`

### Sample Data
- Use the provided `frontend_test.csv` for testing
- Try uploading research papers in PDF format
- Test with JSON data exports from other systems

### Advanced Configuration

#### Custom Analysis Models
```javascript
// Modify analysis parameters in backend/services/AnalysisService.js
const analysisConfig = {
  maxNodes: 200,
  minEdgeWeight: 0.1,
  clusteringMethod: 'community_detection'
};
```

#### Visualization Settings
```javascript
// Adjust visualization in js/config.js
const CONFIG = {
  DEFAULTS: {
    NODE_SIZE_MIN: 8,
    NODE_SIZE_MAX: 45,
    MAX_NODES_DISPLAY: 200
  }
};
```

---

## 🆘 Getting Help

If you encounter issues not covered in this guide:

1. **Check the Console**: Look for error messages in browser console
2. **Review Logs**: Check backend and database logs
3. **Verify Dependencies**: Ensure all packages are properly installed
4. **Test Connectivity**: Use the built-in connection test features

### Support Channels
- **Documentation**: Check the project README and code comments
- **Issues**: Report bugs and feature requests through the project repository
- **Community**: Join discussions in the project forums

---

## 🎉 You're All Set!

Congratulations! You now have PhotoRAG Knowledge Graph System running on your machine. Whether you chose the simplified or comprehensive setup, you can now:

- Upload research data in various formats
- Generate intelligent knowledge graphs
- Analyze relationships and patterns
- Export results for further research

Happy analyzing! 🚀
