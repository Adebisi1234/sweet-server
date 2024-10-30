import * as a from "./module1.js";
const moduleCache = {
    b: a,
    c: a.c,
};
console.log(moduleCache);
a;
