/**
 * Legacy ArangoDB document routes.
 *
 * Graph and AI operations are exposed through /api/graph and /api/analysis
 * so clients do not need to know which graph backend is active.
 */
const express = require('express');
const multer = require('multer');
const ArangoController = require('./arangoController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const arangoController = new ArangoController();

router.get('/health', (req, res) => arangoController.healthCheck(req, res));
router.post('/collection', (req, res) => arangoController.createCollection(req, res));
router.post('/papers/batch', (req, res) => arangoController.uploadPapers(req, res));
router.post('/:collection/batch', (req, res) => arangoController.uploadDocuments(req, res));
router.post('/graph', (req, res) => arangoController.getGraphData(req, res));
router.get('/stats', (req, res) => arangoController.getStats(req, res));
router.post('/upload-csv', upload.single('csvFile'), (req, res) => arangoController.uploadCsv(req, res));
router.get('/metadata-graph', (req, res) => arangoController.getMetadataGraph(req, res));

module.exports = router;
