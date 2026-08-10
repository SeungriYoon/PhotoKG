const dbManager = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const MAX_GRAPH_ITEMS = 500;

function normalizeNode(node = {}) {
  const id = String(node._key || node.id || '').replace(/^nodes\//, '');
  return {
    id,
    label: node.label || node.name || node.title || id,
    type: node.type || 'node',
    size: node.size || 20,
    attributes: node.attributes || {},
    graph_id: node.graph_id,
    graph_source: node.graph_source,
    dataset: node.dataset
  };
}

function normalizeEdge(edge = {}) {
  const source = String(edge.source || edge._from || '').replace(/^nodes\//, '');
  const target = String(edge.target || edge._to || '').replace(/^nodes\//, '');
  return {
    id: String(edge._key || edge.id || `${source}->${target}`),
    source,
    target,
    type: edge.type || edge.relationship_type || 'RELATED_TO',
    relationship_type: edge.relationship_type || edge.type || 'RELATED_TO',
    weight: edge.weight || 1,
    attributes: edge.attributes || {},
    graph_id: edge.graph_id,
    graph_source: edge.graph_source,
    dataset: edge.dataset
  };
}

function normalizeLimit(value, fallback = 50) {
  return Math.min(MAX_GRAPH_ITEMS, Math.max(1, Number.parseInt(value, 10) || fallback));
}

function graphFilterConditions(filter = {}, variable) {
  const conditions = [];
  const bindVars = {};
  if (filter.nodeType || filter.type) {
    conditions.push(`${variable}.type == @nodeType`);
    bindVars.nodeType = filter.nodeType || filter.type;
  }
  if (filter.graphId) {
    conditions.push(`${variable}.graph_id == @graphId`);
    bindVars.graphId = filter.graphId;
  }
  if (filter.graphSource) {
    conditions.push(`${variable}.graph_source == @graphSource`);
    bindVars.graphSource = filter.graphSource;
  }
  if (filter.minSize != null && variable === 'node') {
    conditions.push(`${variable}.size >= @minSize`);
    bindVars.minSize = Number(filter.minSize);
  }
  if (filter.minWeight != null && variable === 'edge') {
    conditions.push(`${variable}.weight >= @minWeight`);
    bindVars.minWeight = Number(filter.minWeight);
  }
  return { clause: conditions.length ? `FILTER ${conditions.join(' AND ')}` : '', bindVars };
}

function graphInput(data = {}) {
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : (Array.isArray(data.edges) ? data.edges : [])
  };
}

function cleanDocument(value = {}) {
  const copy = { ...value };
  delete copy.id;
  delete copy._key;
  delete copy._id;
  delete copy._rev;
  return copy;
}

class ArangoGraphService {
  static async getDatabase() {
    if (!dbManager.isConnected()) await dbManager.connect();
    return dbManager.getDatabase();
  }

  static async testConnection() {
    const db = await this.getDatabase();
    const version = await db.version();
    return { connected: true, backend: 'arango', version: version.version, server: version.server };
  }

  static async getGraph(options = {}) {
    const db = await this.getDatabase();
    const limit = normalizeLimit(options.limit);
    const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
    const filter = options.filter || {};
    const nodeFilter = graphFilterConditions(filter, 'node');
    const edgeFilter = graphFilterConditions(filter, 'edge');
    const nodeQuery = `FOR node IN nodes ${nodeFilter.clause} LIMIT @offset, @limit RETURN node`;
    const edgeQuery = `
      FOR edge IN edges
      ${edgeFilter.clause}
      LET sourceExists = DOCUMENT(edge._from)
      LET targetExists = DOCUMENT(edge._to)
      FILTER sourceExists != null AND targetExists != null
      RETURN edge
    `;
    const countQuery = `FOR node IN nodes ${nodeFilter.clause} COLLECT WITH COUNT INTO totalCount RETURN totalCount`;
    const [nodeResult, edgeResult, countResult] = await Promise.all([
      db.query(nodeQuery, { ...nodeFilter.bindVars, offset, limit }),
      db.query(edgeQuery, edgeFilter.bindVars),
      db.query(countQuery, nodeFilter.bindVars)
    ]);
    const [nodes, links, counts] = await Promise.all([nodeResult.all(), edgeResult.all(), countResult.all()]);
    return { nodes: nodes.map(normalizeNode), links: links.map(normalizeEdge), totalCount: counts[0] || 0 };
  }

  static async getSubgraph(nodeId, depth = 1, options = {}) {
    const db = await this.getDatabase();
    const safeDepth = Math.min(5, Math.max(1, Number.parseInt(depth, 10) || 1));
    const filter = options || {};
    const vertexFilter = graphFilterConditions(filter, 'vertex');
    const center = await db.collection('nodes').document(String(nodeId));
    const query = `
      FOR vertex, edge, path IN 1..@depth ANY @startNode edges
      ${vertexFilter.clause}
      RETURN { vertex: vertex, edge: edge }
    `;
    const result = await db.query(query, {
      ...vertexFilter.bindVars,
      startNode: `nodes/${nodeId}`,
      depth: safeDepth
    });
    const rows = await result.all();
    const nodes = new Map([[String(nodeId), normalizeNode(center)]]);
    const links = new Map();
    rows.forEach(({ vertex, edge }) => {
      if (vertex) nodes.set(normalizeNode(vertex).id, normalizeNode(vertex));
      if (edge) {
        const normalized = normalizeEdge(edge);
        links.set(normalized.id, normalized);
      }
    });
    return { nodes: [...nodes.values()], links: [...links.values()] };
  }

  static async searchNodes(options = {}) {
    const db = await this.getDatabase();
    const queryText = String(options.query || '').toLowerCase();
    const limit = normalizeLimit(options.limit, 20);
    const filter = graphFilterConditions(options, 'node');
    const conditions = [`CONTAINS(LOWER(TO_STRING(node.label)), @query)`];
    if (filter.clause) conditions.push(filter.clause.replace(/^FILTER /, ''));
    const query = `FOR node IN nodes FILTER ${conditions.join(' AND ')} SORT node.size DESC LIMIT @limit RETURN node`;
    const result = await db.query(query, { ...filter.bindVars, query: queryText, limit });
    return (await result.all()).map(node => ({ ...normalizeNode(node), score: 1 }));
  }

  static async createGraph(data = {}) {
    const db = await this.getDatabase();
    const { nodes, links } = graphInput(data);
    const graphId = data.graphId || data.metadata?.graphId || uuidv4();
    const graphSource = data.graphSource || data.metadata?.graphSource;
    const now = new Date().toISOString();
    const metadata = {
      _key: graphId,
      ...(data.metadata || {}),
      created_at: now,
      node_count: nodes.length,
      edge_count: links.length
    };
    await db.collection('metadata').save(metadata, { overwriteMode: 'update' });
    for (const node of nodes) {
      const id = String(node.id || uuidv4());
      await db.collection('nodes').save({
        _key: id,
        label: node.label || id,
        size: node.size || 20,
        type: node.type || 'concept',
        attributes: node.attributes || {},
        graph_id: node.graph_id || graphId,
        graph_source: node.graph_source || graphSource,
        dataset: node.dataset,
        created_at: now
      }, { overwriteMode: 'update' });
    }
    for (const link of links) {
      const source = String(link.source);
      const target = String(link.target);
      await db.collection('edges').save({
        _key: String(link.id || uuidv4()),
        _from: `nodes/${source}`,
        _to: `nodes/${target}`,
        type: link.type || link.relationship_type || 'RELATED_TO',
        relationship_type: link.relationship_type || link.type || 'RELATED_TO',
        weight: link.weight || 1,
        attributes: link.attributes || {},
        graph_id: link.graph_id || graphId,
        graph_source: link.graph_source || graphSource,
        dataset: link.dataset,
        created_at: now
      }, { overwriteMode: 'update' });
    }
    return { graphId, nodes: nodes.length, edges: links.length, metadata };
  }

  static async mergeGraph(data = {}) {
    if (data.mergeStrategy === 'replace') await this.clearGraph();
    const { nodes, links } = graphInput(data);
    const db = await this.getDatabase();
    for (const node of nodes) {
      const id = String(node.id || uuidv4());
      const existing = await db.collection('nodes').document(id).catch(() => null);
      if (existing && data.mergeStrategy === 'update') {
        await db.collection('nodes').update(id, {
          ...cleanDocument(node),
          attributes: { ...(existing.attributes || {}), ...(node.attributes || {}) },
          updated_at: new Date().toISOString()
        });
      } else if (!existing) {
        await this.createGraph({ nodes: [{ ...node, id }], links: [], graphId: node.graph_id });
      }
    }
    for (const link of links) {
      const id = String(link.id || `${link.source}->${link.target}`);
      const existing = await db.collection('edges').document(id).catch(() => null);
      if (existing && data.mergeStrategy === 'update') {
        await db.collection('edges').update(id, { weight: (existing.weight || 0) + (link.weight || 1) });
      } else if (!existing) {
        await db.collection('edges').save({
          _key: id,
          _from: `nodes/${link.source}`,
          _to: `nodes/${link.target}`,
          type: link.type || link.relationship_type || 'RELATED_TO',
          relationship_type: link.relationship_type || link.type || 'RELATED_TO',
          weight: link.weight || 1,
          attributes: link.attributes || {},
          graph_id: link.graph_id,
          graph_source: link.graph_source,
          dataset: link.dataset,
          created_at: new Date().toISOString()
        }, { overwriteMode: 'update' });
      }
    }
    return { nodes: nodes.length, edges: links.length, strategy: data.mergeStrategy || 'append' };
  }

  static async getNode(nodeId) {
    const db = await this.getDatabase();
    try {
      return normalizeNode(await db.collection('nodes').document(String(nodeId)));
    } catch (error) {
      if (error.isArangoError && error.errorNum === 1202) return null;
      throw new Error(`Node lookup failed: ${error.message}`);
    }
  }

  static async updateNode(nodeId, updateData = {}) {
    const db = await this.getDatabase();
    const result = await db.collection('nodes').update(String(nodeId), cleanDocument({ ...updateData, updated_at: new Date().toISOString() }), { returnNew: true });
    return normalizeNode(result.new || await db.collection('nodes').document(String(nodeId)));
  }

  static async deleteNode(nodeId) {
    const db = await this.getDatabase();
    const nodeRef = `nodes/${nodeId}`;
    await db.query('FOR edge IN edges FILTER edge._from == @nodeRef OR edge._to == @nodeRef REMOVE edge IN edges', { nodeRef });
    try {
      await db.collection('nodes').remove(String(nodeId));
      return { id: String(nodeId), deleted: true };
    } catch (error) {
      if (error.isArangoError && error.errorNum === 1202) return { id: String(nodeId), deleted: false };
      throw new Error(`Node deletion failed: ${error.message}`);
    }
  }

  static async createEdge(edgeData = {}) {
    const db = await this.getDatabase();
    const id = String(edgeData.id || uuidv4());
    const result = await db.collection('edges').save({
      _key: id,
      _from: `nodes/${edgeData.source}`,
      _to: `nodes/${edgeData.target}`,
      type: edgeData.type || edgeData.relationship_type || 'RELATED_TO',
      relationship_type: edgeData.relationship_type || edgeData.type || 'RELATED_TO',
      weight: edgeData.weight || 1,
      attributes: edgeData.attributes || {},
      graph_id: edgeData.graph_id,
      graph_source: edgeData.graph_source,
      dataset: edgeData.dataset,
      created_at: new Date().toISOString()
    }, { returnNew: true });
    return normalizeEdge(result.new || result);
  }

  static async clearGraph() {
    const db = await this.getDatabase();
    await Promise.all([
      db.collection('nodes').truncate(),
      db.collection('edges').truncate(),
      db.collection('metadata').truncate()
    ]);
    return { message: 'Graph cleared successfully' };
  }
}

module.exports = ArangoGraphService;
