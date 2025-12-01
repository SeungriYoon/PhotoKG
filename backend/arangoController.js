/**
 * ArangoDB Controller for Enhanced Knowledge Graph Operations
 * Handles direct ArangoDB operations with photosynthesis domain specialization
 */

require('dotenv').config();
const { Database } = require('arangojs');

class ArangoController {
    constructor() {
        this.db = null;
        this.connected = false;
        this.config = {
            url: process.env.ARANGODB_URL || 'http://localhost:8529',
            databaseName: process.env.ARANGODB_DATABASE || 'knowledge_graph',
            auth: { 
                username: process.env.ARANGODB_USERNAME || 'root', 
                password: process.env.ARANGODB_PASSWORD || '' 
            }
        };
        
        this.collections = {
            papers: 'papers',
            authors: 'authors',
            journals: 'journals',
            fields: 'fields',
            keywords: 'keywords',
            gaps: 'gaps',
            novelties: 'novelties',
            methods: 'methods',
            // Edge collections
            author_paper_edges: 'author_paper_edges',
            journal_paper_edges: 'journal_paper_edges',
            field_paper_edges: 'field_paper_edges',
            keyword_paper_edges: 'keyword_paper_edges',
            gap_paper_edges: 'gap_paper_edges',
            novelty_paper_edges: 'novelty_paper_edges',
            method_paper_edges: 'method_paper_edges'
        };
        
        this.init();
    }

    // Initialize ArangoDB connection
    async init() {
        try {
            this.db = new Database(this.config);
            await this.db.acquireHostList();
            console.log('✅ ArangoDB controller initialized');
            this.connected = true;
            
            // Ensure collections exist
            await this.ensureCollections();
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.warn('⚠️  ArangoDB가 실행되지 않았습니다.');
                console.warn('   ArangoDB 없이도 기본 기능은 사용할 수 있습니다.');
                console.warn('   ArangoDB를 사용하려면:');
                console.warn('   1. Docker: docker run -p 8529:8529 -e ARANGO_ROOT_PASSWORD=yourpassword arangodb/arangodb:latest');
                console.warn('   2. 또는 ArangoDB를 직접 설치하세요: https://www.arangodb.com/download-major/');
            } else {
                console.error('❌ ArangoDB initialization failed:', error.message);
            }
            this.connected = false;
        }
    }

    // Health check endpoint
    async healthCheck(req, res) {
        try {
            if (!this.connected) {
                throw new Error('Not connected to ArangoDB');
            }
            
            const info = await this.db.get();
            res.json({
                success: true,
                message: 'ArangoDB connection healthy',
                database: info.name,
                collections: Object.keys(this.collections)
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Create collection if not exists
    async createCollection(req, res) {
        try {
            if (!this.connected || !this.db) {
                return res.status(503).json({
                    success: false,
                    message: 'ArangoDB is not connected. Please start ArangoDB to use this feature.'
                });
            }
            
            const { name, edge = false } = req.body;
            
            const collection = this.db.collection(name);
            const exists = await collection.exists();
            
            if (!exists) {
                await collection.create({ type: edge ? 3 : 2 }); // 3=edge, 2=document
                console.log(`✅ Collection ${name} created`);
            }
            
            res.json({
                success: true,
                message: `Collection ${name} ready`,
                exists: exists
            });
        } catch (error) {
            console.error('❌ Collection creation error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Batch upload papers
    async uploadPapers(req, res) {
        try {
            if (!this.connected || !this.db) {
                return res.status(503).json({
                    success: false,
                    message: 'ArangoDB is not connected. Please start ArangoDB to use this feature.'
                });
            }
            
            const { papers } = req.body;
            
            if (!papers || !Array.isArray(papers)) {
                throw new Error('Papers array is required');
            }

            const collection = this.db.collection(this.collections.papers);
            const result = await collection.saveAll(papers);
            
            const paperIds = result.map(doc => doc._id);
            
            res.json({
                success: true,
                message: `${papers.length} papers uploaded`,
                paper_ids: paperIds,
                inserted: result.length
            });
        } catch (error) {
            console.error('❌ Papers upload error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Batch upload documents to any collection
    async uploadDocuments(req, res) {
        try {
            if (!this.connected || !this.db) {
                return res.status(503).json({
                    success: false,
                    message: 'ArangoDB is not connected. Please start ArangoDB to use this feature.'
                });
            }
            
            const { documents } = req.body;
            const collectionName = req.params.collection;
            
            if (!documents || !Array.isArray(documents)) {
                throw new Error('Documents array is required');
            }

            const collection = this.db.collection(collectionName);
            const result = await collection.saveAll(documents, { 
                overwrite: false,
                returnNew: false 
            });
            
            res.json({
                success: true,
                message: `${documents.length} documents uploaded to ${collectionName}`,
                inserted: result.length
            });
        } catch (error) {
            console.error(`❌ Documents upload error for ${req.params.collection}:`, error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get graph data for visualization
    async getGraphData(req, res) {
        // Fallback for beginners: If not connected to DB, return sample data
        if (!this.connected) {
            console.log('⚠️ ArangoDB not connected. Returning sample graph for beginners.');
            return this.returnSampleGraph(res);
        }

        try {
            const filters = req.body || {};
            
            // Build query based on filters
            let query = `
                FOR paper IN papers
                    LIMIT ${filters.limit || 100}
                    
                    LET authors = (
                        FOR author IN authors
                            FILTER LENGTH(
                                FOR edge IN author_paper_edges
                                    FILTER edge._from == author._id AND edge._to == paper._id
                                    RETURN edge
                            ) > 0
                            RETURN author
                    )
                    
                    LET keywords = (
                        FOR keyword IN keywords
                            FILTER LENGTH(
                                FOR edge IN keyword_paper_edges
                                    FILTER edge._from == keyword._id AND edge._to == paper._id
                                    RETURN edge
                            ) > 0
                            RETURN keyword
                    )
                    
                    RETURN {
                        paper: paper,
                        authors: authors,
                        keywords: keywords
                    }
            `;

            const cursor = await this.db.query(query);
            const result = await cursor.all();
            
            // Transform to D3.js format
            const nodes = [];
            const links = [];
            const nodeMap = new Map();

            result.forEach(item => {
                const { paper, authors, keywords } = item;
                
                // Add paper node
                if (!nodeMap.has(paper._id)) {
                    nodes.push({
                        id: paper._id,
                        name: paper.title || 'Untitled',
                        type: 'paper',
                        size: 10,
                        color: '#3498db'
                    });
                    nodeMap.set(paper._id, true);
                }

                // Add author nodes and links
                authors.forEach(author => {
                    if (!nodeMap.has(author._id)) {
                        nodes.push({
                            id: author._id,
                            name: author.name,
                            type: 'author',
                            size: 8,
                            color: '#2ecc71'
                        });
                        nodeMap.set(author._id, true);
                    }
                    
                    links.push({
                        source: author._id,
                        target: paper._id,
                        type: 'authored',
                        weight: 1
                    });
                });

                // Add keyword nodes and links
                keywords.forEach(keyword => {
                    if (!nodeMap.has(keyword._id)) {
                        nodes.push({
                            id: keyword._id,
                            name: keyword.name,
                            type: 'keyword',
                            size: 6,
                            color: '#e74c3c'
                        });
                        nodeMap.set(keyword._id, true);
                    }
                    
                    links.push({
                        source: keyword._id,
                        target: paper._id,
                        type: 'contains',
                        weight: 1
                    });
                });
            });

            // If no nodes were found in DB, return a default sample graph
            if (nodes.length === 0) {
                return this.returnSampleGraph(res);
            }

            res.json({
                success: true,
                nodes: nodes,
                links: links,
                stats: {
                    total_nodes: nodes.length,
                    total_links: links.length,
                    papers: result.length
                }
            });
            
        } catch (error) {
            console.error('❌ Graph data retrieval error:', error.message);
            // If any DB error occurs, return sample data as a fallback
            return this.returnSampleGraph(res);
        }
    }

    // Helper function to return a sample graph
    returnSampleGraph(res) {
        console.log('⚠️ No data in ArangoDB or connection failed, returning sample graph.');
        const sampleNodes = [
            {id: 'ai', name: 'Artificial Intelligence', size: 50, type: 'concept'},
            {id: 'ml', name: 'Machine Learning', size: 45, type: 'concept'},
            {id: 'dl', name: 'Deep Learning', size: 40, type: 'concept'}
        ];
        const sampleLinks = [
            {source: 'ai', target: 'ml', weight: 8, type: 'subfield'},
            {source: 'ml', target: 'dl', weight: 7, type: 'subfield'}
        ];
        return res.json({
            success: true,
            nodes: sampleNodes,
            links: sampleLinks,
            stats: { total_nodes: sampleNodes.length, total_links: sampleLinks.length, papers: 0, message: 'Displaying sample data as database is empty or unavailable.' }
        });
    }

    // Ensure all required collections exist
    async ensureCollections() {
        try {
            // Node collections
            const nodeCollections = [
                'papers', 'authors', 'journals', 'fields', 
                'keywords', 'gaps', 'novelties', 'methods'
            ];

            // Edge collections
            const edgeCollections = [
                'author_paper_edges', 'journal_paper_edges', 'field_paper_edges',
                'keyword_paper_edges', 'gap_paper_edges', 'novelty_paper_edges', 'method_paper_edges'
            ];

            // Create node collections
            for (const name of nodeCollections) {
                const collection = this.db.collection(name);
                const exists = await collection.exists();
                if (!exists) {
                    await collection.create();
                    console.log(`✅ Created collection: ${name}`);
                }
            }

            // Create edge collections
            for (const name of edgeCollections) {
                const collection = this.db.edgeCollection(name);
                const exists = await collection.exists();
                if (!exists) {
                    await collection.create();
                    console.log(`✅ Created edge collection: ${name}`);
                }
            }

            console.log('✅ All collections ensured');
        } catch (error) {
            console.error('❌ Collection creation error:', error);
        }
    }

    // Get collection statistics
    async getStats(req, res) {
        try {
            if (!this.connected || !this.db) {
                return res.json({
                    success: true,
                    stats: {},
                    message: 'ArangoDB is not connected',
                    timestamp: new Date().toISOString()
                });
            }
            
            const stats = {};
            
            for (const [key, name] of Object.entries(this.collections)) {
                try {
                    const collection = this.db.collection(name);
                    const count = await collection.count();
                    stats[key] = count.count;
                } catch (error) {
                    stats[key] = 0;
                }
            }

            res.json({
                success: true,
                stats: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Stats retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Convert CSV metadata to graph format
    async getMetadataGraph(req, res) {
        try {
            if (!this.connected || !this.db) {
                return res.json({
                    success: true,
                    nodes: [],
                    links: [],
                    stats: { total_nodes: 0, total_links: 0, papers: 0 },
                    message: 'ArangoDB is not connected'
                });
            }
            
            // Get metadata documents
            const collection = this.db.collection('metadata_collection');
            const cursor = await collection.all();
            const documents = await cursor.all();
            
            if (documents.length === 0) {
                return res.json({
                    success: true,
                    nodes: [],
                    links: [],
                    stats: { total_nodes: 0, total_links: 0, papers: 0 },
                    message: 'No metadata found'
                });
            }
            
            // Convert to graph format
            const nodes = [];
            const links = [];
            const nodeMap = new Map();
            
            documents.forEach((doc, index) => {
                const paperId = `paper_${index}`;
                nodes.push({
                    id: paperId,
                    name: doc.title || 'Untitled',
                    type: 'paper',
                    size: 12,
                    color: '#3498db',
                    year: doc.year,
                    journal: doc.journal
                });
                nodeMap.set(paperId, true);
                
                // Add keyword nodes
                if (doc.keywords) {
                    const keywords = doc.keywords.split(',').map(k => k.trim());
                    keywords.forEach(keyword => {
                        const keywordId = `keyword_${keyword.toLowerCase().replace(/\s+/g, '_')}`;
                        
                        if (!nodeMap.has(keywordId)) {
                            nodes.push({
                                id: keywordId,
                                name: keyword,
                                type: 'keyword',
                                size: 8,
                                color: '#e74c3c'
                            });
                            nodeMap.set(keywordId, true);
                        }
                        
                        links.push({
                            source: paperId,
                            target: keywordId,
                            type: 'contains',
                            weight: 1
                        });
                    });
                }
                
                // Add author nodes
                if (doc.authors) {
                    const authors = doc.authors.split(';').map(a => a.trim());
                    authors.forEach(author => {
                        const authorId = `author_${author.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                        
                        if (!nodeMap.has(authorId)) {
                            nodes.push({
                                id: authorId,
                                name: author,
                                type: 'author',
                                size: 6,
                                color: '#2ecc71'
                            });
                            nodeMap.set(authorId, true);
                        }
                        
                        links.push({
                            source: authorId,
                            target: paperId,
                            type: 'authored',
                            weight: 1
                        });
                    });
                }
            });
            
            res.json({
                success: true,
                nodes: nodes,
                links: links,
                stats: {
                    total_nodes: nodes.length,
                    total_links: links.length,
                    papers: documents.length,
                    keywords: nodes.filter(n => n.type === 'keyword').length,
                    authors: nodes.filter(n => n.type === 'author').length
                }
            });
            
        } catch (error) {
            console.error('❌ Metadata graph conversion error:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Upload CSV data to ArangoDB
    async uploadCsv(req, res) {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
        }

        if (!this.connected || !this.db) {
            return res.status(503).json({
                success: false,
                message: 'ArangoDB is not connected. Please start ArangoDB to use CSV upload feature.'
            });
        }

        const documents = [];
        const collectionName = 'metadata_collection'; // Default collection for CSV uploads

        try {
            const stream = require('stream');
            const csv = require('csv-parser'); // Import csv-parser here

            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);

            bufferStream
                .pipe(csv())
                .on('data', (data) => documents.push(data))
                .on('end', async () => {
                    if (documents.length === 0) {
                        return res.status(400).json({ success: false, message: 'CSV file is empty or could not be parsed.' });
                    }

                    try {
                        // Ensure the target collection exists
                        const collection = this.db.collection(collectionName);
                        const exists = await collection.exists();
                        if (!exists) {
                            await collection.create();
                            console.log(`✅ Created collection: ${collectionName}`);
                        }

                        const result = await collection.saveAll(documents);
                        res.json({
                            success: true,
                            message: `${documents.length} documents uploaded to ${collectionName} from CSV.`,
                            inserted: result.length
                        });
                    } catch (dbError) {
                        console.error('❌ ArangoDB CSV upload error:', dbError);
                        res.status(500).json({ success: false, message: 'Failed to save CSV data to database.', error: dbError.message });
                    }
                })
                .on('error', (error) => {
                    console.error('❌ CSV parsing error:', error);
                    res.status(500).json({ success: false, message: 'Failed to parse CSV file.', error: error.message });
                });

        } catch (error) {
            console.error('❌ CSV upload general error:', error);
            res.status(500).json({ success: false, message: 'An unexpected error occurred during CSV upload.', error: error.message });
        }
    }
}

module.exports = ArangoController;