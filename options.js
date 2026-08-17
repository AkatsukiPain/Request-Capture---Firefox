let rules = [];
let editingId = null;
let currentMode = "adjust";

const $ = (id) => document.getElementById(id);

function uid() {
  return "r_" + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function loadRules() {
  const stored = await browser.storage.local.get("rules");
  rules = Array.isArray(stored.rules) ? stored.rules : [];
  renderList();
}

async function saveRules() {
  await browser.storage.local.set({ rules });
  renderList();
}

function actionBadge(action) {
  const map = {
    modifyHeaders: ["headers", "teal"],
    redirect: ["redirect", "amber"],
    mockResponse: ["mock", "amber"],
    delay: ["delay", "teal"],
    block: ["block", "red"],
  };
  const [label, color] = map[action && action.type] || ["—", "teal"];
  return `<span class="pill pill--${color}">${label}</span>`;
}

function modeBadge(rule) {
  if (rule.mode === "live") {
    return `<span class="pill pill--amber">live capture</span>`;
  }
  return actionBadge(rule.action);
}

function renderList() {
  const list = $("ruleList");
  const empty = $("emptyState");
  if (!rules.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = rules
    .map((r, i) => {
      return `
        <div class="rule-row ${r.enabled ? "" : "disabled"}" data-id="${r.id}">
          <div class="rule-index">${i + 1}</div>
          <div class="rule-main">
            <div class="rule-name">${escapeHtml(r.name || "(unnamed rule)")}</div>
            <div class="rule-pattern">${escapeHtml(r.matchMode)} · ${escapeHtml(r.method || "ANY")} · ${escapeHtml(r.pattern || "")}</div>
          </div>
          <div class="rule-badges">${modeBadge(r)}</div>
          <div class="mini-toggle ${r.enabled ? "on" : ""}" data-toggle title="${r.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}">
            <span class="mini-toggle-track"><span class="mini-toggle-knob"></span></span>
            <span class="mini-toggle-text">${r.enabled ? "on" : "off"}</span>
          </div>
          <div class="rule-order-btns">
            <button data-move="up" title="Move up">▲</button>
            <button data-move="down" title="Move down">▼</button>
          </div>
          <div class="rule-actions">
            <button class="btn btn--ghost" data-edit>edit</button>
          </div>
        </div>`;
    })
    .join("");
}

document.addEventListener("click", (e) => {
  const row = e.target.closest(".rule-row");
  if (!row) return;
  const id = row.dataset.id;
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return;

  if (e.target.matches("[data-move='up']") && idx > 0) {
    [rules[idx - 1], rules[idx]] = [rules[idx], rules[idx - 1]];
    saveRules();
  } else if (e.target.matches("[data-move='down']") && idx < rules.length - 1) {
    [rules[idx + 1], rules[idx]] = [rules[idx], rules[idx + 1]];
    saveRules();
  } else if (e.target.closest("[data-toggle]")) {
    rules[idx].enabled = !rules[idx].enabled;
    saveRules();
  } else if (e.target.matches("[data-edit]")) {
    openEditor(rules[idx]);
  }
});

// ---------------- Editor ----------------

function headerRowHtml(op) {
  op = op || { name: "", op: "set", value: "" };
  return `
    <div class="header-row">
      <select class="hr-op">
        <option value="set" ${op.op === "set" ? "selected" : ""}>set</option>
        <option value="remove" ${op.op === "remove" ? "selected" : ""}>remove</option>
      </select>
      <input class="hr-name" type="text" placeholder="Header-Name" value="${escapeHtml(op.name)}" />
      <input class="hr-value" type="text" placeholder="value" value="${escapeHtml(op.value)}" />
      <button class="btn btn--ghost hr-remove" title="remove row">✕</button>
    </div>`;
}

function addHeaderRow(container, op) {
  const div = document.createElement("div");
  div.innerHTML = headerRowHtml(op);
  container.appendChild(div.firstElementChild);
}

function readHeaderRows(container) {
  return Array.from(container.querySelectorAll(".header-row")).map((row) => ({
    op: row.querySelector(".hr-op").value,
    name: row.querySelector(".hr-name").value.trim(),
    value: row.querySelector(".hr-value").value,
  })).filter((h) => h.name);
}

function showActionPanel(type) {
  document.querySelectorAll(".action-panel").forEach((p) => p.classList.remove("active"));
  const panel = $("panel_" + type);
  if (panel) panel.classList.add("active");
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll("#modeSegmented button").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  $("adjustFields").hidden = mode === "live";
  $("liveFields").classList.toggle("active", mode === "live");
  $("modeHint").textContent =
    mode === "live"
      ? "Pauses matching requests so you can review and edit them by hand before they're sent."
      : "Applies the action below automatically, every time this rule matches.";
}

$("modeSegmented").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (btn) setMode(btn.dataset.mode);
});

function resetEditorFields() {
  $("f_name").value = "";
  $("f_matchMode").value = "contains";
  $("f_pattern").value = "";
  $("f_method").value = "ANY";
  $("f_actionType").value = "modifyHeaders";
  $("f_redirectUrl").value = "";
  $("f_mockContentType").value = "application/json";
  $("f_mockBody").value = "";
  $("f_delayMs").value = "1000";
  $("reqHeaderRows").innerHTML = "";
  $("resHeaderRows").innerHTML = "";
  addHeaderRow($("reqHeaderRows"));
  addHeaderRow($("resHeaderRows"));
  showActionPanel("modifyHeaders");
  setMode("adjust");
}

function openEditor(rule) {
  resetEditorFields();
  editingId = rule ? rule.id : null;
  $("editorTitle").textContent = rule ? "Edit rule" : "New rule";
  $("deleteRuleBtn").hidden = !rule;

  if (rule) {
    $("f_name").value = rule.name || "";
    $("f_matchMode").value = rule.matchMode || "contains";
    $("f_pattern").value = rule.pattern || "";
    $("f_method").value = rule.method || "ANY";
    setMode(rule.mode === "live" ? "live" : "adjust");

    const action = rule.action || {};
    $("f_actionType").value = action.type || "modifyHeaders";
    showActionPanel(action.type || "modifyHeaders");

    if (action.type === "modifyHeaders") {
      $("reqHeaderRows").innerHTML = "";
      $("resHeaderRows").innerHTML = "";
      (action.requestHeaders && action.requestHeaders.length
        ? action.requestHeaders
        : [{ op: "set", name: "", value: "" }]
      ).forEach((op) => addHeaderRow($("reqHeaderRows"), op));
      (action.responseHeaders && action.responseHeaders.length
        ? action.responseHeaders
        : [{ op: "set", name: "", value: "" }]
      ).forEach((op) => addHeaderRow($("resHeaderRows"), op));
    } else if (action.type === "redirect") {
      $("f_redirectUrl").value = action.redirectUrl || "";
    } else if (action.type === "mockResponse") {
      $("f_mockContentType").value = (action.mock && action.mock.contentType) || "application/json";
      $("f_mockBody").value = (action.mock && action.mock.body) || "";
    } else if (action.type === "delay") {
      $("f_delayMs").value = action.delayMs || 1000;
    }
  }

  $("editorOverlay").hidden = false;
}

function closeEditor() {
  $("editorOverlay").hidden = true;
  editingId = null;
}

function buildActionFromForm() {
  const type = $("f_actionType").value;
  if (type === "modifyHeaders") {
    return {
      type,
      requestHeaders: readHeaderRows($("reqHeaderRows")),
      responseHeaders: readHeaderRows($("resHeaderRows")),
    };
  }
  if (type === "redirect") {
    return { type, redirectUrl: $("f_redirectUrl").value.trim() };
  }
  if (type === "mockResponse") {
    return {
      type,
      mock: {
        contentType: $("f_mockContentType").value.trim() || "application/json",
        body: $("f_mockBody").value,
      },
    };
  }
  if (type === "delay") {
    return { type, delayMs: Number($("f_delayMs").value) || 0 };
  }
  return { type: "block" };
}

async function handleSave() {
  const pattern = $("f_pattern").value.trim();
  if (!pattern) {
    $("f_pattern").focus();
    return;
  }
  const rule = {
    id: editingId || uid(),
    name: $("f_name").value.trim(),
    enabled: true,
    matchMode: $("f_matchMode").value,
    pattern,
    method: $("f_method").value,
    mode: currentMode,
    action: currentMode === "live" ? null : buildActionFromForm(),
  };

  const existingIdx = editingId ? rules.findIndex((r) => r.id === editingId) : -1;
  if (existingIdx !== -1) {
    // Editing: overwrite in place, preserve enabled state.
    rule.enabled = rules[existingIdx].enabled;
    rules[existingIdx] = rule;
  } else {
    // New rule (or a stale editingId that no longer matches anything).
    rules.push(rule);
  }

  await saveRules();
  closeEditor();
}

async function handleDelete() {
  if (!editingId) return;
  rules = rules.filter((r) => r.id !== editingId);
  await saveRules();
  closeEditor();
}

// ---------------- Wiring ----------------

$("addRuleBtn").addEventListener("click", () => openEditor(null));
$("liveQueueBtn").addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "OPEN_LIVE_QUEUE" });
});
$("closeEditor").addEventListener("click", closeEditor);
$("cancelEdit").addEventListener("click", closeEditor);
$("saveRule").addEventListener("click", handleSave);
$("deleteRuleBtn").addEventListener("click", handleDelete);
$("f_actionType").addEventListener("change", (e) => showActionPanel(e.target.value));

$("editorOverlay").addEventListener("click", (e) => {
  if (e.target.id === "editorOverlay") closeEditor();
});

document.addEventListener("click", (e) => {
  if (e.target.matches(".add-row-btn")) {
    const target = e.target.dataset.add === "request" ? $("reqHeaderRows") : $("resHeaderRows");
    addHeaderRow(target);
  } else if (e.target.matches(".hr-remove")) {
    e.target.closest(".header-row").remove();
  }
});

// Global breaker
async function refreshBreaker() {
  const stored = await browser.storage.local.get("globalEnabled");
  const on = stored.globalEnabled !== false;
  $("breaker").classList.toggle("on", on);
  $("breakerLabel").textContent = on ? "ON" : "OFF";
}

$("breaker").addEventListener("click", async () => {
  const stored = await browser.storage.local.get("globalEnabled");
  const next = !(stored.globalEnabled !== false);
  await browser.storage.local.set({ globalEnabled: next });
  refreshBreaker();
});

// Import / export
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "catchpoint-rules.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Expected a JSON array of rules");
    // Assign fresh ids to avoid collisions with existing rules.
    const withIds = imported.map((r) => ({ ...r, id: uid() }));
    rules = rules.concat(withIds);
    await saveRules();
  } catch (err) {
    alert("Could not import rules: " + err.message);
  } finally {
    e.target.value = "";
  }
});

loadRules();
refreshBreaker();
