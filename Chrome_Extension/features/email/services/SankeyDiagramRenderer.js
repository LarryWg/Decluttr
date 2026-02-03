/**
 * D3-based Sankey diagram renderer for the Pipeline (Diagram) view.
 * Parses SankeyMATIC-style text (Source [amount] Target) and renders the diagram.
 * Requires global d3 (d3.min.js and d3-sankey.min.js loaded before use).
 * 
 * Enhanced with: flowing animations, color gradients, hover effects, entry animations.
 */

const FLOW_LINE_REGEX = /^(.+?)\s*\[\s*([\d.]+)\s*\]\s*(.+)$/;

// Stage-based color scheme for visual impact
const STAGE_COLORS = {
    'Applications Sent': { fill: '#6366f1', gradient: ['#6366f1', '#818cf8'] },
    'OA / Screening': { fill: '#06b6d4', gradient: ['#06b6d4', '#22d3ee'] },
    'Interview': { fill: '#10b981', gradient: ['#10b981', '#34d399'] },
    'Offer': { fill: '#f59e0b', gradient: ['#f59e0b', '#fbbf24'] },
    'Accepted': { fill: '#22c55e', gradient: ['#22c55e', '#4ade80'] },
    'Rejected': { fill: '#ef4444', gradient: ['#ef4444', '#f87171'] },
    'No Response': { fill: '#6b7280', gradient: ['#6b7280', '#9ca3af'] },
    'Declined': { fill: '#8b5cf6', gradient: ['#8b5cf6', '#a78bfa'] },
};

const DEFAULT_COLOR = { fill: '#6366f1', gradient: ['#6366f1', '#818cf8'] };

/**
 * Get color config for a node name.
 */
function getStageColor(name) {
    return STAGE_COLORS[name] || DEFAULT_COLOR;
}

/**
 * Parse SankeyMATIC-style text into nodes and links for d3-sankey.
 */
export function parseSankeyText(text) {
    const links = [];
    const nodeNames = new Set();

    if (!text || typeof text !== 'string') return { nodes: [], links: [] };

    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const m = trimmed.match(FLOW_LINE_REGEX);
        if (!m) continue;
        const [, source, amountStr, target] = m;
        const sourceName = source.trim();
        const targetName = target.trim();
        const value = parseFloat(amountStr);
        if (!sourceName || !targetName || Number.isNaN(value) || value <= 0) continue;
        nodeNames.add(sourceName);
        nodeNames.add(targetName);
        links.push({ source: sourceName, target: targetName, value });
    }

    const nodes = Array.from(nodeNames).map((name) => ({ name }));
    return { nodes, links };
}

/**
 * Render a Sankey diagram into the given container using D3.
 * Enhanced with animations and visual effects.
 */
export function renderSankey(container, data) {
    if (!container || !data || !data.nodes.length || !data.links.length) return;

    const d3 = window.d3;
    if (!d3 || !d3.sankey) {
        container.innerHTML = '<p class="sankeyDiagramError">D3 Sankey not loaded. Reload the extension.</p>';
        return;
    }

    container.innerHTML = '';

    const draw = () => {
        const rect = container.getBoundingClientRect();
        const width = Math.max(rect.width || 460, 400);
        const height = Math.max(rect.height || 380, 320);

        // Reserve enough space so node labels (left/right of nodes) stay inside the frame
        const marginLeft = Math.max(140, width * 0.26);
        const marginRight = Math.max(140, width * 0.26);
        const marginTop = Math.max(28, height * 0.06);
        const marginBottom = Math.max(28, height * 0.06);

        const svg = d3
            .select(container)
            .append('svg')
            .attr('viewBox', [0, 0, width, height])
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('class', 'sankey-svg')
            .style('display', 'block')
            .style('overflow', 'hidden');

        // Add CSS for animations
        const style = document.createElement('style');
        style.textContent = `
            .sankey-svg {
                opacity: 0;
                animation: sankeyFadeIn 0.6s ease-out forwards;
            }
            @keyframes sankeyFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .sankey-link {
                transition: stroke-opacity 0.3s ease, filter 0.3s ease;
            }
            .sankey-link:hover {
                stroke-opacity: 0.9 !important;
                filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.5));
            }
            .sankey-node rect {
                transition: filter 0.3s ease, transform 0.3s ease;
                transform-origin: center;
            }
            .sankey-node:hover rect {
                filter: brightness(1.1) drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
            }
            .sankey-node text {
                transition: fill 0.3s ease;
            }
            .sankey-node:hover text {
                fill: var(--decluttr-accent, #6366f1) !important;
            }
        `;
        container.appendChild(style);

        // Clip all diagram content to viewBox so labels cannot extend past the frame
        const clipId = 'sankey-clip-' + Math.random().toString(36).slice(2, 10);
        const defs = svg.append('defs');
        const clip = defs.append('clipPath').attr('id', clipId);
        clip.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height);

        // Add gradients for links
        data.links.forEach((link, i) => {
            const sourceColor = getStageColor(link.source);
            const targetColor = getStageColor(link.target);
            const gradientId = `link-gradient-${i}`;
            const gradient = defs.append('linearGradient')
                .attr('id', gradientId)
                .attr('gradientUnits', 'userSpaceOnUse');
            gradient.append('stop').attr('offset', '0%').attr('stop-color', sourceColor.gradient[0]);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', targetColor.gradient[0]);
            link.gradientId = gradientId;
        });

        const sankeyGenerator = d3
            .sankey()
            .nodeId((d) => d.name)
            .nodeWidth(20)
            .nodePadding(12)
            .extent([
                [marginLeft, marginTop],
                [width - marginRight, height - marginBottom],
            ]);

        const { nodes, links } = sankeyGenerator({
            nodes: data.nodes.map((d) => ({ ...d })),
            links: data.links.map((d, i) => ({ ...d, gradientId: data.links[i].gradientId })),
        });

        // Update gradient coordinates
        links.forEach((link, i) => {
            const gradient = defs.select(`#link-gradient-${i}`);
            if (gradient) {
                gradient
                    .attr('x1', link.source.x1)
                    .attr('y1', (link.y0 + link.y1) / 2)
                    .attr('x2', link.target.x0)
                    .attr('y2', (link.y0 + link.y1) / 2);
            }
        });

        const linkGenerator = d3.sankeyLinkHorizontal();

        const diagram = svg.append('g').attr('clip-path', `url(#${clipId})`);

        // Draw links with gradients
        const linkPaths = diagram
            .append('g')
            .attr('class', 'sankey-links')
            .selectAll('path')
            .data(links)
            .join('path')
            .attr('class', 'sankey-link')
            .attr('d', linkGenerator)
            .attr('fill', 'none')
            .attr('stroke', (d, i) => `url(#link-gradient-${i})`)
            .attr('stroke-opacity', 0.5)
            .attr('stroke-width', (d) => Math.max(2, d.width))
            .style('stroke-dasharray', '0')
            .style('opacity', 0);

        // Animate links appearing
        linkPaths.transition()
            .duration(800)
            .delay((d, i) => i * 50)
            .style('opacity', 1);

        // Link value labels
        const midX = (d) => (d.source.x1 + d.target.x0) / 2;
        const midY = (d) => (d.y0 + d.y1) / 2;
        diagram
            .append('g')
            .attr('class', 'sankey-link-labels')
            .selectAll('text')
            .data(links)
            .join('text')
            .attr('x', (d) => midX(d) + 14)
            .attr('y', (d) => midY(d))
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .attr('fill', 'var(--decluttr-text, #333)')
            .attr('font-size', 11)
            .attr('font-family', 'system-ui, sans-serif')
            .attr('font-weight', '600')
            .style('opacity', 0)
            .text((d) => String(Math.round(d.value)))
            .transition()
            .duration(600)
            .delay((d, i) => 400 + i * 30)
            .style('opacity', 1);

        // Draw nodes
        const node = diagram
            .append('g')
            .attr('class', 'sankey-nodes')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'sankey-node')
            .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

        // Node rectangles with stage colors
        node
            .append('rect')
            .attr('height', (d) => d.y1 - d.y0)
            .attr('width', (d) => d.x1 - d.x0)
            .attr('rx', 4)
            .attr('ry', 4)
            .attr('fill', (d) => getStageColor(d.name).fill)
            .attr('stroke', (d) => d3.color(getStageColor(d.name).fill).darker(0.3))
            .attr('stroke-width', 1.5)
            .style('opacity', 0)
            .transition()
            .duration(600)
            .delay((d, i) => 200 + i * 80)
            .style('opacity', 1);

        // Node labels
        const nodeWidth = (d) => d.x1 - d.x0;
        const isLeftColumn = (d) => d.depth === 0;
        const labelGap = 8;
        node
            .append('text')
            .attr('x', (d) => (isLeftColumn(d) ? -labelGap : nodeWidth(d) + labelGap))
            .attr('y', (d) => (d.y1 - d.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d) => (isLeftColumn(d) ? 'end' : 'start'))
            .attr('fill', 'var(--decluttr-text, #333)')
            .attr('font-size', 11)
            .attr('font-family', 'system-ui, sans-serif')
            .attr('font-weight', '500')
            .attr('style', 'pointer-events: none;')
            .style('opacity', 0)
            .text((d) => d.name)
            .transition()
            .duration(500)
            .delay((d, i) => 300 + i * 80)
            .style('opacity', 1);

        // Add glow filter for hover
        const glowFilter = defs.append('filter').attr('id', 'glow');
        glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    };

    requestAnimationFrame(draw);
}
