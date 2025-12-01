# AI API Configuration Guide

This guide explains how to configure and use different AI models with the PhotoRAG Knowledge Graph System. The system supports multiple AI providers for flexible knowledge extraction and analysis based on the findings of our research paper.

## Supported AI Models

### Default Configuration
- **Primary Model**: OpenAI GPT-4.1-nano (large-scale indexing + fast interactions)
- **Deep Reasoning Partner**: Google Gemini-2.5-flash (triggered for high-impact, on-demand analysis)

### Available Models

####  OpenAI Models
- `gpt-4.1-nano` (Default - Balanced & Cost-effective for production)
- `gpt-4o-mini` (Fast & High-Value)
- `gpt-3.5-turbo` (Fastest, Budget Option for simple tasks)

####  Google Gemini Models
- `gemini-2.5-flash` (Highest Quality - Recommended for research-grade analysis)
- `gemini-1.5-flash` (Stable & High Recall)
- `gemini-1.5-pro` (High Capability)

---

##  Configuration Setup

### Step 1: Get API Keys

#### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Create new secret key
5. Copy the key (starts with `sk-`)

#### Google AI API Key
1. Go to [Google AI Studio](https://makersuite.google.com/)
2. Sign in with Google account
3. Click **Get API Key**
4. Create new project or select existing
5. Generate API key

### Step 2: Configure Environment Variables

Edit your `backend/.env` file:

```env
# Default OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4.1-nano

# Google AI Configuration (Optional)
GOOGLE_API_KEY=your-google-ai-key-here
GOOGLE_MODEL=gemini-2.5-flash
```

---

## 🔄 Model Selection Strategy

We run a paired-model workflow:

1. **Primary engine (`gpt-4.1-nano`)** handles high-volume indexing, streaming user queries, and lightweight graph refresh.  
2. **On-demand deep reasoning (`gemini-2.5-flash`)** kicks in for high-impact or complex papers, ensuring maximal recall and context fidelity.  
3. **Real-time parity (`gemini-1.5-flash`)** mirrors GPT latency/quality when we want vendor diversity without sacrificing responsiveness.  
4. **Burst workloads (`gpt-4o-mini`)** cover time-sensitive tasks that still demand GPT-quality semantics but favor cost/performance.

---

##  Model Comparison

| Model | Provider | Speed | Cost | Quality | Best For |
|-------|----------|--------|------|---------|----------|
| GPT-4.1-nano | OpenAI | ⚡⚡⚡ | 💰 | ⭐⭐⭐⭐ | Primary engine for large-scale indexing; pair with Gemini-2.5-flash for on-demand deep reasoning on high-impact papers |
| Gemini-2.5-flash | Google | ⚡ | 💰 | ⭐⭐⭐⭐⭐ | Max extraction / research-grade deep reasoning |
| Gemini-1.5-flash | Google | ⚡⚡⚡ | 💰 | ⭐⭐⭐⭐ | Research & real-time parity with high recall |
| GPT-4o-mini | OpenAI | ⚡⚡⚡⚡ | 💰 | ⭐⭐⭐½ | Fast, cost-effective burst processing |

---

## 🛠️ Advanced Configuration

### Custom Prompts per Model
```javascript
// Configure model-specific prompts
const modelPrompts = {
    "gpt-4.1-nano": "Extract key concepts from this research paper...",
    "gemini-2.5-flash": "Analyze the following scientific document for knowledge graph construction...",
};
```

### Rate Limiting Configuration
```env
# API Rate Limits (requests per minute)
OPENAI_RATE_LIMIT=60
GOOGLE_RATE_LIMIT=100

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY=1000
```

### Model-Specific Settings
```env
# OpenAI Settings
OPENAI_TEMPERATURE=0.1
OPENAI_MAX_TOKENS=4000

# Google Settings
GOOGLE_TEMPERATURE=0.2
GOOGLE_MAX_OUTPUT_TOKENS=2048
```

---

## 🔍 Usage Examples

### Basic Knowledge Extraction
```bash
# Using default OpenAI model
curl -X POST http://localhost:3015/api/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "Your research paper content..."}'
```

### Switching Models
```bash
# Using Google Gemini for higher accuracy extraction
curl -X POST http://localhost:3015/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your research paper content...",
    "provider": "google",
    "model": "gemini-2.5-flash"
  }'
```

---

##  Troubleshooting

### Common Issues

#### API Key Errors
```
Error: Invalid API key
```
**Solution**: Verify your API key is correct and has sufficient credits

#### Rate Limit Exceeded
```
Error: Rate limit exceeded
```
**Solution**: Implement delays between requests or upgrade your plan

#### Model Not Available
```
Error: Model not found
```
**Solution**: Check if the model name is correct and available in your region

### Testing API Connection
```bash
# Test OpenAI connection
npm run test-openai

# Test Google connection
npm run test-google
```

---

##  Best Practices

### Cost Optimization
1. Use GPT-4.1-nano for regular, real-time tasks.
2. Reserve Gemini-2.5-flash for complex, offline analysis where quality is paramount.
3. Implement caching for repeated queries.
4. Monitor usage via provider dashboards.

### Performance Optimization
1. Use faster models like GPT-4o-mini for time-sensitive features.
2. Batch similar requests together.
3. Implement request queuing for high loads.
4. Cache frequently used results.

### Security Guidelines
1. Never commit API keys to version control
2. Use environment variables for all keys
3. Rotate keys regularly
4. Monitor API usage for anomalies

---

##  Support

For API-related issues:
- **OpenAI**: [OpenAI Help Center](https://help.openai.com/)
- **Google**: [Google AI Support](https://developers.generativeai.google/)

For system-related issues, check the main documentation or create an issue in the project repository.

---