const fetch = require('node-fetch');

function getNeo4jConfig() {
  const baseUrl = (process.env.NEO4J_URL || 'http://localhost:7474').replace(/\/+$/, '');

  return {
    baseUrl,
    database: process.env.NEO4J_DATABASE || 'neo4j',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  };
}

function buildAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

async function runCypher(statement, parameters = {}) {
  const { baseUrl, database, username, password } = getNeo4jConfig();
  const response = await fetch(`${baseUrl}/db/${encodeURIComponent(database)}/query/v2`, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(username, password),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      statement,
      parameters
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Neo4j query failed (${response.status}): ${text}`);
  }

  if (!text) {
    return { data: { fields: [], values: [] } };
  }

  return JSON.parse(text);
}

function rowsFromResult(result) {
  const fields = result?.data?.fields || [];
  const values = result?.data?.values || [];

  return values.map((row) => {
    const obj = {};
    fields.forEach((field, index) => {
      obj[field] = row[index];
    });
    return obj;
  });
}

async function fetchNeo4jMetadata() {
  const { baseUrl, username, password } = getNeo4jConfig();
  const response = await fetch(baseUrl, {
    headers: {
      Authorization: buildAuthHeader(username, password),
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Neo4j metadata request failed (${response.status}): ${text}`);
  }

  return JSON.parse(text);
}

module.exports = {
  getNeo4jConfig,
  runCypher,
  rowsFromResult,
  fetchNeo4jMetadata
};
