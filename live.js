const $ = (id) => document.getElementById(id);
let currentId = null;
let pendingCache = [];

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createEl(tag, options = {}, children = []) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text != null) el.textContent = options.text;
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([k, v]) => {
      el.dataset[k] = v;
    });
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([k, v]) => {
      if (v != null) el.setAttribute(k, v);
    });
  }
  children.forEach((child) => {
    if (child) el.appendChild(child);
  });
  return el;
}

function createHeaderRow(h) {
  return createEl("div", { className: "header-row" }, [
    createEl("input", {
      className: "hr-name",
      attrs: { type: "text", placeholder: "Header-Name", value: h.name || "" },
    }),
    createEl("input", {
      className: "hr-value",
      attrs: { type: "text", placeholder: "value", value: h.value || "" },
    }),
    createEl("button", {
      className: "btn btn--ghost hr-remove",
      text: "✕",
      attrs: { title: "remove", type: "button" },
    }),
  ]);
}

function renderList() {
  $("pendingCount").textContent = `${pendingCache.length} waiting`;
  const list = $("pendingList");
  const empty = $("emptyState");

  clearChildren(list);
  if (!pendingCache.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  pendingCache.forEach((p) => {
    const top = createEl("div", { className: "pending-row-top" }, [
      createEl("span", { className: "pill pill--amber", text: p.method || "" }),
      createEl("span", { className: "pending-url", text: p.url || "" }),
    ]);
    const meta = createEl("div", {
      className: "pending-meta",
      text: `matched "${p.ruleName || ""}" · ${new Date(p.time).toLocaleTimeString()}`,
    });
    list.appendChild(createEl("div", { className: "pending-row", dataset: { id: p.id } }, [top, meta]));
  });
}

function openDetail(id) {
  const entry = pendingCache.find((p) => p.id === id);
  if (!entry) return;
  currentId = id;
  $("detailMethod").textContent = entry.method;
  $("detailUrl").textContent = entry.url;
  const detailHeaders = $("detailHeaders");
  clearChildren(detailHeaders);
  (entry.requestHeaders || []).forEach((h) => detailHeaders.appendChild(createHeaderRow(h)));
  $("pendingList").hidden = true;
  $("emptyState").hidden = true;
  $("detail").hidden = false;
}

function closeDetail() {
  currentId = null;
  $("detail").hidden = true;
  $("pendingList").hidden = false;
  renderList();
}

function readDetailHeaders() {
  return Array.from(document.querySelectorAll("#detailHeaders .header-row"))
    .map((row) => ({
      name: row.querySelector(".hr-name").value.trim(),
      value: row.querySelector(".hr-value").value,
    }))
    .filter((h) => h.name);
}

async function refresh() {
  const res = await browser.runtime.sendMessage({ type: "GET_PENDING" });
  pendingCache = res.pending || [];

  if (currentId && !pendingCache.some((p) => p.id === currentId)) {
    closeDetail();
    return;
  }
  if (!currentId) renderList();
}

$("pendingList").addEventListener("click", (e) => {
  const row = e.target.closest(".pending-row");
  if (row) openDetail(row.dataset.id);
});

$("backBtn").addEventListener("click", closeDetail);

$("addHeaderBtn").addEventListener("click", () => {
  $("detailHeaders").appendChild(createHeaderRow({ name: "", value: "" }));
});

$("detailHeaders").addEventListener("click", (e) => {
  if (e.target.matches(".hr-remove")) e.target.closest(".header-row").remove();
});

$("sendReqBtn").addEventListener("click", async () => {
  if (!currentId) return;
  await browser.runtime.sendMessage({
    type: "RESOLVE_PENDING",
    id: currentId,
    action: "send",
    requestHeaders: readDetailHeaders(),
  });
  closeDetail();
});

$("cancelReqBtn").addEventListener("click", async () => {
  if (!currentId) return;
  await browser.runtime.sendMessage({ type: "RESOLVE_PENDING", id: currentId, action: "cancel" });
  closeDetail();
});

refresh();
setInterval(refresh, 800);
