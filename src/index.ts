#! /usr/bin/env node

import express, { Request, Response } from "express";
import fsPromise from "fs/promises";
import fs from "fs";
import path from "path";
const app = express();
import { WebSocketServer } from "ws";
import Watcher from "watcher";
import { hmrPayload } from "./types/payload.js";
import compression from "compression";
import mime from "mime";
import babelParser from "@babel/parser";
import { analyzeMetafile, build } from "esbuild";
import { parse } from "node-html-parser";

const modulePaths = new Set<string>();

// Watching a single path
const watcher = new Watcher(process.cwd(), {
  ignoreInitial: true,
  ignore: (path: string) =>
    path.includes(".git") || path.includes("node_modules"),
});

app.use(compression());

// Custom files
app.get("/", addHmrModuleToDOM);

app.get("*.html", addHmrModuleToDOM);

app.get("/hmr.js", async (req, res) => {
  const filePath = new URL("./hmr.js", import.meta.url);

  let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
  const contentType = mime.lookup("js");
  res.setHeader("Content-type", contentType);
  return res.send(hmr) as unknown as void;
});
app.get("/hmr-context.js", async (req, res) => {
  const filePath = new URL("./hmr-context.js", import.meta.url);

  let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
  const contentType = mime.lookup("js");
  res.setHeader("Content-type", contentType);
  return res.send(hmr) as unknown as void;
});

app.get("*.js", customStaticServer);
async function addHmrModuleToDOM(req: express.Request, res: express.Response) {
  const sanitizePath = path.normalize(req.path);
  let filePath = path.join(process.cwd(), sanitizePath);
  if (!fs.existsSync(filePath)) {
    // if the file is not found, return 404

    res.status(404).send(`File ${filePath} not found!`);
    return;
  }

  // if is a directory, then look for index.html
  if (fs.statSync(filePath).isDirectory()) {
    filePath += "/index.html";
  }
  let contents = await fsPromise.readFile(filePath, { encoding: "utf8" });
  const root = parse(contents);
  const moduleSrcStore: string[] = [];
  root.querySelectorAll("script[type='module']").forEach((script) => {
    if (script.getAttribute("src")) {
      moduleSrcStore.push(script.getAttribute("src")!);
    }
    script.remove();
  });
  if (contents.includes("<head>")) {
    contents = root.toString().replace(
      "<head>",
      `<head>
      <!-- Injected by S-server -->
      <script src="/hmr.js" type='module'></script>
      <script>
        window.moduleSrcStore = ${JSON.stringify(moduleSrcStore)}
      </script>
      <script src="/hmr-context.js" type="module"></script>
      `
    );
  } else {
    // Accounting for html files with no head tag
    contents = contents.replace(
      "</body>",
      `<!-- Injected by S-server -->
      <script src="/hmr.js" type='module'></script>
      </body>`
    );
  }
  return res.send(contents) as unknown as void;
}
async function customStaticServer(req: Request, res: Response) {
  try {
    const sanitizePath = path.normalize(req.path);
    let pathname = path.join(process.cwd(), sanitizePath);
    if (!fs.existsSync(pathname)) {
      // if the file is not found, return 404

      res.status(404).send(`File ${pathname} not found!`);
      return;
    }
    if (req.query.t) {
      let data = await fsPromise.readFile(pathname, { encoding: "utf8" });
      const paths = await invalidatedModuleList(pathname);
      paths.forEach((path) => {
        data.replace(path, path + `?t=${req.query.t}`);
      });
      res.contentType(path.parse(pathname).ext);
      return res.send(data) as unknown as void;
    }

    return res.sendFile(pathname);
  } catch (err) {
    console.log(err);
    return res.status(404).json(`Error getting the file.`) as unknown as void;
  }
}

app.use(express.static(process.cwd()));
const port = process.env.PORT || 6001;

const server = app.listen(port, () => {
  console.log(`App started  on port ${port}...`);
  console.log(process.cwd());
});

// Websocket initialization
const wss = new WebSocketServer({ server });

wss.on("connection", function connection(ws) {
  modulePaths.forEach((path) => {
    wss.clients.forEach(function each(client) {
      client.send(
        JSON.stringify({
          event: "change",
          paths: [path],
          timestamp: new Date().getTime(),
          type: "js:init",
        } satisfies hmrPayload)
      );
    });
  });
  ws.on("error", console.error);

  ws.on("message", function message(data) {
    console.log("received: %s", data);
  });
});

// File watching & reloading
watcher.on("error", (error: any) => {
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
watcher.on("change", async (event) => {
  try {
    const split = event.split("/");
    const path: string = split[split.length - 1];
    console.log(`changes detected in ${path} reloading module`);
    if (path.endsWith(".css")) {
      wss.clients.forEach(function each(client) {
        client.send(
          JSON.stringify({
            event: "change",
            path,
            timestamp: new Date().getTime(),
            type: "style:update",
          } satisfies hmrPayload)
        ); // just use json no need to create my own binary protocol
      });
    } else if (path.endsWith(".js")) {
      console.log(path);
      const paths = await invalidatedModuleList(path);
      if (!paths || paths.length === 0) {
        wss.clients.forEach(function each(client) {
          client.send(
            JSON.stringify({
              event: "change",
              path,
              timestamp: new Date().getTime(),
              type: "reload",
            } satisfies hmrPayload)
          ); // just use json no need to create my own binary protocol);
        });
        return;
      }
      console.log("dependencies", paths);
      wss.clients.forEach(function each(client) {
        client.send(
          JSON.stringify({
            event: "change",
            path,
            paths,
            timestamp: new Date().getTime(),
            type: "js:update",
          } satisfies hmrPayload)
        ); // just use json no need to create my own binary protocol
      });
    } else {
      wss.clients.forEach(function each(client) {
        client.send(
          JSON.stringify({
            event: "change",
            path,
            timestamp: new Date().getTime(),
            type: "reload",
          } satisfies hmrPayload)
        ); // just use json no need to create my own binary protocol);
      });
    }
  } catch (err) {
    console.error(`Error occurred listening to change at ${event}`, err);
  }
});

watcher.on("add", (event) => {
  const split = event.split("/");
  const path: string = split[split.length - 1];
  if (path.endsWith(".js")) {
    modulePaths.add(path);
  }
});

async function analyzeInputs(pathname: string) {
  const result = await build({
    entryPoints: [pathname],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    logLevel: "silent",
    target: "esnext",
    format: "esm",
  });
  let deps: { [key: string]: string[] } = {};
  for (let [input, meta] of Object.entries(result.metafile!.inputs)) {
    for (let imp of meta.imports) {
      let key = imp.path;
      deps[key] = deps[key] || [];
      deps[key].push(input);
    }
  }

  return deps;
}

async function invalidatedModuleList(pathname: string) {
  const deps = await analyzeInputs(pathname);

  const paths: string[] = [];
  let q = [pathname];
  while (q.length > 0) {
    let current = q.pop();
    if (current) {
      current = current.startsWith("/") ? current : "/" + current;
      if (paths.includes(current)) continue;
      paths.push(current);
      let dependencies = deps[current] ?? [];

      q.push(...dependencies);
    }
  }

  return paths;
}
