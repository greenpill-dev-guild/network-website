const DATASETS = {
  overlap: {
    label: "Bridge View",
    url: "./data/greenpill-graph/podcast/greenpill-podcast-network-overlap.graph.json",
    rawPath: "./data/greenpill-graph/podcast/greenpill-podcast-network-overlap.graph.json",
    docPath: "./docs/research/greenpill-podcast-network-overlap.md",
    description: "Direct overlap between the podcast and the live network.",
  },
  network: {
    label: "Network Layer",
    url: "./data/greenpill-graph/greenpill-network.graph.json",
    rawPath: "./data/greenpill-graph/greenpill-network.graph.json",
    docPath: "./docs/research/greenpill-current-state.md",
    description: "The structural Greenpill network graph.",
  },
  podcast: {
    label: "Podcast Layer",
    url: "./data/greenpill-graph/podcast/greenpill-podcast.graph.json",
    rawPath: "./data/greenpill-graph/podcast/greenpill-podcast.graph.json",
    docPath: "./docs/research/greenpill-podcast-deep-dive.md",
    description: "The podcast ecosystem graph with episodes, guests, and entities.",
  },
  expanded: {
    label: "Merged Universe",
    url: "./data/greenpill-graph/greenpill-network-expanded.graph.json",
    rawPath: "./data/greenpill-graph/greenpill-network-expanded.graph.json",
    docPath: "./docs/research/greenpill-knowledge-map.md",
    description: "The merged graph for wide exploration.",
  },
};

const VIEW_MODES = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

const LAYER_LABELS = {
  all: "All layers",
  bridge: "Bridge only",
  network: "Network only",
  podcast: "Podcast only",
};

const state = {
  datasetKey: "overlap",
  view: "2d",
  edgeMode: "both",
  layerFilter: "all",
  nodeTypeFilter: "all",
  capitalFilter: "all",
  hoverNodeId: null,
  selectedNodeId: null,
};

const cache = {
  raw: {},
  normalized: {},
  networkIds: new Set(),
};

const dom = {};
let graph2d = null;
let graph3d = null;
let currentDataset = null;
let currentFiltered = null;

function syncUrlState() {
  const params = new URLSearchParams(window.location.search);
  params.set("dataset", state.datasetKey);
  params.set("view", state.view);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function getNodeId(nodeOrId) {
  return typeof nodeOrId === "object" ? nodeOrId.id : nodeOrId;
}

function alpha(hex, value) {
  const clean = hex.replace("#", "");
  const parts = clean.length === 3
    ? clean.split("").map((char) => parseInt(char + char, 16))
    : [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${value})`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function prettyLabel(value) {
  if (!value) return "Unknown";
  return String(value)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json();
}

function resolveLayer(node, datasetKey) {
  if (datasetKey === "network") return "network";
  if (datasetKey === "podcast") return "podcast";
  if (datasetKey === "expanded") {
    return cache.networkIds.has(node.id) ? "network" : "podcast";
  }
  if (datasetKey === "overlap") {
    const refs = node.source_node_refs || {};
    if (refs.main_graph && refs.podcast_graph) return "bridge";
    if (refs.main_graph) return "network";
    if (refs.podcast_graph) return "podcast";
    if ((node.overlap_role || "").includes("bridge")) return "bridge";
    if ((node.overlap_role || "").includes("active_person_unmatched")) return "network";
    return "bridge";
  }
  return "network";
}

function resolveNodeColor(node, layer) {
  if ((node.overlap_role || "").includes("active_person")) return "#ff9ec9";
  if (node.overlap_role === "bridge_entity") return "#ffb55f";
  if (node.overlap_role === "bridge_episode") return "#d6a0ff";
  if (layer === "network") return "#7ef3ab";
  if (layer === "podcast") return "#78b8ff";
  return "#ffb55f";
}

function resolveNodeSize(node) {
  return Math.max(4, (node.importance || 2) * 1.9);
}

function resolveLinkColor(link) {
  if (link.kind === "capital") return alpha("#ff78c8", 0.72);
  if (link.layerSpan === "bridge") return alpha("#ffb55f", 0.38);
  if (link.layerSpan === "podcast") return alpha("#78b8ff", 0.24);
  return alpha("#7ef3ab", 0.24);
}

function summarizeDataset(raw, datasetKey) {
  if (datasetKey === "overlap") {
    return raw.meta?.summary || "Bridge view between podcast and network.";
  }
  if (datasetKey === "podcast") {
    return "Podcast ecosystem view with series, episodes, guests, and repeated external entities.";
  }
  if (datasetKey === "expanded") {
    return "Merged graph of network and podcast layers. Best when you want total context.";
  }
  return "Structural network view across chapters, guilds, programs, tools, and people.";
}

function normalizeGraph(raw, datasetKey) {
  const sources = new Map((raw.sources || []).map((source) => [source.id, source]));
  const nodes = raw.nodes.map((node) => {
    const layer = resolveLayer(node, datasetKey);
    return {
      ...node,
      layer,
      renderColor: resolveNodeColor(node, layer),
      renderSize: resolveNodeSize(node),
      sourceItems: (node.source_ids || []).map((id) => sources.get(id)).filter(Boolean),
      searchText: [node.label, node.description, ...(node.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  const linkLayer = (sourceId, targetId) => {
    const source = nodes.find((node) => node.id === sourceId);
    const target = nodes.find((node) => node.id === targetId);
    if (!source || !target) return "bridge";
    if (source.layer === target.layer) return source.layer;
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
    weight: 1.2 + ((link.capital_forms || []).length * 0.35),
    layerSpan: linkLayer(link.source, link.target),
  }));

  const meta = raw.meta || {};
  return {
    key: datasetKey,
    raw,
    meta,
    summary: summarizeDataset(raw, datasetKey),
    sources,
    nodes,
    links: [...structuralLinks, ...capitalLinks],
    metrics: meta.metrics || raw.metrics || {},
    segmentScores: meta.segment_scores || [],
    rawLink: DATASETS[datasetKey].rawPath,
    docLink: DATASETS[datasetKey].docPath,
  };
}

async function loadDataset(datasetKey) {
  if (cache.normalized[datasetKey]) return cache.normalized[datasetKey];
  const raw = await fetchJson(DATASETS[datasetKey].url);
  cache.raw[datasetKey] = raw;
  const normalized = normalizeGraph(raw, datasetKey);
  cache.normalized[datasetKey] = normalized;
  return normalized;
}

function buildButtons(container, items, activeId, handler) {
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

function updateSelectOptions(select, values, currentValue, transform = (value) => value) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = transform(value);
    option.selected = value === currentValue;
    select.appendChild(option);
  });
}

function refreshControls(dataset) {
  buildButtons(
    dom.datasetPills,
    Object.entries(DATASETS).map(([id, item]) => ({ id, label: item.label })),
    state.datasetKey,
    async (datasetKey) => {
      state.datasetKey = datasetKey;
      state.selectedNodeId = null;
      state.hoverNodeId = null;
      state.nodeTypeFilter = "all";
      state.capitalFilter = "all";
      state.layerFilter = "all";
      syncUrlState();
      await render();
    }
  );

  buildButtons(dom.viewPills, VIEW_MODES, state.view, async (view) => {
    state.view = view;
    syncUrlState();
    switchView();
    await renderGraph();
  });

  const nodeTypes = ["all", ...new Set(dataset.nodes.map((node) => node.node_type).filter(Boolean))];
  updateSelectOptions(dom.nodeTypeFilter, nodeTypes, state.nodeTypeFilter, (value) => {
    return value === "all" ? "All node types" : prettyLabel(value);
  });

  const capitalForms = ["all", ...new Set(dataset.links
    .filter((link) => link.kind === "capital")
    .flatMap((link) => link.capital_forms || []))];
  updateSelectOptions(dom.capitalFilter, capitalForms, state.capitalFilter, (value) => {
    return value === "all" ? "All capital forms" : prettyLabel(value);
  });

  const labels = dataset.nodes
    .map((node) => node.label)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  dom.searchList.innerHTML = labels.map((label) => `<option value="${escapeHtml(label)}"></option>`).join("");
}

function filterDataset(dataset) {
  let nodes = dataset.nodes.slice();
  if (state.layerFilter !== "all") {
    nodes = nodes.filter((node) => {
      if (state.layerFilter === "bridge") {
        return node.layer === "bridge" || (node.overlap_role || "").includes("bridge");
      }
      return node.layer === state.layerFilter;
    });
  }

  if (state.nodeTypeFilter !== "all") {
    nodes = nodes.filter((node) => node.node_type === state.nodeTypeFilter);
  }

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  let links = dataset.links.filter((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });

  if (state.edgeMode !== "both") {
    links = links.filter((link) => link.kind === state.edgeMode);
  }

  if (state.capitalFilter !== "all") {
    const capitalLinks = links.filter((link) => link.kind === "capital" && (link.capital_forms || []).includes(state.capitalFilter));
    const capitalNodeIds = new Set();
    capitalLinks.forEach((link) => {
      capitalNodeIds.add(getNodeId(link.source));
      capitalNodeIds.add(getNodeId(link.target));
    });

    const supportingStructure = links.filter((link) => {
      if (link.kind !== "structure") return false;
      return capitalNodeIds.has(getNodeId(link.source)) && capitalNodeIds.has(getNodeId(link.target));
    });

    links = state.edgeMode === "structure" ? supportingStructure : [...capitalLinks, ...supportingStructure];
    const linkedNodeIds = new Set();
    links.forEach((link) => {
      linkedNodeIds.add(getNodeId(link.source));
      linkedNodeIds.add(getNodeId(link.target));
    });
    nodes = nodes.filter((node) => linkedNodeIds.has(node.id));
  } else if (links.length) {
    const linkedNodeIds = new Set();
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

  const degree = {};
  linksWithStyle.forEach((link) => {
    degree[link.source] = (degree[link.source] || 0) + 1;
    degree[link.target] = (degree[link.target] || 0) + 1;
  });

  nodes = nodes.map((node) => ({
    ...node,
    degree: degree[node.id] || 0,
  }));

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  if (state.selectedNodeId && !nodeMap.has(state.selectedNodeId)) {
    state.selectedNodeId = null;
  }

  return {
    nodes,
    links: linksWithStyle,
    nodeMap,
  };
}

function renderStageStats(filtered) {
  const capitalCount = filtered.links.filter((link) => link.kind === "capital").length;
  const structureCount = filtered.links.filter((link) => link.kind === "structure").length;
  dom.stageStats.innerHTML = [
    `<span class="stat-pill">${filtered.nodes.length} nodes</span>`,
    `<span class="stat-pill">${structureCount} structure</span>`,
    `<span class="stat-pill">${capitalCount} capital</span>`,
  ].join("");
}

function renderDatasetMeta(dataset) {
  const summary = dataset.summary || DATASETS[dataset.key].description;
  const scoreCards = dataset.segmentScores.length
    ? `<div class="score-grid">${dataset.segmentScores
      .map((segment) => `
          <article class="score-card">
            <strong>${prettyLabel(segment.segment)} · ${Math.round(segment.score * 100)}%</strong>
            <span>${escapeHtml(segment.assessment.replaceAll("_", " "))}</span>
          </article>
        `)
      .join("")}</div>`
    : "";

  dom.datasetMeta.innerHTML = `
    <p class="dataset-summary">${escapeHtml(summary)}</p>
    ${scoreCards}
    <div class="data-link-row">
      <a class="source-link" href="${dataset.rawLink}" target="_blank" rel="noreferrer">Raw JSON</a>
      <a class="source-link" href="${dataset.docLink}" target="_blank" rel="noreferrer">Research note</a>
    </div>
  `;

  dom.resourceLinks.innerHTML = `
    <a href="${dataset.rawLink}" target="_blank" rel="noreferrer">Open raw JSON</a>
    <a href="${dataset.docLink}" target="_blank" rel="noreferrer">Open research note</a>
  `;
}

function renderHeroMeta(dataset, filtered) {
  const cards = [
    { label: "Dataset", value: DATASETS[dataset.key].label },
    { label: "Visible nodes", value: String(filtered.nodes.length) },
    { label: "Visible edges", value: String(filtered.links.length) },
  ];

  if (dataset.meta?.overall_assessment) {
    cards.push({ label: "Assessment", value: prettyLabel(dataset.meta.overall_assessment) });
  }

  dom.heroMeta.innerHTML = cards.map((card) => `
    <div class="metric-card">
      <span class="metric-label">${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
    </div>
  `).join("");
}

function renderViewHint() {
  const touchDevice = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 800;
  if (state.view === "3d") {
    dom.viewHint.textContent = touchDevice
      ? "3D mode: drag to orbit, pinch to zoom, and tap a node to inspect it."
      : "3D mode: drag to orbit, scroll to zoom, and click a node to inspect it.";
    return;
  }

  dom.viewHint.textContent = touchDevice
    ? "2D mode: drag the canvas, tap a node for details, and use filters to narrow the graph."
    : "2D mode: drag to pan, scroll to zoom, and click a node to inspect its relationships.";
}

function getRelatedNodes(nodeId) {
  if (!currentFiltered) return [];
  const related = new Map();
  currentFiltered.links.forEach((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    if (sourceId === nodeId && currentFiltered.nodeMap.has(targetId)) {
      related.set(targetId, currentFiltered.nodeMap.get(targetId));
    }
    if (targetId === nodeId && currentFiltered.nodeMap.has(sourceId)) {
      related.set(sourceId, currentFiltered.nodeMap.get(sourceId));
    }
  });
  return [...related.values()].sort((left, right) => (right.degree || 0) - (left.degree || 0));
}

function renderInspector() {
  if (!currentFiltered || !state.selectedNodeId || !currentFiltered.nodeMap.has(state.selectedNodeId)) {
    const featured = currentFiltered
      ? [...currentFiltered.nodes]
        .sort((left, right) => (right.importance || 0) - (left.importance || 0))
        .slice(0, 8)
      : [];
    dom.inspectorBody.innerHTML = `
      <div class="empty-state">
        <h3>Pick a node to inspect it.</h3>
        <p class="muted-copy">
          Try the Bridge View first. It is the cleanest way to see where the podcast and the live network already meet.
        </p>
        <div class="detail-section">
          <h3>Suggested starting points</h3>
          <div class="related-list">
            ${featured.map((node) => `<button type="button" class="related-button" data-node-id="${node.id}">${escapeHtml(node.label)}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    bindRelatedButtons();
    return;
  }

  const node = currentFiltered.nodeMap.get(state.selectedNodeId);
  const related = getRelatedNodes(node.id).slice(0, 12);
  const nodeUrl = node.url
    ? `<a class="source-link" href="${node.url}" target="_blank" rel="noreferrer">Open node URL</a>`
    : "";
  const sources = (node.sourceItems || []).slice(0, 8);

  dom.inspectorBody.innerHTML = `
    <div class="detail-stack">
      <div class="detail-section">
        <h3>${escapeHtml(node.label)}</h3>
        <div class="badge-row">
          <span class="detail-badge">${escapeHtml(prettyLabel(node.node_type))}</span>
          <span class="detail-badge">${escapeHtml(prettyLabel(node.layer))}</span>
          ${node.overlap_role ? `<span class="detail-badge">${escapeHtml(prettyLabel(node.overlap_role))}</span>` : ""}
        </div>
      </div>

      <p>${escapeHtml(node.description || "No description provided.")}</p>

      <div class="detail-grid">
        <div class="detail-cell">
          <span>Importance</span>
          <strong>${node.importance || 0}</strong>
        </div>
        <div class="detail-cell">
          <span>Confidence</span>
          <strong>${node.confidence != null ? `${Math.round(node.confidence * 100)}%` : "n/a"}</strong>
        </div>
        <div class="detail-cell">
          <span>Degree</span>
          <strong>${node.degree || 0}</strong>
        </div>
        <div class="detail-cell">
          <span>Cluster</span>
          <strong>${escapeHtml(node.cluster || "n/a")}</strong>
        </div>
      </div>

      ${node.tags?.length ? `
        <div class="detail-section">
          <h3>Tags</h3>
          <div class="tag-row">${node.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      ` : ""}

      ${(node.source_node_refs && Object.keys(node.source_node_refs).length) ? `
        <div class="detail-section">
          <h3>Source refs</h3>
          <div class="detail-list">
            ${Object.entries(node.source_node_refs).map(([key, value]) => `<span class="tag-chip">${escapeHtml(`${key}: ${value}`)}</span>`).join("")}
          </div>
        </div>
      ` : ""}

      <div class="detail-section">
        <h3>Actions</h3>
        <div class="data-link-row">
          ${nodeUrl}
        </div>
      </div>

      ${sources.length ? `
        <div class="detail-section">
          <h3>Sources</h3>
          <div class="resource-links">
            ${sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.id)}</a>`).join("")}
          </div>
        </div>
      ` : ""}

      ${related.length ? `
        <div class="detail-section">
          <h3>Related nodes</h3>
          <div class="related-list">
            ${related.map((item) => `<button type="button" class="related-button" data-node-id="${item.id}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;

  bindRelatedButtons();
}

function bindRelatedButtons() {
  dom.inspectorBody.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => focusNode(button.dataset.nodeId));
  });
}

function drawNode2d(node, ctx, globalScale) {
  const radius = state.selectedNodeId === node.id ? node.renderSize * 1.45 : node.renderSize;
  ctx.save();
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = node.renderColor;
  ctx.shadowColor = node.renderColor;
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
    const x = node.x + radius + 6 / globalScale;
    const y = node.y - radius - 6 / globalScale;

    ctx.fillStyle = alpha("#07120d", 0.92);
    ctx.fillRect(x - paddingX, y - fontSize, textWidth + paddingX * 2, fontSize + paddingY * 2);
    ctx.fillStyle = "#f7fbf4";
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

function ensure2dGraph() {
  if (graph2d) return graph2d;
  graph2d = window.ForceGraph()(dom.graph2d);
  graph2d
    .backgroundColor("rgba(0,0,0,0)")
    .nodeId("id")
    .nodeCanvasObject(drawNode2d)
    .nodePointerAreaPaint((node, color, ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.renderSize + 6, 0, 2 * Math.PI);
      ctx.fill();
    })
    .linkColor((link) => link.color)
    .linkWidth((link) => link.kind === "capital" ? 2.2 : 1.05)
    .linkCurvature((link) => link.kind === "capital" ? 0.18 : 0)
    .linkDirectionalParticles((link) => link.kind === "capital" ? 2 : 0)
    .linkDirectionalParticleColor((link) => link.kind === "capital" ? "#ff78c8" : "#ffffff")
    .linkDirectionalParticleWidth((link) => link.kind === "capital" ? 2.4 : 0)
    .d3Force("charge").strength(-180);

  graph2d
    .onNodeHover((node) => {
      state.hoverNodeId = node ? node.id : null;
      dom.graph2d.style.cursor = node ? "pointer" : "grab";
    })
    .onNodeClick((node) => focusNode(node.id))
    .onBackgroundClick(() => {
      state.selectedNodeId = null;
      renderInspector();
      renderGraph();
    });

  return graph2d;
}

function ensure3dGraph() {
  if (graph3d) return graph3d;
  graph3d = window.ForceGraph3D()(dom.graph3d)
    .backgroundColor("rgba(0,0,0,0)")
    .nodeLabel((node) => `
      <div style="padding:8px 10px;border-radius:12px;background:rgba(7,18,13,0.92);border:1px solid rgba(194,232,18,0.15);">
        <strong>${escapeHtml(node.label)}</strong><br/>
        <span>${escapeHtml(prettyLabel(node.node_type))}</span>
      </div>
    `)
    .nodeVal((node) => state.selectedNodeId === node.id ? node.renderSize * 1.5 : node.renderSize)
    .nodeColor((node) => state.selectedNodeId === node.id ? "#ffffff" : node.renderColor)
    .linkColor((link) => link.color)
    .linkWidth((link) => link.kind === "capital" ? 1.9 : 0.7)
    .linkOpacity(0.46)
    .linkDirectionalParticles((link) => link.kind === "capital" ? 2 : 0)
    .linkDirectionalParticleColor((link) => link.kind === "capital" ? "#ff78c8" : "#ffffff")
    .linkDirectionalParticleWidth((link) => link.kind === "capital" ? 2.2 : 0)
    .onNodeClick((node) => focusNode(node.id))
    .onBackgroundClick(() => {
      state.selectedNodeId = null;
      renderInspector();
      renderGraph();
    });

  graph3d.d3Force("charge").strength(-150);
  return graph3d;
}

function resizeGraphs() {
  const rect = dom.graphWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (graph2d) {
    graph2d.width(rect.width);
    graph2d.height(rect.height);
  }
  if (graph3d) {
    graph3d.width(rect.width);
    graph3d.height(rect.height);
  }
}

function switchView() {
  dom.graph2d.classList.toggle("active", state.view === "2d");
  dom.graph3d.classList.toggle("active", state.view === "3d");
  renderViewHint();
  resizeGraphs();
}

function focusNode(nodeId) {
  if (!currentFiltered || !currentFiltered.nodeMap.has(nodeId)) return;
  state.selectedNodeId = nodeId;
  renderInspector();

  const node = currentFiltered.nodeMap.get(nodeId);
  if (state.view === "2d" && graph2d && Number.isFinite(node.x) && Number.isFinite(node.y)) {
    graph2d.centerAt(node.x, node.y, 600);
    graph2d.zoom(3.2, 700);
  }

  if (
    state.view === "3d"
    && graph3d
    && Number.isFinite(node.x)
    && Number.isFinite(node.y)
    && Number.isFinite(node.z)
  ) {
    const distance = 140;
    graph3d.cameraPosition(
      {
        x: node.x * 1.2,
        y: node.y * 1.2,
        z: (node.z || 0) + distance,
      },
      node,
      900
    );
  }
}

async function renderGraph() {
  if (!currentDataset) return;
  currentFiltered = filterDataset(currentDataset);
  const hasNodes = currentFiltered.nodes.length > 0;
  dom.graphEmpty.classList.toggle("hidden", hasNodes);
  renderStageStats(currentFiltered);
  renderHeroMeta(currentDataset, currentFiltered);
  renderViewHint();
  renderInspector();

  if (!hasNodes) return;

  if (state.view === "2d") {
    const fg = ensure2dGraph();
    fg.graphData({ nodes: currentFiltered.nodes, links: currentFiltered.links });
    fg.zoomToFit(600, 60);
  } else {
    const fg = ensure3dGraph();
    fg.graphData({ nodes: currentFiltered.nodes, links: currentFiltered.links });
  }

  resizeGraphs();
}

async function render() {
  currentDataset = await loadDataset(state.datasetKey);
  dom.stageTitle.textContent = DATASETS[state.datasetKey].label;
  refreshControls(currentDataset);
  renderDatasetMeta(currentDataset);
  await renderGraph();
}

function handleSearch(event) {
  event.preventDefault();
  const query = dom.nodeSearch.value.trim().toLowerCase();
  if (!query || !currentFiltered) return;
  const match = currentFiltered.nodes.find((node) => node.label.toLowerCase() === query)
    || currentFiltered.nodes.find((node) => node.searchText.includes(query));
  if (match) {
    focusNode(match.id);
  }
}

function bindControls() {
  dom.edgeMode.addEventListener("change", async () => {
    state.edgeMode = dom.edgeMode.value;
    await renderGraph();
  });

  dom.layerFilter.addEventListener("change", async () => {
    state.layerFilter = dom.layerFilter.value;
    await renderGraph();
  });

  dom.nodeTypeFilter.addEventListener("change", async () => {
    state.nodeTypeFilter = dom.nodeTypeFilter.value;
    await renderGraph();
  });

  dom.capitalFilter.addEventListener("change", async () => {
    state.capitalFilter = dom.capitalFilter.value;
    await renderGraph();
  });

  dom.searchForm.addEventListener("submit", handleSearch);
  dom.clearSelection.addEventListener("click", async () => {
    state.selectedNodeId = null;
    dom.nodeSearch.value = "";
    await renderGraph();
  });
}

async function init() {
  Object.assign(dom, {
    datasetPills: document.getElementById("dataset-pills"),
    viewPills: document.getElementById("view-pills"),
    edgeMode: document.getElementById("edge-mode"),
    layerFilter: document.getElementById("layer-filter"),
    nodeTypeFilter: document.getElementById("node-type-filter"),
    capitalFilter: document.getElementById("capital-filter"),
    searchForm: document.getElementById("search-form"),
    nodeSearch: document.getElementById("node-search"),
    searchList: document.getElementById("node-search-list"),
    graphWrap: document.getElementById("graph-wrap"),
    graph2d: document.getElementById("graph-2d"),
    graph3d: document.getElementById("graph-3d"),
    graphEmpty: document.getElementById("graph-empty"),
    stageTitle: document.getElementById("stage-title"),
    stageStats: document.getElementById("stage-stats"),
    datasetMeta: document.getElementById("dataset-meta"),
    inspectorBody: document.getElementById("inspector-body"),
    clearSelection: document.getElementById("clear-selection"),
    resourceLinks: document.getElementById("resource-links"),
    heroMeta: document.getElementById("hero-meta"),
    viewHint: document.getElementById("view-hint"),
  });

  const networkRaw = await fetchJson(DATASETS.network.url);
  cache.raw.network = networkRaw;
  cache.networkIds = new Set((networkRaw.nodes || []).map((node) => node.id));
  cache.normalized.network = normalizeGraph(networkRaw, "network");

  const params = new URLSearchParams(window.location.search);
  const datasetParam = params.get("dataset");
  const viewParam = params.get("view");
  if (datasetParam && DATASETS[datasetParam]) {
    state.datasetKey = datasetParam;
  }
  if (viewParam && VIEW_MODES.some((mode) => mode.id === viewParam)) {
    state.view = viewParam;
  }

  bindControls();
  switchView();
  await render();

  const initial = currentDataset.nodes.find((node) => node.id === "greenpill-network") || currentDataset.nodes[0];
  if (initial) {
    focusNode(initial.id);
  }

  window.addEventListener("resize", resizeGraphs);
}

init().catch((error) => {
  console.error(error);
  const target = document.getElementById("graph-empty");
  target.classList.remove("hidden");
  target.textContent = "The explorer failed to load. Check the console for details.";
});
