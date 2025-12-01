// import { CONFIG, UTILS } from './config.js'; // ES6 modules removed - using global objects

// Visualization Class
class GraphVisualization {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.svg = null;
        this.simulation = null;
        this.allNodes = [];
        this.allLinks = [];
        this.visibleNodes = [];
        this.visibleLinks = [];
        this.selectedNode = null;
        this.colorScale = null;
        this.zoom = null;
        this.transform = null;
        this.nodeScaleMultiplier = 1;
        this.performanceStats = { fps: 0, renderTime: 0, nodesInView: 0 };
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
    }

    // Calculate label position slightly offset from edge midpoint
    getEdgeLabelPosition(d) {
        const source = typeof d.source === 'object' ? d.source : d.sourceNode || d.source;
        const target = typeof d.target === 'object' ? d.target : d.targetNode || d.target;

        const sx = source?.x;
        const sy = source?.y;
        const tx = target?.x;
        const ty = target?.y;

        if (sx === undefined || sy === undefined || tx === undefined || ty === undefined) {
            return { x: 0, y: 0 };
        }

        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));

        // Offset label perpendicular to the edge to reduce overlap
        const offsetMagnitude = Math.min(18, distance * 0.12);
        const normX = (-dy / distance) * offsetMagnitude;
        const normY = (dx / distance) * offsetMagnitude;

        return {
            x: midX + normX,
            y: midY + normY
        };
    }

    /**
     * HTML의 기존 로딩 오버레이를 표시합니다.
     * @param {string} message - 로딩 화면에 표시할 메시지
     */
    showLoading(message = 'Loading knowledge graph...') {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            const loadingText = loadingOverlay.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = message;
            }
            loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * HTML의 기존 로딩 오버레이를 숨깁니다.
     */
    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }


    // Initialization
    init(container) {
        this.width = container.offsetWidth;
        this.height = container.offsetHeight;

        // Select or create SVG element
        let svgElement = container.querySelector('#graph');
        if (!svgElement) {
            svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgElement.id = 'graph';
            svgElement.setAttribute('width', '100%');
            svgElement.setAttribute('height', '100%');
            container.appendChild(svgElement);
        }
        
        this.svg = d3.select(svgElement)
            .attr('width', this.width)
            .attr('height', this.height);

        // Set up color scale
        this.colorScale = d3.scaleOrdinal()
            .domain(['keyword', 'author', 'journal', 'concept'])
            .range(CONFIG.COLOR_PALETTE);

        this.setupSimulation();
        this.createGradientDefinitions();
        this.setupZoom();

        // Deselect on background (empty space) click to restore the full graph
        this.svg.on('click', (event) => {
            // Node/link clicks are stopped from propagating here
            this.clearSelection();
        });
    }

    // Setup simulation
    setupSimulation() {
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.id)
                .distance(CONFIG.DEFAULTS.LINK_DISTANCE)
                .strength(0.8))
            .force('charge', d3.forceManyBody()
                .strength(CONFIG.DEFAULTS.SIMULATION_STRENGTH)
                .distanceMax(500))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => Math.sqrt(d.size || 10) * 3 + 8)
                .strength(0.7))
            .force('x', d3.forceX(this.width / 2).strength(0.1))
            .force('y', d3.forceY(this.height / 2).strength(0.1));
    }

    // Setup zoom
    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([CONFIG.DEFAULTS.ZOOM_MIN, CONFIG.DEFAULTS.ZOOM_MAX])
            .on('zoom', (event) => {
                this.transform = event.transform;
                // Apply zoom to the graph-group
                d3.select('#graph').select('.graph-group').attr('transform', this.transform);
                this.updateNodeLabels();
            });

        this.svg.call(this.zoom);
    }

    // Zoom in/out methods
    zoomIn() {
        if (this.transform) {
            const newScale = this.transform.k * 1.2;
            if (newScale <= CONFIG.DEFAULTS.ZOOM_MAX) {
                this.transform.k = newScale;
                d3.select('#graph').select('.graph-group').attr('transform', this.transform);
                this.updateNodeLabels();
            }
        }
    }

    zoomOut() {
        if (this.transform) {
            const newScale = this.transform.k / 1.2;
            if (newScale >= CONFIG.DEFAULTS.ZOOM_MIN) {
                this.transform.k = newScale;
                d3.select('#graph').select('.graph-group').attr('transform', this.transform);
                this.updateNodeLabels();
            }
        }
    }

    // Reset zoom
    resetZoom() {
        this.transform = d3.zoomIdentity;
        d3.select('#graph').select('.graph-group').attr('transform', this.transform);
        this.updateNodeLabels();
    }

    // Export graph (300dpi image)
    exportGraph() {
        const graphContainer = document.querySelector('.graph-container');
        const svg = document.getElementById('graph');
        
        // Convert SVG to canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set 300dpi
        const dpi = 300;
        const scale = dpi / 96; // 96dpi is the default screen resolution
        
        canvas.width = svg.clientWidth * scale;
        canvas.height = svg.clientHeight * scale;
        
        // Set background color - changed to white
        ctx.fillStyle = '#f7f8fd';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Convert SVG to image
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Download
            canvas.toBlob((blob) => {
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `knowledge_graph_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
                link.click();
                
                URL.revokeObjectURL(downloadUrl);
                URL.revokeObjectURL(url);
            }, 'image/png');
        };
        img.src = url;
    }

    // Create gradient definitions for 3D effect
    createGradientDefinitions() {
        const defs = this.svg.append('defs');
        
        // Create 50 radial gradients (3D effect)
        for (let i = 0; i < 50; i++) {
            const hue = (i * 137.508) % 360;
            const gradient = defs.append('radialGradient')
                .attr('id', `nodeGradient${i}`)
                .attr('cx', '30%')
                .attr('cy', '30%')
                .attr('r', '70%');

            gradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', `hsl(${hue}, 70%, 65%)`)
                .attr('stop-opacity', 1);

            gradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', `hsl(${hue}, 80%, 45%)`)
                .attr('stop-opacity', 1);
        }

        // Drop shadow filter
        const filter = defs.append('filter')
            .attr('id', 'drop-shadow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');

        filter.append('feDropShadow')
            .attr('dx', '2')
            .attr('dy', '2')
            .attr('stdDeviation', '3')
            .attr('flood-color', 'rgba(0,0,0,0.4)');

        // Glow effect filter
        const glowFilter = defs.append('filter')
            .attr('id', 'glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');

        const feGaussianBlur = glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');

        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode')
            .attr('in', 'coloredBlur');
        feMerge.append('feMergeNode')
            .attr('in', 'SourceGraphic');
    }

    // Calculate node size
    getNodeRadius(d) {
        const baseSize = Math.sqrt(d.size || 10);
        const citationFactor = d.attributes?.total_citations ? Math.log(d.attributes.total_citations + 1) * 0.3 : 0;
        const frequencyFactor = d.attributes?.frequency ? Math.sqrt(d.attributes.frequency) * 1.5 : 0;
        return Math.max(CONFIG.DEFAULTS.NODE_SIZE_MIN, 
                       Math.min(CONFIG.DEFAULTS.NODE_SIZE_MAX, 
                               baseSize * 2.5 + citationFactor + frequencyFactor)) * this.nodeScaleMultiplier;
    }

    // Determine node shape
    getNodeShape(d) {
        const radius = this.getNodeRadius(d);
        // Change all nodes to cute rounded squares
        return 'rounded-square';
    }

    // Dynamic node color
    getNodeColor(d, index) {
        const radius = this.getNodeRadius(d);
        const normalizedSize = Math.min(1, (radius - CONFIG.DEFAULTS.NODE_SIZE_MIN) / 
                                          (CONFIG.DEFAULTS.NODE_SIZE_MAX - CONFIG.DEFAULTS.NODE_SIZE_MIN));
        
        // Color palettes by node type (soft colors)
        const colorPalettes = {
            'concept': [200, 220, 240, 260, 280], // Blue tones
            'process': [120, 140, 160, 180, 200], // Green tones
            'molecule': [300, 320, 340, 360, 380], // Purple tones
            'enzyme': [40, 60, 80, 100, 120],     // Orange tones
            'complex': [0, 20, 40, 60, 80],       // Red tones
            'structure': [160, 180, 200, 220, 240], // Teal tones
            'pigment': [30, 50, 70, 90, 110],     // Gold tones
            'energy': [15, 35, 55, 75, 95],       // Orange-red tones
            'particle': [280, 300, 320, 340, 360], // Magenta tones
            'cell': [140, 160, 180, 200, 220],    // Teal tones
            'tissue': [100, 120, 140, 160, 180],  // Green tones
            'category': [180, 200, 220, 240, 260], // Blue tones
            'organelle': [220, 240, 260, 280, 300] // Blue-purple tones
        };
        
        const nodeType = d.type || 'concept';
        const palette = colorPalettes[nodeType] || colorPalettes['concept'];
        const colorIndex = index % palette.length;
        const baseHue = palette[colorIndex];
        
        // Adjust lightness based on size
        const saturation = 45 + normalizedSize * 25; // 45-70%
        const lightness = 70 - normalizedSize * 20;  // 70-50%
        
        return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
    }

    // Create curved path (Bezier curve)
    createCurvedPath(d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 10) return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`;
        
        // Calculate curvature (distance-based)
        const curvature = Math.min(80, distance * 0.15);
        const midX = (d.source.x + d.target.x) / 2;
        const midY = (d.source.y + d.target.y) / 2;
        
        // Create curve with perpendicular offset
        const offsetX = -dy / distance * curvature;
        const offsetY = dx / distance * curvature;
        
        const controlX = midX + offsetX;
        const controlY = midY + offsetY;
        
        return `M${d.source.x},${d.source.y} Q${controlX},${controlY} ${d.target.x},${d.target.y}`;
    }


    // Create cute rounded square
    createRoundedSquare(cx, cy, size) {
        const halfSize = size * 0.8; // Square size
        const radius = size * 0.15;  // Rounding radius (cuteness factor)
        
        const x = cx - halfSize;
        const y = cy - halfSize;
        const width = halfSize * 2;
        const height = halfSize * 2;
        const r = Math.min(radius, width / 2, height / 2);
        
        return `M${x + r},${y} 
                L${x + width - r},${y} 
                Q${x + width},${y} ${x + width},${y + r}
                L${x + width},${y + height - r} 
                Q${x + width},${y + height} ${x + width - r},${y + height}
                L${x + r},${y + height} 
                Q${x},${y + height} ${x},${y + height - r}
                L${x},${y + r} 
                Q${x},${y} ${x + r},${y} Z`;
    }

    // Create diamond shape
    createDiamond(cx, cy, size) {
        const half = size * 0.7;
        return `M${cx},${cy - half} L${cx + half},${cy} L${cx},${cy + half} L${cx - half},${cy} Z`;
    }

    // Create rounded rectangle
    createRoundedRect(cx, cy, width, height, radius) {
        const x = cx - width / 2;
        const y = cy - height / 2;
        const r = Math.min(radius, width / 2, height / 2);
        
        return `M${x + r},${y} 
                L${x + width - r},${y} 
                Q${x + width},${y} ${x + width},${y + r}
                L${x + width},${y + height - r} 
                Q${x + width},${y + height} ${x + width - r},${y + height}
                L${x + r},${y + height} 
                Q${x},${y + height} ${x},${y + height - r}
                L${x},${y + r} 
                Q${x},${y} ${x + r},${y} Z`;
    }

    // Update labels based on zoom level (LOD)
    updateNodeLabels() {
        const scale = this.transform?.k || 1;
        const labels = this.svg.selectAll('.node-label');
        
        if (scale < 0.5) {
            labels.style('opacity', 0);
        } else if (scale < 1) {
            labels
                .style('opacity', d => this.getNodeRadius(d) > 20 ? 0.8 : 0)
                .style('font-size', d => Math.max(8, this.getNodeRadius(d) * 0.25 * scale) + 'px');
        } else {
            labels
                .style('opacity', d => this.getNodeRadius(d) > 12 ? 1 : 0.7)
                .style('font-size', d => Math.max(9, Math.min(16, this.getNodeRadius(d) * 0.3 * Math.min(scale, 2))) + 'px');
        }
    }

    // Visualize graph
    visualizeGraph() {
        if (!this.visibleNodes || !this.visibleLinks) {
            console.log('No data available');
            return;
        }

        console.log('Starting visualization:', this.visibleNodes.length, 'nodes,', this.visibleLinks.length, 'edges');

        const startTime = performance.now();

        // Remove existing elements
        this.svg.selectAll('*').remove();

        const g = this.svg.append('g');

        // Render curved links
        const linkGroup = g.append('g').attr('class', 'edge-paths');
        const link = linkGroup
            .selectAll('path')
            .data(this.visibleLinks)
            .enter().append('path')
            .attr('class', 'link')
            .attr('fill', 'none')
            .style('stroke', 'rgba(150, 150, 150, 0.6)')
            .style('stroke-width', d => Math.max(0.5, Math.min(4, Math.sqrt(d.weight))))
            .style('opacity', d => UTILS.calculateEdgeOpacity(d.weight))
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => this.showLinkTooltip(event, d))
            .on('mouseout', this.hideLinkTooltip);

        const linkLabelData = this.visibleLinks.filter(d => (d.label && d.label.trim()) || (d.relationship_type && d.relationship_type.trim()));

        const linkLabels = g.append('g')
            .attr('class', 'edge-labels')
            .selectAll('text')
            .data(linkLabelData)
            .enter()
            .append('text')
            .attr('class', 'edge-label')
            .text(d => (d.label || d.relationship_type || '').trim())
            .attr('text-anchor', 'middle')
            .style('font-size', '10px')
            .style('font-weight', '500')
            .style('fill', 'rgba(230, 230, 230, 0.9)')
            .style('pointer-events', 'none')
            .style('paint-order', 'stroke')
            .style('stroke', 'rgba(0,0,0,0.35)')
            .style('stroke-width', '2px')
            .style('letter-spacing', '0.4px')
            .style('opacity', 0.85)
            .attr('x', d => this.getEdgeLabelPosition(d).x)
            .attr('y', d => this.getEdgeLabelPosition(d).y);

        // Render various node shapes
        const nodeContainer = g.append('g').attr('class', 'nodes-container');
        
        this.visibleNodes.forEach((d, i) => {
            const shape = this.getNodeShape(d);
            const radius = this.getNodeRadius(d);
            const color = this.getNodeColor(d, i);
            
            let nodeElement;
            
            if (shape === 'circle') {
                nodeElement = nodeContainer.append('circle')
                    .attr('r', radius)
                    .attr('cx', d.x || this.width/2)
                    .attr('cy', d.y || this.height/2);
            } else if (shape === 'rounded-rect') {
                const rectWidth = radius * 1.8;
                const rectHeight = radius * 1.2;
                nodeElement = nodeContainer.append('path')
                    .attr('d', this.createRoundedRect(d.x || this.width/2, d.y || this.height/2, rectWidth, rectHeight, radius * 0.2));
            } else if (shape === 'diamond') {
                nodeElement = nodeContainer.append('path')
                    .attr('d', this.createDiamond(d.x || this.width/2, d.y || this.height/2, radius * 1.4));
            } else if (shape === 'rounded-square') {
                nodeElement = nodeContainer.append('path')
                    .attr('d', this.createRoundedSquare(d.x || this.width/2, d.y || this.height/2, radius * 1.4));
            }
            
            nodeElement
                .attr('class', 'node')
                .attr('fill', color)
                .style('stroke', 'rgba(255, 255, 255, 0.4)')
                .style('stroke-width', Math.max(1, radius * 0.04))
                .style('filter', 'url(#drop-shadow)')
                .style('cursor', 'pointer')
                .datum(d)
                .call(d3.drag()
                    .on('start', this.dragstarted.bind(this))
                    .on('drag', this.dragged.bind(this))
                    .on('end', this.dragended.bind(this)))
                .on('click', (event, d) => this.handleNodeClick(event, d))
                .on('dblclick', (event, d) => this.handleNodeDoubleClick(event, d))
                .on('mouseover', (event, d) => this.handleNodeMouseOver(event, d))
                .on('mouseout', (event, d) => this.handleNodeMouseOut(event, d));
        });
        
        const node = nodeContainer.selectAll('.node');

        // Dynamic labels (considering zoom level and node size)
        const label = g.append('g').attr('class', 'labels-container')
            .selectAll('text')
            .data(this.visibleNodes.filter(d => this.getNodeRadius(d) > 12))
            .enter().append('text')
            .attr('class', 'node-label')
            .text(d => {
                const radius = this.getNodeRadius(d);
                const maxLen = Math.max(6, Math.min(25, radius * 0.5));
                return UTILS.truncateText(d.label, maxLen);
            })
            .style('font-size', d => Math.max(9, Math.min(16, this.getNodeRadius(d) * 0.3)) + 'px')
            .style('font-weight', '600')
            .style('text-shadow', '0 0 4px rgba(0,0,0,0.9)')
            .style('pointer-events', 'none');

        // Update simulation
        this.simulation.nodes(this.visibleNodes);
        this.simulation.force('link').links(this.visibleLinks);

        // Enhanced physics simulation
        this.simulation.on('tick', () => {
            // Update curved links
            link.attr('d', this.createCurvedPath.bind(this));
            
            // Update node positions (handling by shape)
            node.each((d, i, nodes) => {
                const shape = this.getNodeShape(d);
                const element = d3.select(nodes[i]);
                
                if (shape === 'circle') {
                    element.attr('cx', d.x).attr('cy', d.y);
                } else {
                    const radius = this.getNodeRadius(d);
                    if (shape === 'rounded-rect') {
                        const rectWidth = radius * 1.8;
                        const rectHeight = radius * 1.2;
                        element.attr('d', this.createRoundedRect(d.x, d.y, rectWidth, rectHeight, radius * 0.2));
                    } else if (shape === 'diamond') {
                        element.attr('d', this.createDiamond(d.x, d.y, radius * 1.4));
                    } else if (shape === 'rounded-square') {
                        element.attr('d', this.createRoundedSquare(d.x, d.y, radius * 1.4));
                    }
                }
            });

            // Update label positions
            label.attr('x', d => d.x).attr('y', d => d.y + 2);

            // Update edge label positions
            if (linkLabels) {
                linkLabels
                    .attr('x', d => this.getEdgeLabelPosition(d).x)
                    .attr('y', d => this.getEdgeLabelPosition(d).y);
            }
        });

        // Background click event
        this.svg.on('click', (event) => {
            if (event.target === this.svg.node()) {
                this.clearSelection();
            }
        });

        // Smooth appearance animation
        node
            .style('opacity', 0)
            .style('transform', 'scale(0)')
            .transition()
            .duration(CONFIG.ANIMATION.NODE_APPEAR_DURATION)
            .delay((d, i) => i * CONFIG.ANIMATION.NODE_APPEAR_DELAY)
            .style('opacity', 1)
            .style('transform', 'scale(1)');

        link
            .style('opacity', 0)
            .transition()
            .duration(CONFIG.ANIMATION.LINK_APPEAR_DURATION)
            .delay(CONFIG.ANIMATION.LINK_APPEAR_DELAY)
            .style('opacity', d => UTILS.calculateEdgeOpacity(d.weight));

        label
            .style('opacity', 0)
            .transition()
            .duration(CONFIG.ANIMATION.LABEL_APPEAR_DURATION)
            .delay(CONFIG.ANIMATION.LABEL_APPEAR_DELAY)
            .style('opacity', 1);

        if (linkLabels) {
            linkLabels
                .style('opacity', 0)
                .transition()
                .duration(600)
                .delay(CONFIG.ANIMATION.LINK_APPEAR_DELAY)
                .style('opacity', 0.85);
        }

        this.simulation.restart();

        this.performanceStats.renderTime = performance.now() - startTime;
        this.performanceStats.nodesInView = this.visibleNodes.length;
    }

    // Drag functions
    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Node interaction
    handleNodeClick(event, d) {
        event.stopPropagation();
        
        if (this.selectedNode === d) {
            this.clearSelection();
            this.hideNodeDetails();
            return;
        }
        
        this.selectedNode = d;
        
        // Find directly connected nodes
        const connectedNodes = new Set([d.id]);
        const connectedLinks = [];
        
        this.visibleLinks.forEach(link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            
            if (sourceId === d.id) {
                connectedNodes.add(targetId);
                connectedLinks.push(link);
            } else if (targetId === d.id) {
                connectedNodes.add(sourceId);
                connectedLinks.push(link);
            }
        });

        // Visual highlight
        this.svg.selectAll('.node')
            .classed('highlighted', node => connectedNodes.has(node.id))
            .style('opacity', node => connectedNodes.has(node.id) ? 1 : 0.2)
            .style('filter', node => {
                if (node.id === d.id) return 'url(#glow)';
                return connectedNodes.has(node.id) ? 'url(#drop-shadow) brightness(1.2)' : 'url(#drop-shadow) brightness(0.6)';
            });
        
        this.svg.selectAll('.link')
            .classed('highlighted', link => connectedLinks.includes(link))
            .style('opacity', link => connectedLinks.includes(link) ? 0.9 : 0.05)
            .style('stroke', link => {
                if (connectedLinks.includes(link)) {
                    return `hsl(${(d.id.length * 37) % 360}, 70%, 60%)`;
                }
                return 'rgba(150, 150, 150, 0.6)';
            })
            .style('stroke-width', link => {
                return connectedLinks.includes(link) ? 
                    Math.max(2, Math.sqrt(link.weight) * 2) : 
                    Math.max(0.5, Math.sqrt(link.weight));
            });
            
        // Show node details
        this.showNodeDetails(d);
    }
    
    // Show node details
    showNodeDetails(node) {
        const panel = document.getElementById('nodeDetailsPanel');
        const title = document.getElementById('nodeTitle');
        const type = document.getElementById('nodeType');
        const size = document.getElementById('nodeSize');
        const propertiesList = document.getElementById('propertiesList');
        const formulaSection = document.getElementById('formulaSection');
        const formulaDisplay = document.getElementById('formulaDisplay');
        const referencesSection = document.getElementById('referencesSection');
        const referencesList = document.getElementById('referencesList');
        
        // Set basic information
        title.textContent = node.label;
        type.textContent = this.formatNodeType(node.type);
        size.textContent = this.formatNodeSize(node.size);
        
        // Create properties list (excluding meaningless internal properties + special handling)
        propertiesList.innerHTML = '';
        const excludedKeys = new Set(['id','label','type','size','formula','index','x','y','vx','vy','fx','fy']);

        const addPropertyRow = (k, v) => {
            const propertyItem = document.createElement('div');
            propertyItem.className = 'property-item';

            const labelEl = document.createElement('span');
            labelEl.className = 'property-label';
            labelEl.textContent = this.formatPropertyName(k);

            const valueEl = document.createElement('span');
            valueEl.className = 'property-value';
            valueEl.textContent = this.formatPropertyValue(v);

            propertyItem.appendChild(labelEl);
            propertyItem.appendChild(valueEl);
            propertiesList.appendChild(propertyItem);
        };

        // Debugging: Check node data structure
        console.log('🔍 Displaying node details:', {
            nodeId: node.id,
            nodeLabel: node.label,
            nodeType: node.type,
            attributes: node.attributes,
            hasAttributes: !!node.attributes,
            attributesType: typeof node.attributes,
            allKeys: Object.keys(node),
            directProperties: Object.keys(node).filter(k => !excludedKeys.has(k))
        });

        // Process research literature information (high priority)
        if (node.attributes && typeof node.attributes === 'object') {
            const attrs = node.attributes;
            console.log('📊 Analyzing node attributes:', attrs);
            
            // Citation information
            if (attrs.total_citations !== undefined && attrs.total_citations !== null) {
                addPropertyRow('Total Citations', UTILS.formatNumber(attrs.total_citations));
            }
            if (attrs.citation_score !== undefined && attrs.citation_score !== null) {
                addPropertyRow('Citation Score', attrs.citation_score.toFixed(2));
            }
            
            // Frequency and active period
            if (attrs.frequency !== undefined && attrs.frequency !== null) {
                addPropertyRow('Frequency', `${attrs.frequency} times`);
            }
            if (attrs.first_appeared || attrs.last_appeared) {
                const start = attrs.first_appeared || '?';
                const end = attrs.last_appeared || '?';
                addPropertyRow('Research Period', `${start} - ${end}`);
            }
            
            // Number of related papers
            if (Array.isArray(attrs.related_papers)) {
                addPropertyRow('Related Papers', `${attrs.related_papers.length}`);
            }
            
            // Journal information
            if (attrs.journal_if !== undefined && attrs.journal_if !== null) {
                addPropertyRow('Journal IF', attrs.journal_if.toFixed(2));
            }

            // Additional research information
            if (attrs.pmid) addPropertyRow('PMID', attrs.pmid);
            if (attrs.doi) addPropertyRow('DOI', attrs.doi);
            if (attrs.journal) addPropertyRow('Journal', attrs.journal);
            if (attrs.pub_year) addPropertyRow('Publication Year', attrs.pub_year);
            if (attrs.authors) addPropertyRow('Authors', attrs.authors);
            if (attrs.abstract) addPropertyRow('Abstract', attrs.abstract.substring(0, 100) + '...');
            if (attrs.top_fields) addPropertyRow('Main Fields', attrs.top_fields);
            if (attrs.sub_fields) addPropertyRow('Sub-Fields', attrs.sub_fields);
        }

        // Also display the node's direct properties (in case 'attributes' is missing)
        const directProperties = Object.keys(node).filter(k => !excludedKeys.has(k));
        console.log('📋 Direct properties:', directProperties);
        
        directProperties.forEach(key => {
            const value = node[key];
            if (value !== undefined && value !== null) {
                // Skip already processed properties
                if (key === 'attributes' || key === 'formula' || key === 'value' || key === 'rate' || key === 'unit') {
                    return;
                }
                
                // Handle special properties
                if (key === 'Vcmax') {
                    addPropertyRow('Vcmax (Max Carboxylation Rate)', `${value} μmol/m²/s`);
                } else if (key === 'Jmax') {
                    addPropertyRow('Jmax (Max Electron Transport Rate)', `${value} μmol/m²/s`);
                } else {
                    addPropertyRow(key, this.formatPropertyValue(value));
                }
            }
        });

        // Process numerical data (including units)
        if (node.value !== undefined) {
            const unit = node.unit ? ` ${node.unit}` : '';
            addPropertyRow('Numerical Value', `${this.formatPropertyValue(node.value)}${unit}`);
        }
        if (node.rate !== undefined) {
            const unit = node.unit ? ` ${node.unit}` : '';
            addPropertyRow('Rate', `${this.formatPropertyValue(node.rate)}${unit}`);
        }

        // Display formula
        if (node.formula) {
            formulaSection.style.display = 'block';
            formulaDisplay.innerHTML = `$${node.formula}$`;
            // Re-render MathJax
            if (window.MathJax) {
                MathJax.typesetPromise([formulaDisplay]).catch(err => {
                    console.warn('MathJax rendering error:', err);
                });
            }
        } else {
            formulaSection.style.display = 'none';
        }

        // References section
        if (node.attributes && node.attributes.related_papers && Array.isArray(node.attributes.related_papers)) {
            referencesSection.style.display = 'block';
            referencesList.innerHTML = '';
            
            node.attributes.related_papers.slice(0, 5).forEach((paper, index) => {
                const refItem = document.createElement('div');
                refItem.className = 'reference-item';
                
                const titleEl = document.createElement('div');
                titleEl.className = 'reference-title';
                
                // Improved title handling
                let title = '';
                if (paper.title && paper.title.trim()) {
                    title = paper.title.trim();
                } else if (paper.name && paper.name.trim()) {
                    title = paper.name.trim();
                } else if (typeof paper === 'string' && paper.trim()) {
                    title = paper.trim();
                } else {
                    title = `Paper ${index + 1}`;
                }
                titleEl.textContent = title;
                
                const authorsEl = document.createElement('div');
                authorsEl.className = 'reference-authors';
                
                // Improved author/DOI information handling
                let authorInfo = '';
                if (paper.authors && paper.authors.trim()) {
                    authorInfo = paper.authors.trim();
                } else if (paper.author && paper.author.trim()) {
                    authorInfo = paper.author.trim();
                } else if (paper.doi && paper.doi.trim()) {
                    authorInfo = `DOI: ${paper.doi.trim()}`;
                } else if (paper.pmid && paper.pmid.trim()) {
                    authorInfo = `PMID: ${paper.pmid.trim()}`;
                } else if (paper.journal && paper.journal.trim()) {
                    authorInfo = paper.journal.trim();
                } else if (paper.year) {
                    authorInfo = `Publication Year: ${paper.year}`;
                } else {
                    authorInfo = 'No information available';
                }
                authorsEl.textContent = authorInfo;
                
                refItem.appendChild(titleEl);
                refItem.appendChild(authorsEl);
                referencesList.appendChild(refItem);
            });
        } else {
            referencesSection.style.display = 'none';
        }

        // If there are no properties, display an informational message
        if (propertiesList.children.length === 0) {
            const noDataItem = document.createElement('div');
            noDataItem.className = 'property-item';
            noDataItem.innerHTML = '<span class="property-label">Property Information</span><span class="property-value">No data available</span>';
            propertiesList.appendChild(noDataItem);
        }

        // Display panel
        panel.style.display = 'block';
        
        // Close button event
        const closeDetailsBtn = document.querySelector('.close-btn');
        if (closeDetailsBtn) {
            closeDetailsBtn.onclick = () => this.hideNodeDetails();
        }
    }
    
    // Hide node details
    hideNodeDetails() {
        const panel = document.getElementById('nodeDetailsPanel');
        panel.style.display = 'none';
    }
    
    // Format property name
    formatPropertyName(key) {
        return key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    // Format property value
    formatPropertyValue(value) {
        if (typeof value === 'number') {
            // Display up to 3 decimal places
            return Number.isInteger(value) ? value : value.toFixed(3);
        }
        return value;
    }
    
    // Format node type
    formatNodeType(type) {
        const typeMap = {
            'plant': 'Plant',
            'property': 'Property',
            'process': 'Process',
            'capacity': 'Capacity',
            'optimization': 'Optimization',
            'equation': 'Equation'
        };
        return typeMap[type] || type;
    }
    
    // Format node size
    formatNodeSize(size) {
        if (size >= 1000) {
            return `${(size / 1000).toFixed(1)}k`;
        } else if (size >= 100) {
            return `${Math.round(size / 10) * 10}+`;
        } else {
            return size.toString();
        }
    }

    handleNodeDoubleClick(event, d) {
        event.stopPropagation();
        
        // Find up to 2nd-degree connections
        const primaryConnected = new Set([d.id]);
        const secondaryConnected = new Set();
        const allConnectedLinks = [];
        
        // Find 1st-degree connections
        this.visibleLinks.forEach(link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            
            if (sourceId === d.id) {
                primaryConnected.add(targetId);
                allConnectedLinks.push({...link, level: 1});
            } else if (targetId === d.id) {
                primaryConnected.add(sourceId);
                allConnectedLinks.push({...link, level: 1});
            }
        });

        // Find 2nd-degree connections
        Array.from(primaryConnected).forEach(nodeId => {
            if (nodeId === d.id) return;
            
            this.visibleLinks.forEach(link => {
                const sourceId = link.source.id || link.source;
                const targetId = link.target.id || link.target;
                
                if (sourceId === nodeId && !primaryConnected.has(targetId)) {
                    secondaryConnected.add(targetId);
                    allConnectedLinks.push({...link, level: 2});
                } else if (targetId === nodeId && !primaryConnected.has(sourceId)) {
                    secondaryConnected.add(sourceId);
                    allConnectedLinks.push({...link, level: 2});
                }
            });
        });

        const allConnectedNodes = new Set([...primaryConnected, ...secondaryConnected]);
        
        // Enlarge central node (1.4x)
        this.svg.selectAll('.node')
            .style('transform', node => node.id === d.id ? 'scale(1.4)' : 'scale(1)')
            .style('opacity', node => {
                if (node.id === d.id) return 1;
                if (primaryConnected.has(node.id)) return 0.9;
                if (secondaryConnected.has(node.id)) return 0.6;
                return 0.1;
            })
            .style('filter', node => {
                if (node.id === d.id) return 'url(#glow)';
                if (primaryConnected.has(node.id)) return 'url(#drop-shadow) brightness(1.3)';
                if (secondaryConnected.has(node.id)) return 'url(#drop-shadow) brightness(1.1)';
                return 'url(#drop-shadow) brightness(0.4)';
            });

        // Style links by level
        this.svg.selectAll('.link')
            .style('opacity', link => {
                const linkData = allConnectedLinks.find(l => l.source === link.source && l.target === link.target);
                if (linkData) {
                    return linkData.level === 1 ? 0.9 : 0.5;
                }
                return 0.02;
            })
            .style('stroke', link => {
                const linkData = allConnectedLinks.find(l => l.source === link.source && l.target === link.target);
                if (linkData) {
                    const hue = (d.id.length * 37) % 360;
                    return linkData.level === 1 ? 
                        `hsl(${hue}, 80%, 65%)` : 
                        `hsl(${hue}, 60%, 50%)`;
                }
                return 'rgba(150, 150, 150, 0.3)';
            })
            .style('stroke-width', link => {
                const linkData = allConnectedLinks.find(l => l.source === link.source && l.target === link.target);
                if (linkData) {
                    return linkData.level === 1 ? 
                        Math.max(2.5, Math.sqrt(link.weight) * 2.5) :
                        Math.max(1.5, Math.sqrt(link.weight) * 1.5);
                }
                return 0.5;
            });

        this.showAdvancedTooltip(event, d, {
            primaryConnected: primaryConnected.size - 1,
            secondaryConnected: secondaryConnected.size,
            totalNetwork: allConnectedNodes.size - 1
        });
    }

    handleNodeMouseOver(event, d) {
        if (!this.selectedNode) {
            d3.select(event.currentTarget)
                .style('filter', 'url(#drop-shadow) brightness(1.2)');
            this.showTooltip(event, d);
        }
    }

    handleNodeMouseOut(event, d) {
        if (!this.selectedNode) {
            d3.select(event.currentTarget)
                .style('filter', 'url(#drop-shadow)');
            this.hideTooltip();
        }
    }

    // Tooltip functions
    showTooltip(event, d) {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.display = 'block';
        
        let tooltipContent = `<strong>${d.label}</strong><br>`;
        tooltipContent += `Type: ${d.type}<br>`;
        tooltipContent += `Size: ${Math.round(d.size)}<br>`;
        
        if (d.attributes) {
            if (d.attributes.total_citations) {
                tooltipContent += `Total Citations: ${d.attributes.total_citations}<br>`;
            }
            if (d.attributes.frequency) {
                tooltipContent += `Frequency: ${d.attributes.frequency}<br>`;
            }
            if (d.attributes.first_appeared && d.attributes.last_appeared) {
                tooltipContent += `Period: ${d.attributes.first_appeared} - ${d.attributes.last_appeared}<br>`;
            }
            if (d.attributes.related_papers && d.attributes.related_papers.length) {
                tooltipContent += `Related Papers: ${d.attributes.related_papers.length}`;
            }
        }
        
        tooltip.innerHTML = tooltipContent;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.min(event.pageX + 10, window.innerWidth - tooltipRect.width - 20);
        const top = Math.max(event.pageY - tooltipRect.height - 10, 20);
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    hideTooltip() {
        document.getElementById('tooltip').style.display = 'none';
    }

    showAdvancedTooltip(event, d, networkInfo = null) {
        const tooltip = document.getElementById('tooltip');
        tooltip.style.display = 'block';
        
        let tooltipContent = `<div style="max-width: 300px;">`;
        tooltipContent += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #4CAF50;">${d.label}</div>`;
        tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Type:</span> ${d.type}</div>`;
        tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Size:</span> ${Math.round(d.size)}</div>`;
        
        if (d.attributes) {
            if (d.attributes.total_citations) {
                tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Total Citations:</span> ${UTILS.formatNumber(d.attributes.total_citations)}</div>`;
            }
            if (d.attributes.frequency) {
                tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Frequency:</span> ${d.attributes.frequency}</div>`;
            }
            if (d.attributes.first_appeared && d.attributes.last_appeared) {
                tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Active Period:</span> ${d.attributes.first_appeared} - ${d.attributes.last_appeared}</div>`;
            }
            if (d.attributes.paper_count) {
                tooltipContent += `<div style="margin-bottom: 6px;"><span style="color: #888;">Related Papers:</span> ${d.attributes.paper_count}</div>`;
            }
            if (d.attributes.related_papers && d.attributes.related_papers.length > 0) {
                tooltipContent += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #444;">`;
                tooltipContent += `<div style="font-weight: 600; margin-bottom: 4px; color: #888;">Key Papers:</div>`;
                d.attributes.related_papers.slice(0, 3).forEach(paper => {
                    tooltipContent += `<div style="font-size: 12px; margin-bottom: 2px; opacity: 0.9;">• ${paper}</div>`;
                });
                if (d.attributes.related_papers.length > 3) {
                    tooltipContent += `<div style="font-size: 12px; opacity: 0.7;">... and ${d.attributes.related_papers.length - 3} more</div>`;
                }
                tooltipContent += `</div>`;
            }
        }
        
        if (networkInfo) {
            tooltipContent += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #444;">`;
            tooltipContent += `<div style="font-weight: 600; margin-bottom: 4px; color: #888;">Network Info:</div>`;
            tooltipContent += `<div style="font-size: 12px;">Direct Connections: ${networkInfo.primaryConnected}</div>`;
            tooltipContent += `<div style="font-size: 12px;">2nd-Degree Connections: ${networkInfo.secondaryConnected}</div>`;
            tooltipContent += `<div style="font-size: 12px; font-weight: 600; color: #4CAF50;">Total Network: ${networkInfo.totalNetwork}</div>`;
            tooltipContent += `</div>`;
        }
        
        tooltipContent += `</div>`;
        tooltip.innerHTML = tooltipContent;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.min(event.pageX + 15, window.innerWidth - tooltipRect.width - 20);
        const top = Math.max(event.pageY - tooltipRect.height - 15, 20);
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    // Link tooltip
    showLinkTooltip(event, d) {
        // Handle both object and ID references for source/target
        const sourceNode = typeof d.source === 'object' ? d.source : this.visibleNodes.find(n => n.id === d.source);
        const targetNode = typeof d.target === 'object' ? d.target : this.visibleNodes.find(n => n.id === d.target);
        
        const sourceLabel = sourceNode?.label || sourceNode?.id || d.source || 'Unknown';
        const targetLabel = targetNode?.label || targetNode?.id || d.target || 'Unknown';
        
        // Get relationship label/type (supports both 'label' and 'relationship_type' fields)
        const relationshipLabel = d.label || d.relationship_type || 'related';
        const weight = d.weight || 1;
        
        const tooltip = document.getElementById('tooltip');
        if (!tooltip) {
            console.warn('Tooltip element not found');
            return;
        }
        
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
            <strong>Relationship</strong><br>
            <strong>${sourceLabel}</strong> → <strong>${targetLabel}</strong><br>
            <em>${relationshipLabel}</em><br>
            Weight: ${weight}<br>
            Strength: ${weight > 5 ? 'Strong' : weight > 2 ? 'Medium' : 'Weak'}
        `;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.min(event.pageX + 10, window.innerWidth - tooltipRect.width - 20);
        const top = Math.max(event.pageY - tooltipRect.height - 10, 20);
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    hideLinkTooltip() {
        if (!this.selectedNode) {
            this.hideTooltip();
        }
    }

    // Clear selection
    clearSelection() {
        this.selectedNode = null;
        
        this.svg.selectAll('.node')
            .classed('highlighted', false)
            .style('opacity', 1)
            .style('transform', 'scale(1)')
            .style('filter', 'url(#drop-shadow)');
        
        this.svg.selectAll('.link')
            .classed('highlighted', false)
            .style('opacity', d => UTILS.calculateEdgeOpacity(d.weight))
            .style('stroke', 'rgba(150, 150, 150, 0.6)')
            .style('stroke-width', d => Math.max(0.5, Math.sqrt(d.weight)));
        
        this.hideTooltip();
        this.hideNodeDetails();
    }

    // Set data
    setData(nodes, links) {
        console.log('Setting data:', nodes.length, 'nodes,', links.length, 'edges');
        
        // Show loading when setting new data
        this.showLoading('Rendering graph...');
        
        this.allNodes = nodes.map(d => ({...d}));
        this.allLinks = links.map(d => ({...d}));
        this.visibleNodes = [...this.allNodes];
        this.visibleLinks = [...this.allLinks];
        
        // Immediately execute a simple visualization
        this.renderSimpleGraph();
    }

    // Render simple graph
    renderSimpleGraph() {
        console.log('🎨 renderSimpleGraph called');
        console.log('🎨 SVG exists:', !!this.svg);
        console.log('🎨 visibleNodes:', this.visibleNodes?.length);
        console.log('🎨 visibleLinks:', this.visibleLinks?.length);
        
        if (!this.svg || !this.visibleNodes || this.visibleNodes.length === 0) {
            console.log('❌ Cannot render - missing requirements:', {
                svg: !!this.svg,
                visibleNodes: !!this.visibleNodes,
                nodeCount: this.visibleNodes?.length
            });
            return;
        }

        console.log('✅ Starting simple graph rendering with', this.visibleNodes.length, 'nodes');

        // Remove existing elements
        this.svg.selectAll('*').remove();

        // Create a zoomable group (important: place all graph elements inside this group)
        const graphGroup = this.svg.append('g')
            .attr('class', 'graph-group');

        // Setup simulation
        this.simulation = d3.forceSimulation(this.visibleNodes)
            .force('link', d3.forceLink(this.visibleLinks).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2));

        // Render links (curved path + inherit color from core node)
        const link = graphGroup.append('g')
            .selectAll('path')
            .data(this.visibleLinks)
            .enter().append('path')
            .attr('class', 'link')
            .attr('fill', 'none')
            .attr('stroke-linecap', 'round')
            .attr('stroke', 'rgba(150, 150, 150, 0.7)')
            .attr('stroke-opacity', d => UTILS.calculateEdgeOpacity(d.weight || 1))
            .attr('stroke-width', d => Math.max(1.5, Math.sqrt(d.weight || 1) * 1.2) )
            .on('mouseover', (event, d) => this.showLinkTooltip(event, d))
            .on('mouseout', () => this.hideLinkTooltip());

        const simpleLinkLabelData = this.visibleLinks.filter(d => (d.label && d.label.trim()) || (d.relationship_type && d.relationship_type.trim()));
        const simpleLinkLabels = graphGroup.append('g')
            .attr('class', 'edge-labels')
            .selectAll('text')
            .data(simpleLinkLabelData)
            .enter()
            .append('text')
            .attr('class', 'edge-label')
            .text(d => (d.label || d.relationship_type || '').trim())
            .attr('text-anchor', 'middle')
            .style('font-size', '10px')
            .style('font-weight', '500')
            .style('fill', 'rgba(230, 230, 230, 0.9)')
            .style('pointer-events', 'none')
            .style('paint-order', 'stroke')
            .style('stroke', 'rgba(0,0,0,0.35)')
            .style('stroke-width', '2px')
            .style('letter-spacing', '0.4px')
            .style('opacity', 0.85)
            .attr('x', d => this.getEdgeLabelPosition(d).x)
            .attr('y', d => this.getEdgeLabelPosition(d).y);

        // Render nodes (inside the group)
        const node = graphGroup.append('g')
            .selectAll('circle')
            .data(this.visibleNodes)
            .enter().append('circle')
            .attr('class', 'node')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', (d, i) => this.getNodeColor(d, i))
            .attr('stroke', '#fff')
            .attr('stroke-width', '2px')
            .style('cursor', 'pointer')
            .on('click', (event, d) => this.handleNodeClick(event, d))
            .on('dblclick', (event, d) => this.handleNodeDoubleClick(event, d))
            .on('mouseover', (event, d) => this.handleNodeMouseOver(event, d))
            .on('mouseout', (event, d) => this.handleNodeMouseOut(event, d))
            .call(d3.drag()
                .on('start', this.dragstarted.bind(this))
                .on('drag', this.dragged.bind(this))
                .on('end', this.dragended.bind(this)));

        // Render labels (inside the group)
        const label = graphGroup.append('g')
            .selectAll('text')
            .data(this.visibleNodes)
            .enter().append('text')
            .attr('class', 'node-label')
            .text(d => d.label || d.id)
            .attr('font-size', '12px')
            .attr('fill', '#333')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('pointer-events', 'none');

        // Simulation tick event
        this.simulation.on('tick', () => {
            link
                .attr('d', d => this.getCurvedPath(d));

            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            label
                .attr('x', d => d.x)
                .attr('y', d => d.y);

            if (simpleLinkLabels) {
                simpleLinkLabels
                    .attr('x', d => this.getEdgeLabelPosition(d).x)
                    .attr('y', d => this.getEdgeLabelPosition(d).y);
            }
        });

        // Setup zoom (apply to the group)
        this.setupZoom();

        // Hide loading overlay after rendering
        this.hideLoading();

        console.log('✅ Simple graph rendering complete');
    }

    // Link color: Inherit color from the larger node (based on weight), considering it the core
    getEdgeColor(d) {
        const sourceNode = typeof d.source === 'object' ? d.source : this.visibleNodes.find(n => n.id === d.source);
        const targetNode = typeof d.target === 'object' ? d.target : this.visibleNodes.find(n => n.id === d.target);
        const sourceWeight = (sourceNode && sourceNode.size) || 1;
        const targetWeight = (targetNode && targetNode.size) || 1;
        const core = sourceWeight >= targetWeight ? sourceNode : targetNode;
        const color = this.getNodeColor(core || sourceNode || targetNode, 0);
        return UTILS.adjustColorBrightness(color, 0.8); // Slightly darken the color
    }

    // Smooth curved link path (quadratic curve)
    getCurvedPath(d) {
        const sx = d.source.x;
        const sy = d.source.y;
        const tx = d.target.x;
        const ty = d.target.y;

        // Calculate intermediate control point (offset from the midpoint in the normal direction)
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const normX = -dy / len;
        const normY = dx / len;
        const curvature = Math.min(40, 10 + Math.sqrt(d.weight || 1) * 6); // Curvature proportional to weight
        const cx = mx + normX * curvature;
        const cy = my + normY * curvature;

        return `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;
    }

    // Filtering
    updateFilters(nodeSizeThreshold, edgeWeightThreshold, maxNodesDisplay, progressiveLoading) {
        if (!this.allNodes || !this.allLinks) {
            console.log('No data to filter');
            return;
        }

        console.log('Applying filters:', {nodeSizeThreshold, edgeWeightThreshold, maxNodesDisplay, progressiveLoading});

        // Filter nodes
        let filteredNodes = this.allNodes.filter(node => (node.size || 10) >= nodeSizeThreshold);
        
        // Progressive loading - sort by size and select top nodes
        if (progressiveLoading && filteredNodes.length > maxNodesDisplay) {
            filteredNodes = filteredNodes
                .sort((a, b) => (b.size || 10) - (a.size || 10))
                .slice(0, maxNodesDisplay);
        } else if (filteredNodes.length > maxNodesDisplay) {
            filteredNodes = filteredNodes.slice(0, maxNodesDisplay);
        }

        // Filter edges - select only edges connected to filtered nodes
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = this.allLinks.filter(link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            return (link.weight || 1) >= edgeWeightThreshold && 
                   nodeIds.has(sourceId) && 
                   nodeIds.has(targetId);
        });

        this.visibleNodes = filteredNodes;
        this.visibleLinks = filteredLinks;

        console.log('Filtering result:', this.visibleNodes.length, 'nodes,', this.visibleLinks.length, 'edges');

        // Update visualization
        this.renderSimpleGraph();
    }

    // Simulation control
    updateSimulationStrength(strength) {
        if (this.simulation) {
            this.simulation.force('charge').strength(-strength * 10);
            this.simulation.force('link').strength(strength * 0.1);
            this.simulation.alpha(0.3).restart();
        }
        console.log('Simulation strength updated:', strength);
    }

    updateLinkDistance(distance) {
        if (this.simulation) {
            this.simulation.force('link').distance(distance * 50);
            this.simulation.alpha(0.3).restart();
        }
        console.log('Link distance updated:', distance);
    }

    updateNodeSize(scale) {
        this.nodeScaleMultiplier = scale;
        if (this.svg && this.svg.selectAll) {
            this.svg.selectAll('.node').each((d, i, nodes) => {
                const baseRadius = this.getNodeRadius(d);
                const element = d3.select(nodes[i]);
                const shape = this.getNodeShape(d);
                
                if (shape === 'circle') {
                    element.attr('r', baseRadius);
                } else if (shape === 'rounded-rect') {
                    const rectWidth = baseRadius * 1.8;
                    const rectHeight = baseRadius * 1.2;
                    element.attr('d', this.createRoundedRect(d.x, d.y, rectWidth, rectHeight, baseRadius * 0.2));
                } else if (shape === 'diamond') {
                    element.attr('d', this.createDiamond(d.x, d.y, baseRadius * 1.4));
                } else if (shape === 'rounded-square') {
                    element.attr('d', this.createRoundedSquare(d.x, d.y, baseRadius * 1.4));
                }
            });
            
            this.svg.selectAll('.node-label')
                .style('font-size', d => Math.max(9, Math.min(16, this.getNodeRadius(d) * 0.3)) + 'px');
        }
    }

    // Change layout
    changeLayout(layout) {
        if (!this.simulation || !this.visibleNodes) return;
        
        switch(layout) {
            case 'circular':
                this.simulation.force('x', null);
                this.simulation.force('y', null);
                this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
                break;
            case 'radial':
                this.simulation.force('x', null);
                this.simulation.force('y', null);
                this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
                this.simulation.force('radial', d3.forceRadial(100, this.width / 2, this.height / 2));
                break;
            default: // force
                this.simulation.force('x', d3.forceX(this.width / 2).strength(0.1));
                this.simulation.force('y', d3.forceY(this.height / 2).strength(0.1));
                this.simulation.force('radial', null);
                break;
        }
        
        this.simulation.alpha(0.3).restart();
    }

    // Reset
    resetSimulation() {
        if (this.simulation) {
            this.simulation.alpha(1).restart();
        }
        this.clearSelection();
    }

    // Handle window resize
    handleResize() {
        const container = document.querySelector('.graph-container');
        const newWidth = container.offsetWidth;
        const newHeight = container.offsetHeight;
        
        if (this.width !== newWidth || this.height !== newHeight) {
            this.width = newWidth;
            this.height = newHeight;
            
            this.svg.attr('width', this.width).attr('height', this.height);
            
            if (this.simulation) {
                this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
                this.simulation.force('x', d3.forceX(this.width / 2).strength(0.1));
                this.simulation.force('y', d3.forceY(this.height / 2).strength(0.1));
                this.simulation.restart();
            }
        }
    }

    // Update performance stats
    updatePerformanceStats() {
        this.frameCount++;
        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;
        
        if (deltaTime >= 1000) { // Update every second
            this.performanceStats.fps = Math.round(this.frameCount * 1000 / deltaTime);
            this.frameCount = 0;
            this.lastFrameTime = now;
        }
    }

    // Methods for performance monitoring
    getLastRenderTime() {
        return this.performanceStats.renderTime || 0;
    }

    getVisibleNodesCount() {
        return this.visibleNodes ? this.visibleNodes.length : 0;
    }

    getVisibleEdgesCount() {
        return this.visibleLinks ? this.visibleLinks.length : 0;
    }
    
    // Highlight search results
    highlightSearchResults(matchingNodes, searchTerm) {
        if (!this.svg) return;
        
        // Reset styles of all nodes
        this.svg.selectAll('.node')
            .style('opacity', 0.3)
            .style('stroke', '#fff')
            .style('stroke-width', '2px');
        
        this.svg.selectAll('.node-label')
            .style('opacity', 0.3);
        
        // Highlight search result nodes
        const matchingNodeIds = new Set(matchingNodes.map(n => n.id));
        
        this.svg.selectAll('.node')
            .filter(d => matchingNodeIds.has(d.id))
            .style('opacity', 1)
            .style('stroke', '#ff6b6b')
            .style('stroke-width', '3px');
        
        this.svg.selectAll('.node-label')
            .filter(d => matchingNodeIds.has(d.id))
            .style('opacity', 1)
            .style('font-weight', 'bold');
        
        console.log('Search result highlighting complete:', matchingNodes.length, 'nodes');
    }
    
    // Clear search
    clearSearch() {
        if (!this.svg) return;
        
        // Restore styles of all nodes
        this.svg.selectAll('.node')
            .style('opacity', 1)
            .style('stroke', '#fff')
            .style('stroke-width', '2px');
        
        this.svg.selectAll('.node-label')
            .style('opacity', 1)
            .style('font-weight', 'normal');
        
        console.log('Search cleared');
    }
}
