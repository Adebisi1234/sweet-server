export default async function main(moduleSrcStore, changes) {
    const absolutePath = location.pathname.split("/").slice(0, -1).join("/") + "/"; //For request from relative path that are not the root path
    Promise.all(window.moduleSrcStore.map((src) => import(changes?.includes(src)
        ? src.includes(absolutePath)
            ? src + `?t=${Date.now()}`
            : absolutePath + src + `?t=${Date.now()}`
        : src.includes(absolutePath)
            ? src
            : absolutePath + src)))
        .then(() => {
        dispatchEvent(new Event("load"));
    })
        .catch((reason) => console.error(`[sserver] error reloading modules, reason: ${reason}`));
    console.log("reload complete");
}
window.addEventListener("DOMContentLoaded", async () => {
    await main(window.moduleSrcStore);
});
