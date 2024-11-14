export default async function main(moduleSrcStore, changes) {
    Promise.all(window.moduleSrcStore.map((src) => import(changes?.includes(src) ? src + `?t=${Date.now()}` : src)))
        .then(() => {
        dispatchEvent(new Event("load"));
    })
        .catch((reason) => console.error(`[S-server] error reloading modules, reason: ${reason}`));
    console.log("reload complete");
}
window.addEventListener("DOMContentLoaded", async () => {
    await main(window.moduleSrcStore);
});
