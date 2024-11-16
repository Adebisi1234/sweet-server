#! /usr/bin/env node
import express from "express";
import fsPromise from "fs/promises";
import fs from "fs";
import path from "path";
const app = express();
import { WebSockehmrServer } from "ws";
import Watcher from "watcher";
import compression from "compression";
import mime from "mime";
import { build } from "esbuild";
import { parse } from "node-html-parser";
import { program } from "commander";
import chalk from "chalk";
import Conf from "conf";
import { httpServerStart } from "./utils.js";
const config = new Conf({ projectName: "hmrServer" });
// config.set('unicorn', '🦄');
// console.log(config.get('unicorn'));
// //=> '🦄'
// // Use dot-notation to access nested properties
// config.set('foo.bar', true);
// console.log(config.get('foo'));
// //=> {bar: true}
// config.delete('unicorn');
// console.log(config.get('unicorn'));
// //=> undefined
program
  .name("hmrServer")
  .description(
    "A simple static web server. Supports HMR, Made to be used mostly locally"
  )
  .version("1.0.0");
program
  .option("-p --port [6001]", "Specify which port hmrServer should run on")
  .option(
    "-m, --mode [hmr | no-hmr]",
    "Specify server mode hmr | no-hmr",
    "hmr"
  )
  .option("-g --global", "Set all env passed as global");
program.parse();
const options = program.opts();
// Set global options
if (options.global) {
  for (const option in options) {
    if (Object.prototype.hasOwnProperty.call(options, option)) {
      if (option !== "global" && typeof options[option] !== "boolean") {
        config.set(option, options[option]);
      }
    }
  }
}
const port = Number(
  options.port && typeof options.port !== "boolean"
    ? options.port
    : config.get("port") ?? 6001
);
const mode =
  options.mode && typeof options.mode !== "boolean"
    ? options.mode
    : config.get("mode") ?? "hmr";
// Watching the current working directory
const watcher = new Watcher(process.cwd(), {
  ignoreInitial: true,
  ignore: (path) => path.includes(".git") || path.includes("node_modules"),
});
// Gzip
app.use(compression());
// Custom files
app.get("/", addHmrModuleToDOM);
app.get("*.html", addHmrModuleToDOM);
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
// HMR support
app.get("*.js", customStaticServer);
async function addHmrModuleToDOM(req, res) {
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
  const moduleSrcStore = [];
  root.querySelectorAll("script[type='module']").forEach((script) => {
    if (script.getAttribute("src")) {
      moduleSrcStore.push(script.getAttribute("src"));
    }
    script.remove();
  });
  if (contents.includes("<head>")) {
    contents = root.toString().replace(
      "<head>",
      `<head>
      <!-- Injected by hmrServer -->
      <script>
        window.__hmrServerPort = ${port}
        window.moduleSrcStore = ${JSON.stringify(moduleSrcStore)}
      </script>
      <script src="/hmr.js" type='module'></script>
      <script src="/hmr-context.js" type="module"></script>
      `
    );
  } else {
    // Accounting for html files with no head tag
    contents = contents.replace(
      "</body>",
      `<!-- Injected by hmrServer -->
      <script src="/hmr.js" type='module'></script>
      </body>`
    );
  }
  return res.send(contents);
}
async function customStaticServer(req, res) {
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
      return res.send(data);
    }
    return res.sendFile(pathname);
  } catch (err) {
    console.log(err);
    return res.status(404).json(`Error getting the file.`);
  }
}
// Static web server for other resources
app.use(express.static(process.cwd()));
const server = await httpServerStart(app, port);
// process.on("uncaughtException", (error: any, origin) => {
//   console.log(error);
//   if (error.code) {
//     server.listen(Number(options.port) + 1);
//   }
// });
// Websocket initialization
const wss = new WebSockehmrServer({ server });
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
watcher.on("change", async (event) => {
  try {
    if (mode === "hmr") {
      const split = event.split("/");
      const path = split[split.length - 1];
      console.log(
        chalk.yellow(
          `changes detected in `,
          `${chalk.bold(path)} reloading module`
        )
      );
      if (path.endsWith(".css")) {
        wss.clients.forEach(function each(client) {
          client.send(
            JSON.stringify({
              event: "change",
              path,
              timestamp: new Date().getTime(),
              type: "style:update",
            })
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
              })
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
            })
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
            })
          ); // just use json no need to create my own binary protocol);
        });
      }
    } else {
      console.log(chalk.yellow(`changes detected reloading app`));
      wss.clients.forEach(function each(client) {
        client.send(
          JSON.stringify({
            event: "change",
            timestamp: new Date().getTime(),
            type: "reload",
          })
        ); // just use json no need to create my own binary protocol);
      });
    }
  } catch (err) {
    console.error(`Error occurred listening to change at ${event}`, err);
  }
});
// Get dependency list for updated
async function analyzeInputs(pathname) {
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
  let deps = {};
  for (let [input, meta] of Object.entries(result.metafile.inputs)) {
    for (let imp of meta.imports) {
      let key = imp.path;
      deps[key] = deps[key] || [];
      deps[key].push(input);
    }
  }
  return deps;
}
async function invalidatedModuleList(pathname) {
  const deps = await analyzeInputs(pathname);
  const paths = [];
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
