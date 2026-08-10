const { randomUUID } = require('crypto');
const { runCypher, rowsFromResult, fetchNeo4jMetadata } = require('../config/neo4j');

const MAX_GRAPH_ITEMS = 500;

function safeJsonParse(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (_error) { return { value }; }
}

function serializeProperties(input = {}) {
  const properties = { ...input };
  delete properties.id;
  delete properties._key;
  if (properties.attributes !== undefined) {
    properties.attributes_json = JSON.stringify(properties.attributes || {});
    delete properties.attributes;
  }
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => (
    value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  )));
}

function normalizeNode(row = {}) {
  const props = row.properties || {};
  const labels = row.labels || [];
  const id = String(row.id || props.id || '');
  return {
    id,
    label: props.label || props.title || props.name || props.symbol || props.paper_id || labels[0] || id,
    type: props.type || labels[0] || 'node',
    size: props.size || 20,
    attributes: safeJsonParse(props.attributes_json || props.attributes),
    graph_id: props.graph_id,
    graph_source: props.graph_source,
    dataset: props.dataset
  };
}

function normalizeEdge(row = {}) {
  const props = row.properties || {};
  const source = String(row.source || '');
  const target = String(row.target || '');
  return {
    id: String(row.id || props.id || `${source}->${target}`),
    source,
    target,
    type: props.type || props.relationship_type || row.type || 'RELATED_TO',
    relationship_type: props.relationship_type || props.type || row.type || 'RELATED_TO',
    weight: props.weight || 1,
    attributes: safeJsonParse(props.attributes_json || props.attributes),
    graph_id: props.graph_id,
    graph_source: props.graph_source,
    dataset: props.dataset
  };
}

function normalizeLimit(value, fallback = 50) {
  return Math.min(MAX_GRAPH_ITEMS, Math.max(1, Number.parseInt(value, 10) || fallback));
}

function nodeFilterConditions(filter = {}, variable = 'n') {
  const conditions = [];
  const parameters = {};
  if (filter.nodeType || filter.type) {
    conditions.push(`${variable}.type = $nodeType`);
    parameters.nodeType = filter.nodeType || filter.type;
  }
  if (filter.graphId) {
    conditions.push(`${variable}.graph_id = $graphId`);
    parameters.graphId = filter.graphId;
  }
  if (filter.graphSource) {
    conditions.push(`${variable}.graph_source = $graphSource`);
    parameters.graphSource = filter.graphSource;
  }
  if (filter.minSize != null && variable === 'n') {
    conditions.push(`coalesce(${variable}.size, 0) >= $minSize`);
    parameters.minSize = Number(filter.minSize);
  }
  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', parameters };
}

function graphInput(data = {}) {
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : (Array.isArray(data.edges) ? data.edges : [])
  };
}

function nodeRowQuery(variable = 'n') {
  return `RETURN ${variable}.id AS id, properties(${variable}) AS properties, labels(${variable}) AS labels`;
}

function graphParameters(data = {}) {
  const { nodes, links } = graphInput(data);
  const graphId = data.graphId || data.metadata?.graphId || randomUUID();
  const graphSource = data.graphSource || data.metadata?.graphSource;
  return {
    graphId,
    nodes: nodes.map((node, index) => ({
      id: String(node.id || `node-${index}-${Date.now()}`),
      properties: serializeProperties({ ...node, graph_id: node.graph_id || graphId, graph_source: node.graph_source || graphSource })
    })),
    links: links.map((link, index) => ({
      id: String(link.id || `${link.source}->${link.target}-${index}`),
      source: String(link.source),
      target: String(link.target),
      properties: serializeProperties({
        ...link,
        relationship_type: link.relationship_type || link.type || 'RELATED_TO',
        graph_id: link.graph_id || graphId,
        graph_source: link.graph_source || graphSource
      })
    }))
  };
}

class Neo4jGraphService {
  static async testConnection() {
    const metadata = await fetchNeo4jMetadata();
    return { connected: true, backend: 'neo4j', version: metadata.version, server: metadata.edition || metadata.server };
  }

  static async getGraph(options = {}) {
    const limit = normalizeLimit(options.limit);
    const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
    const filter = options.filter || {};
    const nodeFilter = nodeFilterConditions(filter);
    const edgeConditions = [];
    const edgeParams = { ...nodeFilter.parameters };
    if (filter.graphId) edgeConditions.push('r.graph_id = $graphId');
    if (filter.graphSource) edgeConditions.push('r.graph_source = $graphSource');
    if (filter.minWeight != null) { edgeConditions.push('coalesce(r.weight, 0) >= $minWeight'); edgeParams.minWeight = Number(filter.minWeight); }
    const edgeWhere = edgeConditions.length ? `WHERE ${edgeConditions.join(' AND ')}` : '';
    const [nodeResult, edgeResult, countResult] = await Promise.all([
      runCypher(`MATCH (n) ${nodeFilter.clause} RETURN n.id AS id, properties(n) AS properties, labels(n) AS labels ORDER BY n.size DESC SKIP $offset LIMIT $limit`, { ...nodeFilter.parameters, offset, limit }),
      runCypher(`MATCH (source)-[r]->(target) ${edgeWhere} RETURN r.id AS id, source.id AS source, target.id AS target, type(r) AS type, properties(r) AS properties`, edgeParams),
      runCypher(`MATCH (n) ${nodeFilter.clause} RETURN count(n) AS totalCount`, nodeFilter.parameters)
    ]);
    return {
      nodes: rowsFromResult(nodeResult).map(normalizeNode),
      links: rowsFromResult(edgeResult).map(normalizeEdge),
      totalCount: Number(rowsFromResult(countResult)[0]?.totalCount || 0)
    };
  }

  static async searchNodes(options = {}) {
    const query = String(options.query || '').toLowerCase();
    const limit = normalizeLimit(options.limit, 20);
    const filter = nodeFilterConditions(options);
    const condition = filter.clause ? `${filter.clause} AND ` : 'WHERE ';
    const result = await runCypher(`MATCH (n) ${condition}toLower(n.label) CONTAINS $query RETURN n.id AS id, properties(n) AS properties, labels(n) AS labels ORDER BY n.size DESC LIMIT $limit`, { ...filter.parameters, query, limit });
    return rowsFromResult(result).map(row => ({ ...normalizeNode(row), score: 1 }));
  }

  static async getSubgraph(nodeId, depth = 1, options = {}) {
    const safeDepth = Math.min(5, Math.max(1, Number.parseInt(depth, 10) || 1));
    const filter = nodeFilterConditions(options, 'start');
    const parameters = { ...filter.parameters, nodeId: String(nodeId) };
    const [nodeResult, linkResult] = await Promise.all([
      runCypher(`
        MATCH (start {id: $nodeId}) ${filter.clause}
        OPTIONAL MATCH (start)-[*1..${safeDepth}]-(neighbor)
        WITH collect(DISTINCT start) + collect(DISTINCT neighbor) AS graphNodes
        UNWIND graphNodes AS node
        RETURN collect(DISTINCT {id: node.id, properties: properties(node), labels: labels(node)}) AS nodes
      `, parameters),
      runCypher(`
        MATCH (start {id: $nodeId}) ${filter.clause}
        MATCH path = (start)-[*1..${safeDepth}]-(neighbor)
        UNWIND relationships(path) AS relation
        RETURN collect(DISTINCT {id: relation.id, source: startNode(relation).id, target: endNode(relation).id, type: type(relation), properties: properties(relation)}) AS links
      `, parameters)
    ]);
    const nodeRow = rowsFromResult(nodeResult)[0] || { nodes: [] };
    const linkRow = rowsFromResult(linkResult)[0] || { links: [] };
    return {
      nodes: (nodeRow.nodes || []).map(node => normalizeNode(node)),
      links: (linkRow.links || []).map(normalizeEdge)
    };
  }

  static async createGraph(data = {}) {
    const parameters = graphParameters(data);
    await runCypher(`UNWIND $nodes AS node MERGE (n:KGNode {id: node.id}) SET n += node.properties`, { nodes: parameters.nodes });
    await runCypher(`UNWIND $links AS link MATCH (source:KGNode {id: link.source}), (target:KGNode {id: link.target}) MERGE (source)-[r:RELATIONSHIP {id: link.id}]->(target) SET r += link.properties`, { links: parameters.links });
    return { graphId: parameters.graphId, nodes: parameters.nodes.length, edges: parameters.links.length, metadata: data.metadata || {} };
  }

  static async mergeGraph(data = {}) {
    if (data.mergeStrategy === 'replace') await this.clearGraph();
    const parameters = graphParameters(data);
    const strategy = data.mergeStrategy || 'append';
    const nodeSet = strategy === 'append' ? 'ON CREATE SET n += node.properties' : 'SET n += node.properties';
    await runCypher(`UNWIND $nodes AS node MERGE (n:KGNode {id: node.id}) ${nodeSet}`, { nodes: parameters.nodes });
    if (strategy === 'update') {
      await runCypher(`UNWIND $links AS link MATCH (source:KGNode {id: link.source}), (target:KGNode {id: link.target}) MERGE (source)-[r:RELATIONSHIP {id: link.id}]->(target) WITH r, link, coalesce(r.weight, 0) AS previousWeight SET r += link.properties, r.weight = previousWeight + coalesce(link.properties.weight, 1)`, { links: parameters.links });
    } else {
      await runCypher(`UNWIND $links AS link MATCH (source:KGNode {id: link.source}), (target:KGNode {id: link.target}) MERGE (source)-[r:RELATIONSHIP {id: link.id}]->(target) ON CREATE SET r += link.properties`, { links: parameters.links });
    }
    return { graphId: parameters.graphId, nodes: parameters.nodes.length, edges: parameters.links.length, strategy, metadata: data.metadata || {} };
  }

  static async getNode(nodeId) {
    const result = await runCypher(`MATCH (n {id: $nodeId}) RETURN n.id AS id, properties(n) AS properties, labels(n) AS labels`, { nodeId: String(nodeId) });
    const row = rowsFromResult(result)[0];
    return row ? normalizeNode(row) : null;
  }

  static async updateNode(nodeId, updateData = {}) {
    const properties = serializeProperties(updateData);
    const result = await runCypher(`MATCH (n {id: $nodeId}) SET n += $properties RETURN n.id AS id, properties(n) AS properties, labels(n) AS labels`, { nodeId: String(nodeId), properties });
    const row = rowsFromResult(result)[0];
    return row ? normalizeNode(row) : null;
  }

  static async deleteNode(nodeId) {
    const result = await runCypher(`MATCH (n {id: $nodeId}) WITH n, count(n) AS deleted DETACH DELETE n RETURN deleted`, { nodeId: String(nodeId) });
    return { id: String(nodeId), deleted: Number(rowsFromResult(result)[0]?.deleted || 0) > 0 };
  }

  static async createEdge(edgeData = {}) {
    const properties = serializeProperties({
      ...edgeData,
      relationship_type: edgeData.relationship_type || edgeData.type || 'RELATED_TO'
    });
    const id = String(edgeData.id || `${edgeData.source}->${edgeData.target}-${Date.now()}`);
    const result = await runCypher(`MATCH (source {id: $source}), (target {id: $target}) MERGE (source)-[r:RELATIONSHIP {id: $id}]->(target) SET r += $properties RETURN r.id AS id, source.id AS source, target.id AS target, type(r) AS type, properties(r) AS properties`, { source: String(edgeData.source), target: String(edgeData.target), id, properties });
    const row = rowsFromResult(result)[0];
    if (!row) throw new Error('Source or target node not found');
    return normalizeEdge(row);
  }

  static async clearGraph() {
    await runCypher('MATCH (n) DETACH DELETE n');
    return { message: 'Graph cleared successfully' };
  }
}

module.exports = Neo4jGraphService;
