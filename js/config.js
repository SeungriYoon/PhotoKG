// Configuration and Constant Management
const CONFIG = {
    // Color Palette (50 HSL-based colors)
    COLOR_PALETTE: [
        '#0f766e', '#115e59', '#14b8a6', '#0ea5e9', '#2563eb',
        '#1d4ed8', '#3b82f6', '#16a34a', '#22c55e', '#15803d',
        '#d97706', '#f59e0b', '#ea580c', '#64748b', '#475569',
        '#1e293b', '#94a3b8', '#38bdf8', '#06b6d4', '#84cc16'
    ],

    SEMANTIC_COLORS: {
        primary: '#0f766e',
        primaryStrong: '#115e59',
        secondary: '#2563eb',
        accent: '#d97706',
        success: '#15803d',
        warning: '#f59e0b',
        danger: '#b91c1c',
        neutral: '#64748b',
        surface: '#ffffff',
        surfaceSoft: '#f8fafc',
        text: '#102a43',
        muted: '#627d98'
    },

    GRAPH_PALETTE: {
        concept: ['#0f766e', '#14b8a6', '#0ea5e9'],
        gene: ['#0f766e', '#14b8a6', '#0ea5e9'],
        protein: ['#2563eb', '#3b82f6', '#1d4ed8'],
        organism: ['#16a34a', '#22c55e', '#15803d'],
        phenotype: ['#d97706', '#f59e0b', '#ea580c'],
        trait: ['#f59e0b', '#fbbf24', '#d97706'],
        metabolite: ['#06b6d4', '#0ea5e9', '#38bdf8'],
        molecule: ['#0284c7', '#0ea5e9', '#38bdf8'],
        enzyme: ['#f97316', '#fb923c', '#d97706'],
        process: ['#0f766e', '#14b8a6', '#06b6d4'],
        pathway: ['#2563eb', '#3b82f6', '#60a5fa'],
        cell: ['#15803d', '#22c55e', '#84cc16'],
        tissue: ['#0f766e', '#10b981', '#14b8a6'],
        complex: ['#475569', '#64748b', '#94a3b8'],
        disease: ['#b91c1c', '#dc2626', '#ef4444'],
        regulation: ['#0f766e', '#14b8a6', '#0ea5e9'],
        cellular_component: ['#334155', '#475569', '#64748b'],
        anatomy: ['#0f766e', '#0ea5e9', '#14b8a6'],
        location: ['#64748b', '#475569', '#334155'],
        paper: ['#64748b', '#475569', '#334155'],
        model: ['#0f766e', '#14b8a6', '#0ea5e9'],
        parameter: ['#d97706', '#f59e0b', '#ea580c'],
        measurement: ['#d97706', '#f59e0b', '#ea580c'],
        formula: ['#2563eb', '#3b82f6', '#1d4ed8'],
        method: ['#0f766e', '#14b8a6', '#06b6d4'],
        material: ['#475569', '#64748b', '#94a3b8'],
        condition: ['#f59e0b', '#f97316', '#ea580c'],
        site: ['#64748b', '#94a3b8', '#cbd5e1'],
        author: ['#2563eb', '#3b82f6', '#1d4ed8'],
        journal: ['#d97706', '#f59e0b', '#ea580c'],
        keyword: ['#15803d', '#22c55e', '#16a34a'],
        process: ['#0f766e', '#14b8a6', '#06b6d4'],
        molecule: ['#2563eb', '#0ea5e9', '#38bdf8'],
        enzyme: ['#d97706', '#f59e0b', '#f97316'],
        complex: ['#475569', '#64748b', '#94a3b8'],
        structure: ['#1d4ed8', '#2563eb', '#3b82f6'],
        cell: ['#15803d', '#22c55e', '#84cc16'],
        tissue: ['#0f766e', '#10b981', '#14b8a6'],
        category: ['#2563eb', '#38bdf8', '#0ea5e9'],
        organelle: ['#d97706', '#f59e0b', '#f97316']
    },

    // Default Settings
    DEFAULTS: {
        NODE_SIZE_MIN: 8,
        NODE_SIZE_MAX: 45,
        EDGE_OPACITY_MIN: 0.1,
        EDGE_OPACITY_MAX: 0.8,
        ZOOM_MIN: 0.1,
        ZOOM_MAX: 4,
        SIMULATION_STRENGTH: -300,
        LINK_DISTANCE: 80,
        MAX_NODES_DISPLAY: 200,
        MIN_FREQUENCY: 2,
        MAX_KEYWORDS: 8
    },

    // Stopword Dictionary (Enhanced Version)
    STOPWORDS: new Set([
        // Basic English Stopwords
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
        'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
        'to', 'was', 'we', 'will', 'with', 'have', 'this', 'can', 'could',
        'she', 'they', 'them', 'their', 'what', 'which', 'who', 'where',
        'when', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
        'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
        'so', 'than', 'too', 'very', 'just', 'don', 'should', 'now', 'were',
        'been', 'being', 'had', 'having', 'do', 'does', 'did', 'would',
        'may', 'might', 'must', 'shall', 'ought', 'but', 'or', 'nor', 'if',
        'then', 'else', 'while', 'until', 'since', 'because', 'although',
        
        // Academic Research Related Stopwords (Enhanced)
        'effect', 'result', 'study', 'analysis', 'research', 'method',
        'approach', 'data', 'model', 'system', 'using', 'used', 'use',
        'show', 'shows', 'showed', 'found', 'find', 'findings', 'based',
        'new', 'paper', 'article', 'journal', 'conference', 'proceedings',
        'significant', 'important', 'different', 'similar', 'high', 'low',
        'large', 'small', 'increase', 'decrease', 'change', 'changes',
        'values', 'value', 'level', 'levels', 'rate', 'rates', 'time',
        'times', 'number', 'numbers', 'total', 'average', 'mean', 'control',
        'group', 'sample', 'test', 'measure', 'observed', 'obtained',
        'determined', 'calculated', 'estimated', 'evaluated', 'compared',
        'between', 'among', 'within', 'across', 'during', 'after', 'before',
        'through', 'under', 'over', 'above', 'below', 'into', 'upon',
        'against', 'without', 'also', 'however', 'therefore', 'thus',
        'hence', 'moreover', 'furthermore', 'consequently', 'previously',
        'recently', 'currently', 'generally', 'specifically', 'particularly',
        'especially', 'mainly', 'primarily', 'essentially', 'typically',
        'usually', 'often', 'always', 'never', 'sometimes', 'frequently',
        
        // Problematic General Academic Terms (User-pointed)
        'range', 'respectively', 'representing', 'treatment', 'treatment',
        'respectively', 'representing', 'represent', 'represents', 'represented',
        'range', 'ranges', 'ranging', 'treated', 'treatments', 'treat',
        'treats', 'treated', 'respect', 'respects', 'respected', 'respective',
        
        // Additional General Academic Terms
        'according', 'accordingly', 'addition', 'additional', 'additionally',
        'available', 'availability', 'based', 'basis', 'basic', 'basically',
        'common', 'commonly', 'consider', 'considered', 'considering',
        'consist', 'consists', 'consisted', 'consisting', 'consistently',
        'contain', 'contains', 'contained', 'containing', 'content',
        'describe', 'describes', 'described', 'describing', 'description',
        'develop', 'develops', 'developed', 'developing', 'development',
        'different', 'differently', 'difference', 'differences', 'differential',
        'establish', 'establishes', 'established', 'establishing', 'establishment',
        'examine', 'examines', 'examined', 'examining', 'examination',
        'exist', 'exists', 'existed', 'existing', 'existence', 'existing',
        'express', 'expresses', 'expressed', 'expressing', 'expression',
        'follow', 'follows', 'followed', 'following', 'followed',
        'form', 'forms', 'formed', 'forming', 'formation', 'formal',
        'function', 'functions', 'functioned', 'functioning', 'functional',
        'general', 'generally', 'generate', 'generates', 'generated', 'generating',
        'include', 'includes', 'included', 'including', 'inclusion',
        'indicate', 'indicates', 'indicated', 'indicating', 'indication',
        'individual', 'individually', 'influence', 'influences', 'influenced',
        'involve', 'involves', 'involved', 'involving', 'involvement',
        'maintain', 'maintains', 'maintained', 'maintaining', 'maintenance',
        'observe', 'observes', 'observed', 'observing', 'observation',
        'occur', 'occurs', 'occurred', 'occurring', 'occurrence',
        'perform', 'performs', 'performed', 'performing', 'performance',
        'present', 'presents', 'presented', 'presenting', 'presentation',
        'produce', 'produces', 'produced', 'producing', 'production',
        'provide', 'provides', 'provided', 'providing', 'provision',
        'require', 'requires', 'required', 'requiring', 'requirement',
        'result', 'results', 'resulted', 'resulting', 'resultant',
        'reveal', 'reveals', 'revealed', 'revealing', 'revelation',
        'serve', 'serves', 'served', 'serving', 'service',
        'similar', 'similarly', 'similarity', 'similarities',
        'specific', 'specifically', 'specification', 'specifications',
        'suggest', 'suggests', 'suggested', 'suggesting', 'suggestion',
        'support', 'supports', 'supported', 'supporting', 'supportive',
        'various', 'variously', 'variety', 'varieties', 'variation',
    ]),

    // CSV Field Mapping
    CSV_FIELDS: {
        TITLE: ['title', 'paper_title', 'article_title'],
        ABSTRACT: ['abstract', 'summary', 'description'],
        AUTHORS: ['authors', 'author', 'author_names'],
        JOURNAL: ['journal', 'venue', 'conference', 'publication'],
        YEAR: ['year', 'publication_year', 'pub_year'],
        KEYWORDS: ['keywords', 'keyword', 'tags', 'subjects'],
        CITATIONS: ['citations', 'citation_count', 'cited_by']
    },

    // Node Type Settings
    NODE_TYPES: {
        keyword: { shape: 'circle', color: '#15803d' },
        author: { shape: 'circle', color: '#2563eb' },
        journal: { shape: 'rounded-rect', color: '#d97706' },
        concept: { shape: 'diamond', color: '#0f766e' },
        paper: { shape: 'rounded-rect', color: '#64748b' },
        model: { shape: 'rounded-square', color: '#0f766e' },
        parameter: { shape: 'rounded-square', color: '#d97706' },
        measurement: { shape: 'rounded-square', color: '#d97706' },
        formula: { shape: 'rounded-square', color: '#2563eb' },
        method: { shape: 'rounded-square', color: '#0f766e' },
        material: { shape: 'rounded-square', color: '#64748b' },
        condition: { shape: 'rounded-square', color: '#f59e0b' },
        site: { shape: 'rounded-square', color: '#94a3b8' },
        gene: { shape: 'rounded-square', color: '#0f766e' },
        protein: { shape: 'rounded-square', color: '#2563eb' },
        organism: { shape: 'rounded-square', color: '#16a34a' },
        phenotype: { shape: 'rounded-square', color: '#d97706' },
        metabolite: { shape: 'rounded-square', color: '#06b6d4' },
        enzyme: { shape: 'rounded-square', color: '#f97316' },
        process: { shape: 'rounded-square', color: '#0f766e' },
        pathway: { shape: 'rounded-square', color: '#2563eb' }
    },

    // Animation Settings
    ANIMATION: {
        NODE_APPEAR_DURATION: 1000,
        NODE_APPEAR_DELAY: 8,
        LINK_APPEAR_DURATION: 1200,
        LINK_APPEAR_DELAY: 200,
        LABEL_APPEAR_DURATION: 800,
        LABEL_APPEAR_DELAY: 500
    }
};

// Utility Functions
const UTILS = {
    // Generate HSL Color
    generateHSLColor: (index, baseHue = 0) => {
        const palette = CONFIG.COLOR_PALETTE;
        return palette[(baseHue + index) % palette.length];
    },

    // Calculate Node Size
    calculateNodeSize: (frequency, citations = 0) => {
        const baseSize = Math.log(frequency + 1) * 6;
        const citationBonus = Math.log(citations + 1) * 0.3;
        return Math.max(CONFIG.DEFAULTS.NODE_SIZE_MIN, 
                       Math.min(CONFIG.DEFAULTS.NODE_SIZE_MAX, 
                               baseSize + citationBonus));
    },

    // Calculate Edge Opacity
    calculateEdgeOpacity: (weight) => {
        return Math.min(CONFIG.DEFAULTS.EDGE_OPACITY_MAX, 
                       Math.max(0.3, weight / 8)); // Minimum opacity increased to 0.3
    },

    // Adjust Color Brightness
    adjustColorBrightness: (color, factor) => {
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
            if (match) {
                const h = parseFloat(match[1]);
                const s = parseFloat(match[2]);
                const l = parseFloat(match[3]) * factor;
                return `hsl(${h}, ${s}%, ${Math.max(20, Math.min(80, l))}%)`;
            }
        }
        return color;
    },

    // Truncate Text
    truncateText: (text, maxLength) => {
        return text.length > maxLength ? 
               text.substring(0, maxLength) + '...' : text;
    },

    // Format Number
    formatNumber: (num) => {
        return num.toLocaleString();
    },

    // Adjust Brightness
    adjustBrightness: (color, factor) => {
        // Adjusts and returns the brightness of an HSL color
        return color.replace(/,\s*\d+%\)/, `, ${Math.min(100, Math.max(0, factor * 100))}%)`);
    }
};

// Expose as global objects
window.CONFIG = CONFIG;
window.UTILS = UTILS;
