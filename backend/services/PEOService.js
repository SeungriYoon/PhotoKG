const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class PEOService {
    constructor() {
        this.pythonPath = 'python';
        this.platformPath = path.join(__dirname, '../../knowledge_graph_platform');
        this.resultsPath = path.join(this.platformPath, 'results');
        this.configPath = path.join(this.platformPath, 'config');
    }

    // Run PEO Ontology Coverage Analysis
    async runOntologyCoverageAnalysis(papersData, options = {}) {
        console.log('🔍 Debug: PEO Ontology Coverage analysis service started...');
        
        try {
            // Create temporary data file
            const tempDataPath = path.join(__dirname, '../uploads/temp_ontology_papers.json');
            await fs.writeFile(tempDataPath, JSON.stringify(papersData, null, 2));
            
            // Python CLI runner script path
            const scriptPath = path.join(this.platformPath, 'src/peo_cli_runner.py');
            const configPath = path.join(this.configPath, 'domain_keywords.json');
            
            console.log('🐍 Debug: Running Python CLI runner:', scriptPath);
            
            // Execute Python process
            const result = await this.executePythonScript(scriptPath, [
                '--input', tempDataPath,
                '--config', configPath,
                '--analysis-type', 'ontology',
                '--output-format', 'json'
            ]);
            
            // Clean up temporary file
            await fs.unlink(tempDataPath);
            
            console.log('✅ Debug: PEO Ontology Coverage analysis completed');
            return JSON.parse(result);
            
        } catch (error) {
            console.error('❌ Debug: PEO Ontology Coverage analysis error:', error);
            throw error;
        }
    }

    // Run PEO Text Encoding Analysis
    async runTextEncodingAnalysis(papersData, options = {}) {
        console.log('🔍 Debug: PEO Text Encoding analysis service started...');
        
        try {
            // Create temporary data file
            const tempDataPath = path.join(__dirname, '../uploads/temp_encoding_papers.json');
            await fs.writeFile(tempDataPath, JSON.stringify(papersData, null, 2));
            
            // Python CLI runner script path
            const scriptPath = path.join(this.platformPath, 'src/peo_cli_runner.py');
            const configPath = path.join(this.configPath, 'domain_keywords.json');
            
            console.log('🐍 Debug: Running Python CLI runner (Text Encoding):', scriptPath);
            
            // Execute Python process
            const result = await this.executePythonScript(scriptPath, [
                '--input', tempDataPath,
                '--config', configPath,
                '--analysis-type', 'encoding',
                '--output-format', 'json'
            ]);
            
            // Clean up temporary file
            await fs.unlink(tempDataPath);
            
            console.log('✅ Debug: PEO Text Encoding analysis completed');
            return JSON.parse(result);
            
        } catch (error) {
            console.error('❌ Debug: PEO Text Encoding analysis error:', error);
            throw error;
        }
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
        console.log('🔍 Debug: Retrieving PEO configuration information...');
        
        try {
            const domainKeywordsPath = path.join(this.configPath, 'domain_keywords.json');
            const settingsPath = path.join(this.configPath, 'settings.json');
            
            const [domainKeywords, settings] = await Promise.all([
                fs.readFile(domainKeywordsPath, 'utf8').then(JSON.parse),
                fs.readFile(settingsPath, 'utf8').then(JSON.parse)
            ]);
            
            console.log('✅ Debug: PEO configuration information loaded successfully');
            
            return {
                domain_keywords: domainKeywords,
                settings: settings,
                categories: Object.keys(domainKeywords),
                total_keywords: Object.values(domainKeywords).reduce((sum, arr) => sum + arr.length, 0)
            };
            
        } catch (error) {
            console.error('❌ Debug: PEO configuration retrieval error:', error);
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
        console.log('🔍 Debug: Checking Python environment...');
        
        try {
            const result = await this.executePythonScript('--version', []);
            console.log('✅ Debug: Python environment check completed:', result);
            return true;
        } catch (error) {
            console.error('❌ Debug: Python environment check failed:', error);
            return false;
        }
    }

    // Check PEO platform path
    async checkPlatformPath() {
        console.log('🔍 Debug: Checking PEO platform path...');
        
        try {
            await fs.access(this.platformPath);
            await fs.access(path.join(this.platformPath, 'src'));
            await fs.access(this.configPath);
            
            console.log('✅ Debug: PEO platform path check completed');
            return true;
        } catch (error) {
            console.error('❌ Debug: PEO platform path check failed:', error);
            return false;
        }
    }
}

module.exports = PEOService;
