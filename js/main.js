class KnowledgeGraphApp {
    constructor() {
        this.dataProcessor = new DataProcessor();
        this.plantConnectomeLoader = new PlantConnectomeLoader();
        this.visualization = new GraphVisualization();
        this.uiManager = new UIManager();
        this.backendAPI = new BackendAPI();
        
        this.currentData = null;
        this.isProcessing = false;
        this.searchRequestSeq = 0;
        this.searchDebounceTimer = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.prioritizeSearchAndFilterUI();
        this.visualization.init(document.getElementById('visualizationContainer'));
        this.uiManager.init();
        
        // Set initial state
        this.uiManager.updateStatus('System is ready.');
        this.uiManager.log('Advanced Knowledge Graph System initialized successfully');
        
        // Check LLM status
        this.checkOpenAIStatus();

        // Load initial data (this will handle showing/hiding loading overlay)
        this.loadInitialData();
    }

    async checkOpenAIStatus() {
        try {
            const response = await this.backendAPI.request('/analysis/llm-health', {
                method: 'GET',
                maxRetries: 1,
                timeout: 15000
            });
            const data = response?.data || response || {};
            if (data.connected) {
                this.uiManager.log(`LLM connected: ${data.provider || 'unknown'} / ${data.model || 'unknown'}`);
            } else {
                this.uiManager.log('LLM is not configured. Analysis features may be limited.');
            }
        } catch (error) {
            this.uiManager.log(`Could not verify LLM status: ${error.message}`);
        }
    }
    setupEventListeners() {
        // File upload event
        const fileInput = document.getElementById('fileInput');
        const fileUploadArea = document.getElementById('fileUploadArea');
        const selectFileBtn = document.getElementById('selectFileBtn');
        const maxNodesDisplay = document.getElementById('maxNodesDisplay');
        const maxNodesValue = document.getElementById('maxNodesValue');

        if (maxNodesDisplay) {
            maxNodesDisplay.max = '500';
            if (Number(maxNodesDisplay.value) > 500) {
                maxNodesDisplay.value = '500';
            }
        }
        if (maxNodesValue && maxNodesDisplay) {
            maxNodesValue.textContent = maxNodesDisplay.value;
        }

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
            clearTimeout(this.searchDebounceTimer);
            const value = e.target.value;
            this.searchDebounceTimer = setTimeout(() => {
                this.handleSearch(value);
            }, 250);
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

    prioritizeSearchAndFilterUI() {
        const leftPanel = document.querySelector('.left-panel');
        if (!leftPanel) return;

        const sections = Array.from(leftPanel.querySelectorAll('.control-section'));
        const searchSection = sections.find(section => section.querySelector('#searchInput'));
        const filterSection = sections.find(section => section.querySelector('#nodeSizeThreshold'));
        const uploadSection = sections.find(section => section.querySelector('#fileUploadArea'));
        const performanceSection = sections.find(section => section.querySelector('#fpsCounter'));

        if (searchSection) {
            leftPanel.prepend(searchSection);
            const existingHint = searchSection.querySelector('.section-hint');
            if (!existingHint) {
                const searchBox = searchSection.querySelector('.search-box');
                if (searchBox) {
                    const hint = document.createElement('p');
                    hint.className = 'section-hint';
                    hint.textContent = 'Search labels, aliases, PubMed IDs, species, and relationship text.';
                    searchSection.insertBefore(hint, searchBox);
                }
            }
            const searchInput = searchSection.querySelector('#searchInput');
            if (searchInput) {
                searchInput.placeholder = 'Search source, target, PMID, alias...';
            }
        }

        if (filterSection && uploadSection) {
            leftPanel.insertBefore(filterSection, uploadSection);
        }

        if (uploadSection) {
            const hint = uploadSection.querySelector('.section-hint');
            if (hint) {
                hint.textContent = 'PlantConnectome final-list CSV and normalized JSON are supported.';
            } else {
                const uploadArea = uploadSection.querySelector('#fileUploadArea');
                if (uploadArea) {
                    const newHint = document.createElement('p');
                    newHint.className = 'section-hint';
                    newHint.textContent = 'PlantConnectome final-list CSV and normalized JSON are supported.';
                    uploadSection.insertBefore(newHint, uploadArea);
                }
            }
        }

        if (performanceSection) {
            leftPanel.appendChild(performanceSection);
        }
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        this.uiManager.log(`File upload: ${file.name} (${this.formatFileSize(file.size)})`);

        // Check file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            const isPlantConnectome = /plantconnectome/i.test(file.name);
            if (isPlantConnectome) {
                this.uiManager.log(`PlantConnectome CSV is too large for direct browser upload: ${this.formatFileSize(file.size)}`);
                this.uiManager.log('Convert it first with `node scripts/convert-plantconnectome-csv.js <input.csv> <output.json> 20000` and upload the JSON instead.');
            } else {
                this.uiManager.log(`File too large: ${this.formatFileSize(file.size)} (max: 50MB)`);
            }
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
                    this.uiManager.log(`Upload attempt ${retryCount} failed, retrying... (${error.message})`);
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                }
            }

            if (data) {
                this.currentData = data;
                // setData() will handle loading overlay internally
                this.visualization.setData(data.nodes, data.links);
                this.uiManager.log(`Data loaded successfully: ${data.nodes.length} nodes, ${data.links.length} links`);

                this.updateFilters();
                window.currentGraph = data;
            }

        } catch (error) {
            this.uiManager.log(`File processing error: ${error.message}`);
            if (error.message.includes('Failed to fetch')) {
                this.uiManager.log('Tip: Check whether the backend server is running on port 3015.');
            } else if (error.message.includes('OpenAI API key')) {
                this.uiManager.log('Tip: Check whether the API key is configured in backend/.env.');
            } else if (error.message.includes('timed out')) {
                this.uiManager.log('Tip: File processing timed out. Try a smaller file.');
            }
        } finally {
            this.hideUploadStatus();
        }
    }

    async processCSV(file) {
        this.uiManager.log('Processing CSV file with AI analysis...');
        
        const formData = new FormData();
        formData.append('csvFile', file);
        
        try {
            const response = await this.backendAPI.analyzeCSV(formData);
            if (response.success && response.data) {
                this.uiManager.log('CSV analysis completed successfully');
                // FIX: Log message updated to use 'links' to match the actual data property
                this.uiManager.log(`Generated ${response.data.knowledgeGraph.nodes.length} nodes and ${response.data.knowledgeGraph.links.length} links`);
                
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
            this.uiManager.log(`CSV processing error: ${error.message}`);
            throw error;
        }
    }

    async processJSON(file) {
        this.uiManager.log('Processing JSON file...');
        const result = await this.dataProcessor.handleJSONFile(file);
        
        // This correctly converts 'edges' from a generic JSON to 'links' for visualization
        const processedData = {
            nodes: result.data.nodes,
            links: result.data.edges
        };

        // Create analysis data for PEO panel compatibility
        const analysisData = {
            knowledgeGraph: processedData,
            peoAnalysis: null,
            networkMetrics: null,
            timestamp: new Date().toISOString(),
            type: 'json_upload'
        };

        // Store for global access
        window.currentAnalysis = analysisData;

        // Dispatch event for analysis panel
        document.dispatchEvent(new CustomEvent('analysisComplete', {
            detail: analysisData
        }));

        return processedData;
    }

    async processPDFWithBackend(file) {
        this.uiManager.log('Processing PDF file with AI analysis...');
        
        const formData = new FormData();
        formData.append('pdfFile', file);
        
        try {
            const response = await this.backendAPI.analyzePDF(formData);
            if (response.success && response.data) {
                this.uiManager.log('PDF analysis completed successfully');
                // FIX: Log message updated to use 'links' to match the actual data property
                this.uiManager.log(`Generated ${response.data.knowledgeGraph.nodes.length} nodes and ${response.data.knowledgeGraph.links.length} links`);
                this.applyPdfGraphDefaults(response.data);
                
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
            this.uiManager.log(`PDF processing error: ${error.message}`);
            throw error;
        }
    }

    applyPdfGraphDefaults(analysisData) {
        const isPdfExpansion = String(
            analysisData?.provenance?.mode ||
            analysisData?.knowledgeGraph?.metadata?.provenance?.mode ||
            analysisData?.metadata?.provenance?.mode ||
            ''
        ).toLowerCase().includes('pdf');

        if (!isPdfExpansion) {
            return;
        }

        const nodeSizeThreshold = document.getElementById('nodeSizeThreshold');
        const edgeWeightThreshold = document.getElementById('edgeWeightThreshold');
        const progressiveLoading = document.getElementById('progressiveLoading');
        const nodeSizeValue = document.getElementById('nodeSizeValue');
        const edgeWeightValue = document.getElementById('edgeWeightValue');

        if (nodeSizeThreshold && Number(nodeSizeThreshold.value) > 0) {
            nodeSizeThreshold.value = '0';
            if (nodeSizeValue) {
                nodeSizeValue.textContent = '0';
            }
        }

        if (edgeWeightThreshold && Number(edgeWeightThreshold.value) > 1) {
            edgeWeightThreshold.value = '1';
            if (edgeWeightValue) {
                edgeWeightValue.textContent = '1';
            }
        }

        if (progressiveLoading && !progressiveLoading.checked) {
            progressiveLoading.checked = true;
        }

        this.uiManager.log('PDF graph defaults applied: node threshold=0, edge threshold=1');
    }

    async processCSV(file) {
        if (await this.plantConnectomeLoader.canLoad(file)) {
            return await this.processPlantConnectomeCSV(file);
        }

        this.uiManager.log('Processing CSV file with AI analysis...');

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await this.backendAPI.analyzeCSV(formData);
            if (response.success && response.data) {
                this.uiManager.log('CSV analysis completed successfully');
                this.uiManager.log(`Generated ${response.data.knowledgeGraph.nodes.length} nodes and ${response.data.knowledgeGraph.links.length} links`);

                window.currentAnalysis = response.data;

                document.dispatchEvent(new CustomEvent('analysisComplete', {
                    detail: response.data
                }));

                return {
                    nodes: response.data.knowledgeGraph.nodes,
                    links: response.data.knowledgeGraph.links
                };
            }

            throw new Error(response.message || 'Backend analysis failed');
        } catch (error) {
            this.uiManager.log(`CSV processing error: ${error.message}`);
            throw error;
        }
    }

    async processPlantConnectomeCSV(file) {
        this.uiManager.log('PlantConnectome final list detected. Loading directly...');

        try {
            const graphData = await this.plantConnectomeLoader.load(file);
            const processedData = {
                nodes: graphData.nodes,
                links: graphData.links
            };

            const analysisData = {
                knowledgeGraph: processedData,
                plantConnectomeMetadata: graphData.metadata,
                peoAnalysis: null,
                networkMetrics: null,
                timestamp: new Date().toISOString(),
                type: 'plantconnectome_upload'
            };

            window.currentAnalysis = analysisData;

            document.dispatchEvent(new CustomEvent('analysisComplete', {
                detail: analysisData
            }));

            this.uiManager.log(`PlantConnectome graph ready: ${processedData.nodes.length} nodes, ${processedData.links.length} links`);
            return processedData;
        } catch (error) {
            this.uiManager.log(`PlantConnectome CSV processing error: ${error.message}`);
            throw error;
        }
    }

    async performSearch(query) {
        const trimmedQuery = String(query || '').trim();
        if (!trimmedQuery) {
            this.visualization.clearSearch();
            this.clearSearchResults();
            return;
        }

        const requestSeq = ++this.searchRequestSeq;

        const normalizedQuery = trimmedQuery.toLowerCase();
        const backendGraphScope = {};
        if (this.currentData && this.currentData.graphId && this.currentData.graphSource && this.currentData.graphSource !== 'sample') {
            backendGraphScope.graphId = this.currentData.graphId;
            backendGraphScope.graphSource = this.currentData.graphSource;
        }

        try {
            const response = await this.backendAPI.searchNodes(trimmedQuery, {
                limit: 25,
                ...backendGraphScope
            });

            if (requestSeq !== this.searchRequestSeq) {
                return;
            }

            const payload = response?.data || {};
            const rawResults = Array.isArray(payload.nodes)
                ? payload.nodes
                : Array.isArray(payload.results)
                    ? payload.results
                    : Array.isArray(payload)
                        ? payload
                        : [];

            const backendResults = rawResults
                .map((entry, index) => {
                    const node = entry?.node || entry;
                    if (!node || (!node.label && !node.id)) {
                        return null;
                    }
                    const score = Number.isFinite(entry?.score)
                        ? entry.score
                        : Number.isFinite(node.score)
                            ? node.score
                            : this.scoreSearchMatch(node, normalizedQuery) || Math.max(1, 100 - index);
                    return { node, score };
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score || String(a.node.label || '').localeCompare(String(b.node.label || '')));

            if (!backendResults.length) {
                this.visualization.clearSearch();
                this.clearSearchResults();
                this.uiManager.log('Search returned 0 nodes from backend.');
                return;
            }

            const matchingNodes = backendResults.map(entry => entry.node);
            this.visualization.highlightSearchResults(matchingNodes.slice(0, 25), trimmedQuery);
            this.renderSearchResults(backendResults.slice(0, 10), trimmedQuery);
            this.uiManager.log(`Search results found: ${backendResults.length} nodes from backend.`);

            const topNode = backendResults[0]?.node;
            if (topNode) {
                await this.loadSubgraphForNode(topNode, 2, requestSeq);
            }
            return;
        } catch (error) {
            console.warn('Backend search failed, falling back to current graph search:', error);
        }

        if (!this.currentData || !Array.isArray(this.currentData.nodes)) {
            this.visualization.clearSearch();
            this.clearSearchResults();
            return;
        }

        const scoredNodes = this.currentData.nodes
            .map(node => ({
                node,
                score: this.scoreSearchMatch(node, normalizedQuery)
            }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score || String(a.node.label || '').localeCompare(String(b.node.label || '')));

        if (!scoredNodes.length) {
            this.visualization.clearSearch();
            this.clearSearchResults();
            this.uiManager.log('Search returned 0 nodes from current graph.');
            return;
        }

        const matchingNodes = scoredNodes.map(entry => entry.node);
        this.visualization.highlightSearchResults(matchingNodes.slice(0, 25), trimmedQuery);
        this.renderSearchResults(scoredNodes.slice(0, 10), trimmedQuery);
        this.uiManager.log(`Search results found: ${scoredNodes.length} nodes from current graph.`);
    }

    async loadSubgraphForNode(node, depth = 2, requestSeq = null) {
        if (!node) return;

        const nodeId = node.id || node._id || node.elementId;
        if (!nodeId) {
            this.uiManager.log('Subgraph load skipped: missing node id.');
            return;
        }

        try {
            const options = {};
            const graphId = node.graphId || node.graph_id;
            const graphSource = node.graphSource || node.graph_source;

            if (graphId) options.graphId = graphId;
            if (graphSource) options.graphSource = graphSource;

            const response = await this.backendAPI.getSubgraph(String(nodeId), depth, options);

            if (requestSeq !== null && requestSeq !== this.searchRequestSeq) {
                return;
            }

            const payload = response?.data || {};
            const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
            const links = Array.isArray(payload.links)
                ? payload.links
                : Array.isArray(payload.edges)
                    ? payload.edges
                    : [];

            if (!nodes.length) {
                this.uiManager.log(`Subgraph load returned no nodes for ${node.label || nodeId}.`);
                return;
            }

            const graphData = { nodes, links };
            this.currentData = graphData;
            window.currentGraph = graphData;
            this.visualization.setData(nodes, links);
            this.updateFilters();
            this.uiManager.log(`Subgraph loaded: ${nodes.length} nodes, ${links.length} links`);
        } catch (error) {
            this.uiManager.log(`Subgraph load failed: ${error.message}`);
        }
    }

    buildSearchIndex(node) {
        const values = [];
        const pushValue = (value) => {
            if (value === null || value === undefined) return;
            if (Array.isArray(value)) {
                value.forEach(pushValue);
                return;
            }
            if (typeof value === 'object') {
                Object.values(value).forEach(pushValue);
                return;
            }
            const normalized = String(value).trim().toLowerCase();
            if (normalized) {
                values.push(normalized);
            }
        };

        pushValue(node.label);
        pushValue(node.id);
        pushValue(node.type);
        pushValue(node.attributes);
        pushValue(node.metadata);
        return values.join(' ');
    }

    scoreSearchMatch(node, query) {
        const searchText = this.buildSearchIndex(node);
        if (!searchText) return 0;

        const label = String(node.label || '').toLowerCase();
        const id = String(node.id || '').toLowerCase();
        const type = String(node.type || '').toLowerCase();

        let score = 0;
        if (label === query) score += 120;
        if (id === query) score += 110;
        if (label.startsWith(query)) score += 70;
        if (id.startsWith(query)) score += 60;
        if (type === query) score += 55;
        if (label.includes(query)) score += 35;
        if (id.includes(query)) score += 30;
        if (type.includes(query)) score += 25;
        if (searchText.includes(query)) score += 20;

        return score;
    }

    renderSearchResults(results, query) {
        const container = document.getElementById('searchResults');
        if (!container) return;

        if (!results.length) {
            container.innerHTML = `<div class="search-empty">No matches for "${query}"</div>`;
            return;
        }

        container.innerHTML = '';
        results.forEach(({ node, score }) => {
            const paper = this.getSearchResultPaperInfo(node);
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.setAttribute('role', 'button');
            item.tabIndex = 0;

            const title = document.createElement('span');
            title.className = 'search-result-title';
            title.textContent = node.label || paper.title || 'Unnamed entity';
            item.appendChild(title);

            const meta = document.createElement('span');
            meta.className = 'search-result-meta';
            const metaParts = [
                this.visualization.formatNodeType(node.type) || node.type || 'Entity',
                `Score ${Number.isFinite(score) ? score : 0}`
            ];
            if (paper.journal) {
                metaParts.push(paper.journal);
            }
            if (paper.year) {
                metaParts.push(paper.year);
            }
        meta.textContent = metaParts.filter(Boolean).join(' | ');
            item.appendChild(meta);

            const linkRow = document.createElement('div');
            linkRow.className = 'search-result-links';

            if (paper.pmid) {
                const pubmedLink = document.createElement('a');
                pubmedLink.className = 'search-result-link';
                pubmedLink.href = `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(String(paper.pmid).trim())}/`;
                pubmedLink.target = '_blank';
                pubmedLink.rel = 'noopener noreferrer';
                pubmedLink.textContent = `PubMed ${paper.pmid}`;
                pubmedLink.addEventListener('click', (event) => event.stopPropagation());
                linkRow.appendChild(pubmedLink);
            }

            if (paper.doi) {
                const doiLink = document.createElement('a');
                doiLink.className = 'search-result-link';
                doiLink.href = /^https?:\/\//i.test(paper.doi)
                    ? paper.doi
                    : `https://doi.org/${encodeURI(String(paper.doi).trim())}`;
                doiLink.target = '_blank';
                doiLink.rel = 'noopener noreferrer';
                doiLink.textContent = 'Open DOI';
                doiLink.addEventListener('click', (event) => event.stopPropagation());
                linkRow.appendChild(doiLink);
            }

            if (linkRow.childElementCount > 0) {
                item.appendChild(linkRow);
            }

            item.addEventListener('click', () => {
                this.visualization.showNodeDetails(node);
                this.visualization.highlightSearchResults([node], query);
                this.loadSubgraphForNode(node, 2);
            });
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.visualization.showNodeDetails(node);
                    this.visualization.highlightSearchResults([node], query);
                    this.loadSubgraphForNode(node, 2);
                }
            });
            container.appendChild(item);
        });
    }

    inferDoiFromFilename(filename) {
        const raw = String(filename || '').trim();
        if (!raw) return '';

        const withoutExt = raw.replace(/\.[^.]+$/, '');
        const directMatch = withoutExt.match(/(10\.\d{4,9})[_/](.+)$/i);
        if (directMatch) {
            const prefix = directMatch[1];
            const suffix = directMatch[2].replace(/_/g, '/').replace(/^\/+/, '');
            return `${prefix}/${suffix}`.replace(/\s+/g, '');
        }

        const embeddedMatch = withoutExt.match(/(?:^|[_\/])(10\.\d{4,9}[_/].+)$/i);
        if (embeddedMatch) {
            return embeddedMatch[1].replace(/_/g, '/').replace(/\s+/g, '');
        }

        return '';
    }

    getSearchResultPaperInfo(node) {
        const attrs = node && typeof node.attributes === 'object' ? node.attributes : {};
        const source = { ...attrs, ...node };
        const filenameDoi = this.inferDoiFromFilename(
            source.fname ||
            source.filename ||
            source.file_name ||
            source.source_file ||
            source.pdf
        );

        const firstValue = (...values) => {
            for (const value of values) {
                if (value === undefined || value === null) {
                    continue;
                }

                if (Array.isArray(value)) {
                    const joined = value.map(item => String(item || '').trim()).filter(Boolean).join(', ');
                    if (joined) return joined;
                    continue;
                }

                if (typeof value === 'object') {
                    const nested = firstValue(
                        value.title,
                        value.name,
                        value.label,
                        value.text,
                        value.journal,
                        value.year,
                        value.pmid,
                        value.doi
                    );
                    if (nested) return nested;
                    continue;
                }

                const text = String(value).trim();
                if (text) return text;
            }
            return '';
        };

        return {
            title: firstValue(source.paper_title, source.title, source.document_title, source.name, node.label),
            journal: firstValue(source.journal, source.journal_name, source.source_journal),
            year: firstValue(source.pub_year, source.year, source.publication_year, source.published_year),
            pmid: firstValue(source.pmid, source.pubmed_id, source.pubmedId, source.pubmed_ids),
            doi: firstValue(source.doi, source.DOI, source.doi_url, source.doiUrl, source.paper_doi, source.article_doi, source.external_doi, source.url, source.link, source.external_link, filenameDoi)
        };
    }

    clearSearchResults() {
        const container = document.getElementById('searchResults');
        if (container) {
            container.innerHTML = '';
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
        const maxNodesDisplay = Math.min(500, Math.max(1, parseInt(document.getElementById('maxNodesDisplay').value, 10) || 500));
        const progressiveLoading = document.getElementById('progressiveLoading').checked;

        const maxNodesDisplayInput = document.getElementById('maxNodesDisplay');
        const maxNodesValue = document.getElementById('maxNodesValue');
        if (maxNodesDisplayInput && Number(maxNodesDisplayInput.value) !== maxNodesDisplay) {
            maxNodesDisplayInput.value = String(maxNodesDisplay);
        }
        if (maxNodesValue) {
            maxNodesValue.textContent = String(maxNodesDisplay);
        }
        
        this.visualization.updateFilters(
            nodeSizeThreshold,
            edgeWeightThreshold,
            maxNodesDisplay,
            progressiveLoading
        );
    }

    handleSearch(query) {
        return this.performSearch(query);
    }

    async testBackendConnection() {
        if (this._testingConnection) {
            this.uiManager.log('Connection test already in progress...');
            return;
        }
        
        this._testingConnection = true;
        this.uiManager.log('Testing backend connection...');
        
        try {
            const result = await this.backendAPI.testConnection();
            
            if (result.success) {
                this.uiManager.log(`Backend connected successfully`);
                this.uiManager.log(`OpenAI analysis service available`);
                document.getElementById('analyzeBtn').disabled = false;
            } else {
                this.uiManager.log(`Backend connection failed: ${result.message}`);
                document.getElementById('analyzeBtn').disabled = true;
            }
            
        } catch (error) {
            this.uiManager.log(`Connection test error: ${error.message}`);
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
            this.uiManager.log('No data available for AI analysis.');
            return;
        }
        
        this.uiManager.log('Starting OpenAI analysis...');
        
        try {
            const analysis = await this.backendAPI.analyzeGraph(this.currentData);
            
            if (analysis.success) {
                this.uiManager.log('AI analysis complete');
                this.uiManager.log(`Analysis results: ${analysis.data.summary}`);
                
                if (analysis.data.clusters) {
                    this.visualization.applyAIClusters(analysis.data.clusters);
                }
            } else {
                this.uiManager.log(`AI analysis failed: ${analysis.message}`);
            }
            
        } catch (error) {
            this.uiManager.log(`AI analysis error: ${error.message}`);
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
        this.uiManager.log('Loading initial data from backend...');
        this.visualization.showLoading('Loading knowledge graph...');

        try {
            const response = await this.backendAPI.getGraph();

            if (response && response.success && response.data.nodes.length > 0) {
                this.currentData = response.data;
                this.visualization.setData(response.data.nodes, response.data.links);
                this.uiManager.log(`Data loaded from ${response.source}: ${response.data.nodes.length} nodes, ${response.data.links.length} links`);
                window.currentGraph = response.data;
            } else {
                this.uiManager.log('Backend data not available or empty. Loading sample data.');
                this.loadSampleData(true);
            }
        } catch (error) {
            this.uiManager.log(`Error loading initial data: ${error.message}`);
            this.uiManager.log('Loading sample data as a fallback.');
            this.loadSampleData(true);
        } finally {
            this.visualization.hideLoading();
        }
    }

    loadSampleData(isFallback = false) {
        if (isFallback) {
            this.uiManager.log('...as a fallback.');
        } else {
            this.uiManager.log('Loading sample data...');
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
            {source: 'ai', target: 'ml', weight: 8, label: 'includes'},
            {source: 'ml', target: 'dl', weight: 7, label: 'includes'},
            {source: 'dl', target: 'nn', weight: 6, label: 'uses'},
            {source: 'dl', target: 'nlp', weight: 5, label: 'applies_to'},
            {source: 'dl', target: 'cv', weight: 5, label: 'applies_to'},
            {source: 'nn', target: 'cnn', weight: 4, label: 'includes'},
            {source: 'nn', target: 'rnn', weight: 4, label: 'includes'},
            {source: 'nlp', target: 'transformer', weight: 6, label: 'uses'},
            {source: 'nlp', target: 'bert', weight: 5, label: 'uses'},
            {source: 'transformer', target: 'bert', weight: 4, label: 'influences'}
        ];

        this.currentData = {
            nodes: sampleNodes,
            links: sampleLinks
        };

        // setData() will handle loading overlay internally
        this.visualization.setData(sampleNodes, sampleLinks);
        this.uiManager.log(`Sample data loaded successfully: ${sampleNodes.length} nodes, ${sampleLinks.length} links`);
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
// Initialize application - prevent duplicate initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - main.js executed');
    if (!window.app) {
        try {
            window.app = new KnowledgeGraphApp();
            console.log('KnowledgeGraphApp initialized successfully');
        } catch (error) {
            console.error('KnowledgeGraphApp initialization failed:', error);
        }
    } else {
        console.log('KnowledgeGraphApp already initialized, skipping');
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
    resultsDiv.innerHTML = '<div>Analyzing graph structure...</div>';
    
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
            <h5>Structure Analysis Results</h5>
            <p><strong>Number of nodes:</strong> ${analysis.nodeCount}</p>
            <p><strong>Number of edges:</strong> ${analysis.edgeCount}</p>
            <p><strong>Average degree:</strong> ${analysis.avgDegree.toFixed(2)}</p>
            <p><strong>Network density:</strong> ${(analysis.density * 100).toFixed(2)}%</p>
        `;
    }
};

window.findCommunities = async function() {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '<div>Detecting communities...</div>';
    
    try {
        const graph = window.app?.currentData || { nodes: [], links: [] };
        const data = await window.backendAPI.request('/analysis/metadata', {
            method: 'POST',
            body: { nodes: graph.nodes || [], links: graph.links || [] }
        });

        if (data.success) {
            const clusters = data.analysis?.clusters;
            const insights = data.analysis?.critical_insights || [];
            if (clusters) {
                let html = '<h5>AI Community Detection Results</h5>';
                
                Object.entries(clusters).forEach(([_clusterId, cluster]) => {
                    html += `
                        <div style="margin-bottom: 1rem; padding: 0.5rem; border-left: 3px solid ${cluster.color || '#667eea'}; background: rgba(102, 126, 234, 0.1);">
                            <h6>${cluster.name}</h6>
                            <p style="font-size: 0.9em; color: #666;">${cluster.insight}</p>
                            <p><strong>Nodes (${cluster.nodes.length}):</strong> ${cluster.nodes.map(n => n.label).join(', ')}</p>
                        </div>
                    `;
                });
                
                html += `<p style="margin-top: 1rem; font-size: 0.8em; color: #666;">Powered by the configured analysis provider</p>`;
                resultsDiv.innerHTML = html;
            } else if (insights.length) {
                resultsDiv.innerHTML = `<h5>AI Graph Insights</h5>${insights.map(item => `<div style="margin-bottom: 1rem;"><strong>${item.title || 'Insight'}</strong><p>${item.description || ''}</p></div>`).join('')}`;
            } else {
                resultsDiv.innerHTML = `
                    <h5>Community Detection Results</h5>
                    <p>No clustering data is available for the current graph.</p>
                `;
            }
        }
    } catch (error) {
        console.error('Community detection error:', error);
        resultsDiv.innerHTML = `
            <h5>Community Detection Results</h5>
            <p>Failed to connect to AI service: ${error.message}</p>
            <p>Please ensure the backend server is running on port 3015.</p>
        `;
    }
};

window.identifyKeyNodes = function() {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '<div>Identifying key nodes...</div>';
    
    if (window.app && window.app.currentData) {
        const nodes = window.app.currentData.nodes;
        const sortedNodes = nodes.sort((a, b) => b.size - a.size).slice(0, 5);
        
        let html = '<h5>Key Nodes (by size)</h5>';
        sortedNodes.forEach((node, index) => {
            html += `<p>${index + 1}. <strong>${node.label}</strong> (Size: ${node.size})</p>`;
        });
        
        resultsDiv.innerHTML = html;
    }
};

window.extractKeywords = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>Extracting keywords...</div>';
    
    setTimeout(() => {
        resultsDiv.innerHTML = `
            <h5>Extracted Keywords</h5>
            <p>This feature will be implemented in conjunction with the AI service.</p>
        `;
    }, 1000);
};

window.suggestConnections = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>Generating connection suggestions...</div>';
    
    setTimeout(() => {
        resultsDiv.innerHTML = `
            <h5>Connection Suggestions</h5>
            <p>Additional connection points suggested by the AI will be displayed here.</p>
        `;
    }, 1000);
};

window.categorizeNodes = function() {
    const resultsDiv = document.getElementById('keywordResults');
    resultsDiv.innerHTML = '<div>Categorizing nodes...</div>';
    
    if (window.app && window.app.currentData) {
        const nodes = window.app.currentData.nodes;
        const categories = {};
        
        nodes.forEach(node => {
            const type = node.type || 'unknown';
            if (!categories[type]) categories[type] = [];
            categories[type].push(node.label);
        });
        
        let html = '<h5>Node Categorization Results</h5>';
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
    loadingMsg.textContent = 'AI is thinking...';
    history.appendChild(loadingMsg);
    history.scrollTop = history.scrollHeight;
    
    try {
        const result = await window.backendAPI.request('/analysis/chat', {
            method: 'POST',
            body: {
                message,
                context: window.app?.currentData ? {
                    nodes: window.app.currentData.nodes?.slice(0, 20),
                    links: window.app.currentData.links?.slice(0, 20)
                } : undefined
            }
        });
        
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();
        
        const aiMsg = document.createElement('div');
        aiMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #f1f2f6; border-radius: 8px; line-height: 1.4;';
        
        if (result.success && result.response) {
            aiMsg.innerHTML = `<strong>AI:</strong> ${result.response.replace(/\n/g, '<br>')}`;
        } else {
            aiMsg.innerHTML = `<strong>Error:</strong> ${result.error || 'Failed to get AI response'}`;
        }
        history.appendChild(aiMsg);
        
    } catch (error) {
        console.error('Chat error:', error);
        
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();
        
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'margin-bottom: 1rem; padding: 0.5rem; background: #ffe6e6; border-radius: 8px; color: #d63031;';
        errorMsg.innerHTML = `<strong>??Connection Error:</strong> Unable to reach AI service. Please ensure the backend server is running.`;
        history.appendChild(errorMsg);
    }
    
    history.scrollTop = history.scrollHeight;
};
