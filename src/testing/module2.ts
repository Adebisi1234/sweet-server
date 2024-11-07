import * as a from "./module1.js";

setInterval(async () => {
  console.log(a.c());
}, 500);
