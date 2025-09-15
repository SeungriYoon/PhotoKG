class KnowledgeGraphApp {
    constructor() {
        this.dataProcessor = new DataProcessor();
        this.visualization = new GraphVisualization();
        this.uiManager = new UIManager();
        this.backendAPI = new BackendAPI();
        
        this.currentData = null;
        this.isProcessing = false;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.visualization.init(document.getElementById('visualizationContainer'));
        this.uiManager.init();
        
        // Set initial state
        this.uiManager.updateStatus('System is ready.');
        this.uiManager.log('🚀 Advanced Knowledge Graph System initialized successfully');
        
        // Check OpenAI API status
        this.checkOpenAIStatus();

        // Load initial data (this will handle showing/hiding loading overlay)
        this.loadInitialData();
    }

    async checkOpenAIStatus() {
        try {
            const response = await fetch('http://localhost:3015/api/arango/test-openai');
            const data = await response.json();
            if (data.configured) {
                this.uiManager.log('✅ OpenAI API Key is configured.');
            } else {
                this.uiManager.log('⚠️ OpenAI API Key is not configured. Analysis features may be limited.');
            }
        } catch (error) {
            this.uiManager.log('❌ Could not verify OpenAI API status. Backend may be offline.');
        }
    }
    
    setupEventListeners() {
            // File upload event
            const fileInput = document.getElementById('fileInput');
            const fileUploadArea = document.getElementById('fileUploadArea');
            const selectFileBtn = document.getElementById('selectFileBtn');
            const uploadCsvBtn = document.getElementById('uploadCsvBtn');

            selectFileBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

            // Drag and drop events
            fileUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUploadArea.classList.add('drag-over');
            });

            fileUploadArea.addEventListener('dragleave', () => {
                fileUploadArea.classList.remove('drag-over');
            });

            fileUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUploadArea.classList.remove('drag-over');
                this.handleFileUpload(e.dataTransfer.files);
            });

            // New: CSV Upload button event
            uploadCsvBtn.addEventListener('click', () => this.uploadCsvFile());
        
        // Filter control events
        document.getElementById('nodeSizeThreshold').addEventListener('input', (e) => {
            document.getElementById('nodeSizeValue').textContent = e.target.value;
            this.updateFilters();
        });
        
        document.getElementById('edgeWeightThreshold').addEventListener('input', (e) => {
            document.getElementById('edgeWeightValue').textContent = e.target.value;
            this.updateFilters();
        });
        
        document.getElementById('maxNodesDisplay').addEventListener('input', (e) => {
            document.getElementById('maxNodesValue').textContent = e.target.value;
            this.updateFilters();
        });
        
        document.getElementById('progressiveLoading').addEventListener('change', () => {
            this.updateFilters();
        });
        
        // Search event
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
        
        // Graph control events
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            this.visualization.zoomIn();
        });
        
        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            this.visualization.zoomOut();
        });
        
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.visualization.resetZoom();
            this.visualization.clearSelection();
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.visualization.exportGraph();
        });
        
        // Performance monitoring
        this.startPerformanceMonitoring();
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        this.uiManager.log(`📁 File upload: ${file.name} (${this.formatFileSize(file.size)})`);

        // Check file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            this.uiManager.log(`❌ File too large: ${this.formatFileSize(file.size)} (max: 50MB)`);
            return;
        }

        try {
            this.showUploadStatus();

            let data;
            const fileExtension = file.name.toLowerCase().split('.').pop();

            // Retry logic for failed uploads
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    switch (fileExtension) {
                        case 'csv':
                            data = await this.processCSV(file);
                            break;
                        case 'json':
                            data = await this.processJSON(file);
                            break;
                        case 'pdf':
                            data = await this.processPDFWithBackend(file);
                            break;
                        default:
                            throw new Error('Unsupported file format.');
                    }
                    break; // Success, exit retry loop

                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw error; // Max retries reached, throw original error
                    }
                    this.uiManager.log(`⚠️ Upload attempt ${retryCount} failed, retrying... (${error.message})`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                }
            }

            if (data) {
                this.currentData = data;
                this.visualization.setData(data.nodes, data.links);
                // FIX: Log message updated to 'links' for consistency
                this.uiManager.log(`✅ Data loaded successfully: ${data.nodes.length} nodes, ${data.links.length} links`);

                this.updateFilters();
                window.currentGraph = data;

                // REFACTOR: Redundant event dispatch removed. 
                // The event is now correctly dispatched only from processCSV and processPDFWithBackend.
            }

        } catch (error) {
            this.uiManager.log(`❌ File processing error: ${error.message}`);
            if (error.message.includes('Failed to fetch')) {
                this.uiManager.log('💡 Tip: Check if backend server is running on port 3015');
            } else if (error.message.includes('OpenAI API key')) {
                this.uiManager.log('💡 Tip: Check if OpenAI API key is configured in backend/.env');
            } else if (error.message.includes('timed out')) {
                this.uiManager.log('💡 Tip: File processing timed out. Try with a smaller file.');
            }
        } finally {
            this.hideUploadStatus();
        }
    }

    async uploadCsvFile() {
        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];

        if (!file) {
            this.uiManager.log('⚠️ Please select a CSV file first.');
            return;
        }
        if (file.type !== 'text/csv') {
            this.uiManager.log('❌ Selected file is not a CSV. Please select a .csv file.');
            return;
        }

        this.uiManager.log(`⬆️ Uploading CSV file: ${file.name}...`);
        this.showUploadStatus();

        try {
            const formData = new FormData();
            formData.append('csvFile', file);
            const response = await window.backendAPI.uploadCsv(formData);

            if (response.success) {
                this.uiManager.log(`✅ CSV uploaded successfully: ${response.message}`);
            } else {
                this.uiManager.log(`❌ CSV upload failed: ${response.message || 'Unknown error'}`);
            }
        } catch (error) {
            this.uiManager.log(`❌ Error during CSV upload: ${error.message}`);
            console.error('CSV upload error:', error);
        } finally {
            this.hideUploadStatus();
            fileInput.value = '';
        }
    }

    async processCSV(file) {
        this.uiManager.log('📊 Processing CSV file with AI analysis...');
        
        const formData = new FormData();
        formData.append('csvFile', file);
        
        try {
            const response = await this.backendAPI.analyzeCSV(formData);
            if (response.success && response.data) {
                this.uiManager.log('✅ CSV analysis completed successfully');
                // FIX: Log message updated to use 'links' to match the actual data property
                this.uiManager.log(`📈 Generated ${response.data.knowledgeGraph.nodes.length} nodes and ${response.data.knowledgeGraph.links.length} links`);
                
                window.currentAnalysis = response.data;
                
                // Dispatch a single, reliable event for the analysis panel to consume
                document.dispatchEvent(new CustomEvent('analysisComplete', {
                    detail: response.data
                }));
                
                // FIX: Changed 'edges' to 'links' to match the backend response structure.
                // REFACTOR: Removed the redundant 'analysis' property from the return object.
                return {
                    nodes: response.data.knowledgeGraph.nodes,
                    links: response.data.knowledgeGraph.links 
                };
            } else {
                throw new Error(response.message || 'Backend analysis failed');
            }
        } catch (error) {
            this.uiManager.log(`❌ CSV processing error: ${error.message}`);
            throw error;
        }
    }

    async processJSON(file) {
        this.uiManager.log('📋 Processing JSON file...');
        const result = await this.dataProcessor.handleJSONFile(file);
        
        // This correctly converts 'edges' from a generic JSON to 'links' for visualization
        return {
            nodes: result.data.nodes,
            links: result.data.edges
        };
    }

    async processPDFWithBackend(file) {
        this.uiManager.log('📄 Processing PDF file with AI analysis...');
        
        const formData = new FormData();
        formData.append('pdfFile', file);
        
        try {
            const response = await this.backendAPI.analyzePDF(formData);
            if (response.success && response.data) {
                this.uiManager.log('✅ PDF analysis completed successfully');
                // FIX: Log message updated to use 'links' to match the actual data property
                this.uiManager.log(`📈 Generated ${response.data.knowledgeGraph.nodes.length} nodes and ${response.data.knowledgeGraph.links.length} links`);
                
                window.currentAnalysis = response.data;

                // Dispatch a single, reliable event
                document.dispatchEvent(new CustomEvent('analysisComplete', {
                    detail: response.data
                }));
                
                // FIX: Changed 'edges' to 'links' to match the backend response structure.
                // REFACTOR: Removed the redundant 'analysis' property.
                return {
                    nodes: response.data.knowledgeGraph.nodes,
                    links: response.data.knowledgeGraph.links
                };
            } else {
                throw new Error(response.message || 'Backend PDF analysis failed');
            }
        } catch (error) {
            this.uiManager.log(`❌ PDF processing error: ${error.message}`);
            throw error;
        }
    }

    showUploadStatus() {
        const uploadStatus = document.getElementById('uploadStatus');
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        uploadStatus.style.display = 'block';
        fileUploadArea.style.display = 'none';
        
        const progressFill = document.getElementById('progressFill');
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            progressFill.style.width = `${progress}%`;
        }, 200);
        
        this.progressInterval = interval;
    }

    hideUploadStatus() {
        const uploadStatus = document.getElementById('uploadStatus');
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        const progressFill = document.getElementById('progressFill');
        progressFill.style.width = '100%';
        
        setTimeout(() => {
            uploadStatus.style.display = 'none';
            fileUploadArea.style.display = 'block';
            progressFill.style.width = '0%';
        }, 500);
    }

    updateFilters() {
        if (!this.currentData) return; 
        
        const nodeSizeThreshold = parseInt(document.getElementById('nodeSizeThreshold').value);
        const edgeWeightThreshold = parseInt(document.getElementById('edgeWeightThreshold').value);
        const maxNodesDisplay = parseInt(document.getElementById('maxNodesDisplay').value);
        const progressiveLoading = document.getElementById('progressiveLoading').checked;
        
        this.visualization.updateFilters(
            nodeSizeThreshold,
            edgeWeightThreshold,
            maxNodesDisplay,
            progressiveLoading
        );
    }

    handleSearch(query) {
        if (!query.trim()) {
            this.visualization.clearSearch();
            return;
        }
        
        const matchingNodes = this.currentData.nodes.filter(node =>
            node.label.toLowerCase().includes(query.toLowerCase())
        );
        
        this.visualization.highlightSearchResults(matchingNodes, query);
        this.uiManager.log(`🔍 Search results: ${matchingNodes.length} nodes found`);
    }

    async testBackendConnection() {
        if (this._testingConnection) {
            this.uiManager.log('⏳ Connection test already in progress...');
            return;
        }
        
        this._testingConnection = true;
        this.uiManager.log('🔗 Testing backend connection...');
        
        try {
            const result = await this.backendAPI.testConnection();
            
            if (result.success) {
                this.uiManager.log(`✅ Backend connected successfully`);
                this.uiManager.log(`🤖 OpenAI analysis service available`);
                document.getElementById('analyzeBtn').disabled = false;
            } else {
                this.uiManager.log(`❌ Backend connection failed: ${result.message}`);
                document.getElementById('analyzeBtn').disabled = true;
            }
            
        } catch (error) {
            this.uiManager.log(`❌ Connection test error: ${error.message}`);
            document.getElementById('analyzeBtn').disabled = true;
        } finally {
            this._testingConnection = false;
        }
    }

    updateModelList(availableModels) {
        const modelSelect = document.getElementById('ollamaModel');
        const currentValue = modelSelect.value;
        
        modelSelect.innerHTML = '';
        
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
        
        if (availableModels.includes(currentValue)) {
            modelSelect.value = currentValue;
        }
    }

    async performAIAnalysis() {
        if (!this.currentData) {
            this.uiManager.log('❌ No data to analyze.');
            return;
        }
        
        this.uiManager.log('🤖 Starting OpenAI analysis...');
        
        try {
            const analysis = await this.backendAPI.analyzeGraph(this.currentData);
            
            if (analysis.success) {
                this.uiManager.log('✅ AI analysis complete');
                this.uiManager.log(`📊 Analysis results: ${analysis.data.summary}`);
                
                if (analysis.data.clusters) {
                    this.visualization.applyAIClusters(analysis.data.clusters);
                }
            } else {
                this.uiManager.log(`❌ AI analysis failed: ${analysis.message}`);
            }
            
        } catch (error) {
            this.uiManager.log(`❌ AI analysis error: ${error.message}`);
        }
    }

    startPerformanceMonitoring() {
        let lastTime = performance.now();
        let frameCount = 0;
        
        const updatePerformance = () => {
            const currentTime = performance.now();
            frameCount++;
            
            if (currentTime - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                document.getElementById('fpsCounter').textContent = fps;
                
                const renderTime = this.visualization.getLastRenderTime();
                document.getElementById('renderTime').textContent = `${renderTime}ms`;
                
                const visibleNodes = this.visualization.getVisibleNodesCount();
                document.getElementById('visibleNodes').textContent = visibleNodes;
                
                const visibleEdges = this.visualization.getVisibleEdgesCount();
                document.getElementById('visibleEdges').textContent = visibleEdges;
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(updatePerformance);
        };
        
        updatePerformance();
    }

    async loadInitialData() {
        this.uiManager.log('📊 Loading initial data from backend...');
        this.visualization.showLoading('Loading knowledge graph...');

        try {
            const response = await this.backendAPI.getGraph();

            if (response && response.success && response.data.nodes.length > 0) {
                this.currentData = response.data;
                this.visualization.setData(response.data.nodes, response.data.links);
                this.uiManager.log(`✅ Data loaded from ${response.source}: ${response.data.nodes.length} nodes, ${response.data.links.length} links`);
                window.currentGraph = response.data;
            } else {
                this.uiManager.log('⚠️ Backend data not available or empty. Loading sample data.');
                this.loadSampleData(true);
            }
        } catch (error) {
            this.uiManager.log(`❌ Error loading initial data: ${error.message}`);
            this.uiManager.log('💡 Loading sample data as a fallback.');
            this.loadSampleData(true);
        } finally {
            this.visualization.hideLoading();
        }
    }

    loadSampleData(isFallback = false) {
        if (isFallback) {
            this.uiManager.log('...as a fallback.');
        } else {
            this.uiManager.log('📊 Loading sample data...');
        }
        
        const sampleNodes = [
            {id: 'ai', label: 'Artificial Intelligence', size: 50, type: 'concept'},
            {id: 'ml', label: 'Machine Learning', size: 45, type: 'concept'},
            {id: 'dl', label: 'Deep Learning', size: 40, type: 'concept'},
            {id: 'nlp', label: 'Natural Language Processing', size: 35, type: 'concept'},
            {id: 'cv', label: 'Computer Vision', size: 35, type: 'concept'},
            {id: 'nn', label: 'Neural Networks', size: 30, type: 'concept'},
            {id: 'cnn', label: 'CNN', size: 25, type: 'concept'},
            {id: 'rnn', label: 'RNN', size: 25, type: 'concept'},
            {id: 'transformer', label: 'Transformer', size: 30, type: 'concept'},
            {id: 'bert', label: 'BERT', size: 20, type: 'concept'}
        ];

        const sampleLinks = [
            {source: 'ai', target: 'ml', weight: 8},
            {source: 'ml', target: 'dl', weight: 7},
            {source: 'dl', target: 'nn', weight: 6},
            {source: 'dl', target: 'nlp', weight: 5},
            {source: 'dl', target: 'cv', weight: 5},
            {source: 'nn', target: 'cnn', weight: 4},
            {source: 'nn', target: 'rnn', weight: 4},
            {source: 'nlp', target: 'transformer', weight: 6},
            {source: 'nlp', target: 'bert', weight: 5},
            {source: 'transformer', target: 'bert', weight: 4}
        ];

        this.currentData = {
            nodes: sampleNodes,
            links: sampleLinks
        };

        this.visualization.setData(sampleNodes, sampleLinks);
        this.uiManager.log(`✅ Sample data loaded successfully: ${sampleNodes.length} nodes, ${sampleLinks.length} links`);
        
        // Hide loading overlay after sample data is loaded
        this.visualization.hideLoading();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Global functions
window.clearConsole = function() {
    const consoleContent = document.getElementById('consoleContent');
    consoleContent.innerHTML = '<div class="console-message">Console cleared.</div>';
};

window.hideNodeDetails = function() {
    const panel = document.getElementById('nodeDetailsPanel');
    panel.style.display = 'none';
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - main.js executed');
    try {
        window.app = new KnowledgeGraphApp();
        console.log('KnowledgeGraphApp initialized successfully');
    } catch (error) {
        console.error('KnowledgeGraphApp initialization failed:', error);
    }
});

// Global functions
window.clearConsole = function() {
    const consoleContent = document.getElementById('consoleContent');
    if (consoleContent) {
        consoleContent.innerHTML = '<div class="console-message">Console cleared.</div>';
    }
};

window.hideNodeDetails = function() {
    const panel = document.getElementById('nodeDetailsPanel');
    if (panel) {
        panel.style.display = 'none';
    }
};

// AI Workspace related functions
window.toggleAIPanel = function() {
    const workspace = document.getElementById('aiWorkspace');
    if (workspace.style.display === 'none' || workspace.style.display === '') {
        workspace.style.display = 'flex';
    } else {
        workspace.style.display = 'none';
    }
};

window.switchAITab = function(tabName) {
    // Deactivate all tabs
    document.querySelectorAll('.ai-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.ai-tab-content').forEach(content => content.classList.remove('active'));
    
    // Activate selected tab
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
};

window.analyzeGraphStructure = function() {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '<div>🔍 Analyzing graph structure...</div>';
    
    if (window.app && window.app.currentData) {
        const nodes = window.app.currentData.nodes;
        const links = window.app.currentData.links;
        
        const analysis = {
            nodeCount: nodes.length,
            edgeCount: links.length,
            avgDegree: (links.length * 2) / nodes.length,
            density: (links.length * 2) / (nodes.length * (nodes.length - 1))
        };
        
        resultsDiv.innerHTML = `
            <h5>📊 Structure Analysis Results</h5>
            <p><strong>Number of nodes:</strong> ${analysis.nodeCount}</p>
            <p><strong>Number of edges:</strong> ${analysis.edgeCount}</p>
            <p><strong>Average degree:</strong> ${analysis.avgDegree.toFixed(2)}</p>
            <p><strong>Network density:</strong> ${(analysis.density * 100).toFixed(2)}%</p>
        `;
    }
};

window.findCommunities = async function() {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '<div>🎯 Detecting communities...</div>';
    
    try {
        const response = await fetch('http://localhost:3014/api/arango/analyze-metadata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.analysis && data.analysis.clusters) {
                let html = '<h5>🎯 AI Community Detection Results</h5>';
                
                Object.entries(data.analysis.clusters).forEach(([clusterId, cluster]) => {
                    html += `
                        <div style="margin-bottom: 1rem; padding: 0.5rem; border-left: 3px solid ${cluster.color || '#667eea'}; background: rgba(102, 126, 234, 0.1);">
                            <h6>${cluster.name}</h6>
                            <p style="font-size: 0.9em; color: #666;">${cluster.insight}</p>
                            <p><strong>Nodes (${cluster.nodes.length}):</strong> ${cluster.nodes.map(n => n.label).join(', ')}</p>
                        </div>
                    `;
                });
                
                html += `<p style="margin-top: 1rem; font-size: 0.8em; color: #666;">✨ Powered by Ollama AI</p>`;
                resultsDiv.innerHTML = html;
            } else {
                resultsDiv.innerHTML = `
                    <h5>🎯 Community Detection Results</h5>
                    <p>❌ No clustering data available. Please ensure CSV data is uploaded to ArangoDB.</p>
                `;
            }
        } else {
            throw new Error(`Backend error: ${response.status}`);
        }
    } catch (error) {
        console.error('Community detection error:', error);
        resultsDiv.innerHTML = `
            <h5>🎯 Community Detection Results</h5>
            <p>❌ Failed to connect to AI service: ${error.message}</p>
            <p>Please ensure the backend server is running on port 3010.</p>
        `;
    }
};

window.identifyKeyNodes = function() {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '<div>⭐ Identifying key nodes...</div>';
    
    if (window.app && window.app.currentData) {
        const nodes = window.app.currentData.nodes;
        const sortedNodes = nodes.sort((a, b) => b.size - a.size).slice(0, 5);
        
        let html = '<h5>⭐ Key Nodes (by size)</h5>';
        sortedNodes.forEach((node, index) => {
            html += `<p>${index + 1}. <strong>${node.label}</strong> (Size: ${node.size})</p>`;
        });
        
        resultsDiv.innerHTML = html;
    }
};

window.extractKeywords = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>🏷️ Extracting keywords...</div>';
    
    setTimeout(() => {
        resultsDiv.innerHTML = `
            <h5>🏷️ Extracted Keywords</h5>
            <p>This feature will be implemented in conjunction with the AI service.</p>
        `;
    }, 1000);
};

window.suggestConnections = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>🔗 Generating connection suggestions...</div>';
    
    setTimeout(() => {
        resultsDiv.innerHTML = `
            <h5>🔗 Connection Suggestions</h5>
            <p>Additional connection points suggested by the AI will be displayed here.</p>
        `;
    }, 1000);
};

window.categorizeNodes = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>📂 Categorizing nodes...</div>';
    
    if (window.app && window.app.currentData) {
        const nodes = window.app.currentData.nodes;
        const categories = {};
        
        nodes.forEach(node => {
            const type = node.type || 'unknown';
            if (!categories[type]) categories[type] = [];
            categories[type].push(node.label);
        });
        
        let html = '<h5>📂 Node Categorization Results</h5>';
        Object.entries(categories).forEach(([type, nodeList]) => {
            html += `<p><strong>${type}:</strong> ${nodeList.length} items</p>`;
        });
        
        resultsDiv.innerHTML = html;
    }
};

window.sendChatMessage = async function() {
    const input = document.getElementById('chatInput');
    const history = document.getElementById('chatHistory');
    const message = input.value.trim();
    
    if (!message) return;
    
    input.value = '';
    
    const userMsg = document.createElement('div');
    userMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #667eea; color: white; border-radius: 8px; text-align: right;';
    userMsg.textContent = message;
    history.appendChild(userMsg);
    
    const loadingMsg = document.createElement('div');
    loadingMsg.id = 'loading-indicator';
    loadingMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #f1f2f6; border-radius: 8px; font-style: italic; color: #666;';
    loadingMsg.textContent = '🤖 AI is thinking...';
    history.appendChild(loadingMsg);
    history.scrollTop = history.scrollHeight;
    
    try {
        const response = await fetch('http://localhost:3014/api/arango/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        
        const result = await response.json();
        
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();
        
        const aiMsg = document.createElement('div');
        aiMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #f1f2f6; border-radius: 8px; line-height: 1.4;';
        
        if (result.success && result.response) {
            aiMsg.innerHTML = `<strong>🤖 AI:</strong> ${result.response.replace(/\n/g, '<br>')}`;
        } else {
            aiMsg.innerHTML = `<strong>❌ Error:</strong> ${result.error || 'Failed to get AI response'}`;
        }
        history.appendChild(aiMsg);
        
    } catch (error) {
        console.error('Chat error:', error);
        
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();
        
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #ffe6e6; border-radius: 8px; color: #d63031;';
        errorMsg.innerHTML = `<strong>❌ Connection Error:</strong> Unable to reach AI service. Please ensure the backend server is running.`;
        history.appendChild(errorMsg);
    }
    
    history.scrollTop = history.scrollHeight;
};