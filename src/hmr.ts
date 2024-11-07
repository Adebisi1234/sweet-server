declare global {
  interface Document {
    hmrModuleCache: Map<string, any>;
    getModuleFromCache: (path: string, module: string) => any;
    addModuleToCache: (path: string, t: number) => any;
  }
}
// @ts-ignore

document.hmrModuleCache = new Map<string, any>();
document.getModuleFromCache = async (path: string) => {
  try {
    if (document.hmrModuleCache.has(path)) {
      return document.hmrModuleCache.get(path);
    } else {
      const newModule = await import(path);
      if (newModule) {
        document.hmrModuleCache.set(path, newModule);
      }
      return newModule;
    }
  } catch (err) {
    console.log(err);
    throw new Error(`[S-server] Unable to fetch module at ${path}`);
  }
};

// Relative routes
document.addModuleToCache = async (path: string, t: number) => {
  try {
    const newModule = await import(`./${path}?t=${t}`);
    if (newModule) {
      document.hmrModuleCache.set(`./${path}`, newModule);
    }
    return newModule;
  } catch (err) {
    console.log(err);
    throw new Error(`[S-server] Unable to fetch module at ${path}`);
  }
};

document.addEventListener("error", (event) => {
  console.error(event);
  console.log("[S-server] Error occurred");
});

import type { hmrPayload } from "./types/payload.js";

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
    case "js:update":
      alertListener(event);
    // case "reload":
    //   location.reload();
  }
}

function alertListener(event: hmrPayload) {
  const fn = listenersMap.get(event.type);
  if (fn) {
    fn(event);
  }
}
function getAndUpdateStyle(event: hmrPayload) {
  const el = Array.from(document.querySelectorAll("link")).find(
    (e) => !oldLinkEls.has(e) && cleanUrl(e.href).includes(event.path)
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
  document.addModuleToCache(event.path, event.timestamp);
}

function handleWarnings(event: hmrPayload) {
  console.warn(
    `[S-server] Error: can't properly monitor changes in  ${event.path}, changes in this file will cause full-reload`
  );
}

listenersMap.set("style:update", getAndUpdateStyle);
listenersMap.set("js:update", getAndUpdateScript);
listenersMap.set("warning", handleWarnings);
