#! /usr/bin/env node

import express, { Request, Response } from "express";
import fsPromise from "fs/promises";
import fs from "fs";
import path from "path";
const app = express();
import { WebSocketServer } from "ws";
import chokidar from "chokidar";
import { hmrPayload } from "./types/payload.js";
import compression from "compression";
import mime from "mime";
import { build } from "esbuild";
import { parse } from "node-html-parser";
import { program } from "commander";
import chalk from "chalk";
import Conf from "conf";
import { httpServerStart } from "./utils.js";
import { spawn } from "child_process";

const config = new Conf({ projectName: "sserver" });

program
  .name("sserver")
  .description(
    "A simple static web server. Supports HMR, Made to be used mostly locally"
  )
  .version("1.0.0");

program
  .option("-p --port [6001]", "Specify which port sserver should run on")
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
const watcher = chokidar.watch(process.cwd(), {
  ignored: (path: string) =>
    path.includes(".git") || path.includes("node_modules"), // only watch js files
  persistent: true,
  ignoreInitial: true,
});

// Gzip
app.use(compression());

// Custom files
app.get("/", addHmrModuleToDOM);

app.get("*.html", addHmrModuleToDOM);

app.get("/hmr.js", async (req, res) => {
  try {
    const filePath = new URL("./hmr.js", import.meta.url);

    let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
    const contentType = mime.lookup("js");
    res.setHeader("Content-type", contentType);
    return res.send(hmr) as unknown as void;
  } catch (err) {
    return res.send("Error occurred") as unknown as void;
  }
});
app.get("/default.css", async (req, res) => {
  try {
    const filePath = new URL("./default.css", import.meta.url);

    let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
    const contentType = mime.lookup("css");
    res.setHeader("Content-type", contentType);
    return res.send(hmr) as unknown as void;
  } catch (err) {
    return res.send("Error occurred") as unknown as void;
  }
});
app.get("/hmr-context.js", async (req, res) => {
  try {
    const filePath = new URL("./hmr-context.js", import.meta.url);

    let hmr = await fsPromise.readFile(filePath, { encoding: "utf8" });
    const contentType = mime.lookup("js");
    res.setHeader("Content-type", contentType);
    return res.send(hmr) as unknown as void;
  } catch (err) {
    console.log(err);
    return res.status(404).json(`Error getting the file.`) as unknown as void;
  }
});

// HMR support
app.get(["*.js"], customStaticServer);
async function addHmrModuleToDOM(req: express.Request, res: express.Response) {
  try {
    const sanitizePath = path.normalize(req.path);
    let filePath = path.join(process.cwd(), sanitizePath);
    if (!fs.existsSync(filePath)) {
      // if the file is not found, return 404

      res.status(404).send(`File ${filePath} not found!`);
      return;
    }

    // if is a directory, then look for index.html
    if (fs.statSync(filePath).isDirectory()) {
      const fileList = fs.readdirSync(filePath, { withFileTypes: true });
      if (fileList.find((x) => x.name.includes("index.html"))) {
        filePath += "/index.html";
      } else {
        // Generate a dropdown to select appropriate file
        return res.send(generateCustomIndexHtml(fileList)) as unknown as void;
      }
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
      <!-- Injected by sserver -->
      <script>
        window.__sserverPort = ${port}
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
        `<!-- Injected by sserver -->
      <script>
        window.__sserverPort = ${port}
        window.moduleSrcStore = ${JSON.stringify(moduleSrcStore)}
      </script>
      <script src="/hmr.js" type='module'></script>
      <script src="/hmr-context.js" type="module"></script>      
      </body>`
      );
    }
    return res.send(contents) as unknown as void;
  } catch (err) {
    console.log(err);
    return res.status(404).json(`Error getting the file.`) as unknown as void;
  }
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
// Static web server for other resources
app.use(express.static(process.cwd()));

const server = await httpServerStart(app, port);

// Websocket initialization
const wss = new WebSocketServer({ server });

wss.on("connection", function connection(ws) {
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

watcher.on("change", async (event) => {
  try {
    const pathname: string = path.relative(process.cwd(), event);
    if (pathname.endsWith(".ts")) {
      console.log("Compiling changed ts file(s)");
      const child = spawn("npx tsc", {
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", (_, sig) => {
        console.log("compilation done");
        child.kill(sig ?? "SIGQUIT");
      });
    }
    if (mode === "hmr") {
      if (pathname.endsWith(".css")) {
        console.log(
          chalk.yellow(
            `changes detected in `,
            `${chalk.bold(pathname)} reloading styles`
          )
        );
        wss.clients.forEach(function each(client) {
          client.send(
            JSON.stringify({
              event: "change",
              path: pathname,
              timestamp: new Date().getTime(),
              type: "style:update",
            } satisfies hmrPayload)
          ); // just use json no need to create my own binary protocol
        });
      } else if (pathname.endsWith(".js")) {
        console.log(
          chalk.yellow(
            `changes detected in `,
            `${chalk.bold(pathname)} reloading module`
          )
        );
        const paths = await invalidatedModuleList(pathname);
        if (!paths || paths.length === 0) {
          wss.clients.forEach(function each(client) {
            client.send(
              JSON.stringify({
                event: "change",
                path: pathname,
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
              path: pathname,
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
              path: pathname,
              timestamp: new Date().getTime(),
              type: "reload",
            } satisfies hmrPayload)
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
          } satisfies hmrPayload)
        ); // just use json no need to create my own binary protocol);
      });
    }
  } catch (err) {
    console.error(`Error occurred listening to change at ${event}`, err);
  }
});

// Get dependency list for updated
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

function generateCustomIndexHtml(fileList: fs.Dirent[]) {
  fileList = fileList.filter(
    (fileOrDir) =>
      !(
        fileOrDir.name.includes("node_modules") ||
        fileOrDir.name.includes(".git")
      )
  );
  return `<head>
    <link rel="stylesheet" href="/default.css" />
    <script>
      window.__sserver_default_filelist_toggle = (id) => {
          const folder = document.querySelector(id)
          if(folder.classList.contains("open")) {
            folder.classList.replace("open", "closed")
          }else {
            folder.classList.replace("closed", "open")
          }
      }
    </script>
  </head><body class="sserver"><ul>
  ${fileList
    .map((fileOrDir) => {
      return `<li>
    ${recursiveHtmlList(fileOrDir)}
    </li>`;
    })
    .join("\n")} </ul> </body>`;
}

function recursiveHtmlList(fileOrDir: fs.Dirent, id?: string): string {
  if (!fileOrDir.isDirectory()) {
    return `<a href="./${path.relative(
      process.cwd(),
      path.join(fileOrDir.parentPath, fileOrDir.name)
    )}">
    ${
      fileOrDir.name.includes(".html")
        ? `<svg  viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M137.6 512l204.8-204.8c12.8-12.8 12.8-32 0-44.8-12.8-12.8-32-12.8-44.8 0L70.4 489.6c-6.4 6.4-9.6 12.8-9.6 22.4 0 9.6 3.2 16 9.6 22.4l227.2 227.2c12.8 12.8 32 12.8 44.8 0 12.8-12.8 12.8-32 0-44.8L137.6 512z m464-339.2c-16-3.2-35.2 6.4-38.4 22.4L396.8 812.8c-3.2 16 6.4 35.2 22.4 38.4 16 3.2 35.2-6.4 38.4-22.4L624 211.2c6.4-16-3.2-35.2-22.4-38.4z m352 316.8L726.4 262.4c-12.8-12.8-32-12.8-44.8 0-12.8 12.8-12.8 32 0 44.8L886.4 512 681.6 716.8c-12.8 12.8-12.8 32 0 44.8 12.8 12.8 32 12.8 44.8 0l227.2-227.2c6.4-6.4 9.6-16 9.6-22.4 0-9.6-3.2-16-9.6-22.4z" fill="#333333" /></svg>`
        : fileOrDir.name.includes(".css")
        ? `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M88.064 27.648l77.824 871.424L512 996.352l346.112-97.28 77.824-871.424z" fill="#2196F3" /><path d="M771.072 312.32l-10.24 109.568-29.696 328.704L512 811.008l-220.16-60.416-14.336-172.032h107.52l7.168 89.088L512 700.416l119.808-32.768 16.384-148.48-375.808 1.024-11.264-101.376 395.264-4.096 8.192-108.544-413.696 1.024-7.168-101.376h536.576z" fill="#FAFAFA" /></svg>`
        : fileOrDir.name.includes(".js")
        ? `<svg  viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M63.5 63.5h897v897h-897v-897zM887 746.6c-6.5-40.9-33.2-75.3-112.2-107.4-27.5-12.9-58.1-21.9-67.2-42.6-3.4-12.3-3.9-19.1-1.7-26.4 5.6-24.1 34.2-31.4 56.6-24.7 14.6 4.5 28 15.7 36.5 33.6 38.6-25.3 38.6-25.3 65.6-42-10.1-15.7-15.1-22.5-21.9-29.2-23.5-26.3-54.9-39.8-105.9-38.6l-26.4 3.3c-25.3 6.2-49.3 19.6-63.9 37.6-42.6 48.3-30.3 132.3 21.3 167.1 51 38.1 125.6 46.5 135.2 82.4 9 43.7-32.5 57.7-73.5 52.7-30.3-6.7-47.1-21.9-65.6-49.9l-68.4 39.3c7.8 17.9 16.8 25.8 30.3 41.4 65 65.6 227.6 62.3 256.8-37.5 1.1-3.4 9-26.4 2.8-61.7l1.6 2.6zM551.3 475.8h-84c0 72.4-0.3 144.4-0.3 217 0 46 2.4 88.3-5.2 101.3-12.3 25.8-44.1 22.5-58.5 17.9-14.8-7.3-22.3-17.4-31-32-2.4-3.9-4.1-7.3-4.7-7.3l-68.2 42c11.4 23.5 28 43.8 49.5 56.7 32 19.1 74.9 25.2 119.9 15.1 29.3-8.4 54.5-25.8 67.7-52.7 19.1-34.8 15-77.4 14.8-125.1 0.4-76.8 0-153.6 0-230.9v-2z" fill="#F5DD1E" /></svg>`
        : `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M800 340.8l-144-144H224V832h576V340.8zM256 800V228.8h376v136H768V800H256z m392-566.4l115.2 115.2h-115.2v-115.2z" fill="#707070" /></svg>`
    }
    ${fileOrDir.name}
    
    </a>`;
  } else {
    const id = path
      .relative(process.cwd(), path.join(fileOrDir.parentPath, fileOrDir.name))
      .replace(/\W/g, "");
    return `<li class="open" id="${id}"><p onclick="__sserver_default_filelist_toggle('#${id}')">
    
    <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M860.992 884.352H162.88A163.136 163.136 0 0 1 0 721.408v-581.76h860.992A163.2 163.2 0 0 1 1024 302.592v418.88a163.2 163.2 0 0 1-163.008 162.88zM46.528 186.176v535.232a116.48 116.48 0 0 0 116.352 116.352h698.112a116.416 116.416 0 0 0 116.352-116.352V302.592a116.416 116.416 0 0 0-116.352-116.352H46.528z" fill="#4D4D4D" /><path d="M535.232 186.176H0v-23.232A163.136 163.136 0 0 1 162.88 0h279.296c51.328 0 93.056 41.728 93.056 93.12v93.056zM48.896 139.648h439.872v-46.528a46.72 46.72 0 0 0-46.592-46.592H162.88A116.672 116.672 0 0 0 48.896 139.648z" fill="#4D4D4D" /></svg>

    <span>${fileOrDir.name}<span></p><ul><li>${fs
      .readdirSync(path.join(fileOrDir.parentPath, fileOrDir.name), {
        withFileTypes: true,
      })
      .map((x: fs.Dirent) => {
        return `<li>${recursiveHtmlList(x)}</li>`;
      })
      .join("\n")}</li></ul></li>`;
  }
}
