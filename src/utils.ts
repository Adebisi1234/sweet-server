import { Express } from "express";
import chalk from "chalk";
export async function httpServerStart(
  httpServer: Express,
  port: number
): Promise<any> {
  const initialPort = port;
  return new Promise((resolve, reject) => {
    const server = httpServer.listen(port, () => {
      console.log(
        chalk.greenBright(`App started on port`, `${chalk.bold(`${port}`)}...`)
      );
      resolve(server);
    });

    const onError = (e: Error & { code?: string }) => {
      if (e.code === "EADDRINUSE") {
        console.info(
          chalk.yellow(
            `Port ${chalk.bold(`${port}`)} is in use, trying another one...`
          )
        );
        if (port - initialPort >= 30) {
          console.error(
            "port difference exceeded 30 please restart sserver with an open port"
          );
          process.exitCode = 1;
        }
        server.listen(++port);
      } else {
        reject(e);
      }
    };
    server.on("error", onError);
  });
}
export async function hostedHttpServerStart(
  httpServer: Express,
  localIp: string,
  port: number
): Promise<any> {
  const initialPort = ++port;
  return new Promise((resolve, reject) => {
    const server = httpServer.listen(port, localIp, () => {
      console.log(
        chalk.greenBright(`Network:`, `${chalk.bold(`${localIp}:${port}`)}...`)
      );
      resolve(server);
    });

    const onError = (e: Error & { code?: string }) => {
      if (e.code === "EADDRINUSE") {
        console.info(
          chalk.yellow(
            `Port ${chalk.bold(`${port}`)} is in use, trying another one...`
          )
        );
        if (port - initialPort >= 30) {
          console.error(
            "port difference exceeded 30 please restart sserver with an open port"
          );
          process.exitCode = 1;
        }
        server.listen(++port, localIp);
      } else {
        reject(e);
      }
    };
    server.on("error", onError);
  });
}
