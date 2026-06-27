/* ---------------------------------------------------------
   PRISM SETUP (GLOBAL, SAFE, NO AUTO-HIGHLIGHT, NO PHP)
--------------------------------------------------------- */
window.Prism = window.Prism || {};
Prism.manual = true; // prevent Prism from auto-highlighting <pre> in HTML
// ---------------------------------------------------------
// VIEW IN FRAME BUTTON (load source, not URL)
// ---------------------------------------------------------
const openFrameBtn = document.getElementById("openFrameBtn");
const frameViewer = document.getElementById("frameViewer");
openFrameBtn.addEventListener("click", () => {
  if (!activePath) return;
  if (!lastFetchedFileContent) return;

  frameViewer.style.display = "block";
  fileContentEl.style.display = "none";
  emptyStateEl.style.display = "none";

  let content = lastFetchedFileContent;

  // Detect fragment (no root tags)
  const lower = content.toLowerCase();
  const isFragment = !(
    lower.includes("<html") ||
    lower.includes("<body") ||
    lower.includes("<head") ||
    lower.includes("<?xml") ||
    lower.includes("<svg")
  );

  // Wrap fragment in full HTML shell
  if (isFragment) {
    content =
      `<html><head><style>
        html, body {
          background: white !important;
          margin: 0;
          padding: 10px;
          font-family: Arial;
          overflow: auto;
        }

        /* SCROLLBAR THEME INSIDE IFRAME */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #020512; /* blue-darkest */
        }
        ::-webkit-scrollbar-thumb {
          background: #9be1f0; /* blue */
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #fff; /* blue-strong */
          box-shadow: 0 0 12px #9be1f044;
        }
      </style></head><body>` +
      content +
      `</body></html>`;
  }

  const blob = new Blob([content], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  frameViewer.src = url;
});


function injectPrismDependencies() {
  if (document.getElementById("prism-core-lib")) return;

  const linkEl = document.createElement("link");
  linkEl.rel = "stylesheet";
  linkEl.href = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css";
  document.head.appendChild(linkEl);

  const scriptEl = document.createElement("script");
  scriptEl.id = "prism-core-lib";
  scriptEl.src = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js";

  scriptEl.onload = () => {
    const langs = [
      "javascript","typescript","json","markdown","python",
      "css","c","cpp","bash","java","go","rust"
    ];
    langs.forEach(lang => {
      const s = document.createElement("script");
      s.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`;
      document.body.appendChild(s);
    });

    // BLOCK PHP COMPLETELY
    delete Prism.languages.php;
    Prism.hooks.add("before-highlight", env => {
      if (env.language === "php") env.language = "none";
    });
  };

  document.body.appendChild(scriptEl);
}

function getPrismLanguageClass(path) {
  const lower = path.toLowerCase();

  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".cbord")) return "language-javascript";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "language-typescript";
  if (lower.endsWith(".json")) return "language-json";
  if (lower.endsWith(".md")) return "language-markdown";
  if (lower.endsWith(".py")) return "language-python";
  if (lower.endsWith(".html") || lower.endsWith(".xml")) return "language-markup";
  if (lower.endsWith(".css")) return "language-css";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "language-bash";
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "language-c";
  if (lower.endsWith(".cpp") || lower.endsWith(".hpp")) return "language-cpp";

  return "language-none";
}

function renderPrismCode(rawCode, path) {
  const langClass = getPrismLanguageClass(path);
  const safe = rawCode
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `
    <pre class="${langClass}" style="margin:0; padding:1rem; background:transparent;">
      <code class="${langClass}">${safe}</code>
    </pre>
  `;
}

/* ---------------------------------------------------------
   CONFIG
--------------------------------------------------------- */
const CONFIG = {
  owner: "",
  repo: "",
  branch: "",
  api_base: "",
  raw_base: "",
  pages_base: ""
};

/* ---------------------------------------------------------
   DOM REFS
--------------------------------------------------------- */
const fileTreeEl = document.getElementById("fileTree");
const currentPathEl = document.getElementById("currentPath");
const fileContentEl = document.getElementById("fileContent");
const emptyStateEl = document.getElementById("emptyState");
const fileTypeBadgeEl = document.getElementById("fileTypeBadge");
const fileMetaEl = document.getElementById("fileMeta");
const repoNameEl = document.getElementById("repoName");
const repoBranchEl = document.getElementById("repoBranch");
const repoInfoBadgeEl = document.getElementById("repoInfoBadge");
const statusDotEl = document.getElementById("statusDot");
const statusLabelEl = document.getElementById("statusLabel");
const statusTextEl = document.getElementById("statusText");
const openGithubBtn = document.getElementById("openGithubBtn");
const openRawBtn = document.getElementById("openRawBtn");
const searchInput = document.getElementById("searchInput");

let treeData = [];
let flatFiles = [];
let activePath = null;

/* ---------------------------------------------------------
   STATUS BAR
--------------------------------------------------------- */
function setStatus(mode, text = "") {
  if (mode === "loading") {
    statusDotEl.classList.remove("error");
    statusLabelEl.textContent = "LOADING";
    statusTextEl.textContent = text;
  } else if (mode === "error") {
    statusDotEl.classList.add("error");
    statusLabelEl.textContent = "ERROR";
    statusTextEl.textContent = text;
  } else {
    statusDotEl.classList.remove("error");
    statusLabelEl.textContent = "READY";
    statusTextEl.textContent = text;
  }
}

/* ---------------------------------------------------------
   TEXT FILE DETECTION
--------------------------------------------------------- */
function isTextFile(path) {
  const lower = path.toLowerCase();
  const textExts = [
    ".avis",".cbord",".js",".ts",".jsx",".tsx",".json",".md",".txt",".html",".css",".scss",".sass",".less",
    ".yml",".yaml",".xml",".c",".h",".cpp",".hpp",".cc",".hh",".py",".rb",".go",".rs",".java",
    ".cs",".sh",".bat",".ps1",".toml",".ini",".cfg",".conf",".env"
  ];
  return textExts.some(ext => lower.endsWith(ext));
}

/* ---------------------------------------------------------
   BUILD TREE
--------------------------------------------------------- */
function buildTreeFromPaths(files) {
  const root = { name: "/", path: "", type: "dir", children: [] };

  for (const file of files) {
    if (!file || !file.path || typeof file.path !== "string") continue;

    const parts = file.path.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let node = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? currentPath + "/" + part : part;

      if (!node.children) node.children = [];

      if (isLast) {
        node.children.push({
          name: part,
          path: currentPath,
          type: file.type,
          size: file.size || 0,
          sha: file.sha || ""
        });
      } else {
        let childDir = node.children.find(
          c => c.type === "dir" && c.name === part
        );

        if (!childDir) {
          childDir = {
            name: part,
            path: currentPath,
            type: "dir",
            children: []
          };
          node.children.push(childDir);
        }

        node = childDir;
      }
    }
  }

  function sortNode(n) {
    if (!n.children) return;
    n.children.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
    n.children.forEach(sortNode);
  }

  sortNode(root);
  return root.children;
}

/* ---------------------------------------------------------
   RENDER TREE
--------------------------------------------------------- */
function renderTree(nodes, container, filter = "") {
  container.innerHTML = "";

  function renderNode(node, parentEl) {
    const matchesFilter =
      !filter ||
      node.type === "dir" ||
      node.path.toLowerCase().includes(filter.toLowerCase());

    if (!matchesFilter) {
      if (node.type === "dir" && node.children) {
        const anyChildMatches = node.children.some(child =>
          child.path.toLowerCase().includes(filter.toLowerCase())
        );
        if (!anyChildMatches) return;
      } else {
        return;
      }
    }

    const nodeEl = document.createElement("div");
    nodeEl.className = "tree-node";
    nodeEl.dataset.path = node.path;
    nodeEl.dataset.type = node.type;

    const toggleEl = document.createElement("div");
    toggleEl.className = "tree-toggle";
    if (node.type === "dir") {
      toggleEl.textContent = "▾";
    } else {
      toggleEl.classList.add("hidden");
    }

    const iconEl = document.createElement("div");
    iconEl.className = "icon";
    iconEl.textContent = node.type === "dir" ? "📁" : "📄";

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = node.name;

    nodeEl.appendChild(toggleEl);
    nodeEl.appendChild(iconEl);
    nodeEl.appendChild(nameEl);
    parentEl.appendChild(nodeEl);

    let childrenContainer = null;
    if (node.type === "dir" && node.children && node.children.length) {
      childrenContainer = document.createElement("div");
      childrenContainer.className = "tree-children";
      parentEl.appendChild(childrenContainer);
      node.children.forEach(child => renderNode(child, childrenContainer));
    }

    nodeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (node.type === "dir") {
        if (childrenContainer) {
          const isHidden = childrenContainer.style.display === "none";
          childrenContainer.style.display = isHidden ? "" : "none";
          toggleEl.textContent = isHidden ? "▾" : "▸";
        }
      } else {
        selectFile(node.path);
      }
    });
  }

  nodes.forEach(node => renderNode(node, container));
}

/* ---------------------------------------------------------
   FETCH REPO TREE
--------------------------------------------------------- */
async function fetchRepoTree() {
  setStatus("loading", "Fetching repo tree...");
  repoNameEl.textContent = `${CONFIG.owner}/${CONFIG.repo}`;
  repoBranchEl.textContent = CONFIG.branch;

  try {
    const refRes = await fetch(
      `${CONFIG.api_base}/${CONFIG.owner}/${CONFIG.repo}/git/refs/heads/${CONFIG.branch}`
    );
    if (!refRes.ok) throw new Error("Failed to resolve branch ref");
    const refData = await refRes.json();
    const commitSha = refData.object.sha;

    const commitRes = await fetch(
      `${CONFIG.api_base}/${CONFIG.owner}/${CONFIG.repo}/git/commits/${commitSha}`
    );
    if (!commitRes.ok) throw new Error("Failed to fetch commit");
    const commitData = await commitRes.json();
    const treeSha = commitData.tree.sha;

    const treeRes = await fetch(
      `${CONFIG.api_base}/${CONFIG.owner}/${CONFIG.repo}/git/trees/${treeSha}?recursive=1`
    );
    if (!treeRes.ok) throw new Error("Failed to fetch tree");
    const treeDataRaw = await treeRes.json();

    flatFiles = treeDataRaw.tree
      .filter(item => item.type === "blob" || item.type === "tree")
      .map(item => ({
        path: item.path,
        type: item.type === "tree" ? "dir" : "file",
        size: item.size || 0,
        sha: item.sha
      }));

    treeData = buildTreeFromPaths(flatFiles);
    renderTree(treeData, fileTreeEl);
    setStatus("ready", `Loaded ${flatFiles.length} entries`);
  } catch (err) {
    console.error(err);
    setStatus("error", err.message || "Failed to load repo");
    repoInfoBadgeEl.textContent = "GitHub API ERROR";
  }
}

/* ---------------------------------------------------------
   FILE TYPE HELPERS
--------------------------------------------------------- */
function isBinaryFile(path) {
  const lower = path.toLowerCase();
  const binaryExts = [
    ".exe",".dll",".bin",".dat",".zip",".rar",".7z",".pdf",".jpg",".jpeg",".png",".gif",".bmp",".ico",
    ".mp3",".wav",".ogg",".mp4",".avi",".mov",".webm"
  ];
  return binaryExts.some(ext => lower.endsWith(ext));
}

function isImageFile(path) {
  const lower = path.toLowerCase();
  return [".png",".jpg",".jpeg",".gif",".bmp",".webp",".svg"].some(ext => lower.endsWith(ext));
}

/* ---------------------------------------------------------
   SELECT FILE (PRISM ENABLED)
--------------------------------------------------------- */
async function selectFile(path) {
  activePath = path;

  // Reset iframe on every file select
  frameViewer.style.display = "none";
  frameViewer.src = "";

  const encodedRepo = encodeURIComponent(CONFIG.repo);
  const rawPathEncoded = path ? path.split("/").map(encodeURIComponent).join("/") : "";

  const pagesURL = path
    ? `${CONFIG.pages_base}/${encodedRepo}/${rawPathEncoded}`
    : `${CONFIG.pages_base}/${encodedRepo}/`;

  if (!path) {
    currentPathEl.innerHTML = `<a class="rru-link" href="${pagesURL}" target="_blank" rel="noopener noreferrer">/${CONFIG.repo}</a>`;
  } else {
    currentPathEl.innerHTML = `<a class="rru-link" href="${pagesURL}" target="_blank" rel="noopener noreferrer">/${path}</a>`;
  }

  document.querySelectorAll(".tree-node").forEach(el => el.classList.remove("active"));
  const activeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
  if (activeNode) activeNode.classList.add("active");

  const file = flatFiles.find(f => f.path === path && f.type === "file");
  if (!file) {
    fileTypeBadgeEl.textContent = "Directory";
    fileMetaEl.textContent = "";
    fileContentEl.style.display = "none";
    emptyStateEl.style.display = "flex";
    openFrameBtn.style.display = "none";
    setStatus("ready", "Directory selected");
    return;
  }

  const rawURL = `${CONFIG.raw_base}/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${rawPathEncoded}`;

  /* ---------------------------------------------------------
     FRAME-SAFE FILE TYPES
     These will open in the iframe when VIEW IN FRAME is clicked
  --------------------------------------------------------- */
  const frameSafe = [
    ".html",".htm",".txt",".md",".json",".xml",".svg",
    ".png",".jpg",".jpeg",".gif",".webp"
  ];

  const lower = path.toLowerCase();
  const isFrameSafe = frameSafe.some(ext => lower.endsWith(ext));

  // Show or hide the frame button
  openFrameBtn.style.display = isFrameSafe ? "inline-block" : "none";

  /* ---------------------------------------------------------
     IMAGE VIEWER (native)
  --------------------------------------------------------- */
  if (isImageFile(path)) {
    fileTypeBadgeEl.textContent = "Image";
    fileContentEl.innerHTML = `<img src="${rawURL}" style="max-width:100%;border-radius:6px;">`;
    fileContentEl.style.display = "block";
    emptyStateEl.style.display = "none";
    setStatus("ready", "Image loaded");
    return;
  }

  /* ---------------------------------------------------------
     BINARY FILES
  --------------------------------------------------------- */
  if (isBinaryFile(path)) {
    fileTypeBadgeEl.textContent = "Binary file";
    fileContentEl.style.display = "none";
    emptyStateEl.style.display = "flex";
    emptyStateEl.innerHTML = `
      <div>
        Cannot display raw binary.<br>
        <span style="font-size:11px;color:#ff4b6a;">Open via the RRU link or download.</span>
      </div>`;
    setStatus("ready", "Binary file");
    return;
  }

  /* ---------------------------------------------------------
     TEXT FILES (Prism)
  --------------------------------------------------------- */
  fileTypeBadgeEl.textContent = isTextFile(path) ? "Text file" : "Plain text (unsupported ext)";
  fileMetaEl.textContent = `${file.size || 0} bytes • sha ${file.sha.slice(0, 7)}`;

  setStatus("loading", "Fetching file content...");

  try {
    const res = await fetch(rawURL);
    if (!res.ok) throw new Error("Failed to fetch file");
    const rawCode = await res.text();
lastFetchedFileContent = rawCode;

    fileContentEl.innerHTML = renderPrismCode(rawCode, path);

    if (window.Prism) {
      Prism.highlightAllUnder(fileContentEl);
    }

    fileContentEl.style.display = "block";
    emptyStateEl.style.display = "none";
    setStatus("ready", "File loaded");
  } catch (err) {
    console.error(err);
    fileContentEl.style.display = "none";
    emptyStateEl.style.display = "flex";
    emptyStateEl.innerHTML = `<div>Failed to load file.<br/><span style="font-size:11px;color:#ff4b6a;">${err.message}</span></div>`;
    setStatus("error", "Failed to load file");
  }
}


/* ---------------------------------------------------------
   OPEN BUTTONS
--------------------------------------------------------- */
openGithubBtn.addEventListener("click", () => {
  if (!activePath) {
    window.open(`https://github.com/${CONFIG.owner}/${CONFIG.repo}`, "_blank");
    return;
  }
  window.open(
    `https://github.com/${CONFIG.owner}/${CONFIG.repo}/blob/${CONFIG.branch}/${activePath}`,
    "_blank"
  );
});

openRawBtn.addEventListener("click", () => {
  if (!activePath) return;
  const rawPath = activePath.split("/").map(encodeURIComponent).join("/");
  window.open(
    `${CONFIG.raw_base}/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${rawPath}`,
    "_blank"
  );
});

/* ---------------------------------------------------------
   SEARCH
--------------------------------------------------------- */
searchInput.addEventListener("input", () => {
  const filter = searchInput.value.trim();
  renderTree(treeData, fileTreeEl, filter);
});

/* ---------------------------------------------------------
   KEYBOARD SHORTCUTS
--------------------------------------------------------- */
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

/* ---------------------------------------------------------
   HYDRATE CONFIG
--------------------------------------------------------- */
// ---------------------------------------------------------
// HYDRATE CONFIG FROM JSON + APPLY ?index= OVERRIDE
// ---------------------------------------------------------
async function hydrateConfigFromRoot() {
  try {
    const res = await fetch("config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("CONFIG JSON missing or unreadable");

    const data = await res.json();

    CONFIG.owner = data.owner;
    CONFIG.branch = data.branch;
    CONFIG.api_base = data.api_base;
    CONFIG.raw_base = data.raw_base;
    CONFIG.pages_base = data.pages_base;

    CONFIG.repo = window.REPO_NAME ? window.REPO_NAME : data.repo;

    document.getElementById("repoNameHeader").textContent = CONFIG.repo;
    document.getElementById("legalRepoName").textContent = CONFIG.repo;
    document.title = `Mercwar Cyborg ${CONFIG.repo} Repo-Browser`;

    fetchRepoTree();

  } catch (err) {
    console.error("CONFIG HYDRATION ERROR:", err);
    setStatus("error", "Failed to load config.json");
  }
}

// ---------------------------------------------------------
// STARTUP
// ---------------------------------------------------------
injectPrismDependencies();
hydrateConfigFromRoot();

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
function isFragmentHTML(content) {
  const lower = content.toLowerCase();
  return !(
    lower.includes("<html") ||
    lower.includes("<body") ||
    lower.includes("<head") ||
    lower.includes("<?xml") ||
    lower.includes("<svg")
  );
}

