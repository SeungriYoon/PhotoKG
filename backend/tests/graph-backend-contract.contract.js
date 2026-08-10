const assert = require('assert');
const GraphService = require('../services/GraphService');

const backend = GraphService.getBackendName();
const suffix = `${backend}-${Date.now()}`;
const graphId = `contract-${suffix}`;
const nodeA = `contract-a-${suffix}`;
const nodeB = `contract-b-${suffix}`;
const nodeC = `contract-c-${suffix}`;
const edgeId = `contract-edge-${suffix}`;
let connectionReady = false;

function assertNode(node, expectedId) {
  assert.ok(node);
  assert.strictEqual(node.id, expectedId);
  assert.ok(typeof node.label === 'string');
  assert.ok(typeof node.attributes === 'object');
}

function assertLink(link) {
  assert.ok(link);
  assert.ok(typeof link.id === 'string');
  assert.ok(typeof link.source === 'string');
  assert.ok(typeof link.target === 'string');
  assert.ok(typeof link.type === 'string');
  assert.ok(typeof link.attributes === 'object');
}

describe(`GraphService ${backend} contract`, () => {
  afterAll(async () => {
    if (!connectionReady) return;
    await GraphService.deleteNode(nodeA).catch(() => {});
    await GraphService.deleteNode(nodeB).catch(() => {});
    await GraphService.deleteNode(nodeC).catch(() => {});
  });

  test('supports the common graph lifecycle and response shape', async () => {
    const health = await GraphService.testConnection();
    connectionReady = true;
    assert.strictEqual(health.connected, true);
    assert.strictEqual(health.backend, backend);

    const created = await GraphService.createGraph({
      graphId,
      graphSource: 'contract-test',
      nodes: [
        { id: nodeA, label: 'Photosynthesis contract source', type: 'process', size: 40, attributes: { role: 'source' } },
        { id: nodeB, label: 'Chloroplast contract target', type: 'structure', size: 25, attributes: { role: 'target' } }
      ],
      links: [{ id: edgeId, source: nodeA, target: nodeB, type: 'occurs_in', weight: 3, attributes: { evidence: 'contract' } }],
      metadata: { test: true }
    });
    assert.strictEqual(created.nodes, 2);
    assert.strictEqual(created.edges, 1);

    const graph = await GraphService.getGraph({ limit: 50, filter: { graphId } });
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.links));
    assertNode(graph.nodes.find(node => node.id === nodeA), nodeA);
    assertNode(graph.nodes.find(node => node.id === nodeB), nodeB);
    assertLink(graph.links.find(link => link.id === edgeId));

    const search = await GraphService.searchNodes({ query: 'photosynthesis contract', graphId, limit: 10 });
    assertNode(search.find(node => node.id === nodeA), nodeA);

    assertNode(await GraphService.getNode(nodeA), nodeA);
    const updated = await GraphService.updateNode(nodeA, { label: 'Updated contract source', size: 45 });
    assert.strictEqual(updated.label, 'Updated contract source');
    assert.strictEqual(updated.size, 45);

    const subgraph = await GraphService.getSubgraph(nodeA, 1, { graphId });
    assert.ok(Array.isArray(subgraph.nodes));
    assert.ok(Array.isArray(subgraph.links));
    assertNode(subgraph.nodes.find(node => node.id === nodeB), nodeB);
    assertLink(subgraph.links[0]);

    const addedEdge = await GraphService.createEdge({ id: `contract-edge-2-${suffix}`, source: nodeB, target: nodeA, type: 'supports', weight: 2, attributes: { reverse: true } });
    assertLink(addedEdge);
    assert.strictEqual(addedEdge.source, nodeB);
    assert.strictEqual(addedEdge.target, nodeA);

    const merged = await GraphService.mergeGraph({
      mergeStrategy: 'append',
      nodes: [{ id: nodeC, label: 'Contract addition', type: 'concept', attributes: {} }],
      links: []
    });
    assert.strictEqual(merged.strategy, 'append');
    assertNode(await GraphService.getNode(nodeC), nodeC);

    const deleted = await GraphService.deleteNode(nodeB);
    assert.strictEqual(deleted.deleted, true);
    assert.strictEqual(await GraphService.getNode(nodeB), null);
  }, 120000);
});
