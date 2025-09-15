/**
 * Backend API Client
 * A wrapper to easily call the backend API from existing client code.
 */

class BackendAPI {
  constructor(baseURL = 'http://localhost:3015') {
    this.baseURL = baseURL;
    this.enabled = false;
    this.fallbackToLocal = true;
    this.connectionChecked = false;
    this.connectionPromise = null;
    
    // Start connection check but don't wait for it
    this.connectionPromise = this.checkConnection();
  }

  // Check backend connection status
  async checkConnection() {
    if (this.connectionChecked) {
      return { success: this.enabled, message: this.enabled ? 'Backend connected' : 'Backend not available' };
    }

    try {
      const response = await fetch(`${this.baseURL}/api/health`);
      if (response.ok) {
        this.enabled = true;
        this.connectionChecked = true;
        console.log('✅ Backend API connected successfully');
        return { success: true, message: 'Backend connected' };
      } else {
        console.warn('⚠️ Backend API response error');
        this.enabled = false;
        this.connectionChecked = true;
        return { success: false, message: 'Backend response error' };
      }
    } catch (error) {
      console.warn('⚠️ Backend API connection failed:', error.message);
      this.enabled = false;
      this.connectionChecked = true;
      return { success: false, message: error.message };
    }
  }

  // Test connection (public method)
  async testConnection() {
    return await this.checkConnection();
  }

  // API request helper with retry logic
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}/api${endpoint}`;
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const config = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Legacy-Format': 'true', // Request client-compatible format
            ...options.headers
          },
          // Increase timeout for large files
          signal: AbortSignal.timeout(options.timeout || 300000), // 5 minutes default
          ...options
        };

        if (options.body && typeof options.body === 'object') {
          config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `HTTP ${response.status}`);
        }

        return data;

      } catch (error) {
        console.warn(`API request attempt ${attempt}/${maxRetries} failed:`, error.message);

        // Don't retry on client errors (4xx)
        if (error.message.includes('HTTP 4')) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          console.error(`API request failed after ${maxRetries} attempts: ${endpoint}`, error);
          throw error;
        }

        // Wait before retrying
        console.log(`Retrying in ${retryDelay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }

  // Get Graph
  async getGraph(options = {}) {
    if (!this.enabled && !this.fallbackToLocal) {
      throw new Error('Backend API is not available');
    }

    if (!this.enabled) {
      console.log('🔄 Falling back to local mode');
      return this.getLocalGraph(options);
    }

    try {
      const result = await this.request('/arango/graph', { // Changed endpoint to /arango/graph
        method: 'POST',
        body: options // Pass options directly as body for POST request
      });
      
      // Transform data from backend format to frontend (D3.js) format
      const transformedNodes = result.nodes.map(node => ({
        id: node.id,
        label: node.name, // Map 'name' from backend to 'label' for frontend
        size: node.size,
        type: node.type,
        attributes: node.attributes || {} // Include any additional attributes
      }));

      const transformedLinks = result.links.map(link => ({
        source: link.source,
        target: link.target,
        weight: link.weight,
        type: link.type // Keep link type if needed
      }));

      return {
        success: true,
        data: { nodes: transformedNodes, links: transformedLinks },
        source: 'backend'
      };

    } catch (error) {
      if (this.fallbackToLocal) {
        console.warn('Backend failed, falling back to local:', error.message);
        return this.getLocalGraph(options);
      }
      throw error;
    }
  }

  // Get Subgraph
  async getSubgraph(nodeId, depth = 1) {
    if (!this.enabled) {
      return this.getLocalSubgraph(nodeId, depth);
    }

    try {
      const result = await this.request(`/graph/subgraph/${nodeId}?depth=${depth}&legacy=true`);
      return {
        success: true,
        data: result.data,
        source: 'backend'
      };
    } catch (error) {
      if (this.fallbackToLocal) {
        return this.getLocalSubgraph(nodeId, depth);
      }
      throw error;
    }
  }

  // Search Nodes
  async searchNodes(query, options = {}) {
    if (!this.enabled) {
      return this.searchLocalNodes(query, options);
    }

    try {
      const params = new URLSearchParams({
        query,
        limit: options.limit || 20,
        legacy: 'true'
      });

      if (options.type) {
        params.append('type', options.type);
      }

      const result = await this.request(`/graph/search?${params}`);
      return {
        success: true,
        data: result.data,
        source: 'backend'
      };
    } catch (error) {
      if (this.fallbackToLocal) {
        return this.searchLocalNodes(query, options);
      }
      throw error;
    }
  }

  // Upload Graph
  async uploadGraph(graphData, metadata = {}) {
    if (!this.enabled) {
      throw new Error('Graph upload requires the backend API');
    }

    try {
      // Use the specific papers batch upload endpoint
      const result = await this.request('/papers/batch', {
        method: 'POST',
        body: graphData.nodes // Assuming graphData.nodes contains the paper documents
      });

      return {
        success: true,
        data: result.data,
        message: 'Papers uploaded to the backend'
      };
    } catch (error) {
      throw new Error(`Graph upload failed: ${error.message}`);
    }
  }

  // File Upload
  async uploadFile(file, options = {}) {
    // Wait for connection check to complete
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    if (!this.enabled) {
      throw new Error('File upload requires the backend API');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (Object.keys(options).length > 0) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await fetch(`${this.baseURL}/api/upload/file`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'File upload failed');
      }

      return {
        success: true,
        data: result.data,
        message: 'File processed successfully'
      };
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  // New: CSV Upload
  async uploadCsv(formData) {
    // Wait for connection check to complete
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    if (!this.enabled) {
      throw new Error('CSV upload requires the backend API to be enabled.');
    }

    try {
      const response = await fetch(`${this.baseURL}/api/arango/upload-csv`, {
        method: 'POST',
        body: formData // FormData object, fetch will set Content-Type automatically
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `CSV upload failed with status ${response.status}`);
      }

      return {
        success: true,
        message: result.message,
        inserted: result.inserted
      };
    } catch (error) {
      console.error(`CSV upload API request failed:`, error);
      throw new Error(`CSV upload failed: ${error.message}`);
    }
  }

  // Analyze CSV with OpenAI
  async analyzeCSV(formData) {
    // Wait for connection check to complete
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    if (!this.enabled) {
      throw new Error('CSV analysis requires the backend API');
    }

    try {
      const response = await fetch(`${this.baseURL}/api/analysis/csv`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'CSV analysis failed');
      }

      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      throw new Error(`CSV analysis failed: ${error.message}`);
    }
  }

  // Analyze PDF with OpenAI
  async analyzePDF(formData) {
    // Wait for connection check to complete
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    if (!this.enabled) {
      throw new Error('PDF analysis requires the backend API');
    }

    try {
      const response = await fetch(`${this.baseURL}/api/analysis/pdf`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'PDF analysis failed');
      }

      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      throw new Error(`PDF analysis failed: ${error.message}`);
    }
  }

  // Analyze Graph with OpenAI
  async analyzeGraph(graphData) {
    // Wait for connection check to complete
    if (this.connectionPromise) {
      await this.connectionPromise;
    }

    if (!this.enabled) {
      throw new Error('Graph analysis requires the backend API');
    }

    try {
      const result = await this.request('/analysis/graph', {
        method: 'POST',
        body: {
          nodes: graphData.nodes,
          links: graphData.links
        }
      });

      return {
        success: true,
        data: result.data,
        message: result.message
      };
    } catch (error) {
      throw new Error(`Graph analysis failed: ${error.message}`);
    }
  }

  // Community Detection
  async detectCommunities(graphId, algorithm = 'modularity') {
    if (!this.enabled) {
      throw new Error('Community detection requires the backend API');
    }

    try {
      const result = await this.request('/analysis/communities', {
        method: 'POST',
        body: {
          graphId,
          algorithm
        }
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      throw new Error(`Community detection failed: ${error.message}`);
    }
  }

  // Local Fallback Methods (using existing client logic)
  getLocalGraph(options) {
    console.log('🔄 Using local graph data');
    
    // Get data from existing global variables or local storage
    if (window.currentGraph) {
      return {
        success: true,
        data: window.currentGraph,
        source: 'local'
      };
    }

    return {
      success: false,
      error: 'No local graph data available',
      data: { nodes: [], edges: [] }
    };
  }

  getLocalSubgraph(nodeId, depth) {
    console.log(`🔄 Creating local subgraph: ${nodeId} (depth: ${depth})`);
    
    if (!window.currentGraph) {
      return { success: false, data: { nodes: [], edges: [] } };
    }

    // Simple subgraph extraction logic
    const { nodes, edges } = window.currentGraph;
    const subNodes = new Set([nodeId]);
    const subEdges = [];

    // Expand by depth
    for (let d = 0; d < depth; d++) {
      const currentNodes = Array.from(subNodes);
      edges.forEach(edge => {
        if (currentNodes.includes(edge.source)) {
          subNodes.add(edge.target);
          subEdges.push(edge);
        } else if (currentNodes.includes(edge.target)) {
          subNodes.add(edge.source);
          subEdges.push(edge);
        }
      });
    }

    const subgraphNodes = nodes.filter(node => subNodes.has(node.id));

    return {
      success: true,
      data: { nodes: subgraphNodes, edges: subEdges },
      source: 'local'
    };
  }

  searchLocalNodes(query, options) {
    console.log(`🔍 Searching local nodes: ${query}`);
    
    if (!window.currentGraph) {
      return { success: false, data: [] };
    }

    const { nodes } = window.currentGraph;
    const searchResults = nodes.filter(node => {
      const matchesQuery = node.label.toLowerCase().includes(query.toLowerCase());
      const matchesType = !options.type || node.type === options.type;
      return matchesQuery && matchesType;
    });

    return {
      success: true,
      data: searchResults.slice(0, options.limit || 20),
      source: 'local'
    };
  }

  // Status Check Methods
  isEnabled() {
    return this.enabled;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      baseURL: this.baseURL,
      fallbackToLocal: this.fallbackToLocal
    };
  }

  // Settings Methods
  setFallbackMode(enabled) {
    this.fallbackToLocal = enabled;
  }

  setBaseURL(url) {
    this.baseURL = url;
    this.checkConnection();
  }
}

// Create global instance
window.backendAPI = new BackendAPI();

// Wrapper functions for compatibility with existing code
window.uploadToBackend = async (graphData, metadata) => {
  return window.backendAPI.uploadGraph(graphData, metadata);
};

window.searchBackend = async (query, options) => {
  return window.backendAPI.searchNodes(query, options);
};

window.analyzeWithBackend = async (analysisType, options) => {
  switch (analysisType) {
    case 'structure':
      return window.backendAPI.analyzeStructure(options.graphId, options);
    case 'communities':
      return window.backendAPI.detectCommunities(options.graphId, options.algorithm);
    default:
      throw new Error(`Unsupported analysis type: ${analysisType}`);
  }
};

async function getRichAIInsights(graphData) {
    console.log('Fetching rich AI insights from backend...');
    const response = await fetch(`${window.backendAPI.baseURL}/api/analysis/rich-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphData)
    });

    if (response.ok) {
        const result = await response.json();
        return result.data;
    } else {
        console.error('Failed to fetch rich AI insights');
        throw new Error(`Server responded with ${response.status}`);
    }
}

console.log('🔌 Backend API client loaded successfully');

// Module export (for ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackendAPI;
}