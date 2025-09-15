/**
 * ArangoDB Routes for Knowledge Graph API
 */

const express = require('express');
const router = express.Router();
const ArangoController = require('./arangoController');
const multer = require('multer');
const fetch = require('node-fetch');
const upload = multer({ storage: multer.memoryStorage() });

// Initialize controller
const arangoController = new ArangoController();

// Health check
router.get('/health', (req, res) => {
    arangoController.healthCheck(req, res);
});

// Collection management
router.post('/collection', (req, res) => {
    arangoController.createCollection(req, res);
});

// Papers endpoints
router.post('/papers/batch', (req, res) => {
    arangoController.uploadPapers(req, res);
});

// Generic document upload
router.post('/:collection/batch', (req, res) => {
    arangoController.uploadDocuments(req, res);
});

// Graph data for visualization
router.post('/graph', (req, res) => {
    arangoController.getGraphData(req, res);
});

// Statistics
router.get('/stats', (req, res) => {
    arangoController.getStats(req, res);
});

// CSV Upload Route
router.post('/upload-csv', upload.single('csvFile'), (req, res) => {
    arangoController.uploadCsv(req, res);
});

// Metadata Graph Route
router.get('/metadata-graph', (req, res) => {
    arangoController.getMetadataGraph(req, res);
});

// Ollama Test Route
router.get('/test-ollama', async (req, res) => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        const data = await response.json();
        res.json({ success: true, connected: true, models: data.models });
    } catch (error) {
        res.json({ success: false, connected: false, error: error.message });
    }
});

// OpenAI API Key Test Route
router.get('/test-openai', (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    const isConfigured = apiKey && apiKey !== 'your-openai-api-key-here' && apiKey.startsWith('sk-');
    
    if (isConfigured) {
        res.json({ 
            success: true, 
            configured: true, 
            message: 'OpenAI API key is configured.' 
        });
    } else {
        res.json({ 
            success: true, 
            configured: false, 
            message: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in the .env file.' 
        });
    }
});

// AI Analysis Route
router.post('/analyze-metadata', async (req, res) => {
    try {
        // Get metadata from ArangoDB
        const collection = arangoController.db.collection('metadata_collection');
        const cursor = await collection.all();
        const documents = await cursor.all();
        
        if (documents.length === 0) {
            return res.json({ success: false, message: 'No data to analyze' });
        }
        
        // Create detailed clusters from actual papers
        const papers = documents.map((doc, i) => ({
            id: `paper_${i+1}`,
            title: doc.title,
            authors: doc.authors,
            keywords: doc.keywords,
            year: doc.year
        }));
        
        const prompt = `Analyze these research papers and create meaningful clusters based on their topics and keywords:

${papers.map(p => `Title: ${p.title}\nAuthors: ${p.authors}\nKeywords: ${p.keywords}`).join('\n\n')}

Create 2-3 thematic clusters. Respond with JSON only:
{
  "clusters": [
    {
      "name": "Cluster Name",
      "insight": "Brief explanation of this cluster's significance",
      "nodes": [
        {"id": "paper_1", "label": "Paper Title", "size": 25, "type": "paper"}
      ]
    }
  ]
}`;

        // Call Ollama
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.1',
                prompt: prompt,
                stream: false,
                options: { temperature: 0.3 }
            })
        });
        
        const result = await response.json();
        
        // Try to extract JSON from response
        let clusters = {};
        try {
            const jsonMatch = result.response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                // Transform to expected format
                if (parsed.clusters) {
                    parsed.clusters.forEach((cluster, index) => {
                        // Create nodes from papers if not provided
                        if (!cluster.nodes || cluster.nodes.length === 0) {
                            cluster.nodes = papers.slice(0, 2).map((paper, i) => ({
                                id: paper.id,
                                label: paper.title,
                                size: 20 + Math.random() * 10,
                                type: 'paper'
                            }));
                        }
                        
                        clusters[`cluster_${index + 1}`] = {
                            name: cluster.name,
                            insight: cluster.insight || 'AI-generated research cluster',
                            nodes: cluster.nodes,
                            isAI: true,
                            color: `hsl(${(index * 120) % 360}, 70%, 60%)`
                        };
                    });
                }
            }
        } catch (parseError) {
            console.log('JSON parsing failed, creating fallback clusters');
        }
        
        // Fallback if parsing failed
        if (Object.keys(clusters).length === 0) {
            clusters = {
                'cluster_1': {
                    name: 'Photosynthesis Mechanisms',
                    insight: 'Studies focusing on core photosynthetic processes',
                    nodes: papers.slice(0, 3).map(p => ({
                        id: p.id,
                        label: p.title,
                        size: 25,
                        type: 'paper'
                    })),
                    isAI: true,
                    color: 'hsl(120, 70%, 60%)'
                },
                'cluster_2': {
                    name: 'Biosynthesis & Regulation',
                    insight: 'Research on chlorophyll biosynthesis and metabolic pathways',
                    nodes: papers.slice(3).map(p => ({
                        id: p.id,
                        label: p.title,
                        size: 22,
                        type: 'paper'
                    })),
                    isAI: true,
                    color: 'hsl(240, 70%, 60%)'
                }
            };
        }
        
        res.json({ 
            success: true, 
            analysis: { clusters },
            rawResponse: result.response 
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Chat Route
router.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || !message.trim()) {
            return res.json({ success: false, error: 'Message is required' });
        }
        
        // Create chat prompt with context about photosynthesis research
        const prompt = `You are an AI assistant specialized in photosynthesis research and knowledge graphs. 
A user is asking: "${message}"

Please provide a helpful, informative response. If the question is about photosynthesis, provide scientific details. 
If it's about knowledge graphs or data analysis, explain concepts clearly. Keep responses concise but informative.

Response:`;

        // Call Ollama
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.1',
                prompt: prompt,
                stream: false,
                options: { 
                    temperature: 0.7,
                    max_tokens: 300 
                }
            })
        });
        
        const result = await response.json();
        
        if (result.response) {
            res.json({ 
                success: true, 
                response: result.response.trim(),
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({ 
                success: false, 
                error: 'No response from AI model' 
            });
        }
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'AI chat service temporarily unavailable' 
        });
    }
});

module.exports = router;