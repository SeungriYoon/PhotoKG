/**
 * Analysis Panel Manager
 * Handles display and interaction with analysis results (PEO, network metrics, etc.)
 */

class AnalysisPanel {
    constructor() {
        this.currentAnalysis = null;
        this.init();
    }

    init() {
        this.createAnalysisPanel();
        this.setupEventListeners();
    }

    createAnalysisPanel() {
        // Create popup analysis panels if they don't exist
        this.createPopupPanels();
    }

    createPopupPanels() {
        // Create PEO Analysis Popup
        if (!document.getElementById('peoAnalysisPopup')) {
            const peoPopup = document.createElement('div');
            peoPopup.id = 'peoAnalysisPopup';
            peoPopup.className = 'analysis-popup';
            peoPopup.innerHTML = `
                <div class="popup-header">
                    <h3>🔍 PEO Analysis</h3>
                    <button class="close-popup-btn" onclick="closeAnalysisPopup('peo')">×</button>
                </div>
                <div class="popup-content">
                    <div class="peo-content"></div>
                </div>
            `;
            document.body.appendChild(peoPopup);
        }

        // Create Network Analysis Popup
        if (!document.getElementById('networkAnalysisPopup')) {
            const networkPopup = document.createElement('div');
            networkPopup.id = 'networkAnalysisPopup';
            networkPopup.className = 'analysis-popup';
            networkPopup.innerHTML = `
                <div class="popup-header">
                    <h3>🌐 Network Analysis</h3>
                    <button class="close-popup-btn" onclick="closeAnalysisPopup('network')">×</button>
                </div>
                <div class="popup-content">
                    <div class="network-content"></div>
                </div>
            `;
            document.body.appendChild(networkPopup);
        }

        // Create AI Insights Popup
        if (!document.getElementById('aiInsightsPopup')) {
            const insightsPopup = document.createElement('div');
            insightsPopup.id = 'aiInsightsPopup';
            insightsPopup.className = 'analysis-popup';
            insightsPopup.innerHTML = `
                <div class="popup-header">
                    <h3>🤖 AI Insights</h3>
                    <button class="close-popup-btn" onclick="closeAnalysisPopup('insights')">×</button>
                </div>
                <div class="popup-content">
                    <div class="insights-content"></div>
                </div>
            `;
            document.body.appendChild(insightsPopup);
        }
    }

    setupEventListeners() {
        // Listen for analysis updates
        document.addEventListener('analysisComplete', (e) => {
            console.log('📊 Analysis complete event received:', e.detail);
            this.updateAnalysis(e.detail);

            // Log comprehensive PEO analysis results
            if (e.detail.peoAnalysis && e.detail.peoAnalysis.statistics) {
                const totalPapers = e.detail.peoAnalysis.statistics.total_papers;
                console.log(`✅ Full PEO Analysis completed: ${totalPapers} papers analyzed across all categories`);

                // Show coverage summary
                const coverage = e.detail.peoAnalysis.statistics.coverage_percentages;
                if (coverage) {
                    console.log('📈 PEO Coverage Summary:', coverage);
                }
            }
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('analysis-popup')) {
                this.closeAllPopups();
            }
        });

        // Close popup with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllPopups();
            }
        });
    }

    updateAnalysis(analysisData) {
        console.log('🔄 Updating analysis data:', analysisData);
        this.currentAnalysis = analysisData;
    }

    async openPopup(popupType) {
        console.log(`🔍 Opening ${popupType} popup, current analysis:`, this.currentAnalysis);
        const popupId = `${popupType}AnalysisPopup`;
        const popup = document.getElementById(popupId);
        
        if (popup) {
            // If no analysis data is present, run a simple client-side analysis
            if (!this.currentAnalysis && window.app && window.app.currentData) {
                console.log('📊 No analysis data found, running client-side analysis...');
                this.currentAnalysis = this.runSimpleClientAnalysis(window.app.currentData);
                document.dispatchEvent(new CustomEvent('analysisComplete', {
                    detail: this.currentAnalysis
                }));
            }
            // Check if we have global analysis data as fallback
            else if (!this.currentAnalysis && window.currentAnalysis) {
                console.log('📋 Using global analysis data as fallback');
                this.currentAnalysis = window.currentAnalysis;
            }

            popup.style.display = 'flex';
            popup.classList.add('active');
            
            // Update content based on current analysis data
            this.updatePopupContent(popupType);
        }
    }

    closePopup(popupType) {
        const popupId = `${popupType}AnalysisPopup`;
        const popup = document.getElementById(popupId);
        
        if (popup) {
            popup.style.display = 'none';
            popup.classList.remove('active');
        }
    }

    closeAllPopups() {
        const popups = document.querySelectorAll('.analysis-popup');
        popups.forEach(popup => {
            popup.style.display = 'none';
            popup.classList.remove('active');
        });
    }

    updatePopupContent(popupType) {
        if (!this.currentAnalysis) return;

        switch (popupType) {
            case 'peo':
                this.updatePEOContent();
                break;
            case 'network':
                this.updateNetworkContent();
                break;
            case 'insights':
                this.updateInsightsContent();
                break;
        }
    }

    updatePEOContent() {
        const contentDiv = document.querySelector('#peoAnalysisPopup .peo-content');
        if (!contentDiv) return;

        // Show loading state
        contentDiv.innerHTML = '<div class="loading-spinner"></div><p>Running PEO Coverage Analysis...</p>';

        // Run the new PEO Coverage Analysis
        this.runPEOCoverageAnalysis()
            .then(result => {
                if (result.success) {
                    contentDiv.innerHTML = this.buildPEOAnalysisHTML(result.data);
                } else {
                    contentDiv.innerHTML = `<p class="error">PEO Analysis failed: ${result.error}</p>`;
                }
            })
            .catch(error => {
                console.error('Error running PEO analysis:', error);
                contentDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            });
    }

    async runPEOCoverageAnalysis() {
        // Check if we have the necessary data
        if (!window.app || !window.app.currentData) {
            throw new Error('No graph data available for analysis');
        }

        console.log('🔍 Current data structure:', window.app.currentData);
        
        // Handle different data structures
        let nodes = window.app.currentData.nodes || 
                   window.app.currentData.knowledgeGraph?.nodes ||
                   [];

        if (!nodes || nodes.length === 0) {
            throw new Error('No nodes available for PEO analysis');
        }

        console.log(`📊 Found ${nodes.length} nodes for PEO analysis`);

        // Convert graph nodes to paper-like format for analysis
        const papers = this.convertGraphDataToPapers(nodes);
        
        if (papers.length === 0) {
            throw new Error('No valid papers found for analysis');
        }

        // Create and run PEO analyzer
        const analyzer = new PEOCoverageAnalyzer();
        const result = await analyzer.runFullAnalysis(papers);
        
        // Store results for download
        this.currentPEOResults = result;
        
        return result;
    }

    convertGraphDataToPapers(nodes) {
        // Convert graph nodes to a format suitable for PEO analysis
        return nodes.map((node, index) => ({
            title: node.label || node.name || `Node ${index}`,
            abstract: node.description || node.abstract || '',
            pub_year: node.year || node.publication_year || 2020 // Default year if not available
        })).filter(paper => paper.title); // Only keep nodes with labels
    }

    buildPEOAnalysisHTML(data) {
        const { coverage, temporal, visualization } = data;
        
        // Build coverage chart
        const coverageChart = this.buildCoverageChart(visualization.coverage);
        
        // Build temporal trends summary
        const temporalSummary = this.buildTemporalSummary(visualization.temporal);
        
        return `
            <div class="peo-analysis-results">
                <div class="analysis-summary">
                    <h4>📊 Analysis Summary</h4>
                    <div class="summary-stats">
                        <div class="stat-item">
                            <span class="stat-number">${visualization.summary.totalPapers}</span>
                            <span class="stat-label">Total Papers</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${visualization.summary.categories}</span>
                            <span class="stat-label">Categories</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${visualization.summary.timeRange}</span>
                            <span class="stat-label">Time Range</span>
                        </div>
                    </div>
                </div>

                <div class="coverage-analysis">
                    <h4>🎯 Category Coverage</h4>
                    ${coverageChart}
                </div>

                <div class="temporal-analysis">
                    <h4>📈 Temporal Trends</h4>
                    ${temporalSummary}
                </div>

                <div class="download-section">
                    <button onclick="window.analysisPanel.downloadPEOResults()" class="download-btn">
                        💾 Download Results
                    </button>
                </div>
            </div>
        `;
    }

    buildCoverageChart(coverageData) {
        const chartItems = coverageData.map(item => `
            <div class="coverage-item">
                <div class="coverage-bar-container">
                    <div class="coverage-label">${item.category}</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${item.percentage}%; background-color: ${item.color}"></div>
                    </div>
                    <div class="coverage-value">${item.percentage.toFixed(1)}%</div>
                </div>
                <div class="coverage-count">${item.count.toLocaleString()} papers</div>
            </div>
        `).join('');

        return `<div class="coverage-chart">${chartItems}</div>`;
    }

    buildTemporalSummary(temporalData) {
        const totalByPeriod = temporalData.periods.map((period, index) => ({
            period,
            total: temporalData.totalPapers[index]
        }));

        const periodItems = totalByPeriod.map(item => `
            <div class="temporal-item">
                <span class="period-label">${item.period}</span>
                <span class="period-count">${item.total.toLocaleString()} papers</span>
            </div>
        `).join('');

        return `<div class="temporal-summary">${periodItems}</div>`;
    }

    downloadPEOResults() {
        if (!this.currentPEOResults) {
            console.warn('No PEO results to download');
            return;
        }

        const dataStr = JSON.stringify(this.currentPEOResults, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `peo_analysis_results_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    updateNetworkContent() {
        const contentDiv = document.querySelector('#networkAnalysisPopup .network-content');
        if (!contentDiv || !this.currentAnalysis || !this.currentAnalysis.networkMetrics) {
            contentDiv.innerHTML = '<p>Network analysis data is not available.</p>';
            return;
        }

        const { networkMetrics } = this.currentAnalysis;
        contentDiv.innerHTML = `
            <h4>Network Metrics</h4>
            <p>Nodes: ${networkMetrics.basic_metrics.node_count}</p>
            <p>Edges: ${networkMetrics.basic_metrics.edge_count}</p>
            <p>Density: ${networkMetrics.basic_metrics.density}</p>
            <p>Avg. Degree: ${networkMetrics.basic_metrics.average_degree}</p>
            <h4>Top 5 Connected Nodes</h4>
            <ul>
                ${networkMetrics.centrality.top_nodes.slice(0, 5).map(n => `<li>${n.label} (Degree: ${n.degree})</li>`).join('')}
            </ul>
        `;
    }

    updateInsightsContent() {
        const contentDiv = document.querySelector('#aiInsightsPopup .insights-content');
        contentDiv.innerHTML = '<div class="loading-spinner"></div><p>Generating AI Insights...</p>';

        if (!window.app || !window.app.currentData) {
            contentDiv.innerHTML = '<p>No graph data available to analyze.</p>';
            return;
        }

        // Use the new backend API function
        getRichAIInsights(window.app.currentData)
            .then(data => {
                console.log('Rich AI Insights data received:', data);
                contentDiv.innerHTML = this.buildInsightsHTML(data);
            })
            .catch(error => {
                console.error('Error generating AI Insights:', error);
                contentDiv.innerHTML = `<p class="error">Failed to generate AI Insights: ${error.message}</p>`;
            });
    }

    buildInsightsHTML(data) {
        // Helper function to build HTML for recommendations
        const buildRecommendations = (recommendations) => {
            return recommendations.map(rec => `
                <div class="rec-item ${rec.priority.toLowerCase()}-priority">
                    <div class="rec-header">
                        <div class="rec-title">${rec.title}</div>
                        <div class="priority-badge ${rec.priority.toLowerCase()}">${rec.priority}</div>
                    </div>
                    <div class="rec-content">
                        ${rec.description}
                        <div class="confidence-indicator">
                            <span class="confidence-text">Confidence:</span>
                            <div class="confidence-bar">
                                <div class="confidence-fill" style="width: ${rec.confidence}%;"></div>
                            </div>
                            <span class="confidence-text">${rec.confidence}%</span>
                        </div>
                    </div>
                </div>
            `).join('');
        };

        // Main HTML structure
        return `
            <div class="metrics-overview">
                <div class="metric-card">
                    <div class="metric-number">${data.network_metrics.node_count}</div>
                    <div class="metric-label">Nodes</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${data.network_metrics.edge_count}</div>
                    <div class="metric-label">Relationships</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${data.network_metrics.density}</div>
                    <div class="metric-label">Network Density</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${Object.keys(data.peo_analysis.peo_distribution).length}</div>
                    <div class="metric-label">Node Types</div>
                </div>
            </div>

            <div class="insight-section key-findings">
                <h2>🔍 Critical Insights</h2>
                ${data.critical_insights.map(item => `
                    <div class="finding-item ${item.type}">
                        <h3>${item.title}</h3>
                        <p>${item.description}</p>
                    </div>
                `).join('')}
            </div>

            <div class="recommendations">
                <h2>💡 Strategic Recommendations</h2>
                ${buildRecommendations(data.strategic_recommendations)}
            </div>

            <div class="interactive-summary">
                <h2>📋 Executive Summary</h2>
                <div class="summary-content">
                    <p><strong>System Architecture:</strong> ${data.executive_summary.system_architecture}</p>
                    <p><strong>Critical Success Factors:</strong> ${data.executive_summary.critical_success_factors}</p>
                    <p><strong>Strategic Priority:</strong> ${data.executive_summary.strategic_priority}</p>
                </div>
            </div>
        `;
    }

    runSimpleClientAnalysis(graphData) {
        const peoAnalysis = this.simplePEOClassification(graphData);
        const networkMetrics = this.calculateNetworkMetrics(graphData);
        return {
            type: 'client_side_analysis',
            timestamp: new Date().toISOString(),
            knowledgeGraph: graphData,
            peoAnalysis,
            networkMetrics
        };
    }

    calculateNetworkMetrics(graphData) {
        const nodes = graphData.nodes || [];
        const edges = graphData.links || graphData.edges || [];
        const nodeCount = nodes.length;
        const edgeCount = edges.length;
        const density = nodeCount > 1 ? (edgeCount * 2) / (nodeCount * (nodeCount - 1)) : 0;

        const degreeMap = new Map();
        edges.forEach(edge => {
            const sourceId = edge.source.id || edge.source;
            const targetId = edge.target.id || edge.target;
            degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
            degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
        });

        const degrees = Array.from(degreeMap.values());
        const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
        const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

        const topNodes = nodes
            .map(node => ({...node, degree: degreeMap.get(node.id) || 0}))
            .sort((a, b) => b.degree - a.degree)
            .slice(0, 10);

        return {
            basic_metrics: {
                node_count: nodeCount,
                edge_count: edgeCount,
                density: density.toFixed(4),
                average_degree: avgDegree.toFixed(2),
                max_degree: maxDegree
            },
            centrality: {
                top_nodes: topNodes,
                degree_distribution: this.calculateDegreeDistribution(degrees)
            },
            connectivity: {
                connected: edgeCount > 0,
                estimated_components: this.estimateComponents(graphData)
            }
        };
    }

    simplePEOClassification(graphData) {
        const classified = { processes: [], entities: [], outcomes: [] };
        if (!graphData || !graphData.nodes) return classified;

        graphData.nodes.forEach(node => {
            const peoType = this.classifyNodePEO(node);
            const targetArray = classified[peoType + 's'];
            if (targetArray) {
                targetArray.push({ ...node, peo_type: peoType, peo_confidence: 0.6 });
            }
        });

        return {
            ...classified,
            statistics: {
                total_processes: classified.processes.length,
                total_entities: classified.entities.length,
                total_outcomes: classified.outcomes.length
            }
        };
    }

    classifyNodePEO(node) {
        if (!node || !node.label) return 'entity';
        const label = node.label.toLowerCase();
        const type = (node.type || '').toLowerCase();

        if (type.includes('process') || label.includes('process') || label.includes('reaction') || label.includes('synthesis')) {
            return 'process';
        } else if (type.includes('outcome') || label.includes('outcome') || label.includes('result') || label.includes('product')) {
            return 'outcome';
        } else {
            return 'entity';
        }
    }

    buildAdjacencyList(graphData) {
        const adjList = new Map();
        const edges = graphData.links || graphData.edges || [];
        graphData.nodes.forEach(node => adjList.set(node.id, []));
        edges.forEach(edge => {
            const sourceId = edge.source.id || edge.source;
            const targetId = edge.target.id || edge.target;
            if (adjList.has(sourceId)) adjList.get(sourceId).push(targetId);
            if (adjList.has(targetId)) adjList.get(targetId).push(sourceId);
        });
        return adjList;
    }

    dfsComponent(nodeId, adjList, visited, community) {
        visited.add(nodeId);
        community.push(nodeId);
        const neighbors = adjList.get(nodeId) || [];
        neighbors.forEach(neighbor => {
            if (!visited.has(neighbor)) {
                this.dfsComponent(neighbor, adjList, visited, community);
            }
        });
    }

    estimateComponents(graphData) {
        const visited = new Set();
        let components = 0;
        const adjList = this.buildAdjacencyList(graphData);
        graphData.nodes.forEach(node => {
            if (!visited.has(node.id)) {
                const community = [];
                this.dfsComponent(node.id, adjList, visited, community);
                components++;
            }
        });
        return components;
    }

    calculateDegreeDistribution(degrees) {
        const distribution = {};
        degrees.forEach(degree => {
            distribution[degree] = (distribution[degree] || 0) + 1;
        });
        return distribution;
    }
}

// --- START: 수정된 부분 ---
// DOM이 완전히 로드된 후에 AnalysisPanel 인스턴스를 생성합니다.
document.addEventListener('DOMContentLoaded', () => {
    if (!window.analysisPanel) {
        window.analysisPanel = new AnalysisPanel();
        console.log('AnalysisPanel initialized successfully after DOM load');
    }
});
// --- END: 수정된 부분 ---


// Global functions for popup management
window.openAnalysisPopup = function(popupType) {
    if (window.analysisPanel) {
        window.analysisPanel.openPopup(popupType);
    }
};

window.closeAnalysisPopup = function(popupType) {
    if (window.analysisPanel) {
        window.analysisPanel.closePopup(popupType);
    }
};