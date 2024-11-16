import chalk from "chalk";
export async function httpServerStart(httpServer, port) {
    const initialPort = port;
    return new Promise((resolve, reject) => {
        const server = httpServer.listen(port, () => {
            console.log(chalk.greenBright(`App started on port`, `${chalk.bold(`${port}`)}...`));
            resolve(server);
        });
        const onError = (e) => {
            if (e.code === "EADDRINUSE") {
                console.info(chalk.yellow(`Port ${chalk.bold(`${port}`)} is in use, trying another one...`));
                if (port - initialPort >= 30) {
                    console.error("port difference exceeded 30 please restart hmrServer with an open port");
                    process.exitCode = 1;
                }
                server.listen(++port);
            }
            else {
                reject(e);
            }
        };
        server.on("error", onError);
    });
}
