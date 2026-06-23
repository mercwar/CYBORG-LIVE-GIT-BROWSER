// browser-extension.js
// Pure extension layer for the Mercwar Repo Browser.
// No duplication of index.js logic. No overrides. No conflicts.

class RepoBrowserExtension {
  constructor() {
    this.history = [];
    this.bookmarks = new Set();
    this.stats = null;

    this._bindCoreEvents();
    this._injectUI();
    this._installShortcuts();
  }

  // ---------------------------------------------------------
  // CORE EVENT HOOKS (non-invasive)
  // ---------------------------------------------------------
  _bindCoreEvents() {
    // Hook into file selection without touching index.js
    document.addEventListener("click", (e) => {
      const node = e.target.closest(".tree-node");
      if (!node) return;

      const path = node.dataset.path;
      const type = node.dataset.type;

      if (type === "file") {
        this._addToHistory(path);
      }
    });
  }

  // ---------------------------------------------------------
  // UI INJECTION (new buttons + panels)
  // ---------------------------------------------------------
  _injectUI() {
    const header = document.querySelector(".main-header .main-actions");
    if (!header) return;

    // Quick Open
    const quickBtn = this._makeBtn("QUICK OPEN", () => this._openPalette());
    header.appendChild(quickBtn);

    // Bookmarks
    const favBtn = this._makeBtn("★", () => this._toggleBookmark());
    favBtn.style.fontSize = "14px";
    header.appendChild(favBtn);

    // Reload
    const reloadBtn = this._makeBtn("RELOAD", () => location.reload());
    header.appendChild(reloadBtn);

    // Stats Panel
    this._injectStatsPanel();
  }

  _makeBtn(label, fn) {
    const b = document.createElement("button");
    b.className = "btn rk-btn";
    b.textContent = label;
    b.onclick = fn;
    return b;
  }

  // ---------------------------------------------------------
  // HISTORY SYSTEM
  // ---------------------------------------------------------
  _addToHistory(path) {
    if (this.history[this.history.length - 1] !== path) {
      this.history.push(path);
    }
    this._updateStats();
  }

  getHistory() {
    return [...this.history];
  }

  // ---------------------------------------------------------
  // BOOKMARK SYSTEM
  // ---------------------------------------------------------
  _toggleBookmark() {
    const active = document.querySelector(".tree-node.active");
    if (!active) return;

    const path = active.dataset.path;

    if (this.bookmarks.has(path)) {
      this.bookmarks.delete(path);
    } else {
      this.bookmarks.add(path);
    }

    this._renderBookmarks();
  }

  _renderBookmarks() {
    let panel = document.getElementById("rbxBookmarks");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "rbxBookmarks";
      panel.className = "rru-panel";
      panel.style.margin = "10px";
      panel.style.fontFamily = "var(--mono)";
      panel.style.fontSize = "12px";
      document.body.appendChild(panel);
    }

    panel.innerHTML = "<strong>Bookmarks</strong><br>";

    [...this.bookmarks].forEach(path => {
      const el = document.createElement("div");
      el.textContent = path;
      el.style.cursor = "pointer";
      el.onclick = () => this._openFile(path);
      panel.appendChild(el);
    });
  }

  _openFile(path) {
    // Trigger existing browser logic
    const node = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
    if (node) node.click();
  }

  // ---------------------------------------------------------
  // QUICK OPEN PALETTE (Ctrl+P)
  // ---------------------------------------------------------
  _openPalette() {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "#000a";
    overlay.style.backdropFilter = "blur(6px)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const box = document.createElement("div");
    box.style.background = "#111";
    box.style.padding = "20px";
    box.style.border = "1px solid var(--border-blue)";
    box.style.borderRadius = "6px";
    box.style.width = "400px";
    box.style.fontFamily = "var(--mono)";
    box.style.color = "var(--text)";

    const input = document.createElement("input");
    input.style.width = "100%";
    input.style.padding = "8px";
    input.style.marginBottom = "10px";
    input.style.background = "#000";
    input.style.color = "var(--text)";
    input.style.border = "1px solid var(--border-blue)";
    input.placeholder = "Type to search files…";

    const list = document.createElement("div");
    list.style.maxHeight = "300px";
    list.style.overflowY = "auto";

    input.oninput = () => {
      const q = input.value.toLowerCase();
      list.innerHTML = "";

      const matches = window.flatFiles
        .filter(f => f.type === "file" && f.path.toLowerCase().includes(q))
        .slice(0, 50);

      matches.forEach(f => {
        const item = document.createElement("div");
        item.textContent = f.path;
        item.style.padding = "4px";
        item.style.cursor = "pointer";
        item.onclick = () => {
          overlay.remove();
          this._openFile(f.path);
        };
        list.appendChild(item);
      });
    };

    box.appendChild(input);
    box.appendChild(list);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.focus();

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  }

  // ---------------------------------------------------------
  // KEYBOARD SHORTCUTS
  // ---------------------------------------------------------
  _installShortcuts() {
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        this._openPalette();
      }
    });
  }

  // ---------------------------------------------------------
  // STATS PANEL
  // ---------------------------------------------------------
  _injectStatsPanel() {
    const panel = document.createElement("div");
    panel.id = "rbxStats";
    panel.className = "rru-panel";
    panel.style.margin = "10px";
    panel.style.fontFamily = "var(--mono)";
    panel.style.fontSize = "12px";
    document.body.appendChild(panel);

    this._updateStats();
  }

  _updateStats() {
    if (!window.flatFiles) return;

    const files = window.flatFiles.filter(f => f.type === "file");
    const dirs = window.flatFiles.filter(f => f.type === "dir");

    const totalSize = files.reduce((a, b) => a + (b.size || 0), 0);

    const panel = document.getElementById("rbxStats");
    if (!panel) return;

    panel.innerHTML = `
      <strong>Repository Stats</strong><br>
      Files: ${files.length}<br>
      Directories: ${dirs.length}<br>
      Total Size: ${totalSize} bytes<br>
      History: ${this.history.length} opened<br>
      Bookmarks: ${this.bookmarks.size}<br>
    `;
  }
}

// ---------------------------------------------------------
// AUTO‑START EXTENSION
// ---------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  window.RepoBrowserExtension = new RepoBrowserExtension();
});

function collapseAllDropdowns() {
  document.querySelectorAll(".tree-children").forEach(el => {
    el.style.display = "none";
  });

  document.querySelectorAll(".tree-toggle").forEach(el => {
    if (!el.classList.contains("hidden")) {
      el.textContent = "▸";
    }
  });
}
function expandAllDropdowns() {
  document.querySelectorAll(".tree-children").forEach(el => {
    el.style.display = "";
  });

  document.querySelectorAll(".tree-toggle").forEach(el => {
    if (!el.classList.contains("hidden")) {
      el.textContent = "▾";
    }
  });
}