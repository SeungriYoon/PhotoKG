#!/usr/bin/env node

const { runCypher, rowsFromResult, fetchNeo4jMetadata } = require('../config/neo4j');

async function main() {
  try {
    const metadata = await fetchNeo4jMetadata();
    console.log('Neo4j metadata:', metadata);

    const [nodeStats, edgeStats] = await Promise.all([
      runCypher(`MATCH (n) RETURN count(n) AS nodeCount`),
      runCypher(`MATCH ()-[r]->() RETURN count(r) AS edgeCount`)
    ]);
    console.log('Neo4j stats:', {
      ...(rowsFromResult(nodeStats)[0] || {}),
      ...(rowsFromResult(edgeStats)[0] || {})
    });

    const query = process.env.NEO4J_TEST_QUERY || 'RBCS1A';
    const sampleSearch = await runCypher(`
      MATCH (n)
      WHERE any(text IN [
        coalesce(n.title, ''),
        coalesce(n.abstract, ''),
        coalesce(n.paper_id, ''),
        coalesce(n.name, ''),
        coalesce(n.symbol, ''),
        coalesce(n.agi, '')
      ] WHERE toLower(text) CONTAINS toLower($query))
      RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
      LIMIT 5
    `, { query });

    console.log(`Neo4j sample search for "${query}":`, JSON.stringify(rowsFromResult(sampleSearch), null, 2));
    console.log('✅ Neo4j connection test passed');
  } catch (error) {
    console.error('❌ Neo4j connection test failed');
    console.error(error);
    process.exitCode = 1;
  }
}

main();
