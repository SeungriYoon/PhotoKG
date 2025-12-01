// Configuration and Constant Management
const CONFIG = {
    // Color Palette (50 HSL-based colors)
    COLOR_PALETTE: (() => {
        const palette = [];
        for (let i = 0; i < 50; i++) {
            const hue = (i * 137.508) % 360; // Even distribution using the golden angle
            const saturation = 65 + (i % 3) * 10; // 65-85% saturation
            const lightness = 50 + (i % 4) * 8;   // 50-74% lightness
            palette.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
        }
        return palette;
    })(),

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
        keyword: { shape: 'circle', color: 'hsl(200, 70%, 60%)' },
        author: { shape: 'circle', color: 'hsl(120, 70%, 60%)' },
        journal: { shape: 'rounded-rect', color: 'hsl(280, 70%, 60%)' },
        concept: { shape: 'diamond', color: 'hsl(40, 70%, 60%)' }
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
        const hue = (baseHue + index * 137.508) % 360;
        const saturation = 65 + (index % 3) * 10;
        const lightness = 50 + (index % 4) * 8;
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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