const ArangoGraphService = require('./ArangoGraphService');
const Neo4jGraphService = require('./Neo4jGraphService');

const BACKENDS = {
  arango: ArangoGraphService,
  neo4j: Neo4jGraphService
};

class GraphService {
  static getBackendName() {
    const configured = String(process.env.GRAPH_BACKEND || 'neo4j').trim().toLowerCase();
    return BACKENDS[configured] ? configured : 'neo4j';
  }

  static getBackend() {
    return BACKENDS[this.getBackendName()];
  }

  static getBackendInfo() {
    return {
      backend: this.getBackendName(),
      service: this.getBackend().name
    };
  }

  static async testConnection() {
    return this.getBackend().testConnection();
  }

  static async getGraph(options = {}) {
    return this.getBackend().getGraph(options);
  }

  static async getSubgraph(nodeId, depth = 1, options = {}) {
    return this.getBackend().getSubgraph(nodeId, depth, options);
  }

  static async searchNodes(options = {}) {
    return this.getBackend().searchNodes(options);
  }

  static async createGraph(data) {
    return this.getBackend().createGraph(data);
  }

  static async mergeGraph(data) {
    return this.getBackend().mergeGraph(data);
  }

  static async getNode(nodeId) {
    return this.getBackend().getNode(nodeId);
  }

  static async updateNode(nodeId, updateData) {
    return this.getBackend().updateNode(nodeId, updateData);
  }

  static async deleteNode(nodeId) {
    return this.getBackend().deleteNode(nodeId);
  }

  static async createEdge(edgeData) {
    return this.getBackend().createEdge(edgeData);
  }

  static async clearGraph() {
    return this.getBackend().clearGraph();
  }
}

module.exports = GraphService;
