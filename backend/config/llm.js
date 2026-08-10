const DEFAULTS = {
  provider: 'openai_compatible',
  model: 'qwen2.5-1.5b-instruct',
  baseURL: 'http://localhost:11434/v1',
  apiKey: '',
  timeoutMs: 300000,
  temperature: 0.2,
  maxTokens: 4096
};

const PROVIDER_DEFAULTS = {
  gemini: {
    model: 'gemini-2.5-flash',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta'
  },
  openai_compatible: {
    model: DEFAULTS.model,
    baseURL: DEFAULTS.baseURL
  },
  ollama: {
    model: DEFAULTS.model,
    baseURL: 'http://localhost:11434'
  },
  local_http: {
    model: DEFAULTS.model,
    baseURL: 'http://localhost:8000/v1'
  }
};

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (['ollama', 'local_http', 'openai_compatible', 'gemini'].includes(provider)) {
    return provider;
  }
  return DEFAULTS.provider;
}

function inferProvider(overrides = {}) {
  const explicit = String(overrides.provider || process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit) {
    return normalizeProvider(explicit);
  }

  if (process.env.GEMINI_API_KEY) {
    return 'gemini';
  }

  if (process.env.OPENAI_API_KEY || process.env.LLM_API_KEY) {
    return 'openai_compatible';
  }

  return DEFAULTS.provider;
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getLLMConfig(overrides = {}) {
  const provider = inferProvider(overrides);
  const providerDefaults = PROVIDER_DEFAULTS[provider] || DEFAULTS;
  const baseURL = trimTrailingSlash(
    overrides.baseURL || process.env.LLM_BASE_URL || providerDefaults.baseURL || DEFAULTS.baseURL
  );
  const model = String(overrides.model || process.env.LLM_MODEL || providerDefaults.model || DEFAULTS.model).trim();
  const apiKey =
    provider === 'gemini'
      ? String(overrides.apiKey || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || DEFAULTS.apiKey).trim()
      : String(overrides.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || DEFAULTS.apiKey).trim();

  return {
    provider,
    model,
    baseURL,
    apiKey,
    timeoutMs: Number(overrides.timeoutMs || process.env.LLM_TIMEOUT_MS || DEFAULTS.timeoutMs),
    temperature: Number(overrides.temperature || process.env.LLM_TEMPERATURE || DEFAULTS.temperature),
    maxTokens: Number(overrides.maxTokens || process.env.LLM_MAX_TOKENS || DEFAULTS.maxTokens)
  };
}

function isLLMConfigured(config = getLLMConfig()) {
  if (!config || !config.model || !config.baseURL) {
    return false;
  }

  if (config.provider === 'ollama' || config.provider === 'local_http') {
    return true;
  }

  if (config.provider === 'gemini') {
    return Boolean(config.apiKey);
  }

  return Boolean(config.apiKey) || /localhost|127\.0\.0\.1/i.test(config.baseURL);
}

function resolveLLMEndpoint(config = getLLMConfig()) {
  const baseURL = trimTrailingSlash(config.baseURL);
  if (config.provider === 'gemini') {
    return `${baseURL}/models/${config.model}:generateContent`;
  }
  if (config.provider === 'ollama') {
    return `${baseURL}/api/chat`;
  }
  return `${baseURL}/chat/completions`;
}

function buildLLMHeaders(config = getLLMConfig()) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (config.provider !== 'ollama' && config.apiKey) {
    if (config.provider === 'gemini') {
      headers['x-goog-api-key'] = config.apiKey;
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
  }

  return headers;
}

function buildChatCompletionPayload(messages, options = {}, config = getLLMConfig()) {
  if (config.provider === 'gemini') {
    const systemMessages = messages
      .filter(message => message && message.role === 'system')
      .map(message => String(message.content || '').trim())
      .filter(Boolean);

    const contents = messages
      .filter(message => message && message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [
          {
            text: String(message.content || '')
          }
        ]
      }));

    const payload = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? config.temperature,
        maxOutputTokens: options.maxTokens ?? config.maxTokens
      }
    };

    if (options.responseMimeType) {
      payload.generationConfig.responseMimeType = options.responseMimeType;
    }

    if (options.responseSchema) {
      payload.generationConfig.responseSchema = options.responseSchema;
    }

    if (systemMessages.length) {
      payload.systemInstruction = {
        parts: [
          {
            text: systemMessages.join('\n\n')
          }
        ]
      };
    }

    return payload;
  }

  const payload = {
    model: options.model || config.model,
    messages,
    temperature: options.temperature ?? config.temperature,
    max_tokens: options.maxTokens ?? config.maxTokens
  };

  if (config.provider === 'ollama') {
    return {
      model: payload.model,
      messages,
      stream: false,
      options: {
        temperature: payload.temperature,
        num_predict: payload.max_tokens
      }
    };
  }

  return payload;
}

module.exports = {
  DEFAULTS,
  getLLMConfig,
  isLLMConfigured,
  resolveLLMEndpoint,
  buildLLMHeaders,
  buildChatCompletionPayload
};
