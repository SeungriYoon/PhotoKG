// AI Service Class
class AIService {
    constructor() {
        this.ollamaConnected = false;
        this.ollamaUrl = 'http://127.0.0.1:11434';
        this.model = 'llama3.1';
        this.fallbackMode = true; // Enable fallback analysis without Ollama
    }

    // Ollama Connection Test (via backend)
    async testConnection() {
        try {
            console.log('🔗 Testing Ollama server connection via backend...');
            
            const response = await fetch('http://localhost:3015/api/arango/test-ollama', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Ollama server connected successfully:', data);
                this.ollamaConnected = true;
                return { 
                    success: true, 
                    message: 'Connected ✅',
                    models: data.models || []
                };
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Ollama server connection failed:', error);
            this.ollamaConnected = false;
            return { 
                success: false, 
                message: 'Not Connected ❌',
                error: error.message
            };
        }
    }

    // Ollama API Call
    async callOllama(prompt, model = null) {
        if (!this.ollamaConnected) return null;
        
        const modelToUse = model || this.model;
        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelToUse,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        num_predict: 800
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Ollama API Error:', error);
            return null;
        }
    }

    // AI-based Clustering
    async generateAIClusters(nodes, edges) {
        // Prepare node context (using top 50 only)
        const topNodes = nodes
            .sort((a, b) => b.size - a.size)
            .slice(0, 50);
            
        const nodeContext = topNodes
            .map(n => `${n.label} (Type: ${n.type}, Size: ${Math.round(n.size)})`)
            .join(', ');

        const prompt = `
Analyze the following network nodes and create semantic clusters:

Nodes: ${nodeContext}

Create 3-7 thematic clusters based on the following conditions:
1. Assign meaningful thematic names to each cluster
2. Add a brief explanation of the importance and meaning of each cluster
3. Classify nodes based on semantic relevance

Respond in the following JSON format:
{
  "clusters": [
    {
      "name": "Cluster Name",
      "insight": "Explanation of the meaning and importance of this cluster",
      "nodes": ["Node1", "Node2", "Node3"]
    }
  ]
}

Prioritize semantic relevance over statistical connections for clustering.
`;

        try {
            const aiResponse = await this.callOllama(prompt);
            if (aiResponse) {
                // Extract JSON (handles markdown code blocks)
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return await this.enhanceAIClusters(parsed.clusters, nodes, edges);
                }
            }
        } catch (error) {
            console.error('AI Clustering Error:', error);
        }

        return await this.generateBasicClusters(nodes, edges);
    }

    // Analyze CSV Metadata via Backend
    async analyzeMetadata() {
        try {
            console.log('🧠 Starting AI analysis via backend...');
            
            const response = await fetch('http://localhost:3015/api/arango/analyze-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ AI analysis completed:', data);
                return data;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('❌ AI analysis failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Enhance AI Clusters
    async enhanceAIClusters(aiClusters, nodes, edges) {
        const clusters = {};
        const nodeMap = new Map(nodes.map(n => [n.label.toLowerCase(), n]));

        aiClusters.forEach((cluster, index) => {
            const clusterNodes = cluster.nodes
                .map(nodeName => nodeMap.get(nodeName.toLowerCase()))
                .filter(node => node);

            if (clusterNodes.length > 0) {
                clusters[`ai_cluster_${index + 1}`] = {
                    name: cluster.name,
                    insight: cluster.insight,
                    nodes: clusterNodes,
                    isAI: true,
                    color: `hsl(${(index * 137.508) % 360}, 70%, 60%)`
                };
            }
        });

        // Add unclassified nodes to other clusters
        const clusteredNodeIds = new Set();
        Object.values(clusters).forEach(cluster => {
            cluster.nodes.forEach(node => clusteredNodeIds.add(node.id));
        });

        const unclusteredNodes = nodes.filter(node => !clusteredNodeIds.has(node.id));
        if (unclusteredNodes.length > 0) {
            clusters['misc_cluster'] = {
                name: 'Miscellaneous Concepts',
                insight: 'Additional concepts not included in main topics',
                nodes: unclusteredNodes,
                isAI: false,
                color: 'hsl(0, 0%, 60%)'
            };
        }

        return clusters;
    }

    // Basic Clustering (Connectivity-based)
    async generateBasicClusters(nodes, edges) {
        const clusters = {};
        const visited = new Set();
        let clusterIndex = 1;

        // Create adjacency list
        const adjacencyList = new Map();
        nodes.forEach(node => adjacencyList.set(node.id, []));
        edges.forEach(edge => {
            const sourceId = edge.source.id || edge.source;
            const targetId = edge.target.id || edge.target;
            if (adjacencyList.has(sourceId)) {
                adjacencyList.get(sourceId).push(targetId);
            }
            if (adjacencyList.has(targetId)) {
                adjacencyList.get(targetId).push(sourceId);
            }
        });

        // Find connected components
        nodes.forEach(node => {
            if (!visited.has(node.id)) {
                const cluster = [];
                const stack = [node];
                
                while (stack.length > 0) {
                    const current = stack.pop();
                    if (!visited.has(current.id)) {
                        visited.add(current.id);
                        cluster.push(current);
                        
                        const neighbors = adjacencyList.get(current.id) || [];
                        neighbors.forEach(neighborId => {
                            const neighbor = nodes.find(n => n.id === neighborId);
                            if (neighbor && !visited.has(neighbor.id)) {
                                stack.push(neighbor);
                            }
                        });
                    }
                }
                
                if (cluster.length > 1) {
                    // Generate cluster name (based on largest node)
                    const mainNode = cluster.reduce((max, node) => 
                        node.size > max.size ? node : max
                    );
                    
                    clusters[`cluster_${clusterIndex++}`] = {
                        name: `${mainNode.label} Group`,
                        insight: `${cluster.length} connected concepts`,
                        nodes: cluster,
                        isAI: false,
                        color: `hsl(${(clusterIndex * 50) % 360}, 65%, 55%)`
                    };
                }
            }
        });

        return clusters;
    }

    // Detect Structural Gaps
    async detectStructuralGaps(nodes, edges, clusters) {
        const gaps = [];
        
        // Analyze inter-cluster connections
        const clusterConnections = new Map();
        
        edges.forEach(edge => {
            const sourceId = edge.source.id || edge.source;
            const targetId = edge.target.id || edge.target;
            
            const sourceCluster = this.findNodeCluster(sourceId, clusters);
            const targetCluster = this.findNodeCluster(targetId, clusters);
            
            if (sourceCluster && targetCluster && sourceCluster !== targetCluster) {
                const key = [sourceCluster, targetCluster].sort().join('__');
                if (!clusterConnections.has(key)) {
                    clusterConnections.set(key, {
                        source: sourceCluster,
                        target: targetCluster,
                        connections: 0,
                        totalWeight: 0
                    });
                }
                const connection = clusterConnections.get(key);
                connection.connections++;
                connection.totalWeight += edge.weight || 1;
            }
        });

        // Find weak connections
        const clusterSizes = new Map();
        Object.entries(clusters).forEach(([id, cluster]) => {
            clusterSizes.set(id, cluster.nodes.length);
        });

        clusterConnections.forEach((connection, key) => {
            const sourceSize = clusterSizes.get(connection.source) || 1;
            const targetSize = clusterSizes.get(connection.target) || 1;
            const expectedConnections = Math.min(sourceSize, targetSize) * 0.1;
            
            if (connection.connections < expectedConnections) {
                gaps.push({
                    type: 'weak_connection',
                    source: connection.source,
                    target: connection.target,
                    actual: connection.connections,
                    expected: Math.round(expectedConnections),
                    strength: connection.totalWeight,
                    description: `Weak connection between ${connection.source} and ${connection.target} clusters.`
                });
            }
        });

        // Find isolated clusters
        Object.entries(clusters).forEach(([id, cluster]) => {
            const hasExternalConnections = Array.from(clusterConnections.values())
                .some(conn => conn.source === id || conn.target === id);
            
            if (!hasExternalConnections && cluster.nodes.length > 3) {
                gaps.push({
                    type: 'isolated_cluster',
                    cluster: id,
                    nodeCount: cluster.nodes.length,
                    description: `${cluster.name} cluster is not connected to other clusters.`
                });
            }
        });

        return gaps;
    }

    // Find node cluster
    findNodeCluster(nodeId, clusters) {
        for (const [clusterId, cluster] of Object.entries(clusters)) {
            if (cluster.nodes.some(node => node.id === nodeId)) {
                return clusterId;
            }
        }
        return null;
    }

    // Analyze Network Bias
    analyzeNetworkBias(nodes, edges, clusters) {
        const totalNodes = nodes.length;
        const totalEdges = edges.length;
        const clusterCount = Object.keys(clusters).length;
        
        // Calculate network density
        const maxPossibleEdges = (totalNodes * (totalNodes - 1)) / 2;
        const density = totalEdges / maxPossibleEdges;
        
        // Cluster size distribution
        const clusterSizes = Object.values(clusters).map(c => c.nodes.length);
        const sizeVariance = this.calculateVariance(clusterSizes);
        
        // Bias classification
        let biasType = 'balanced';
        let biasScore = 0;
        
        if (density < 0.01) {
            biasType = 'sparse';
            biasScore = 0.3;
        } else if (density > 0.1) {
            biasType = 'dense';
            biasScore = 0.8;
        }
        
        if (sizeVariance > 100) {
            biasType = 'focused';
            biasScore = Math.max(biasScore, 0.6);
        }
        
        return {
            type: biasType,
            score: biasScore,
            density: density,
            clusterVariance: sizeVariance,
            totalNodes: totalNodes,
            totalEdges: totalEdges,
            clusterCount: clusterCount
        };
    }

    // Calculate Variance
    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return variance;
    }

    // Update Settings
    updateSettings(url, model) {
        this.ollamaUrl = url;
        this.model = model;
    }

    // Analyze Graph
    async analyzeGraph(nodes, edges) {
        if (!this.ollamaConnected) {
            return {
                success: false,
                error: 'Ollama server not connected.'
            };
        }

        try {
            // Create clusters
            const clusters = await this.generateAIClusters(nodes, edges);
            
            // Detect structural gaps
            const gaps = await this.detectStructuralGaps(nodes, edges, clusters);
            
            // Analyze network bias
            const bias = this.analyzeNetworkBias(nodes, edges, clusters);
            
            // Generate AI insights
            const insights = await this.generateInsights(nodes, edges, clusters, gaps, bias);
            
            return {
                success: true,
                clusters: clusters,
                gaps: gaps,
                bias: bias,
                insights: insights,
                summary: {
                    nodeCount: nodes.length,
                    edgeCount: edges.length,
                    clusterCount: Object.keys(clusters).length,
                    gapCount: gaps.length,
                    biasScore: bias.score
                }
            };
        } catch (error) {
            console.error('AI Graph Analysis Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Generate AI Insights
    async generateInsights(nodes, edges, clusters, gaps, bias) {
        const topNodes = nodes
            .sort((a, b) => b.size - a.size)
            .slice(0, 10)
            .map(n => n.label)
            .join(', ');

        const clusterNames = Object.values(clusters)
            .map(c => c.name)
            .join(', ');

        const prompt = `
Generate 3-5 key insights based on the following knowledge graph analysis results:

Key Nodes: ${topNodes}
Clusters: ${clusterNames}
Network Type: ${bias.type}
Number of Structural Gaps: ${gaps.length}
Total Nodes: ${nodes.length}
Total Edges: ${edges.length}

Respond in the following JSON format:
{
  "insights": [
    {
      "type": "Key Findings|Structural Characteristics|Research Directions",
      "title": "Insight Title",
      "description": "Detailed Description",
      "importance": "high|medium|low"
    }
  ]
}

Provide academic and practical insights.
`;

        try {
            const aiResponse = await this.callOllama(prompt);
            if (aiResponse) {
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return parsed.insights || [];
                }
            }
        } catch (error) {
            console.error('AI Insight Generation Error:', error);
        }

        return [
            {
                type: "Structural Characteristics",
                title: `${bias.type} Network Structure`,
                description: `The network shows ${bias.type} characteristics with a density of ${(bias.density * 100).toFixed(1)}%.`,
                importance: "medium"
            },
            {
                type: "Research Directions",
                title: "Need to Strengthen Inter-Cluster Connections",
                description: `${gaps.length} structural gaps were found, requiring further research.`,
                importance: "high"
            }
        ];
    }
}