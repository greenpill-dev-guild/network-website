import ForceGraph from 'force-graph';

interface GraphNode {
  id: string;
  label: string;
  description?: string;
  node_type?: string;
  tags?: string[];
  importance?: number;
  overlap_role?: string;
  source_node_refs?: Record<string, any>;
  layer?: string;
  renderColor?: string;
  renderSize?: number;
  searchText?: string;
  degree?: number;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  confidence?: number;
  capital_forms?: string[];
  kind?: string;
  label?: string;
  weight?: number;
  layerSpan?: string;
  color?: string;
}

interface RawGraph {
  nodes: GraphNode[];
  relationships?: GraphLink[];
  capital_flows?: GraphLink[];
}

interface NormalizedGraph {
  key: string;
  raw: RawGraph;
  nodes: GraphNode[];
  links: GraphLink[];
}

interface FilteredGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  nodeMap: Map<string, GraphNode>;
}

const DATASETS: Record<string, { label: string; url: string; description: string }> = {
  overlap: {
    label: "Bridge View",
    url: "/data/greenpill-graph/podcast/greenpill-podcast-network-overlap.graph.json",
    description: "Direct overlap between the podcast and the live network.",
  },
  network: {
    label: "Network Layer",
    url: "/data/greenpill-graph/greenpill-network.graph.json",
    description: "The structural Greenpill network graph.",
  },
};

const state = {
  datasetKey: "overlap",
  selectedNodeId: null as string | null,
  hoverNodeId: null as string | null,
};

const cache: { raw: Record<string, RawGraph>; normalized: Record<string, NormalizedGraph> } = { raw: {}, normalized: {} };
const dom: Record<string, any> = {};
let graph2d: any = null;
let currentDataset: NormalizedGraph | null = null;
let currentFiltered: FilteredGraph | null = null;

function syncUrlState() {
  const params = new URLSearchParams(window.location.search);
  params.set("dataset", state.datasetKey);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function getNodeId(nodeOrId: any): string {
  return typeof nodeOrId === "object" ? nodeOrId.id : nodeOrId;
}

function alpha(hex: string, value: number): string {
  const clean = hex.replace("#", "");
  const parts = clean.length === 3
    ? clean.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${value})`;
}

function escapeHtml(value: string = ""): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function prettyLabel(value?: string): string {
  if (!value) return "Unknown";
  return String(value).replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function resolveLayer(node: GraphNode, datasetKey: string): string {
  if (datasetKey === "network") return "network";
  // overlap dataset
  const refs = node.source_node_refs || {};
  if (refs.main_graph && refs.podcast_graph) return "bridge";
  if (refs.main_graph) return "network";
  if (refs.podcast_graph) return "podcast";
  if ((node.overlap_role || "").includes("bridge")) return "bridge";
  if ((node.overlap_role || "").includes("active_person_unmatched")) return "network";
  return "bridge";
}

function resolveNodeColor(node: GraphNode, layer: string): string {
  if ((node.overlap_role || "").includes("active_person")) return "#ff9ec9";
  if (node.overlap_role === "bridge_entity") return "#ffb55f";
  if (node.overlap_role === "bridge_episode") return "#d6a0ff";
  if (layer === "network") return "#7ef3ab";
  if (layer === "podcast") return "#78b8ff";
  return "#ffb55f";
}

function resolveNodeSize(node: GraphNode): number {
  return Math.max(4, (node.importance || 2) * 1.9);
}

function resolveLinkColor(link: GraphLink): string {
  if (link.kind === "capital") return alpha("#ff78c8", 0.72);
  if (link.layerSpan === "bridge") return alpha("#ffb55f", 0.38);
  if (link.layerSpan === "podcast") return alpha("#78b8ff", 0.24);
  return alpha("#7ef3ab", 0.24);
}

function normalizeGraph(raw: RawGraph, datasetKey: string): NormalizedGraph {
  const nodes = raw.nodes.map((node) => {
    const layer = resolveLayer(node, datasetKey);
    return {
      ...node,
      layer,
      renderColor: resolveNodeColor(node, layer),
      renderSize: resolveNodeSize(node),
      searchText: [node.label, node.description, ...(node.tags || [])].filter(Boolean).join(" ").toLowerCase(),
    };
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const linkLayer = (sourceId: string, targetId: string): string => {
    const source = nodeMap.get(sourceId);
    const target = nodeMap.get(targetId);
    if (!source || !target) return "bridge";
    if (source.layer === target.layer) return source.layer!;
    return "bridge";
  };

  const structuralLinks = (raw.relationships || []).map((link) => ({
    ...link,
    source: link.source,
    target: link.target,
    kind: "structure",
    label: prettyLabel(link.relation),
    capital_forms: [],
    weight: 1 + (link.confidence || 0.4) * 1.2,
    layerSpan: linkLayer(link.source, link.target),
  }));

  const capitalLinks = (raw.capital_flows || []).map((link) => ({
    ...link,
    source: link.source,
    target: link.target,
    kind: "capital",
    label: (link.capital_forms || []).join(", "),
    weight: 1.2 + (link.capital_forms || []).length * 0.35,
    layerSpan: linkLayer(link.source, link.target),
  }));

  return {
    key: datasetKey,
    raw,
    nodes,
    links: [...structuralLinks, ...capitalLinks],
  };
}

async function loadDataset(datasetKey: string): Promise<NormalizedGraph> {
  if (cache.normalized[datasetKey]) return cache.normalized[datasetKey];
  const raw = await fetchJson(DATASETS[datasetKey].url);
  cache.raw[datasetKey] = raw;
  const normalized = normalizeGraph(raw, datasetKey);
  cache.normalized[datasetKey] = normalized;
  return normalized;
}

function buildButtons(container: HTMLElement, items: Array<{ id: string; label: string }>, activeId: string, handler: (id: string) => void) {
  container.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.className = activeId === item.id ? "is-active" : "";
    button.setAttribute("aria-pressed", activeId === item.id ? "true" : "false");
    button.addEventListener("click", () => handler(item.id));
    container.appendChild(button);
  });
}

function refreshControls(dataset: NormalizedGraph) {
  buildButtons(
    dom.datasetPills,
    Object.entries(DATASETS).map(([id, item]) => ({ id, label: item.label })),
    state.datasetKey,
    async (datasetKey: string) => {
      state.datasetKey = datasetKey;
      state.selectedNodeId = null;
      state.hoverNodeId = null;
      syncUrlState();
      await render();
    }
  );

  const labels = dataset.nodes
    .map((node) => node.label)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  dom.searchList.innerHTML = labels.map((label: string) => `<option value="${escapeHtml(label)}"></option>`).join("");
}

function filterDataset(dataset: NormalizedGraph): FilteredGraph {
  let nodes = dataset.nodes.slice();
  const visibleNodeIds = new Set(nodes.map((n) => n.id));

  let links = dataset.links.filter((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });

  if (links.length) {
    const linkedNodeIds = new Set<string>();
    links.forEach((link) => {
      linkedNodeIds.add(getNodeId(link.source));
      linkedNodeIds.add(getNodeId(link.target));
    });
    nodes = nodes.filter((node) => linkedNodeIds.has(node.id) || node.id === state.selectedNodeId);
  }

  const linksWithStyle = links.map((link) => ({
    ...link,
    color: resolveLinkColor(link),
    source: getNodeId(link.source),
    target: getNodeId(link.target),
  }));

  const degree: Record<string, number> = {};
  linksWithStyle.forEach((link) => {
    degree[link.source] = (degree[link.source] || 0) + 1;
    degree[link.target] = (degree[link.target] || 0) + 1;
  });

  nodes = nodes.map((node) => ({ ...node, degree: degree[node.id] || 0 }));

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  if (state.selectedNodeId && !nodeMap.has(state.selectedNodeId)) {
    state.selectedNodeId = null;
  }

  return { nodes, links: linksWithStyle, nodeMap };
}

function getRelatedNodes(nodeId: string): GraphNode[] {
  if (!currentFiltered) return [];
  const related = new Map<string, GraphNode>();
  currentFiltered.links.forEach((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    if (sourceId === nodeId && currentFiltered!.nodeMap.has(targetId)) {
      related.set(targetId, currentFiltered!.nodeMap.get(targetId)!);
    }
    if (targetId === nodeId && currentFiltered!.nodeMap.has(sourceId)) {
      related.set(sourceId, currentFiltered!.nodeMap.get(sourceId)!);
    }
  });
  return [...related.values()].sort((a, b) => (b.degree || 0) - (a.degree || 0));
}

function renderInspector() {
  if (!currentFiltered || !state.selectedNodeId || !currentFiltered.nodeMap.has(state.selectedNodeId)) {
    const featured = currentFiltered
      ? [...currentFiltered.nodes].sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 8)
      : [];
    dom.inspectorBody.innerHTML = `
      <div class="empty-state">
        <h3>Pick a node to inspect it.</h3>
        <p class="muted-copy">Click any node in the graph to see its details and connections.</p>
        <div class="detail-section">
          <h3>Suggested starting points</h3>
          <div class="related-list">
            ${featured.map((n) => `<button type="button" class="related-button" data-node-id="${n.id}">${escapeHtml(n.label)}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    bindRelatedButtons();
    return;
  }

  const node = currentFiltered.nodeMap.get(state.selectedNodeId)!;
  const related = getRelatedNodes(node.id).slice(0, 12);

  dom.inspectorBody.innerHTML = `
    <div class="detail-stack">
      <div class="detail-section">
        <h3>${escapeHtml(node.label)}</h3>
        <div class="badge-row">
          <span class="detail-badge">${escapeHtml(prettyLabel(node.node_type))}</span>
          <span class="detail-badge">${escapeHtml(prettyLabel(node.layer))}</span>
        </div>
      </div>

      <p>${escapeHtml(node.description || "No description provided.")}</p>

      <div class="detail-grid">
        <div class="detail-cell">
          <span>Importance</span>
          <strong>${node.importance || 0}</strong>
        </div>
        <div class="detail-cell">
          <span>Degree</span>
          <strong>${node.degree || 0}</strong>
        </div>
      </div>

      ${related.length ? `
        <div class="detail-section">
          <h3>Related nodes</h3>
          <div class="related-list">
            ${related.map((r) => `<button type="button" class="related-button" data-node-id="${r.id}">${escapeHtml(r.label)}</button>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;

  bindRelatedButtons();
}

function bindRelatedButtons() {
  dom.inspectorBody.querySelectorAll("[data-node-id]").forEach((button: HTMLElement) => {
    button.addEventListener("click", () => focusNode(button.dataset.nodeId!));
  });
}

function drawNode2d(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) {
  const radius = state.selectedNodeId === node.id ? node.renderSize! * 1.45 : node.renderSize!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
  ctx.fillStyle = node.renderColor!;
  ctx.shadowColor = node.renderColor!;
  ctx.shadowBlur = state.selectedNodeId === node.id ? 22 : state.hoverNodeId === node.id ? 14 : 7;
  ctx.fill();

  if (state.selectedNodeId === node.id) {
    ctx.strokeStyle = alpha("#ffffff", 0.9);
    ctx.lineWidth = 2.5 / globalScale;
    ctx.stroke();
  }

  const shouldLabel = state.selectedNodeId === node.id
    || state.hoverNodeId === node.id
    || (node.importance || 0) >= 5
    || (node.overlap_role || "").includes("bridge");

  if (shouldLabel) {
    const fontSize = Math.max(12 / globalScale, 4.2);
    ctx.font = `600 ${fontSize}px Inter`;
    const text = node.label;
    const textWidth = ctx.measureText(text).width;
    const paddingX = 6 / globalScale;
    const paddingY = 4 / globalScale;
    const x = node.x! + radius + 6 / globalScale;
    const y = node.y! - radius - 6 / globalScale;

    ctx.fillStyle = alpha("#07120d", 0.92);
    ctx.fillRect(x - paddingX, y - fontSize, textWidth + paddingX * 2, fontSize + paddingY * 2);
    ctx.fillStyle = "#f7fbf4";
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

function ensure2dGraph(): any {
  if (graph2d) return graph2d;
  graph2d = ForceGraph()(dom.graph2d);
  graph2d
    .backgroundColor("rgba(0,0,0,0)")
    .nodeId("id")
    .nodeCanvasObject(drawNode2d)
    .nodePointerAreaPaint((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, node.renderSize! + 6, 0, 2 * Math.PI);
      ctx.fill();
    })
    .linkColor((link: GraphLink) => link.color)
    .linkWidth((link: GraphLink) => link.kind === "capital" ? 2.2 : 1.05)
    .linkCurvature((link: GraphLink) => link.kind === "capital" ? 0.18 : 0)
    .linkDirectionalParticles((link: GraphLink) => link.kind === "capital" ? 2 : 0)
    .linkDirectionalParticleColor((link: GraphLink) => link.kind === "capital" ? "#ff78c8" : "#ffffff")
    .linkDirectionalParticleWidth((link: GraphLink) => link.kind === "capital" ? 2.4 : 0)
    .d3Force("charge").strength(-180);

  graph2d
    .onNodeHover((node: GraphNode | null) => {
      state.hoverNodeId = node ? node.id : null;
      dom.graph2d.style.cursor = node ? "pointer" : "grab";
    })
    .onNodeClick((node: GraphNode) => focusNode(node.id))
    .onBackgroundClick(() => {
      state.selectedNodeId = null;
      renderInspector();
      renderGraph();
    });

  return graph2d;
}

function resizeGraph() {
  const rect = dom.graphWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (graph2d) {
    graph2d.width(rect.width);
    graph2d.height(rect.height);
  }
}

function focusNode(nodeId: string) {
  if (!currentFiltered || !currentFiltered.nodeMap.has(nodeId)) return;
  state.selectedNodeId = nodeId;
  renderInspector();

  const node = currentFiltered.nodeMap.get(nodeId)!;
  if (graph2d && Number.isFinite(node.x) && Number.isFinite(node.y)) {
    graph2d.centerAt(node.x, node.y, 600);
    graph2d.zoom(3.2, 700);
  }
}

async function renderGraph() {
  if (!currentDataset) return;
  currentFiltered = filterDataset(currentDataset);
  const hasNodes = currentFiltered.nodes.length > 0;
  dom.graphEmpty.classList.toggle("hidden", hasNodes);
  renderInspector();

  if (!hasNodes) return;

  const fg = ensure2dGraph();
  fg.graphData({ nodes: currentFiltered.nodes, links: currentFiltered.links });
  fg.zoomToFit(600, 60);
  resizeGraph();
}

async function render() {
  currentDataset = await loadDataset(state.datasetKey);
  dom.stageTitle.textContent = DATASETS[state.datasetKey].label;
  refreshControls(currentDataset);
  await renderGraph();
}

function handleSearch(event: Event) {
  event.preventDefault();
  const query = (dom.nodeSearch as HTMLInputElement).value.trim().toLowerCase();
  if (!query || !currentFiltered) return;
  const match = currentFiltered.nodes.find((n) => n.label.toLowerCase() === query)
    || currentFiltered.nodes.find((n) => n.searchText!.includes(query));
  if (match) focusNode(match.id);
}

function bindControls() {
  dom.searchForm.addEventListener("submit", handleSearch);
  dom.clearSelection.addEventListener("click", async () => {
    state.selectedNodeId = null;
    (dom.nodeSearch as HTMLInputElement).value = "";
    await renderGraph();
  });
}

async function init() {
  Object.assign(dom, {
    datasetPills: document.getElementById("dataset-pills"),
    searchForm: document.getElementById("search-form"),
    nodeSearch: document.getElementById("node-search"),
    searchList: document.getElementById("node-search-list"),
    graphWrap: document.getElementById("graph-wrap"),
    graph2d: document.getElementById("graph-2d"),
    graphEmpty: document.getElementById("graph-empty"),
    stageTitle: document.getElementById("stage-title"),
    inspectorBody: document.getElementById("inspector-body"),
    clearSelection: document.getElementById("clear-selection"),
  });

  const params = new URLSearchParams(window.location.search);
  const datasetParam = params.get("dataset");
  if (datasetParam && DATASETS[datasetParam]) {
    state.datasetKey = datasetParam;
  }

  bindControls();
  await render();

  const initial = currentDataset!.nodes.find((n) => n.id === "greenpill-network") || currentDataset!.nodes[0];
  if (initial) focusNode(initial.id);

  window.addEventListener("resize", resizeGraph);
}

init().catch((error) => {
  console.error(error);
  const target = document.getElementById("graph-empty");
  if (target) {
    target.classList.remove("hidden");
    target.textContent = "The explorer failed to load. Check the console for details.";
  }
});
