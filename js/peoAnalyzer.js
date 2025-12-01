/**
 * PEO Coverage Analyzer
 * JavaScript port of figure_DomainCoverageandTemporalTrends_analysis_0915.py
 * Analyzes coverage by category and temporal trends for photosynthesis research
 */

class PEOCoverageAnalyzer {
    constructor(options = {}) {
        this.domainKeywords = this._getPhotosynthesisKeywords();
        this.data = null;
        this.results = {
            coverage: {},
            temporal: {}
        };

        // Configuration options
        this.options = {
            batchSize: options.batchSize || 1000,
            timeoutMs: options.timeoutMs || 300000, // 5 minutes
            enableCache: options.enableCache !== false,
            ...options
        };

        // Pre-compiled regex patterns for performance
        this.compiledPatterns = this._compilePatterns();

        // Color scheme for PEO categories (matching Python version)
        this.categoryColors = {
            'Plant Science': '#8DD3C7',
            'Genetics': '#FFFFB3',
            'Molecular Biology': '#BEBADA',
            'Physiology': '#FB8072',
            'Biotechnology': '#80B1D3',
            'Biophysics': '#FDB462',
            'Ecology & Env.': '#B3DE69',
            'Systems Biology': '#FCCDE5'
        };

        // Progress tracking
        this.progressCallback = options.progressCallback || null;
    }

    _getPhotosynthesisKeywords() {
        return {
            'Plant Science': [
                'plant', 'crop', 'agriculture', 'leaf', 'stem', 'root', 'flower',
                'growth', 'development', 'germination', 'seed', 'fruit', 'yield',
                'drought', 'stress', 'resistance', 'tolerance', 'adaptation'
            ],
            'Genetics': [
                'gene', 'genetic', 'genome', 'dna', 'rna', 'mutation', 'allele',
                'transgenic', 'crispr', 'genome editing', 'qtl', 'gwas',
                'expression', 'regulation', 'transcription', 'inheritance'
            ],
            'Molecular Biology': [
                'molecular', 'protein', 'structure', 'crystallography',
                'biochemistry', 'molecular dynamics', 'binding',
                'interaction', 'complex formation'
            ],
            'Physiology': [
                'physiology', 'metabolism', 'enzyme', 'biochemical', 'pathway',
                'transport', 'osmotic', 'water relation', 'nutrient',
                'hormone', 'signal transduction', 'cellular'
            ],
            'Biotechnology': [
                'biotechnology', 'engineering', 'synthetic', 'artificial',
                'bioengineering', 'directed evolution', 'protein design',
                'metabolic engineering'
            ],
            'Biophysics': [
                'biophysics', 'quantum', 'energy transfer', 'fluorescence',
                'spectroscopy', 'electron transport', 'thermodynamics',
                'kinetics', 'modeling', 'simulation', 'physics'
            ],
            'Ecology & Env.': [
                'ecology', 'ecosystem', 'environment', 'climate', 'carbon cycle',
                'global warming', 'atmospheric', 'field study', 'natural',
                'biodiversity', 'competition', 'adaptation', 'environmental science',
                'pollution', 'conservation', 'ecophysiology'
            ],
            'Systems Biology': [
                'systems biology', 'computational', 'bioinformatics', 'machine learning',
                'algorithm', 'database', 'prediction', 'modeling',
                'artificial intelligence', 'data mining', 'network analysis',
                'omics', 'integration', 'simulation'
            ]
        };
    }

    loadData(papers) {
        console.log('📊 Loading PEO analysis data...');

        if (!Array.isArray(papers)) {
            throw new Error('Papers data must be an array');
        }

        // Filter papers with required fields and valid years
        const validPapers = [];
        let skippedCount = 0;

        for (const paper of papers) {
            // Validate paper has content
            if (!paper.title && !paper.abstract) {
                skippedCount++;
                continue;
            }

            // Validate and parse year
            const yearStr = paper.pub_year || paper.year || paper.publication_year;
            const year = parseInt(yearStr);

            if (isNaN(year) || year < 1995 || year > 2025) {
                skippedCount++;
                continue;
            }

            validPapers.push({
                title: paper.title || '',
                abstract: paper.abstract || '',
                pub_year: year,
                original_index: validPapers.length
            });
        }

        this.data = validPapers;

        console.log(`✅ Loaded ${this.data.length} papers from 1995-2025 (skipped: ${skippedCount})`);

        if (this.data.length === 0) {
            throw new Error('No valid papers found in the dataset');
        }

        return this.data;
    }

    preprocessText(text) {
        if (!text || text === '' || text === null || text === undefined) return '';

        try {
            return text.toString()
                .toLowerCase()
                .replace(/[^\w\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        } catch (error) {
            console.warn('Text preprocessing failed:', error);
            return '';
        }
    }

    _compilePatterns() {
        const patterns = {};
        for (const [category, keywords] of Object.entries(this.domainKeywords)) {
            patterns[category] = keywords.map(kw =>
                new RegExp('\\b' + kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
            );
        }
        return patterns;
    }

    checkKeywordsBatch(texts, category) {
        if (!this.compiledPatterns[category]) {
            console.warn(`No patterns found for category: ${category}`);
            return new Array(texts.length).fill(false);
        }

        const patterns = this.compiledPatterns[category];
        const batchSize = this.options.batchSize;
        const results = [];

        // Process in batches for better memory management
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchResults = batch.map(text => {
                const processedText = this.preprocessText(text);
                if (!processedText) return false;
                return patterns.some(pattern => pattern.test(processedText));
            });
            results.push(...batchResults);

            // Update progress if callback provided
            if (this.progressCallback) {
                const progress = Math.min(100, (i + batchSize) / texts.length * 100);
                this.progressCallback({
                    stage: 'keyword_matching',
                    category: category,
                    progress: progress
                });
            }
        }

        return results;
    }

    analyzeCoverage() {
        console.log('🔍 Analyzing Panel A: Category Coverage...');
        
        if (!this.data || this.data.length === 0) {
            throw new Error('Data not loaded. Please call loadData() first.');
        }

        const totalPapers = this.data.length;
        const coverageResults = {};
        const searchTexts = this.data.map(paper => 
            `${paper.title || ''} ${paper.abstract || ''}`.trim()
        );

        for (const [category, keywords] of Object.entries(this.domainKeywords)) {
            try {
                const matches = this.checkKeywordsBatch(searchTexts, category);
                const papersWithCategory = matches.filter(Boolean).length;
                const coveragePercentage = totalPapers > 0 ? (papersWithCategory / totalPapers) * 100 : 0;

                coverageResults[category] = {
                    papers_count: papersWithCategory,
                    coverage_percentage: coveragePercentage,
                    keyword_count: keywords.length,
                    analysis_timestamp: new Date().toISOString()
                };

                console.log(`  - ${category}: ${coveragePercentage.toFixed(1)}% (${papersWithCategory.toLocaleString()}/${totalPapers.toLocaleString()})`);

            } catch (error) {
                console.error(`Error analyzing category ${category}:`, error);
                coverageResults[category] = {
                    papers_count: 0,
                    coverage_percentage: 0,
                    error: error.message,
                    analysis_timestamp: new Date().toISOString()
                };
            }
        }

        this.results.coverage = coverageResults;
        return coverageResults;
    }

    analyzeTemporalTrends() {
        console.log('📈 Analyzing Panel B: Temporal Trends...');
        
        if (!this.data || this.data.length === 0) {
            throw new Error('Data not loaded. Please call loadData() first.');
        }

        const periods = [
            { name: "1995-1999", start: 1995, end: 1999 },
            { name: "2000-2004", start: 2000, end: 2004 },
            { name: "2005-2009", start: 2005, end: 2009 },
            { name: "2010-2014", start: 2010, end: 2014 },
            { name: "2015-2019", start: 2015, end: 2019 },
            { name: "2020-2025", start: 2020, end: 2025 }
        ];

        const temporalResults = {};
        const periodPapersCount = [];
        const periodCategoryCounts = {};

        for (const period of periods) {
            const periodData = this.data.filter(paper => 
                paper.pub_year >= period.start && paper.pub_year <= period.end
            );

            if (periodData.length === 0) {
                periodPapersCount.push(0);
                periodCategoryCounts[period.name] = {};
                continue;
            }

            const periodTexts = periodData.map(paper => 
                `${paper.title || ''} ${paper.abstract || ''}`.trim()
            );
            
            const categoryCounts = {};
            for (const [category, keywords] of Object.entries(this.domainKeywords)) {
                try {
                    const matches = this.checkKeywordsBatch(periodTexts, category);
                    categoryCounts[category] = matches.filter(Boolean).length;
                } catch (error) {
                    console.error(`Error analyzing category ${category} for period ${period.name}:`, error);
                    categoryCounts[category] = 0;
                }
            }

            periodPapersCount.push(periodData.length);
            periodCategoryCounts[period.name] = categoryCounts;
            
            console.log(`  - ${period.name}: ${periodData.length.toLocaleString()} papers`);
        }

        temporalResults.period_names = periods.map(p => p.name);
        temporalResults.total_papers_timeline = periodPapersCount;
        temporalResults.category_counts_timeline = periodCategoryCounts;
        
        this.results.temporal = temporalResults;
        return temporalResults;
    }

    generateVisualizationData() {
        if (!this.results.coverage || !this.results.temporal) {
            throw new Error('Analysis not completed. Please run analyzeCoverage() and analyzeTemporalTrends() first.');
        }

        // Panel A: Coverage data for chart
        const coverageData = Object.entries(this.results.coverage)
            .sort((a, b) => a[1].coverage_percentage - b[1].coverage_percentage)
            .map(([category, data]) => ({
                category,
                percentage: data.coverage_percentage,
                count: data.papers_count,
                color: this.categoryColors[category] || '#CCCCCC'
            }));

        // Panel B: Temporal trends data for chart
        const temporalData = {
            periods: this.results.temporal.period_names,
            totalPapers: this.results.temporal.total_papers_timeline,
            categories: Object.keys(this.domainKeywords),
            categoryData: Object.keys(this.domainKeywords).map(category => ({
                name: category,
                color: this.categoryColors[category],
                data: this.results.temporal.period_names.map(period => 
                    this.results.temporal.category_counts_timeline[period]?.[category] || 0
                )
            }))
        };

        return {
            coverage: coverageData,
            temporal: temporalData,
            summary: {
                totalPapers: this.data.length,
                timeRange: '1995-2025',
                categories: Object.keys(this.domainKeywords).length
            }
        };
    }

    async runFullAnalysis(papers, options = {}) {
        const startTime = Date.now();
        let analysisTimeout;

        try {
            console.log('🚀 Starting PEO Coverage Analysis...');

            // Set timeout for analysis
            if (this.options.timeoutMs > 0) {
                analysisTimeout = setTimeout(() => {
                    throw new Error(`Analysis timeout after ${this.options.timeoutMs}ms`);
                }, this.options.timeoutMs);
            }

            // Progress tracking
            const updateProgress = (stage, progress) => {
                if (this.progressCallback) {
                    this.progressCallback({ stage, progress, elapsed: Date.now() - startTime });
                }
            };

            updateProgress('loading', 0);
            this.loadData(papers);
            updateProgress('loading', 100);

            updateProgress('coverage_analysis', 0);
            const coverage = this.analyzeCoverage();
            updateProgress('coverage_analysis', 100);

            updateProgress('temporal_analysis', 0);
            const temporal = this.analyzeTemporalTrends();
            updateProgress('temporal_analysis', 100);

            updateProgress('visualization', 0);
            const visualizationData = this.generateVisualizationData();
            updateProgress('visualization', 100);

            const totalTime = Date.now() - startTime;
            console.log(`✅ PEO Analysis complete! (${totalTime}ms)`);

            if (analysisTimeout) {
                clearTimeout(analysisTimeout);
            }

            return {
                success: true,
                timestamp: new Date().toISOString(),
                executionTimeMs: totalTime,
                statistics: {
                    totalPapers: this.data.length,
                    categories: Object.keys(this.domainKeywords).length,
                    timeRange: '1995-2025'
                },
                data: {
                    coverage,
                    temporal,
                    visualization: visualizationData
                }
            };

        } catch (error) {
            if (analysisTimeout) {
                clearTimeout(analysisTimeout);
            }

            const totalTime = Date.now() - startTime;
            console.error('❌ PEO Analysis failed:', error);

            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                executionTimeMs: totalTime,
                partialResults: this.results
            };
        }
    }

    // Add utility methods for better debugging and maintenance
    getAnalysisStatistics() {
        if (!this.data) {
            return { error: 'No data loaded' };
        }

        const yearRange = this.data.reduce((acc, paper) => {
            acc.min = Math.min(acc.min, paper.pub_year);
            acc.max = Math.max(acc.max, paper.pub_year);
            return acc;
        }, { min: Infinity, max: -Infinity });

        return {
            totalPapers: this.data.length,
            yearRange: `${yearRange.min}-${yearRange.max}`,
            categories: Object.keys(this.domainKeywords).length,
            totalKeywords: Object.values(this.domainKeywords).reduce((sum, arr) => sum + arr.length, 0),
            averageKeywordsPerCategory: Object.values(this.domainKeywords).reduce((sum, arr) => sum + arr.length, 0) / Object.keys(this.domainKeywords).length
        };
    }

    validateData(papers) {
        if (!Array.isArray(papers)) {
            return { valid: false, error: 'Data must be an array' };
        }

        if (papers.length === 0) {
            return { valid: false, error: 'Dataset is empty' };
        }

        const validPapers = papers.filter(paper => {
            const hasContent = paper.title || paper.abstract;
            const hasYear = paper.pub_year || paper.year || paper.publication_year;
            return hasContent && hasYear;
        });

        const validationRate = (validPapers.length / papers.length) * 100;

        return {
            valid: validPapers.length > 0,
            totalPapers: papers.length,
            validPapers: validPapers.length,
            validationRate: validationRate,
            warnings: validationRate < 90 ? ['High number of invalid papers detected'] : []
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.PEOCoverageAnalyzer = PEOCoverageAnalyzer;
}

// Node.js export support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PEOCoverageAnalyzer;
}