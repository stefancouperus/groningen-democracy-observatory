import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm";

const root = document.querySelector("#democracy-dashboard");
if (!root) throw new Error("Dashboard root not found.");

const caseId = root.dataset.caseId;
const basePath = root.dataset.basePath || ".";
const MAX_VARIABLES = 6;
const MAX_GROUPS = 5;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const slugify = (value) => String(value)
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const yearLabel = (index) => `Y${String(index).padStart(2, "0")}`;
const formatValue = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not observed";
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
};

const normalizeSearch = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "");

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
};

const [variables, caseData, cases] = await Promise.all([
  fetchJson(`${basePath}/data/variables.json`),
  fetchJson(`${basePath}/data/${caseId}.json`),
  fetchJson(`${basePath}/data/cases.json`)
]);

const caseMeta = cases.find((item) => item.case_id === caseId);
if (!caseMeta) throw new Error(`Case metadata missing for ${caseId}`);

const variableById = new Map(variables.map((item) => [item.variable_id, item]));
const yearByIndex = new Map(caseData.years.map((item) => [item.year_index, item]));
const accent = caseId === "case_a" ? "#9d6b1f" : caseId === "case_b" ? "#176c6a" : "#743761";

const loadGroups = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(`vdo-groups-${caseId}`));
    if (!parsed || !Array.isArray(parsed.groups)) return { groups: [], active: "all" };
    return {
      groups: parsed.groups.slice(0, MAX_GROUPS).map((group) => ({
        id: String(group.id),
        name: String(group.name).slice(0, 32),
        variables: Array.isArray(group.variables)
          ? group.variables.filter((id) => variableById.has(id))
          : []
      })),
      active: "all"
    };
  } catch {
    return { groups: [], active: "all" };
  }
};

const parseHash = () => {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const selected = (params.get("vars") || "")
    .split(",")
    .filter((id) => variableById.has(id))
    .slice(0, MAX_VARIABLES);
  const requestedView = params.get("view");
  const view = requestedView === "data" || requestedView === "trends" ? "data" : "overview";
  const mode = params.get("time") === "point" ? "point" : "period";
  const point = Math.min(20, Math.max(1, Number(params.get("point")) || 20));
  const start = Math.min(20, Math.max(1, Number(params.get("start")) || 1));
  const end = Math.min(20, Math.max(start, Number(params.get("end")) || 20));
  return {
    selected,
    view,
    timeMode: mode,
    point,
    start,
    end,
    indexed: params.get("indexed") === "1"
  };
};

const restored = parseHash();
const groupState = loadGroups();
const state = {
  activeView: restored.view,
  selected: restored.selected,
  timeMode: restored.timeMode,
  point: restored.point,
  start: restored.start,
  end: restored.end,
  indexed: restored.indexed,
  tableVisible: false,
  search: "",
  groups: groupState.groups,
  activeGroup: groupState.active,
  groupEditorVariable: null,
  creatingGroup: false,
  metadataVariable: null,
  leftOpen: !matchMedia("(max-width: 760px)").matches,
  rightOpen: matchMedia("(min-width: 1200px)").matches,
  renderToken: 0
};

const briefHtml = () => caseMeta.brief.sections.map((section) => `
  <section class="brief-section">
    <h2>${escapeHtml(section.heading)}</h2>
    ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
  </section>
`).join("");

const yearOptions = (selected) => caseData.years.map((year) => `
  <option value="${year.year_index}" ${year.year_index === selected ? "selected" : ""}>${year.year_id}</option>
`).join("");

root.innerHTML = `
  <div class="dashboard-app" data-case="${escapeHtml(caseId)}">
    <header class="dashboard-header">
      <div class="header-primary">
        <div class="country-brand">
          <img src="${basePath}/${escapeHtml(caseMeta.flag_path)}" alt="Flag of ${escapeHtml(caseMeta.name)}">
          <div class="country-brand__text">
            <span>Groningen Democracy Observatory</span>
            <strong>${escapeHtml(caseMeta.name)}</strong>
          </div>
        </div>

        <div class="header-actions">
          <button class="btn" id="help-button" type="button"><span>Help</span></button>
          <a class="btn btn--quiet" href="${basePath}/" aria-label="Back to country selection">Countries</a>
        </div>

        <div class="time-control" id="time-control" aria-label="Global time selection"></div>
      </div>

      <div class="header-secondary">
        <nav class="view-tabs" role="tablist" aria-label="Dashboard views">
          ${[
            ["overview", "Overview"],
            ["data", "Data"]
          ].map(([id, label]) => `<button class="tab-btn" id="tab-${id}" type="button" role="tab" data-view="${id}" aria-controls="view-${id}" aria-selected="false">${label}</button>`).join("")}
        </nav>
        <span class="selection-summary" id="selection-summary">0 of ${MAX_VARIABLES} variables selected</span>
      </div>
    </header>

    <main class="dashboard-main">
      <section class="view-panel overview-view" id="view-overview" role="tabpanel" aria-labelledby="tab-overview">
        <div class="overview-hero">
          <div>
            <p class="eyebrow">Country brief · ${escapeHtml(caseMeta.student_period)}</p>
            <h1>${escapeHtml(caseMeta.formal_name)}</h1>
            <p class="overview-standfirst">${escapeHtml(caseMeta.brief.standfirst)}</p>
          </div>
          <img class="overview-flag" src="${basePath}/${escapeHtml(caseMeta.flag_path)}" alt="Flag of ${escapeHtml(caseMeta.name)}">
        </div>
        <article class="brief-copy brief-copy--wide">
          ${briefHtml()}
          <div class="overview-actions"><button class="btn btn--primary" id="start-exploring" type="button">View data</button></div>
        </article>
      </section>

      <section class="view-panel analysis-view" id="view-data" role="tabpanel" aria-labelledby="tab-data" hidden>
        <div class="mobile-panel-buttons" id="panel-buttons">
          <button class="btn" id="open-left-panel" type="button">Variables</button>
          <button class="btn" id="open-right-panel" type="button">Details</button>
        </div>
        <div class="analysis-grid" id="analysis-grid">
          <aside class="side-panel side-panel--left" id="variable-panel" aria-label="Variable finder">
            <div class="panel-header">
              <h2>Variables</h2>
              <button class="icon-btn" id="close-left-panel" type="button" aria-label="Close variable panel">×</button>
            </div>
            <div class="panel-body">
              <label class="sr-only" for="variable-search">Search variables</label>
              <div class="search-wrap"><input id="variable-search" type="search" placeholder="Search titles and definitions" autocomplete="off"></div>
              <div class="group-controls" id="group-controls"></div>
              <div id="new-group-region"></div>
              <div class="selected-tray" id="selected-tray" aria-label="Selected variables"></div>
              <p class="selection-limit" id="selection-limit"></p>
              <div class="variable-list" id="variable-list"></div>
            </div>
          </aside>

          <section class="chart-panel" aria-labelledby="data-title">
            <div class="chart-heading">
              <div>
                <h2 id="data-title">Data trajectories</h2>
                <p id="chart-context"></p>
              </div>
              <div class="chart-toolbar">
                <button class="btn" id="index-toggle" type="button" aria-pressed="false">Index start = 100</button>
                <button class="btn" id="table-toggle" type="button" aria-pressed="false">Show table</button>
              </div>
            </div>
            <div id="chart-notice" class="chart-note" aria-live="polite"></div>
            <div id="data-charts"></div>
            <div id="data-table"></div>
          </section>

          <aside class="side-panel side-panel--right" id="metadata-panel" aria-label="Variable details">
            <div class="panel-header">
              <h2>Details</h2>
              <button class="icon-btn" id="close-right-panel" type="button" aria-label="Close details panel">×</button>
            </div>
            <div class="panel-body" id="metadata-content"></div>
          </aside>
        </div>
      </section>

    </main>

    <dialog class="dashboard-dialog" id="help-dialog">
      <div class="dialog-header">
        <h2>Contextual help</h2>
        <button class="icon-btn" data-close-dialog="help-dialog" type="button" aria-label="Close help">×</button>
      </div>
      <div class="dialog-body">
        <h3>State at a point in time</h3>
        <p>A static classification asks what kind of regime exists in the selected year: closed autocracy, electoral autocracy, electoral democracy, or liberal democracy. The dashboard does not assign this classification.</p>
        <h3>Direction of change</h3>
        <p>Democratization and autocratization concern movement at regime level. Backsliding and deepening describe institutional deterioration or improvement while a case remains democratic.</p>
        <h3>Institutional durability</h3>
        <p>Consolidation, deconsolidation, and resilience concern whether democratic rules and institutions can endure pressure and correct deterioration. They are not identical to the current institutional level.</p>
        <h3>Point and period controls</h3>
        <p>Point mode highlights one year. Period mode filters the trajectory to a selected interval. The optional index sets every compatible series to 100 at the beginning of the selected period and shows relative—not raw—change.</p>
        <h3>My groups</h3>
        <p>Groups are your own organisational labels. The dashboard does not assess or validate them. Adding a variable to a group does not add it to a chart.</p>
      </div>
    </dialog>

    <div class="toast-region" id="toast-region" aria-live="polite" aria-atomic="true"></div>
  </div>
`;

const el = (id) => document.getElementById(id);

const saveGroups = () => {
  localStorage.setItem(`vdo-groups-${caseId}`, JSON.stringify({ groups: state.groups }));
};

const selectedVariables = () => state.selected.map((id) => variableById.get(id)).filter(Boolean);

const valueAt = (variableId, yearIndex) => yearByIndex.get(yearIndex)?.values?.[variableId] ?? null;

const activePeriod = () => state.timeMode === "point"
  ? { start: 1, end: 20, label: `${yearLabel(state.point)} highlighted within Y01–Y20` }
  : { start: state.start, end: state.end, label: `${yearLabel(state.start)}–${yearLabel(state.end)}` };

const seriesFor = (variableId) => {
  const period = activePeriod();
  const years = caseData.years.filter((year) => year.year_index >= period.start && year.year_index <= period.end);
  const baseValue = state.indexed && state.timeMode === "period" ? valueAt(variableId, state.start) : null;
  return years.map((year) => {
    const raw = year.values[variableId];
    const indexed = state.indexed && baseValue !== null && baseValue !== 0 && raw !== null
      ? (raw / baseValue) * 100
      : null;
    return {
      year_index: year.year_index,
      year_id: year.year_id,
      raw,
      value: state.indexed ? indexed : raw,
      variable_id: variableId,
      label: variableById.get(variableId).label
    };
  });
};

const canUseIndex = () => state.timeMode === "period"
  && state.selected.length > 0
  && state.selected.every((id) => {
    const value = valueAt(id, state.start);
    return value !== null && value !== 0;
  });

const syncUrl = () => {
  const params = new URLSearchParams();
  params.set("view", state.activeView);
  if (state.selected.length) params.set("vars", state.selected.join(","));
  params.set("time", state.timeMode);
  if (state.timeMode === "point") params.set("point", state.point);
  else {
    params.set("start", state.start);
    params.set("end", state.end);
  }
  if (state.indexed) params.set("indexed", "1");
  history.replaceState(null, "", `${location.pathname}#${params.toString()}`);
};

const notify = (message, isError = false) => {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  el("toast-region").append(toast);
  setTimeout(() => toast.remove(), 3600);
};

const copyText = async (text, label) => {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${label} copied.`);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (copied) notify(`${label} copied.`);
    else showCopyFallback(text, label);
    return copied;
  }
};

const showCopyFallback = (text, label) => {
  let dialog = el("copy-fallback-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "dashboard-dialog";
    dialog.id = "copy-fallback-dialog";
    dialog.innerHTML = `
      <div class="dialog-header">
        <h2>Copy manually</h2>
        <button class="icon-btn" type="button" aria-label="Close copy window">×</button>
      </div>
      <div class="dialog-body">
        <p>The browser did not grant clipboard access. Select the text below and use your device’s copy command.</p>
        <label class="sr-only" for="copy-fallback-text">Text to copy</label>
        <textarea id="copy-fallback-text" style="width:100%;min-height:260px;padding:.7rem;border:1px solid var(--rule-strong);border-radius:.35rem"></textarea>
      </div>
    `;
    dialog.querySelector("button").addEventListener("click", () => dialog.close());
    document.querySelector(".dashboard-app").append(dialog);
  }
  dialog.querySelector("h2").textContent = `Copy ${label.toLowerCase()} manually`;
  const area = dialog.querySelector("textarea");
  area.value = text;
  dialog.showModal();
  area.focus();
  area.select();
  notify("Clipboard permission was unavailable; manual copy opened.");
};

const renderTimeControl = () => {
  const pointFields = `
    <div class="compact-field">
      <label for="global-point">Year</label>
      <select id="global-point">${yearOptions(state.point)}</select>
    </div>
  `;
  const periodFields = `
    <div class="compact-field">
      <label for="period-preset">Period</label>
      <select id="period-preset">
        <option value="custom">Custom</option>
        <option value="full" ${state.start === 1 && state.end === 20 ? "selected" : ""}>Full period</option>
        <option value="last5" ${state.start === 16 && state.end === 20 ? "selected" : ""}>Last five years</option>
      </select>
    </div>
    <div class="compact-field">
      <label for="global-start">Start</label>
      <select id="global-start">${yearOptions(state.start)}</select>
    </div>
    <div class="compact-field">
      <label for="global-end">End</label>
      <select id="global-end">${yearOptions(state.end)}</select>
    </div>
  `;
  el("time-control").innerHTML = `
    <div class="time-mode" aria-label="Time mode">
      <button type="button" data-time-mode="point" aria-pressed="${state.timeMode === "point"}">Point in time</button>
      <button type="button" data-time-mode="period" aria-pressed="${state.timeMode === "period"}">Period</button>
    </div>
    ${state.timeMode === "point" ? pointFields : periodFields}
  `;

  el("time-control").querySelectorAll("[data-time-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeMode = button.dataset.timeMode;
      if (state.timeMode === "point") state.indexed = false;
      refresh({ variables: false });
    });
  });
  el("global-point")?.addEventListener("change", (event) => {
    state.point = Number(event.target.value);
    refresh({ variables: false });
  });
  el("global-start")?.addEventListener("change", (event) => {
    state.start = Number(event.target.value);
    if (state.start > state.end) state.end = state.start;
    if (!canUseIndex()) state.indexed = false;
    refresh({ variables: false });
  });
  el("global-end")?.addEventListener("change", (event) => {
    state.end = Number(event.target.value);
    if (state.end < state.start) state.start = state.end;
    if (!canUseIndex()) state.indexed = false;
    refresh({ variables: false });
  });
  el("period-preset")?.addEventListener("change", (event) => {
    if (event.target.value === "full") [state.start, state.end] = [1, 20];
    if (event.target.value === "last5") [state.start, state.end] = [16, 20];
    if (!canUseIndex()) state.indexed = false;
    refresh({ variables: false });
  });
};

const setView = (view) => {
  state.activeView = view;
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.hidden = panel.id !== `view-${view}`;
  });
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.view === view));
    button.tabIndex = button.dataset.view === view ? 0 : -1;
  });
  if (view === "data") requestAnimationFrame(renderData);
  syncUrl();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const renderGroupControls = () => {
  const controls = el("group-controls");
  const activeGroup = state.groups.find((group) => group.id === state.activeGroup);
  controls.innerHTML = `
    <button class="filter-chip" type="button" data-group-filter="all" aria-pressed="${state.activeGroup === "all"}">All variables</button>
    ${state.groups.map((group) => `<button class="filter-chip" type="button" data-group-filter="${escapeHtml(group.id)}" aria-pressed="${state.activeGroup === group.id}">${escapeHtml(group.name)} · ${group.variables.length}</button>`).join("")}
    <button class="filter-chip" id="new-group-button" type="button" ${state.groups.length >= MAX_GROUPS ? "disabled" : ""}>+ New group</button>
    ${activeGroup ? `<button class="filter-chip" id="rename-group-button" type="button">Rename group</button><button class="filter-chip" id="delete-group-button" type="button">Delete group</button>` : ""}
  `;
  controls.querySelectorAll("[data-group-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeGroup = button.dataset.groupFilter;
      renderGroupControls();
      renderVariableList();
    });
  });
  el("new-group-button")?.addEventListener("click", () => {
    state.creatingGroup = true;
    renderNewGroupForm();
  });
  el("rename-group-button")?.addEventListener("click", () => {
    const group = state.groups.find((item) => item.id === state.activeGroup);
    if (!group) return;
    const name = window.prompt("Rename your group", group.name)?.trim();
    if (!name) return;
    group.name = name.slice(0, 32);
    saveGroups();
    renderGroupControls();
  });
  el("delete-group-button")?.addEventListener("click", () => {
    const group = state.groups.find((item) => item.id === state.activeGroup);
    if (!group || !window.confirm(`Delete your group “${group.name}”? The variables and charts will not be deleted.`)) return;
    state.groups = state.groups.filter((item) => item.id !== group.id);
    state.activeGroup = "all";
    saveGroups();
    renderGroupControls();
    renderVariableList();
  });
};

const renderNewGroupForm = () => {
  const region = el("new-group-region");
  if (!state.creatingGroup) {
    region.innerHTML = "";
    return;
  }
  region.innerHTML = `
    <form class="new-group-form" id="new-group-form">
      <label for="new-group-name"><strong>Name your group</strong></label>
      <input id="new-group-name" maxlength="32" required autocomplete="off" placeholder="Your own label">
      <span class="selection-limit">The dashboard does not assess or validate this label.</span>
      <div class="new-group-form__actions">
        <button class="btn btn--primary" type="submit">Create</button>
        <button class="btn" id="cancel-new-group" type="button">Cancel</button>
      </div>
    </form>
  `;
  el("new-group-name").focus();
  el("new-group-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el("new-group-name").value.trim();
    if (!name) return;
    state.groups.push({ id: `${Date.now().toString(36)}`, name, variables: [] });
    state.creatingGroup = false;
    saveGroups();
    renderGroupControls();
    renderNewGroupForm();
    renderVariableList();
  });
  el("cancel-new-group").addEventListener("click", () => {
    state.creatingGroup = false;
    renderNewGroupForm();
  });
};

const renderSelectedTray = () => {
  const tray = el("selected-tray");
  tray.innerHTML = state.selected.length
    ? state.selected.map((id) => {
      const variable = variableById.get(id);
      return `<span class="chip">${escapeHtml(variable.label)}<button type="button" data-deselect="${escapeHtml(id)}" aria-label="Deselect ${escapeHtml(variable.label)}">×</button></span>`;
    }).join("")
    : `<span class="metadata-empty">No variables selected.</span>`;
  tray.querySelectorAll("[data-deselect]").forEach((button) => button.addEventListener("click", () => deselectVariable(button.dataset.deselect)));

  const limit = el("selection-limit");
  limit.textContent = state.selected.length >= MAX_VARIABLES
    ? `${MAX_VARIABLES} of ${MAX_VARIABLES} selected. Deselect a variable to add another.`
    : `${state.selected.length} of ${MAX_VARIABLES} selected.`;
  limit.classList.toggle("is-full", state.selected.length >= MAX_VARIABLES);
  el("selection-summary").textContent = `${state.selected.length} of ${MAX_VARIABLES} variables selected`;
};

const variableMatches = (variable) => {
  const query = normalizeSearch(state.search).trim();
  if (query) {
    const haystack = normalizeSearch([variable.label, variable.description, ...(variable.search_terms || [])].join(" "));
    if (!query.split(/\s+/).every((term) => haystack.includes(term))) return false;
  }
  if (state.activeGroup !== "all") {
    const group = state.groups.find((item) => item.id === state.activeGroup);
    if (!group?.variables.includes(variable.variable_id)) return false;
  }
  return true;
};

const renderVariableList = () => {
  const list = el("variable-list");
  const filtered = variables.filter(variableMatches);
  if (!filtered.length) {
    list.innerHTML = `<p class="metadata-empty">No variables match this search or group.</p>`;
    return;
  }
  list.innerHTML = filtered.map((variable) => {
    const selected = state.selected.includes(variable.variable_id);
    const full = state.selected.length >= MAX_VARIABLES && !selected;
    const groupOpen = state.groupEditorVariable === variable.variable_id;
    return `
      <article class="variable-row ${selected ? "is-selected" : ""}">
        <div class="variable-row__top">
          <div>
            <h3>${escapeHtml(variable.label)}</h3>
            <p>${escapeHtml(variable.description)}</p>
          </div>
          <button class="icon-btn" type="button" data-info="${escapeHtml(variable.variable_id)}" aria-label="Details for ${escapeHtml(variable.label)}">i</button>
        </div>
        <div class="variable-row__actions">
          <button class="btn ${selected ? "" : "btn--primary"}" type="button" data-select-variable="${escapeHtml(variable.variable_id)}" ${full ? "disabled" : ""}>${selected ? "Deselect" : "Add to chart"}</button>
          <button class="btn" type="button" data-group-variable="${escapeHtml(variable.variable_id)}" aria-expanded="${groupOpen}">My groups</button>
        </div>
        ${groupOpen ? renderGroupMenu(variable) : ""}
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-select-variable]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.selectVariable;
      if (state.selected.includes(id)) deselectVariable(id);
      else selectVariable(id);
    });
  });
  list.querySelectorAll("[data-info]").forEach((button) => button.addEventListener("click", () => openMetadata(button.dataset.info)));
  list.querySelectorAll("[data-group-variable]").forEach((button) => button.addEventListener("click", () => {
    state.groupEditorVariable = state.groupEditorVariable === button.dataset.groupVariable ? null : button.dataset.groupVariable;
    renderVariableList();
  }));
  list.querySelectorAll("[data-group-membership]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const [groupId, variableId] = checkbox.dataset.groupMembership.split("::");
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return;
    if (checkbox.checked && !group.variables.includes(variableId)) group.variables.push(variableId);
    if (!checkbox.checked) group.variables = group.variables.filter((id) => id !== variableId);
    saveGroups();
    renderGroupControls();
  }));
};

const renderGroupMenu = (variable) => {
  if (!state.groups.length) {
    return `<div class="group-menu"><p class="metadata-empty">Create a group first. Groups are your own labels and do not affect the data.</p></div>`;
  }
  return `
    <div class="group-menu">
      ${state.groups.map((group) => `
        <label>
          <input type="checkbox" data-group-membership="${escapeHtml(group.id)}::${escapeHtml(variable.variable_id)}" ${group.variables.includes(variable.variable_id) ? "checked" : ""}>
          <span>${escapeHtml(group.name)}</span>
        </label>
      `).join("")}
    </div>
  `;
};

const selectVariable = (id) => {
  if (state.selected.includes(id)) return;
  if (state.selected.length >= MAX_VARIABLES) {
    notify(`Six variables are already selected. Deselect one before adding another.`, true);
    return;
  }
  state.selected.push(id);
  state.metadataVariable = id;
  refresh();
};

const deselectVariable = (id) => {
  state.selected = state.selected.filter((item) => item !== id);
  if (state.metadataVariable === id) state.metadataVariable = state.selected.at(-1) || null;
  if (!state.selected.length) state.indexed = false;
  refresh();
};

const openMetadata = (id) => {
  state.metadataVariable = id;
  state.rightOpen = true;
  renderPanelState();
  renderMetadata();
};

const renderMetadata = () => {
  const container = el("metadata-content");
  if (state.selected.length > 1 && !state.selected.includes(state.metadataVariable)) {
    state.metadataVariable = state.selected[0];
  } else if (state.selected.length === 1 && !state.metadataVariable) {
    state.metadataVariable = state.selected[0];
  }
  const variable = variableById.get(state.metadataVariable);
  const variableChooser = state.selected.length > 1 ? `
    <div class="compact-field details-variable-field">
      <label for="details-variable">Displayed variable</label>
      <select id="details-variable">
        ${selectedVariables().map((item) => `<option value="${escapeHtml(item.variable_id)}" ${item.variable_id === state.metadataVariable ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </div>
  ` : "";
  if (!variable) {
    container.innerHTML = `
      <p class="metadata-empty">Select the information button beside a variable to inspect its definition, scale, and limitation.</p>
      <hr>
      <button class="btn" id="clear-selection" type="button" ${state.selected.length ? "" : "disabled"}>Clear all selected variables</button>
      <button class="btn btn--quiet" id="reset-groups" type="button" ${state.groups.length ? "" : "disabled"}>Reset my groups</button>
    `;
  } else {
    container.innerHTML = `
      ${variableChooser}
      <article class="metadata-card">
        <p class="eyebrow">Variable details</p>
        <h3>${escapeHtml(variable.label)}</h3>
        <p>${escapeHtml(variable.description)}</p>
        <dl class="metadata-list">
          <div><dt>Unit</dt><dd>${escapeHtml(variable.unit)}</dd></div>
          <div><dt>Direction</dt><dd>${escapeHtml(variable.higher_means)}</dd></div>
          <div><dt>Coverage</dt><dd>Annual observations, Y01–Y20; some event-specific variables contain gaps.</dd></div>
          <div><dt>Interpretive limit</dt><dd>This variable does not classify the regime on its own. Its relevance depends on the democratic approach and argument you apply.</dd></div>
        </dl>
        <button class="btn" id="copy-definition" type="button">Copy definition</button>
      </article>
      <hr>
      <button class="btn" id="clear-selection" type="button" ${state.selected.length ? "" : "disabled"}>Clear all selected variables</button>
      <button class="btn btn--quiet" id="reset-groups" type="button" ${state.groups.length ? "" : "disabled"}>Reset my groups</button>
    `;
    el("details-variable")?.addEventListener("change", (event) => {
      state.metadataVariable = event.target.value;
      renderMetadata();
    });
    el("copy-definition")?.addEventListener("click", () => copyText(`${variable.label}\nDefinition: ${variable.description}\nUnit: ${variable.unit}\nDirection: ${variable.higher_means}`, "Definition"));
  }
  el("clear-selection")?.addEventListener("click", () => {
    state.selected = [];
    state.metadataVariable = null;
    state.indexed = false;
    refresh();
  });
  el("reset-groups")?.addEventListener("click", () => {
    state.groups = [];
    state.activeGroup = "all";
    state.groupEditorVariable = null;
    saveGroups();
    refresh();
  });
};

const plotWidth = (host, fallback = 430) => Math.max(280, Math.floor(host.getBoundingClientRect().width || fallback));

const yDomainFor = (variable, data) => {
  if (state.indexed) {
    const values = data.map((item) => item.value).filter((value) => value !== null);
    const min = Math.min(...values, 100);
    const max = Math.max(...values, 100);
    const pad = Math.max(4, (max - min) * 0.12);
    return [Math.max(0, min - pad), max + pad];
  }
  if (variable.unit.startsWith("0–100")) return [0, 100];
  const values = data.map((item) => item.value).filter((value) => value !== null);
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.15);
  return [min - span * 0.12, max + span * 0.12];
};

const createPlot = (host, variable, data, { expanded = false } = {}) => {
  const width = plotWidth(host, expanded ? 760 : 430);
  const period = activePeriod();
  const yLabel = state.indexed ? "Index" : null;
  const chart = Plot.plot({
    width,
    height: expanded ? 430 : 245,
    marginLeft: 46,
    marginRight: 14,
    marginTop: 12,
    marginBottom: 38,
    x: { domain: [period.start, period.end], ticks: expanded ? 8 : 5, tickFormat: yearLabel, label: null },
    y: { domain: yDomainFor(variable, data), grid: true, label: yLabel },
    marks: [
      Plot.ruleY(state.indexed ? [100] : [], { stroke: "#8f999e", strokeDasharray: "4,4" }),
      Plot.ruleX(state.timeMode === "point" ? [state.point] : [], { stroke: "#53636e", strokeDasharray: "3,3" }),
      Plot.lineY(data, { x: "year_index", y: "value", stroke: accent, strokeWidth: 2.4, curve: "linear" }),
      Plot.dot(data, { x: "year_index", y: "value", fill: "white", stroke: accent, r: 2.5, tip: true, title: (d) => `${d.year_id}: ${formatValue(d.value)}${state.indexed ? " (index)" : ""}` }),
      Plot.dot(data.filter((d) => state.timeMode === "point" && d.year_index === state.point), { x: "year_index", y: "value", fill: accent, stroke: "white", r: 5.5, strokeWidth: 1.5 })
    ]
  });

  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", `Line chart of ${variable.label} over ${period.label}`);
  host.replaceChildren(chart);
  return chart;
};

const chartCard = (variable, { expanded = false } = {}) => {
  const card = document.createElement("article");
  card.className = `chart-card${expanded ? " chart-card--expanded" : ""}`;
  card.dataset.variableId = variable.variable_id;
  card.innerHTML = `
    <div class="chart-card__header">
      <div>
        <h3>${escapeHtml(variable.label)}</h3>
        <span class="chart-card__unit">${escapeHtml(state.indexed ? `Index (${yearLabel(state.start)} = 100)` : variable.unit)}</span>
      </div>
      <div class="chart-card__actions">
        <button class="icon-btn" type="button" data-copy-chart aria-label="Copy ${escapeHtml(variable.label)} chart" title="Copy visual">Copy</button>
        <button class="icon-btn" type="button" data-save-svg aria-label="Save ${escapeHtml(variable.label)} as SVG" title="Save SVG">SVG</button>
        <button class="icon-btn" type="button" data-save-png aria-label="Save ${escapeHtml(variable.label)} as PNG" title="Save PNG">PNG</button>
      </div>
    </div>
    <div class="chart-host"></div>
    <p class="chart-note">${escapeHtml(activePeriod().label)}${state.indexed ? " · indexed values" : ""}</p>
  `;
  const host = card.querySelector(".chart-host");
  requestAnimationFrame(() => createPlot(host, variable, seriesFor(variable.variable_id), { expanded }));
  bindChartExportActions(card, variable);
  return card;
};

const bindChartExportActions = (card, variable) => {
  card.querySelector("[data-save-svg]").addEventListener("click", () => exportSvg(card, variable, "svg"));
  card.querySelector("[data-save-png]").addEventListener("click", () => exportSvg(card, variable, "png"));
  card.querySelector("[data-copy-chart]").addEventListener("click", () => copySvg(card, variable));
};

const serializeSvg = (svg) => {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.insertAdjacentHTML("afterbegin", `<style>text{font-family:Inter,Arial,sans-serif} .domain{stroke:#8b969c}</style>`);
  return new XMLSerializer().serializeToString(clone);
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const svgToPng = (svgText, width, height) => new Promise((resolve, reject) => {
  const image = new Image();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  image.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(url);
      if (blob) resolve(blob);
      else reject(new Error("PNG conversion failed"));
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("SVG image could not be loaded"));
  };
  image.src = url;
});

const exportFilename = (variable, extension) => `${slugify(caseMeta.name)}-${slugify(variable.label)}-${state.timeMode === "point" ? yearLabel(state.point) : `${yearLabel(state.start)}-${yearLabel(state.end)}`}.${extension}`;

const exportSvg = async (card, variable, format) => {
  const svg = card.querySelector("svg");
  if (!svg) return notify("The chart is still rendering. Try again.", true);
  const text = serializeSvg(svg);
  if (format === "svg") {
    downloadBlob(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), exportFilename(variable, "svg"));
    notify("SVG saved.");
    return;
  }
  try {
    const blob = await svgToPng(text, Number(svg.getAttribute("width")) || 600, Number(svg.getAttribute("height")) || 320);
    downloadBlob(blob, exportFilename(variable, "png"));
    notify("PNG saved.");
  } catch {
    notify("Could not create the PNG. Save the SVG instead.", true);
  }
};

const copySvg = async (card, variable) => {
  const svg = card.querySelector("svg");
  if (!svg) return notify("The chart is still rendering. Try again.", true);
  try {
    const text = serializeSvg(svg);
    const blob = await svgToPng(text, Number(svg.getAttribute("width")) || 600, Number(svg.getAttribute("height")) || 320);
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("Image clipboard unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    notify("Visual copied.");
  } catch {
    notify("Image copying is unavailable here. Use Save PNG or Save SVG.", true);
  }
};

const matrixRows = () => {
  const years = state.timeMode === "point"
    ? [yearByIndex.get(state.point)]
    : caseData.years.filter((year) => year.year_index >= state.start && year.year_index <= state.end);
  return selectedVariables().map((variable) => ({
    variable,
    values: years.map((year) => ({ year: year.year_id, value: year.values[variable.variable_id] }))
  }));
};

const renderTable = (container) => {
  if (!state.selected.length || !state.tableVisible) {
    container.innerHTML = "";
    return;
  }
  const rows = matrixRows();
  const years = rows[0]?.values.map((item) => item.year) || [];
  container.innerHTML = `
    <div class="table-output-header">
      <div>
        <h3>Table output</h3>
        <p>${escapeHtml(activePeriod().label)} · ${state.selected.length} variable${state.selected.length === 1 ? "" : "s"}</p>
      </div>
      <div class="chart-card__actions">
        <button class="icon-btn" id="table-export" type="button" aria-label="Export displayed table as CSV" title="Export CSV">Export</button>
      </div>
    </div>
    <div class="data-table-wrap">
      <table class="data-table">
        <caption class="sr-only">Selected observations for ${escapeHtml(caseMeta.name)}</caption>
        <thead><tr><th scope="col">Variable</th><th scope="col">Unit</th>${years.map((year) => `<th scope="col">${year}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.variable.label)}</th><td>${escapeHtml(row.variable.unit)}</td>${row.values.map((item) => `<td>${formatValue(item.value)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  el("table-export").addEventListener("click", () => {
    const period = state.timeMode === "point" ? yearLabel(state.point) : `${yearLabel(state.start)}-${yearLabel(state.end)}`;
    downloadBlob(new Blob([csvText()], { type: "text/csv;charset=utf-8" }), `${slugify(caseMeta.name)}-${period}.csv`);
    notify("CSV saved.");
  });
};

const renderData = () => {
  const selected = selectedVariables();
  const indexButton = el("index-toggle");
  indexButton.disabled = !canUseIndex();
  indexButton.setAttribute("aria-pressed", String(state.indexed));
  indexButton.textContent = state.indexed ? `Indexed: ${yearLabel(state.start)} = 100` : "Index start = 100";
  el("table-toggle").setAttribute("aria-pressed", String(state.tableVisible));
  el("table-toggle").textContent = state.tableVisible ? "Hide table" : "Show table";
  el("chart-context").textContent = `${activePeriod().label}. ${state.indexed ? "Values shown as a relative index; raw values remain in the table." : "Values shown in original units."}`;

  const notice = [];
  if (state.timeMode === "point") notice.push(`${yearLabel(state.point)} is highlighted; the full trajectory remains visible so the point stays in context.`);
  if (state.timeMode === "period" && !canUseIndex() && selected.length) notice.push("Indexing is unavailable when a selected variable has zero or no observation at the period start.");
  el("chart-notice").textContent = notice.join(" ");

  const charts = el("data-charts");
  if (!selected.length) {
    charts.innerHTML = `<div class="empty-state"><strong>Select variables to begin</strong>Search the alphabetical list or use your own groups, then add up to six variables.</div>`;
    el("data-table").innerHTML = "";
    return;
  }
  const grid = document.createElement("div");
  grid.className = `chart-grid${selected.length === 1 ? " chart-grid--single" : ""}`;
  selected.forEach((variable) => grid.append(chartCard(variable, { expanded: selected.length === 1 })));
  charts.replaceChildren(grid);
  renderTable(el("data-table"));
};

const csvText = () => {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const years = state.timeMode === "point"
    ? [yearByIndex.get(state.point)]
    : caseData.years.filter((year) => year.year_index >= state.start && year.year_index <= state.end);
  return [
    ["Country", "Variable", "Variable ID", "Unit", "Year", "Value"].map(quote).join(","),
    ...selectedVariables().flatMap((variable) => years.map((year) => [
      caseMeta.name,
      variable.label,
      variable.variable_id,
      variable.unit,
      year.year_id,
      year.values[variable.variable_id]
    ].map(quote).join(",")))
  ].join("\n");
};

const renderPanelState = () => {
  const grid = el("analysis-grid");
  grid.classList.toggle("left-closed", !state.leftOpen);
  grid.classList.toggle("right-closed", !state.rightOpen);
  el("open-left-panel").hidden = state.leftOpen;
  el("open-right-panel").hidden = state.rightOpen;
  el("panel-buttons").hidden = state.leftOpen && state.rightOpen;
};

const refresh = ({ variables: renderVariables = true } = {}) => {
  if (state.indexed && !canUseIndex()) state.indexed = false;
  renderTimeControl();
  renderSelectedTray();
  if (renderVariables) {
    renderGroupControls();
    renderNewGroupForm();
    renderVariableList();
  }
  renderMetadata();
  renderPanelState();
  if (state.activeView === "data") renderData();
  syncUrl();
};

document.querySelectorAll(".tab-btn").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
el("start-exploring").addEventListener("click", () => setView("data"));
el("help-button").addEventListener("click", () => el("help-dialog").showModal());
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => el(button.dataset.closeDialog).close()));

el("variable-search").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderVariableList();
});
el("index-toggle").addEventListener("click", () => {
  if (!canUseIndex()) return notify("Indexing requires a non-zero observation for every selected variable at the period start.", true);
  state.indexed = !state.indexed;
  renderData();
  syncUrl();
});
el("table-toggle").addEventListener("click", () => {
  state.tableVisible = !state.tableVisible;
  renderData();
});

el("open-left-panel").addEventListener("click", () => { state.leftOpen = true; renderPanelState(); });
el("open-right-panel").addEventListener("click", () => { state.rightOpen = true; renderPanelState(); });
el("close-left-panel").addEventListener("click", () => { state.leftOpen = false; renderPanelState(); });
el("close-right-panel").addEventListener("click", () => { state.rightOpen = false; renderPanelState(); });

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.activeView === "data") renderData();
  }, 160);
});

renderGroupControls();
renderNewGroupForm();
renderSelectedTray();
renderVariableList();
renderMetadata();
renderPanelState();
renderTimeControl();
setView(state.activeView);
