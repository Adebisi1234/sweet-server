document.addEventListener("error", (event) => {
  console.error(event);
  console.log("[S-server] Error occurred");
});

import main from "./hmr-context.js";
import type { hmrPayload } from "./types/payload.js";

declare global {
  interface Window {
    moduleSrcStore: string[];
  }
}

// Check if browser supports WebSockets
if (typeof window.WebSocket === "undefined") {
  alert(
    "Your browser does not support WebSockets. Please use a modern browser."
  );
  //Support other protocol maybe later
}

const ws = new WebSocket("ws://localhost:6001");

ws.addEventListener("message", async ({ data }) => {
  handleEvent(JSON.parse(data));
});
ws.addEventListener("open", async () => {
  console.log("Connected to s-server");
});
ws.addEventListener("error", async () => {
  console.log("[S-server] Error");
});
ws.addEventListener("close", async () => {
  console.log("Connection closed");
  // Handle reconnecting later
});
const oldLinkEls = new WeakSet();
const listenersMap = new Map<hmrPayload["type"], (event: hmrPayload) => any>();
const queued = [];

function cleanUrl(pathname: string): string {
  const url = new URL(pathname, location.origin);
  return url.pathname + url.search;
}

function handleEvent(event: hmrPayload) {
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
      alert("[S-server] Error occurred");
      console.error(event);
      break;
  }
}

function alertListener(event: hmrPayload) {
  const fn = listenersMap.get(event.type);
  if (fn) {
    fn(event);
  }
}
function getAndUpdateStyle(event: hmrPayload) {
  if (!event.path) return;
  const el = Array.from(document.querySelectorAll("link")).find(
    (e) =>
      event.path && !oldLinkEls.has(e) && cleanUrl(e.href).includes(event.path)
  );

  if (!el) {
    return;
  }
  //   Synchronous just for testing

  const newLinkTag = el.cloneNode() as HTMLLinkElement;
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

function getAndUpdateScript(event: hmrPayload) {
  if (!event.paths) return;
  const changes = event.paths;
  changes.forEach((path) => {
    if (!window.moduleSrcStore.includes(path)) window.moduleSrcStore.push(path);
  });

  setTimeout(async () => {
    await main(window.moduleSrcStore, changes);
    console.log(`reloaded ${event.path}`);
  }, 0);
}

function handleWarnings(event: hmrPayload) {
  console.warn(
    `[S-server] Error: can't properly monitor changes in the following paths ${JSON.stringify(
      event.paths
    )}, changes in this files will cause full-reload`
  );
}

listenersMap.set("style:update", getAndUpdateStyle);
listenersMap.set("js:update", getAndUpdateScript);
listenersMap.set("warning", handleWarnings);
