const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const backend = String(process.argv[2] || '').toLowerCase();
if (!['neo4j', 'arango'].includes(backend)) {
  console.error('Usage: node scripts/run-graph-contract.js <neo4j|arango>');
  process.exit(2);
}

const jestCli = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const contractPath = path.join(__dirname, '..', 'tests', 'graph-backend-contract.contract.js');
const result = spawnSync(process.execPath, [jestCli, '--runInBand', '--testRegex', 'graph-backend-contract\\.contract\\.js$'], {
  stdio: 'inherit',
  env: { ...process.env, GRAPH_BACKEND: backend }
});

process.exit(result.status == null ? 1 : result.status);
