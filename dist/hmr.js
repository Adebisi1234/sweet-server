document.addEventListener("error", (event) => {
  console.error(event);
  console.log("[hmrServer] Error occurred");
});
import main from "./hmr-context.js";
// Check if browser supports WebSockets
if (typeof window.WebSocket === "undefined") {
  alert(
    "Your browser does not support WebSockets. Please use a modern browser."
  );
  //Support other protocol maybe later
}
const ws = new WebSocket(`ws://localhost:${window.__sserverPort}`);
ws.addEventListener("message", async ({ data }) => {
  handleEvent(JSON.parse(data));
});
ws.addEventListener("open", async () => {
  console.log("Connected to hmrServer");
});
ws.addEventListener("error", async () => {
  console.log("[hmrServer] Error");
});
ws.addEventListener("close", async () => {
  console.log("Connection closed");
  // Handle reconnecting later
});
const oldLinkEls = new WeakSet();
const listenersMap = new Map();
const queued = [];
function cleanUrl(pathname) {
  const url = new URL(pathname, location.origin);
  return url.pathname + url.search;
}
function handleEvent(event) {
  switch (event.type) {
    case "style:update":
      alertListener(event);
      break;
    case "js:update":
      alertListener(event);
      break;
    case "reload":
      location.reload();
      break;
    case "warning":
      alertListener(event);
      break;
    // case "js:init":
    //   alertListener(event);
    //   break;
    case "error":
      alert("[hmrServer] Error occurred");
      console.error(event);
      break;
  }
}
function alertListener(event) {
  const fn = listenersMap.get(event.type);
  if (fn) {
    fn(event);
  }
}
function getAndUpdateStyle(event) {
  if (!event.path) return;
  const el = Array.from(document.querySelectorAll("link")).find(
    (e) =>
      event.path && !oldLinkEls.has(e) && cleanUrl(e.href).includes(event.path)
  );
  if (!el) {
    return;
  }
  //   Synchronous just for testing
  const newLinkTag = el.cloneNode();
  newLinkTag.href = new URL(event.path, el.href).href;
  const removeOldEl = () => {
    el.remove();
    console.debug("css hot updated");
  };
  console.log("updating css");
  newLinkTag.addEventListener("load", removeOldEl);
  newLinkTag.addEventListener("error", removeOldEl);
  oldLinkEls.add(el);
  el.after(newLinkTag);
}
function getAndUpdateScript(event) {
  if (!event.paths) return;
  const changes = event.paths;
  changes.forEach((path) => {
    if (!window.moduleSrcStore.includes(path)) window.moduleSrcStore.push(path);
  });
  setTimeout(async () => {
    changes.forEach(async (change) => {
      const module = change.replace("/", "").replace(".js", "");
      const cleanup = `__sserver_cleanup_${module}`;
      typeof window[cleanup] !== "undefined" && (await window[cleanup]());
    });
    await main(window.moduleSrcStore, changes);
    console.log(`reloaded ${event.path}`);
  }, 0);
}
function handleWarnings(event) {
  console.warn(
    `[hmrServer] Error: can't properly monitor changes in the following paths ${JSON.stringify(
      event.paths
    )}, changes in this files will cause full-reload`
  );
}
listenersMap.set("style:update", getAndUpdateStyle);
listenersMap.set("js:update", getAndUpdateScript);
listenersMap.set("warning", handleWarnings);
