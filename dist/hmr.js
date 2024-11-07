// @ts-ignore
document.hmrModuleCache = new Map();
document.getModuleFromCache = async (path) => {
    try {
        if (document.hmrModuleCache.has(path)) {
            return document.hmrModuleCache.get(path);
        }
        else {
            const newModule = await import(path);
            if (newModule) {
                document.hmrModuleCache.set(path, newModule);
            }
            return newModule;
        }
    }
    catch (err) {
        console.log(err);
        throw new Error(`[S-server] Unable to fetch module at ${path}`);
    }
};
// Relative routes
document.addModuleToCache = async (path, t) => {
    try {
        const newModule = await import(`./${path}?t=${t}`);
        if (newModule) {
            document.hmrModuleCache.set(`./${path}`, newModule);
        }
        return newModule;
    }
    catch (err) {
        console.log(err);
        throw new Error(`[S-server] Unable to fetch module at ${path}`);
    }
};
document.addEventListener("error", (event) => {
    console.error(event);
    console.log("[S-server] Error occurred");
});
// Check if browser supports WebSockets
if (typeof window.WebSocket === "undefined") {
    alert("Your browser does not support WebSockets. Please use a modern browser.");
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
        case "js:update":
            alertListener(event);
        // case "reload":
        //   location.reload();
    }
}
function alertListener(event) {
    const fn = listenersMap.get(event.type);
    if (fn) {
        fn(event);
    }
}
function getAndUpdateStyle(event) {
    const el = Array.from(document.querySelectorAll("link")).find((e) => !oldLinkEls.has(e) && cleanUrl(e.href).includes(event.path));
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
    document.addModuleToCache(event.path, event.timestamp);
}
function handleWarnings(event) {
    console.warn(`[S-server] Error: can't properly monitor changes in  ${event.path}, changes in this file will cause full-reload`);
}
listenersMap.set("style:update", getAndUpdateStyle);
listenersMap.set("js:update", getAndUpdateScript);
listenersMap.set("warning", handleWarnings);
export {};
