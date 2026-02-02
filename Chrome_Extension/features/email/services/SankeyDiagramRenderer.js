/**
 * D3-based Sankey diagram renderer for the Pipeline (Diagram) view.
 * Parses SankeyMATIC-style text (Source [amount] Target) and renders the diagram.
 * Requires global d3 (d3.min.js and d3-sankey.min.js loaded before use).
 */

const FLOW_LINE_REGEX = /^(.+?)\s*\[\s*([\d.]+)\s*\]\s*(.+)$/;

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
            .style('display', 'block')
            .style('overflow', 'hidden');

        // Clip all diagram content to viewBox so labels cannot extend past the frame
        const clipId = 'sankey-clip-' + Math.random().toString(36).slice(2, 10);
        const clip = svg.append('defs').append('clipPath').attr('id', clipId);
        clip.append('rect').attr('x', 0).attr('y', 0).attr('width', width).attr('height', height);

        const color = d3.scaleOrdinal(d3.schemeTableau10);

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
            links: data.links.map((d) => ({ ...d })),
        });

        const linkGenerator = d3.sankeyLinkHorizontal();

        const diagram = svg.append('g').attr('clip-path', `url(#${clipId})`);

        diagram
            .append('g')
            .attr('class', 'sankey-links')
            .selectAll('path')
            .data(links)
            .join('path')
            .attr('d', linkGenerator)
            .attr('fill', 'none')
            .attr('stroke', (d) => d3.color(color(d.source.name)).brighter(0.5))
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', (d) => Math.max(2, d.width));

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
            .attr('font-size', 10)
            .attr('font-family', 'system-ui, sans-serif')
            .attr('font-weight', '500')
            .text((d) => String(Math.round(d.value)));

        const node = diagram
            .append('g')
            .attr('class', 'sankey-nodes')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

        node
            .append('rect')
            .attr('height', (d) => d.y1 - d.y0)
            .attr('width', (d) => d.x1 - d.x0)
            .attr('fill', (d) => color(d.name))
            .attr('stroke', (d) => d3.color(color(d.name)).darker(0.5));

        const nodeWidth = (d) => d.x1 - d.x0;
        const isLeftColumn = (d) => d.depth === 0;
        const labelGap = 6;
        node
            .append('text')
            .attr('x', (d) => (isLeftColumn(d) ? -labelGap : nodeWidth(d) + labelGap))
            .attr('y', (d) => (d.y1 - d.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d) => (isLeftColumn(d) ? 'end' : 'start'))
            .attr('fill', 'var(--decluttr-text, #333)')
            .attr('font-size', 10)
            .attr('font-family', 'system-ui, sans-serif')
            .attr('style', 'pointer-events: none;')
            .text((d) => d.name);
    };

    requestAnimationFrame(draw);
}
