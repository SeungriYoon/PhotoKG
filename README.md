# PhotoKG Knowledge Graph System

Advanced knowledge graph visualization and analysis platform for scientific research. PhotoKG combines AI-powered entity extraction with interactive graph visualization to help researchers understand complex relationships in their data.

## ✨ Features

### 🎯 Core Capabilities
- **Multi-format Data Import**: CSV, JSON, and PDF file support
- **AI-Powered Analysis**: OpenAI GPT-4 and Google Gemini integration
- **Interactive Visualization**: D3.js-based knowledge graph rendering
- **Real-time Filtering**: Dynamic node and edge filtering
- **Advanced Analytics**: PEO analysis, network metrics, and community detection
- **Export Functionality**: Save graphs and analysis results

### 🤖 AI Integration
- **OpenAI Models**: GPT-4.1-nano (default), GPT-4o-mini, GPT-3.5-turbo
- **Google Gemini**: Gemini-2.5-flash (highest accuracy), Gemini-1.5-flash, Gemini-1.5-pro
- **Intelligent Extraction**: Automatic entity and relationship detection
- **Contextual Analysis**: Research paper understanding and knowledge graph generation

### 📊 Visualization Features
- **Interactive Graphs**: Zoom, pan, and explore relationships
- **Performance Monitoring**: Real-time FPS and rendering statistics
- **Search & Filter**: Find specific nodes and relationships
- **Progressive Loading**: Handle large datasets efficiently
- **Export Options**: Save visualizations as images or data

## 🚀 Quick Start

### Prerequisites
- Node.js (v16.0.0+)
- Python (v3.8+)
- Git

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd PhotoRAG
```

2. **Install dependencies**
```bash
# Backend dependencies
cd backend
npm install
cd ..

# Python dependencies
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
pip install -r requirements.txt
```

3. **Configure environment**
```bash
# Create .env file in project root
OPENAI_API_KEY=sk-your-openai-api-key-here
PORT=3015
NODE_ENV=development
```

4. **Start the system**

You need to run two servers in separate terminal windows:

**Terminal 1 - Backend Server:**
```bash
cd backend
npm start
```
The backend server will run on port 3015. Keep this terminal window open.

**Terminal 2 - Frontend Server:**
```bash
# Navigate to project root directory
cd <project-root-directory>
python -m http.server 3000
```
The frontend server will run on port 3000. Keep this terminal window open.

**Note:** 
- You need two separate terminal windows
- Backend runs from the `backend` folder
- Frontend runs from the project **root folder**
- Each server must run in a separate terminal window

5. **Access the application**
- Open `http://localhost:3000` in your browser
- Upload CSV, JSON, or PDF files
- Explore the generated knowledge graph

## 📁 Project Structure

```
PhotoRAG/
├── backend/                 # Node.js backend server
│   ├── config/             # Database configuration
│   ├── middleware/         # API middleware
│   ├── models/             # Data schemas
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic
│   ├── scripts/            # Database scripts
│   └── server.js           # Main server file
├── js/                     # Frontend JavaScript modules
│   ├── main.js            # Main application logic
│   ├── visualization.js   # D3.js graph rendering
│   ├── aiService.js       # AI integration
│   ├── dataProcessor.js   # Data processing
│   └── uiManager.js       # UI management
├── index.html              # Main HTML file
├── styles.css             # Main stylesheet
├── styles_analysis.css    # Analysis panel styles
└── requirements.txt       # Python dependencies
```

## 🔧 Advanced Setup

For production use with full database integration:

### ArangoDB Setup
```bash
# Using Docker (recommended)
docker run -e ARANGO_ROOT_PASSWORD=your_password -p 8529:8529 -d --name arangodb arangodb:latest

# Or install natively
# See INSTALLATION_GUIDE.md for detailed instructions
```

### Environment Configuration
```env
# Database Configuration
ARANGODB_URL=http://localhost:8529
ARANGODB_USERNAME=root
ARANGODB_PASSWORD=your_password
ARANGODB_DATABASE=knowledge_graph

# AI Configuration
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-nano
GOOGLE_API_KEY=your-google-key-here
GOOGLE_MODEL=gemini-2.5-flash

# Server Configuration
PORT=3015
NODE_ENV=production
```

## 📖 API Documentation

### Core Endpoints
- `GET /api/health` - System health check
- `POST /api/upload/csv` - Upload and analyze CSV files
- `POST /api/upload/pdf` - Upload and analyze PDF files
- `GET /api/graph` - Retrieve knowledge graph data
- `POST /api/analysis/peo` - Perform PEO analysis
- `POST /api/analysis/network` - Network analysis

### AI Analysis Endpoints
- `POST /api/arango/analyze-metadata` - AI-powered metadata analysis
- `POST /api/arango/chat` - AI chat interface
- `GET /api/arango/test-openai` - Test OpenAI connection

## 🎨 Usage Examples

### Upload CSV Data
1. Click "Select File" button
2. Choose your CSV file
3. System automatically processes and generates knowledge graph
4. Use filters to explore relationships

### Analyze PDF Research Papers
1. Upload PDF file
2. AI extracts entities and relationships
3. Interactive graph shows research concepts
4. Use analysis tools for deeper insights

### Export Results
1. Use zoom/pan controls to focus on areas of interest
2. Click export button to save visualization
3. Download analysis results as JSON

## 🛠️ Configuration

### AI Model Selection
The system supports multiple AI models optimized for different use cases:

| Model | Provider | Speed | Quality | Best For |
|-------|----------|--------|---------|----------|
| GPT-4.1-nano | OpenAI | ⚡⚡⚡ | ⭐⭐⭐⭐ | Primary engine for large-scale indexing; pair with Gemini-2.5-flash for on-demand deep reasoning on high-impact papers |
| Gemini-1.5-flash | Google | ⚡⚡⚡ | ⭐⭐⭐⭐ | Research & real-time parity |
| GPT-4o-mini | OpenAI | ⚡⚡⚡⚡ | ⭐⭐⭐½ | Fast processing |

### Performance Tuning
```javascript
// Adjust visualization settings in js/config.js
const CONFIG = {
  DEFAULTS: {
    NODE_SIZE_MIN: 8,
    NODE_SIZE_MAX: 45,
    MAX_NODES_DISPLAY: 200
  }
};
```

## 🔍 Troubleshooting

### Common Issues

**OpenAI API Errors**
- Verify API key is correct and has sufficient credits
- Check rate limits and retry configuration

**Database Connection Issues**
- Ensure ArangoDB is running on port 8529
- Verify credentials in .env file

**File Upload Errors**
- Check file size (max 50MB)
- Ensure file format is supported (CSV, JSON, PDF)

### Debug Mode
```bash
# Enable debug logging
NODE_ENV=development npm start

# Check backend logs
cd backend && npm run dev
```

## 📚 Documentation

- [Installation Guide](INSTALLATION_GUIDE.md) - Detailed setup instructions
- [API Guide](API_Guide.md) - Complete API documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [D3.js](https://d3js.org/) for visualization
- AI integration with [OpenAI](https://openai.com/) and [Google AI](https://ai.google.dev/)
- Database powered by [ArangoDB](https://www.arangodb.com/)
- Backend built with [Express.js](https://expressjs.com/)

## 📞 Support

For support and questions:
- Check the [troubleshooting section](#troubleshooting)
- Review the [API documentation](API_Guide.md)
- Open an issue in the repository

---

**Happy analyzing! 🚀**
>>>>>>> e065657 (Initial commit)
