#! /usr/bin/env node
import express from "express";
import fsPromise from "fs/promises";
import fs from "fs";
import path from "path";
const app = express();
import { WebSocketServer } from "ws";
import Watcher from "watcher";
import compression from "compression";
import mime from "mime";
import extractAndReplaceImports from "./hmr-context.js";
// Watching a single path
const watcher = new Watcher(process.cwd(), {
    ignore: (path) => path.includes(".git") || path.includes("node_modules"),
    ignoreInitial: true,
});
app.use(compression());
// Custom files
app.get("/", async (req, res) => {
    const filePath = path.join(process.cwd(), "index.html");
    let contents = await fsPromise.readFile(filePath, { encoding: "utf8" });
    if (contents.includes("</head>")) {
        contents = contents.replace("</head>", `<!-- Injected by S-server -->
      <script src="/hmr.js" type='module'></script>
      </head>`);
    }
    else {
        // Accounting for html files with no head tag
        contents = contents.replace("</body>", `<!-- Injected by S-server -->
      <script src="/hmr.js" type='module'></script>
      </body>`);
    }
    return res.send(contents);
});
app.get("/hmr.js", async (req, res) => {
    const filePath = new URL("./hmr.js", import.meta.url);
    let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
    const contentType = mime.lookup("js");
    res.setHeader("Content-type", contentType);
    return res.send(hmr);
});
app.get("/hmr-context.js", async (req, res) => {
    const filePath = new URL("./hmr-context.js", import.meta.url);
    let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
    const contentType = mime.lookup("js");
    res.setHeader("Content-type", contentType);
    return res.send(hmr);
});
// app.use(express.static(process.cwd(), { cacheControl: false, etag: false }));
app.get("*", customStaticServer);
async function customStaticServer(req, res) {
    try {
        const sanitizePath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, "");
        let pathname = path.join(process.cwd(), sanitizePath);
        console.log({ pathname });
        if (!fs.existsSync(pathname)) {
            // if the file is not found, return 404
            res.statusCode = 404;
            res.send(`File ${pathname} not found!`);
        }
        // if is a directory, then look for index.html
        if (fs.statSync(pathname).isDirectory()) {
            pathname += "/index.html";
        }
        const contentType = mime.lookup(path.parse(pathname).ext.replace(".", ""));
        // read file from file system
        const data = await fsPromise.readFile(pathname, { encoding: "utf8" });
        // based on the URL path, extract the file extention. e.g. .js, .doc, ...
        // if the file is found, set Content-type and send data
        res.setHeader("Content-type", contentType || "text/plain");
        return res.send(extractAndReplaceImports(data));
    }
    catch (err) {
        return res
            .status(500)
            .send(`Error getting the file: ${err}.`);
    }
}
const port = process.env.PORT || 6001;
const server = app.listen(port, () => {
    console.log(`App started  on port ${port}...`);
    console.log(process.cwd());
});
// Websocket initialization
const wss = new WebSocketServer({ server });
wss.on("connection", function connection(ws) {
    ws.on("error", console.error);
    ws.on("message", function message(data) {
        console.log("received: %s", data);
    });
});
// File watching & reloading
watcher.on("error", (error) => {
    console.log("Error watching file change");
    console.dir(error, { depth: Infinity }); // => true, "Error" instances are always provided on "error"
});
watcher.on("ready", () => {
    // The app just finished instantiation and may soon emit some events
    console.log("Watching file changes");
});
watcher.on("close", () => {
    // The app just stopped watching and will not emit any further events
    console.log("file watcher closed");
});
watcher.on("change", (event) => {
    const split = event.split("/");
    const path = split[split.length - 1];
    console.log(`changes detected in ${path} reloading module`);
    if (path.endsWith(".css")) {
        wss.clients.forEach(function each(client) {
            client.send(JSON.stringify({
                event: "change",
                path,
                timestamp: new Date().getTime(),
                type: "style:update",
            })); // just use json no need to create my own binary protocol
        });
    }
    else if (path.endsWith(".js")) {
        wss.clients.forEach(function each(client) {
            client.send(JSON.stringify({
                event: "change",
                path,
                timestamp: new Date().getTime(),
                type: "js:update",
            })); // just use json no need to create my own binary protocol
        });
    }
    else {
        wss.clients.forEach(function each(client) {
            client.send(JSON.stringify({
                event: "change",
                path,
                timestamp: new Date().getTime(),
                type: "reload",
            })); // just use json no need to create my own binary protocol);
        });
    }
});
