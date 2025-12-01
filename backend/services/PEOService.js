const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Import the JavaScript PEO analyzer as fallback
const PEOCoverageAnalyzer = require('../../js/peoAnalyzer.js');

class PEOService {
    constructor() {
        this.pythonPath = process.env.PYTHON_PATH || 'python';

        // Use local analysis by default, fallback to Python if available
        this.useJavaScriptAnalyzer = true;

        // Optional Python platform paths (for advanced features)
        this.platformPath = process.env.PEO_PLATFORM_PATH || path.join(__dirname, '../../python_analysis');
        this.resultsPath = path.join(__dirname, '../uploads/peo_results');
        this.configPath = path.join(__dirname, '../config');

        // Ensure results directory exists
        this.ensureDirectories();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.resultsPath, { recursive: true });
            await fs.mkdir(this.configPath, { recursive: true });
        } catch (error) {
            console.warn('Could not create directories:', error.message);
        }
    }

    // Run PEO Coverage Analysis (Primary method - uses JavaScript analyzer)
    async runCoverageAnalysis(papersData, options = {}) {
        console.log('🔍 Starting PEO Coverage analysis...');

        try {
            // Use JavaScript analyzer by default
            if (this.useJavaScriptAnalyzer) {
                return await this.runJavaScriptAnalysis(papersData, options);
            } else {
                // Fallback to Python if configured
                return await this.runPythonAnalysis(papersData, options);
            }

        } catch (error) {
            console.error('❌ PEO Coverage analysis error:', error);

            // Try fallback method if primary fails
            if (this.useJavaScriptAnalyzer) {
                console.log('🔄 Attempting Python fallback...');
                try {
                    return await this.runPythonAnalysis(papersData, options);
                } catch (fallbackError) {
                    console.error('❌ Python fallback also failed:', fallbackError);
                }
            }

            throw error;
        }
    }

    // JavaScript-based analysis (primary method)
    async runJavaScriptAnalysis(papersData, options = {}) {
        console.log('🟨 Running JavaScript PEO analysis...');

        const analyzer = new PEOCoverageAnalyzer({
            batchSize: options.batchSize || 1000,
            timeoutMs: options.timeoutMs || 300000,
            progressCallback: options.progressCallback
        });

        // Validate data first
        const validation = analyzer.validateData(papersData);
        if (!validation.valid) {
            throw new Error(`Data validation failed: ${validation.error}`);
        }

        // Run full analysis
        const result = await analyzer.runFullAnalysis(papersData, options);

        // Save results if requested
        if (options.saveResults) {
            const resultPath = path.join(this.resultsPath, `peo_analysis_${Date.now()}.json`);
            await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
            result.savedPath = resultPath;
        }

        return result;
    }

    // Python-based analysis (fallback method)
    async runPythonAnalysis(papersData, options = {}) {
        console.log('🐍 Running Python PEO analysis...');

        // Check if Python environment is available
        const pythonAvailable = await this.checkPythonEnvironment();
        if (!pythonAvailable) {
            throw new Error('Python environment not available for analysis');
        }

        try {
            // Create temporary data file
            const tempDataPath = path.join(__dirname, '../uploads/temp_peo_papers.json');
            await fs.writeFile(tempDataPath, JSON.stringify(papersData, null, 2));

            // Use local Python script if platform not available
            const scriptPath = await this.findPythonScript();

            console.log('🐍 Executing Python analysis:', scriptPath);

            // Execute Python process
            const result = await this.executePythonScript(scriptPath, [
                '--input', tempDataPath,
                '--output-format', 'json'
            ]);

            // Clean up temporary file
            await fs.unlink(tempDataPath);

            console.log('✅ Python PEO analysis completed');
            return JSON.parse(result);

        } catch (error) {
            console.error('❌ Python PEO analysis error:', error);
            throw error;
        }
    }

    // Find available Python script
    async findPythonScript() {
        const possiblePaths = [
            path.join(this.platformPath, 'src/peo_cli_runner.py'),
            path.join(__dirname, '../../figure_DomainCoverageandTemporalTrends_analysis_0915.py'),
            path.join(__dirname, '../../python_analysis/peo_analyzer.py')
        ];

        for (const scriptPath of possiblePaths) {
            try {
                await fs.access(scriptPath);
                return scriptPath;
            } catch (error) {
                // Continue to next path
            }
        }

        throw new Error('No Python analysis script found');
    }

    // Legacy method - redirects to new coverage analysis
    async runOntologyCoverageAnalysis(papersData, options = {}) {
        console.log('⚠️  runOntologyCoverageAnalysis is deprecated, using runCoverageAnalysis');
        return await this.runCoverageAnalysis(papersData, options);
    }

    // Legacy method - redirects to new coverage analysis
    async runTextEncodingAnalysis(papersData, options = {}) {
        console.log('⚠️  runTextEncodingAnalysis is deprecated, using runCoverageAnalysis');
        return await this.runCoverageAnalysis(papersData, options);
    }

    // Run Ollama-based Advanced Analysis
    async runOllamaAnalysis(papersData, ollamaConfig = {}) {
        console.log('🔍 Debug: Ollama-based PEO analysis service started...');
        
        try {
            // Create temporary data files
            const tempDataPath = path.join(__dirname, '../uploads/temp_ollama_papers.json');
            const tempConfigPath = path.join(__dirname, '../uploads/temp_ollama_config.json');
            
            await fs.writeFile(tempDataPath, JSON.stringify(papersData, null, 2));
            await fs.writeFile(tempConfigPath, JSON.stringify(ollamaConfig, null, 2));
            
            // Python CLI runner script path
            const scriptPath = path.join(this.platformPath, 'src/peo_cli_runner.py');
            
            console.log('🐍 Debug: Running Python CLI runner (Ollama):', scriptPath);
            
            // Execute Python process
            const result = await this.executePythonScript(scriptPath, [
                '--input', tempDataPath,
                '--config', tempConfigPath,
                '--analysis-type', 'ollama',
                '--output-format', 'json'
            ]);
            
            // Clean up temporary files
            await fs.unlink(tempDataPath);
            await fs.unlink(tempConfigPath);
            
            console.log('✅ Debug: Ollama-based PEO analysis completed');
            return JSON.parse(result);
            
        } catch (error) {
            console.error('❌ Debug: Ollama-based PEO analysis error:', error);
            throw error;
        }
    }

    // Python script execution helper function
    async executePythonScript(scriptPath, args = []) {
        return new Promise((resolve, reject) => {
            console.log('🐍 Debug: Starting Python process:', scriptPath, args);
            
            const pythonProcess = spawn(this.pythonPath, [scriptPath, ...args], {
                cwd: this.platformPath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log('📊 Debug: Python output:', data.toString().trim());
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log('⚠️ Debug: Python error:', data.toString().trim());
            });

            pythonProcess.on('close', (code) => {
                console.log('🐍 Debug: Python process finished, code:', code);
                
                if (code === 0) {
                    if (stdout.trim()) {
                        resolve(stdout.trim());
                    } else {
                        reject(new Error('Python script did not generate output.'));
                    }
                } else {
                    reject(new Error(`Python script execution failed (code: ${code}): ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('❌ Debug: Python process error:', error);
                reject(new Error(`Python process start failed: ${error.message}`));
            });

            // Set timeout (5 minutes)
            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Python script execution timeout (5 minutes)'));
            }, 300000);
        });
    }

    // Get PEO configuration information
    async getPEOConfiguration() {
        console.log('🔍 Retrieving PEO configuration information...');

        try {
            // Use built-in keywords from JavaScript analyzer as primary source
            const analyzer = new PEOCoverageAnalyzer();
            const domainKeywords = analyzer.domainKeywords;
            const categoryColors = analyzer.categoryColors;

            // Try to load additional config files if they exist
            let externalConfig = {};
            try {
                const configPath = path.join(this.configPath, 'peo_config.json');
                const configData = await fs.readFile(configPath, 'utf8');
                externalConfig = JSON.parse(configData);
            } catch (error) {
                // External config not available, use defaults
            }

            console.log('✅ PEO configuration information loaded successfully');

            return {
                domain_keywords: domainKeywords,
                category_colors: categoryColors,
                categories: Object.keys(domainKeywords),
                total_keywords: Object.values(domainKeywords).reduce((sum, arr) => sum + arr.length, 0),
                external_config: externalConfig,
                analyzer_version: '2.0.0',
                last_updated: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ PEO configuration retrieval error:', error);
            throw error;
        }
    }

    // Retrieve analysis result files
    async getAnalysisResults(analysisId) {
        console.log('🔍 Debug: Retrieving PEO analysis results:', analysisId);
        
        try {
            // Check results directory
            await fs.access(this.resultsPath);
            
            // Get results file list
            const files = await fs.readdir(this.resultsPath);
            const analysisFiles = files.filter(file => file.includes(analysisId));
            
            console.log(`📁 Debug: Found ${analysisFiles.length} related files`);
            
            if (analysisFiles.length === 0) {
                throw new Error('Analysis results not found');
            }
            
            // Read result files
            const results = {};
            for (const file of analysisFiles) {
                const filePath = path.join(this.resultsPath, file);
                const content = await fs.readFile(filePath, 'utf8');
                
                if (file.endsWith('.json')) {
                    results[file] = JSON.parse(content);
                } else {
                    results[file] = content;
                }
            }
            
            console.log('✅ Debug: PEO analysis results loaded successfully');
            
            return {
                analysisId: analysisId,
                fileCount: analysisFiles.length,
                results: results
            };
            
        } catch (error) {
            console.error('❌ Debug: Results retrieval error:', error);
            throw error;
        }
    }

    // Check Python environment
    async checkPythonEnvironment() {
        console.log('🔍 Checking Python environment...');

        try {
            // Use python --version instead of script execution
            const result = await new Promise((resolve, reject) => {
                const pythonProcess = spawn(this.pythonPath, ['--version'], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let output = '';
                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    output += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve(output.trim());
                    } else {
                        reject(new Error(`Python check failed with code ${code}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    reject(error);
                });
            });

            console.log('✅ Python environment check completed:', result);
            return true;
        } catch (error) {
            console.error('❌ Python environment check failed:', error);
            return false;
        }
    }

    // Check service health and capabilities
    async checkServiceHealth() {
        console.log('🔍 Checking PEO service health...');

        const health = {
            jsAnalyzer: true, // Always available
            pythonEnvironment: false,
            platformPath: false,
            timestamp: new Date().toISOString()
        };

        try {
            // Check Python environment
            health.pythonEnvironment = await this.checkPythonEnvironment();

            // Check platform paths
            try {
                await fs.access(this.platformPath);
                await fs.access(this.configPath);
                health.platformPath = true;
            } catch (error) {
                health.platformPath = false;
            }

            console.log('✅ PEO service health check completed:', health);
            return health;

        } catch (error) {
            console.error('❌ PEO service health check failed:', error);
            health.error = error.message;
            return health;
        }
    }
}

module.exports = PEOService;

// Export the analyzer class as well for direct use
module.exports.PEOCoverageAnalyzer = PEOCoverageAnalyzer;
