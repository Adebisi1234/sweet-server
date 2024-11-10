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
const modulePaths = new Set<string>();

// Watching a single path
const watcher = new Watcher(process.cwd(), {
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
  if (contents.includes("<head>")) {
    contents = contents.replace(
      "<head>",
      `<head>
      <!-- Injected by S-server -->
      <script src="/hmr.js" type='module'></script>
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
      data = data.replace(`${req.path}`, `${req.path}?t=${req.query.t}`);
      res.contentType(path.parse(pathname).ext);
      return res.send(data) as unknown as void;
      // return res.sendFile(pathname);
    }
    // read file from file system
    let data = await fsPromise.readFile(pathname, { encoding: "utf8" });
    if (path.parse(pathname).ext.replace(".", "") === "js") {
      try {
        if (!fs.existsSync(pathname + "babel.json")) {
          await fsPromise.writeFile(
            pathname + "babel.json",
            JSON.stringify(
              babelParser.parse(data, {
                sourceType: "unambiguous",
              })
            ),
            {
              encoding: "utf8",
            }
          );
        }
        data = parseJSAndReplaceImport(data);
      } catch (error: any) {
        console.log(error.message);
        console.log(
          `Error can't properly monitor changes in  ${req.path}, changes in this file will cause full-reload`
        );
        wss.clients.forEach((client) => {
          client.send(
            JSON.stringify({
              event: "change",
              path: req.path,
              timestamp: Date.now(),
              type: "error",
            } satisfies hmrPayload)
          );
        });
      }
    }
    // based on the URL path, extract the file extension. e.g. .js, .doc, ...
    res.contentType(path.parse(pathname).ext);
    return res.send(data) as unknown as void;
  } catch (err) {
    console.log(err);
    return res.status(404).json(`Error getting the file.`) as unknown as void;
  }
}

function parseJSAndReplaceImport(data: string) {
  const program = babelParser.parse(data, {
    sourceType: "unambiguous",
  });

  let hmrSupportData = data;

  for (const statement of program.program.body) {
    if (statement.type === "ImportDeclaration") {
      const values: {
        name: string;
        type:
          | "ImportDefaultSpecifier"
          | "ImportNamespaceSpecifier"
          | "ImportSpecifier";
      }[] = [];
      const modules: string[] = [];
      const imports = statement.specifiers.map((value, i) => {
        values.push({ name: value.local.name, type: value.type });
        modules.push(`module${crypto.randomUUID().split("-")[0]}`);
        if (value.type === "ImportDefaultSpecifier") {
          return `${getModuleStore(statement.source.value)}`;
        } else if (value.type === "ImportNamespaceSpecifier") {
          return `${getModuleStore(statement.source.value)}`;
        } else if (value.type === "ImportSpecifier") {
          return `${getModuleStore(statement.source.value)}`;
        }
        return "";
      });
      const importString =
        `const [${modules.join(", ")}] = await Promise.all([${imports.join(
          ","
        )}])` + "\n";
      const modulesLines = modules.map((module, i) => {
        return `const ${values[i].name} = ${module}${
          values[i].type === "ImportDefaultSpecifier"
            ? ".default"
            : values[i].type === "ImportSpecifier"
            ? `['${values[i].name}']`
            : ""
        };`;
      });
      const moduleString = modulesLines.join("\n");
      const replaceString = importString + moduleString;
      // hmrSupportData =
      //   hmrSupportData.slice(0, statement.start) +
      //   importString +
      //   hmrSupportData.slice(statement.end);
      hmrSupportData = hmrSupportData.replace(
        data
          .slice(statement.start ?? 0, statement.end ?? undefined)
          .replace(/\n/g, ""),
        replaceString
      );
    }
  }
  return hmrSupportData;
}

function getModuleStore(path: any) {
  return `document.getModuleFromCache("${path}")`;
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
          path,
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
watcher.on("change", (event) => {
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
    wss.clients.forEach(function each(client) {
      client.send(
        JSON.stringify({
          event: "change",
          path,
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
});

watcher.on("add", (event) => {
  const split = event.split("/");
  const path: string = split[split.length - 1];
  if (path.endsWith(".js")) {
    modulePaths.add(path);
  }
});
