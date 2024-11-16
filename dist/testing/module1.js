const counter = document.getElementById("counter");
setInterval(() => {
    if (!counter)
        return;
    counter.textContent = `${parseInt(counter.textContent ?? "0") + 1}`;
}, 1000);
export {};
