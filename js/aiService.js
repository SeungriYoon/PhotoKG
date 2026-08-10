// Client-side AI helpers. All model requests use the backend analysis API.
class AIService {
    constructor() {
        this.ollamaConnected = false;
        this.ollamaUrl = '';
        this.model = 'qwen2.5-1.5b-instruct';
        this.fallbackMode = true;
    }

    async testConnection() {
        try {
            const result = await window.backendAPI.request('/analysis/llm-health', { maxRetries: 1 });
            this.ollamaConnected = Boolean(result.success && result.data?.connected);
            return { success: this.ollamaConnected, message: result.data?.message || 'LLM health checked', models: [] };
        } catch (error) {
            this.ollamaConnected = false;
            return { success: false, message: 'Not connected', error: error.message };
        }
    }

    async callOllama(prompt, model = null) {
        if (!this.ollamaConnected) return null;
        try {
            const result = await window.backendAPI.request('/analysis/chat', {
                method: 'POST',
                body: { message: prompt, model: model || this.model }
            });
            return result.response || '';
        } catch (error) {
            console.error('AI API error:', error);
            return null;
        }
    }

    async generateAIClusters(nodes, edges) {
        const nodeContext = nodes.slice().sort((a, b) => b.size - a.size).slice(0, 50)
            .map(node => `${node.label} (Type: ${node.type}, Size: ${Math.round(node.size || 0)})`).join(', ');
        const prompt = `Analyze this network and return JSON with a clusters array. Each cluster must contain name, insight, and nodes (labels). Nodes: ${nodeContext}`;
        try {
            const response = await this.callOllama(prompt);
            const match = response && response.match(/\{[\s\S]*\}/);
            if (match) return this.enhanceAIClusters(JSON.parse(match[0]).clusters || [], nodes);
        } catch (error) {
            console.error('AI clustering error:', error);
        }
        return this.generateBasicClusters(nodes, edges);
    }

    async analyzeMetadata() {
        try {
            const graph = window.app?.currentData || { nodes: [], links: [] };
            return await window.backendAPI.request('/analysis/metadata', {
                method: 'POST',
                body: { nodes: graph.nodes || [], links: graph.links || [] }
            });
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    enhanceAIClusters(aiClusters, nodes) {
        const nodeMap = new Map(nodes.map(node => [String(node.label || '').toLowerCase(), node]));
        const clusters = {};
        aiClusters.forEach((cluster, index) => {
            const clusterNodes = (cluster.nodes || []).map(label => nodeMap.get(String(label).toLowerCase())).filter(Boolean);
            if (clusterNodes.length) {
                clusters[`ai_cluster_${index + 1}`] = {
                    name: cluster.name || `Cluster ${index + 1}`,
                    insight: cluster.insight || '',
                    nodes: clusterNodes,
                    isAI: true,
                    color: `hsl(${(index * 137.508) % 360}, 70%, 60%)`
                };
            }
        });
        const clustered = new Set(Object.values(clusters).flatMap(cluster => cluster.nodes.map(node => node.id)));
        const remaining = nodes.filter(node => !clustered.has(node.id));
        if (remaining.length) clusters.misc_cluster = { name: 'Miscellaneous Concepts', insight: 'Unclassified concepts', nodes: remaining, isAI: false, color: 'hsl(0, 0%, 60%)' };
        return clusters;
    }

    async generateBasicClusters(nodes, edges) {
        const adjacency = new Map(nodes.map(node => [node.id, []]));
        edges.forEach(edge => {
            const source = edge.source?.id || edge.source;
            const target = edge.target?.id || edge.target;
            if (adjacency.has(source)) adjacency.get(source).push(target);
            if (adjacency.has(target)) adjacency.get(target).push(source);
        });
        const visited = new Set();
        const clusters = {};
        let index = 1;
        nodes.forEach(node => {
            if (visited.has(node.id)) return;
            const group = [];
            const stack = [node.id];
            while (stack.length) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                const current = nodes.find(item => item.id === id);
                if (current) group.push(current);
                (adjacency.get(id) || []).forEach(neighbor => { if (!visited.has(neighbor)) stack.push(neighbor); });
            }
            if (group.length > 1) {
                const main = group.reduce((a, b) => (b.size || 0) > (a.size || 0) ? b : a);
                clusters[`cluster_${index}`] = { name: `${main.label} Group`, insight: `${group.length} connected concepts`, nodes: group, isAI: false, color: `hsl(${(index * 50) % 360}, 65%, 55%)` };
                index += 1;
            }
        });
        return clusters;
    }

    findNodeCluster(nodeId, clusters) {
        return Object.entries(clusters).find(([, cluster]) => cluster.nodes.some(node => node.id === nodeId))?.[0] || null;
    }

    async detectStructuralGaps(nodes, edges, clusters) {
        const connections = new Map();
        edges.forEach(edge => {
            const source = this.findNodeCluster(edge.source?.id || edge.source, clusters);
            const target = this.findNodeCluster(edge.target?.id || edge.target, clusters);
            if (!source || !target || source === target) return;
            const key = [source, target].sort().join('__');
            const item = connections.get(key) || { source, target, connections: 0, totalWeight: 0 };
            item.connections += 1;
            item.totalWeight += edge.weight || 1;
            connections.set(key, item);
        });
        return [...connections.values()].filter(item => item.connections < Math.min(clusters[item.source]?.nodes.length || 1, clusters[item.target]?.nodes.length || 1) * 0.1)
            .map(item => ({ type: 'weak_connection', source: item.source, target: item.target, actual: item.connections, strength: item.totalWeight, description: `Weak connection between ${item.source} and ${item.target} clusters.` }));
    }

    calculateVariance(values) {
        if (!values.length) return 0;
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        return values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    }

    analyzeNetworkBias(nodes, edges, clusters) {
        const possible = (nodes.length * Math.max(0, nodes.length - 1)) / 2;
        const density = possible ? edges.length / possible : 0;
        const variance = this.calculateVariance(Object.values(clusters).map(cluster => cluster.nodes.length));
        const type = variance > 100 ? 'focused' : density < 0.01 ? 'sparse' : density > 0.1 ? 'dense' : 'balanced';
        return { type, score: type === 'dense' ? 0.8 : type === 'focused' ? 0.6 : type === 'sparse' ? 0.3 : 0, density, clusterVariance: variance, totalNodes: nodes.length, totalEdges: edges.length, clusterCount: Object.keys(clusters).length };
    }

    updateSettings(_url, model) { this.model = model || this.model; }

    async analyzeGraph(nodes, edges) {
        const clusters = await this.generateAIClusters(nodes, edges);
        const gaps = await this.detectStructuralGaps(nodes, edges, clusters);
        const bias = this.analyzeNetworkBias(nodes, edges, clusters);
        return { success: true, clusters, gaps, bias, summary: { nodeCount: nodes.length, edgeCount: edges.length, clusterCount: Object.keys(clusters).length, gapCount: gaps.length, biasScore: bias.score } };
    }
}

window.AIService = AIService;
