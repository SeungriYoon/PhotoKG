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
        const panels = [
            ['peoAnalysisPopup', 'PEO Analysis', 'peo-content', 'peo'],
            ['networkAnalysisPopup', 'Network Analysis', 'network-content', 'network'],
            ['aiInsightsPopup', 'AI Insights', 'insights-content', 'insights']
        ];

        panels.forEach(([id, title, contentClass, popupType]) => {
            if (document.getElementById(id)) {
                return;
            }

            const popup = document.createElement('div');
            popup.id = id;
            popup.className = 'analysis-popup';
            popup.style.zIndex = '20000';
            popup.innerHTML = `
                <div class="popup-header">
                    <h3>${title}</h3>
                    <button class="close-popup-btn" onclick="closeAnalysisPopup('${popupType}')">x</button>
                </div>
                <div class="popup-content">
                    <div class="${contentClass}"></div>
                </div>
            `;
            document.body.appendChild(popup);
        });
    }

    getPopupId(popupType) {
        const popupMap = {
            peo: 'peoAnalysisPopup',
            network: 'networkAnalysisPopup',
            insights: 'aiInsightsPopup'
        };

        return popupMap[popupType] || `${popupType}AnalysisPopup`;
    }

    setupEventListeners() {
        document.addEventListener('analysisComplete', (e) => {
        console.log('Analysis complete event received:', e.detail);
            this.updateAnalysis(e.detail);

            if (e.detail.peoAnalysis && e.detail.peoAnalysis.statistics) {
                const totalPapers = e.detail.peoAnalysis.statistics.total_papers;
                console.log(`Full PEO analysis completed: ${totalPapers} papers analyzed across all categories`);

                const coverage = e.detail.peoAnalysis.statistics.coverage_percentages;
                if (coverage) {
                    console.log('PEO coverage summary:', coverage);
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('analysis-popup')) {
                this.closeAllPopups();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllPopups();
            }
        });
    }

    updateAnalysis(analysisData) {
        console.log('Updating analysis data:', analysisData);
        this.currentAnalysis = analysisData;
    }

    async openPopup(popupType) {
        console.log(`Opening ${popupType} popup, current analysis:`, this.currentAnalysis);
        const popupId = this.getPopupId(popupType);
        const popup = document.getElementById(popupId);

        if (!popup) {
            console.warn(`Popup not found: ${popupId}`);
            return;
        }

        popup.style.display = 'flex';
        popup.style.visibility = 'visible';
        popup.style.zIndex = '20000';
        popup.classList.add('active');

        const graphData = this.getActiveGraphData();

        try {
            if (!this.currentAnalysis && graphData) {
                console.log('No analysis data found, running client-side analysis...');
                this.currentAnalysis = this.runSimpleClientAnalysis(graphData);
                window.currentAnalysis = this.currentAnalysis;
                document.dispatchEvent(new CustomEvent('analysisComplete', {
                    detail: this.currentAnalysis
                }));
            } else if (!this.currentAnalysis && window.currentAnalysis) {
                console.log('Using global analysis data as fallback');
                this.currentAnalysis = window.currentAnalysis;
            }
        } catch (error) {
            console.error(`Failed to prepare popup analysis for ${popupType}:`, error);
        }

        this.updatePopupContent(popupType);
    }

    closePopup(popupType) {
        const popupId = this.getPopupId(popupType);
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
        if (!this.currentAnalysis && popupType !== 'insights') return;

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

    getActiveGraphData() {
        return window.currentGraph ||
            window.app?.currentData ||
            this.currentAnalysis?.knowledgeGraph ||
            window.currentAnalysis?.knowledgeGraph ||
            null;
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
        const graphData = this.getActiveGraphData();
        if (!graphData) {
            throw new Error('No graph data available for analysis');
        }

        console.log('Current data structure:', graphData);
        
        // Handle different data structures
        let nodes = graphData.nodes || graphData.knowledgeGraph?.nodes || [];

        if (!nodes || nodes.length === 0) {
            throw new Error('No nodes available for PEO analysis');
        }

        console.log(`Found ${nodes.length} nodes for PEO analysis`);

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
                    <h4>Analysis Summary</h4>
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
                    <h4>Category Coverage</h4>
                    ${coverageChart}
                </div>

                <div class="temporal-analysis">
                    <h4>Temporal Trends</h4>
                    ${temporalSummary}
                </div>

                <div class="download-section">
                    <button onclick="window.analysisPanel.downloadPEOResults()" class="download-btn">
                        Download Results
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
        if (!contentDiv) return;

        contentDiv.innerHTML = '<div class="loading-spinner"></div><p>Generating AI Insights...</p>';

        const graphData = this.getActiveGraphData();
        if (!graphData) {
            contentDiv.innerHTML = '<p>No graph data available to analyze.</p>';
            return;
        }

        // Use the backend API function when available, otherwise keep the popup usable with a local fallback.
        const insightFetcher = typeof window.getRichAIInsights === 'function'
            ? window.getRichAIInsights
            : (typeof getRichAIInsights === 'function' ? getRichAIInsights : null);
        if (!insightFetcher) {
            contentDiv.innerHTML = this.buildInsightsHTML(this.buildFallbackInsightsData(graphData));
            return;
        }

        insightFetcher(graphData)
            .then(data => {
                const normalized = this.normalizeInsightsData(data, graphData);
                console.log('Rich AI Insights data received:', normalized);
                contentDiv.innerHTML = this.buildInsightsHTML(normalized);
            })
            .catch(error => {
                console.error('Error generating AI Insights:', error);
                const fallback = this.buildFallbackInsightsData(graphData, error);
                contentDiv.innerHTML = this.buildInsightsHTML(fallback);
            });
    }

    normalizeInsightsData(data, graphData) {
        const fallback = this.buildFallbackInsightsData(graphData);
        if (!data || typeof data !== 'object') {
            return fallback;
        }

        return {
            network_metrics: data.network_metrics || fallback.network_metrics,
            peo_analysis: data.peo_analysis || fallback.peo_analysis,
            critical_insights: Array.isArray(data.critical_insights) ? data.critical_insights : fallback.critical_insights,
            strategic_recommendations: Array.isArray(data.strategic_recommendations) ? data.strategic_recommendations : fallback.strategic_recommendations,
            executive_summary: data.executive_summary || fallback.executive_summary,
            provenance: data.provenance || fallback.provenance
        };
    }

    buildFallbackInsightsData(graphData, error = null) {
        const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
        const links = Array.isArray(graphData?.links) ? graphData.links : Array.isArray(graphData?.edges) ? graphData.edges : [];
        const metrics = this.calculateNetworkMetrics(graphData || { nodes: [], links: [] });
        const typeDistribution = nodes.reduce((acc, node) => {
            const key = String(node?.type || 'unknown').toLowerCase() || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const topNode = metrics?.centrality?.top_nodes?.[0]?.label || 'the graph';
        const topEdge = links[0]?.label || links[0]?.relationship_type || links[0]?.type || 'related_to';

        return {
            network_metrics: metrics.basic_metrics,
            peo_analysis: {
                peo_distribution: typeDistribution
            },
            critical_insights: [
                {
                    type: 'structure',
                    title: `Largest signal: ${topNode}`,
                    description: `The current graph contains ${nodes.length} nodes and ${links.length} edges.`
                },
                {
                    type: 'relationship',
                    title: 'Dominant relation pattern',
                    description: `The strongest visible relation label is "${topEdge}".`
                }
            ],
            strategic_recommendations: [
                {
                    title: 'Add more grounded relations',
                    priority: 'High',
                    confidence: 78,
                    description: 'If AI insights look sparse, add more explicit entity-relation pairs or expand the PDF extraction excerpt.'
                },
                {
                    title: 'Separate mixed graph sources',
                    priority: 'High',
                    confidence: 84,
                    description: 'Use graphSource or graphId filters when multiple domains are loaded together.'
                }
            ],
            executive_summary: {
                system_architecture: error ? `Fallback analysis used because the LLM response could not be rendered: ${error.message}` : 'Fallback analysis generated locally from the active graph.',
                critical_success_factors: `The current graph centers on ${topNode} with relation label "${topEdge}".`,
                strategic_priority: 'Increase evidence coverage and keep graph sources scoped before regenerating AI insights.'
            },
            provenance: {
                source: error ? 'fallback' : 'local'
            }
        };
    }

    buildInsightsHTML(data) {
        const networkMetrics = data?.network_metrics || {};
        const peoDistribution = data?.peo_analysis?.peo_distribution || {};
        const criticalInsights = Array.isArray(data?.critical_insights) ? data.critical_insights : [];
        const strategicRecommendations = Array.isArray(data?.strategic_recommendations) ? data.strategic_recommendations : [];
        const executiveSummary = data?.executive_summary || {};

        // Helper function to build HTML for recommendations
        const buildRecommendations = (recommendations) => {
            if (!recommendations.length) {
                return '<div class="empty-state">No recommendations available.</div>';
            }

            return recommendations.map(rec => `
                <div class="rec-item ${String(rec.priority || 'medium').toLowerCase()}-priority">
                    <div class="rec-header">
                        <div class="rec-title">${rec.title || 'Untitled recommendation'}</div>
                        <div class="priority-badge ${String(rec.priority || 'medium').toLowerCase()}">${rec.priority || 'Medium'}</div>
                    </div>
                    <div class="rec-content">
                        ${rec.description || ''}
                        <div class="confidence-indicator">
                            <span class="confidence-text">Confidence:</span>
                            <div class="confidence-bar">
                                <div class="confidence-fill" style="width: ${Number(rec.confidence || 0)}%;"></div>
                            </div>
                            <span class="confidence-text">${Number(rec.confidence || 0)}%</span>
                        </div>
                    </div>
                </div>
            `).join('');
        };

        // Main HTML structure
        return `
            <div class="metrics-overview">
                <div class="metric-card">
                    <div class="metric-number">${networkMetrics.node_count ?? 0}</div>
                    <div class="metric-label">Nodes</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${networkMetrics.edge_count ?? 0}</div>
                    <div class="metric-label">Relationships</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${networkMetrics.density ?? 0}</div>
                    <div class="metric-label">Network Density</div>
                </div>
                <div class="metric-card">
                    <div class="metric-number">${Object.keys(peoDistribution).length}</div>
                    <div class="metric-label">Node Types</div>
                </div>
            </div>

            <div class="insight-section key-findings">
                <h2>Critical Insights</h2>
                ${criticalInsights.length ? criticalInsights.map(item => `
                    <div class="finding-item ${item.type}">
                        <h3>${item.title || 'Untitled insight'}</h3>
                        <p>${item.description || ''}</p>
                    </div>
                `).join('') : '<div class="empty-state">No insights available.</div>'}
            </div>

            <div class="recommendations">
                <h2>Strategic Recommendations</h2>
                ${buildRecommendations(strategicRecommendations)}
            </div>

            <div class="interactive-summary">
                <h2>Executive Summary</h2>
                <div class="summary-content">
                    <p><strong>System Architecture:</strong> ${executiveSummary.system_architecture || 'No summary available.'}</p>
                    <p><strong>Critical Success Factors:</strong> ${executiveSummary.critical_success_factors || 'No summary available.'}</p>
                    <p><strong>Strategic Priority:</strong> ${executiveSummary.strategic_priority || 'No summary available.'}</p>
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

// --- START: DOM-ready initialization ---
// Create the AnalysisPanel after the DOM has fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    if (!window.analysisPanel) {
        window.analysisPanel = new AnalysisPanel();
        console.log('AnalysisPanel initialized successfully after DOM load');
    }
});
// --- END: DOM-ready initialization ---


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
