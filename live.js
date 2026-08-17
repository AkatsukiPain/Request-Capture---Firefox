const $ = (id) => document.getElementById(id);
let currentId = null;
let pendingCache = [];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function headerRowHtml(h) {
  return `
    <div class="header-row">
      <input class="hr-name" type="text" placeholder="Header-Name" value="${escapeHtml(h.name)}" />
      <input class="hr-value" type="text" placeholder="value" value="${escapeHtml(h.value)}" />
      <button class="btn btn--ghost hr-remove" title="remove">✕</button>
    </div>`;
}

function renderList() {
  $("pendingCount").textContent = `${pendingCache.length} waiting`;
  const list = $("pendingList");
  const empty = $("emptyState");

  if (!pendingCache.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = pendingCache
    .map(
      (p) => `
      <div class="pending-row" data-id="${p.id}">
        <div class="pending-row-top">
          <span class="pill pill--amber">${escapeHtml(p.method)}</span>
          <span class="pending-url">${escapeHtml(p.url)}</span>
        </div>
        <div class="pending-meta">matched "${escapeHtml(p.ruleName)}" · ${new Date(p.time).toLocaleTimeString()}</div>
      </div>`
    )
    .join("");
}

function openDetail(id) {
  const entry = pendingCache.find((p) => p.id === id);
  if (!entry) return;
  currentId = id;
  $("detailMethod").textContent = entry.method;
  $("detailUrl").textContent = entry.url;
  $("detailHeaders").innerHTML = (entry.requestHeaders || [])
    .map((h) => headerRowHtml(h))
    .join("");
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
    // The item we were editing got resolved elsewhere (e.g. timeout).
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
  const div = document.createElement("div");
  div.innerHTML = headerRowHtml({ name: "", value: "" });
  $("detailHeaders").appendChild(div.firstElementChild);
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
