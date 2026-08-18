function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createEl(tag, options = {}, children = []) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text != null) el.textContent = options.text;
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

async function refreshRuleCount() {
  const res = await browser.runtime.sendMessage({ type: "GET_RULE_COUNT" });
  document.getElementById("ruleCount").textContent =
    `${res.enabled} of ${res.total} rule${res.total === 1 ? "" : "s"} active`;
}

function renderLog(entries) {
  const container = document.getElementById("log");
  clearChildren(container);

  if (!entries.length) {
    container.appendChild(
      createEl("div", {
        className: "empty-state",
        text: "No requests caught yet. Browse somewhere and matching rules will show up here.",
      })
    );
    return;
  }

  entries.slice(0, 30).forEach((e) => {
    const time = new Date(e.time).toLocaleTimeString();
    const top = createEl("div", { className: "log-row-top" }, [
      createEl("span", { className: "log-method", text: e.method || "" }),
      createEl("span", {
        className: "log-url",
        text: e.url || "",
        attrs: { title: e.url || "" },
      }),
    ]);
    const meta = createEl("div", {
      className: "log-meta",
      text: `${time} · ${e.ruleName || "rule"} · ${e.actionType || ""}`,
    });
    container.appendChild(createEl("div", { className: "log-row" }, [top, meta]));
  });
}

async function refreshLog() {
  const res = await browser.runtime.sendMessage({ type: "GET_LOG" });
  renderLog(res.log || []);
  setBreaker(res.globalEnabled);
}

function setBreaker(on) {
  const el = document.getElementById("breaker");
  const label = document.getElementById("breakerLabel");
  el.classList.toggle("on", !!on);
  label.textContent = on ? "ON" : "OFF";
}

document.getElementById("breaker").addEventListener("click", async () => {
  const stored = await browser.storage.local.get("globalEnabled");
  const next = !(stored.globalEnabled !== false);
  await browser.storage.local.set({ globalEnabled: next });
  setBreaker(next);
});

document.getElementById("clearLog").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_LOG" });
  renderLog([]);
});

document.getElementById("openOptions").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

document.getElementById("openLiveQueue").addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "OPEN_LIVE_QUEUE" });
});

refreshRuleCount();
refreshLog();
setInterval(refreshLog, 1500);
