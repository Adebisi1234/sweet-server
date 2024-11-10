// export default function extractAndReplaceImports(code: string) {
//   const regex =
//     /^import\s+(?:(\*\s+as\s+(\w+))|(?:{([^}]+)}|(\w+))?)\s*from\s*['"]([^'"]+)['"]([;\s])?\s*$/gm;
export {};
//   // let matches;
//   const changeImports = [];
//   let matches: any[] | null;
//   let lines = code.split("\n"); // Split the code into lines
//   console.log(lines, "initial");
//   // Loop through each line of the code
//   // TODO: make this async
//   while ((matches = regex.exec(code)) !== null) {
//     const modulePath = matches[5]; // Captures the module path
//     // Check for namespace import
//     if (matches[2]) {
//       // console.log("Namespace Import:", matches[2]); // Logs the namespace import name
//       const importLine = RegExp(
//         String.raw`import\s+\*\s+as\s+${matches[2]}\s+from\s+['"]${modulePath}['"]`
//       );
//       const matchRegex = new RegExp(
//         String.raw`(?<!\bconst\s+\w+\s*=\s*${matches[2]}\b)(?<!\blet\s+\w+\s*=\s*${matches[2]}\b)(?<!\bvar\s+\w+\s*=\s*${matches[2]}\b)\b${matches[2]}\b`
//       );
//       lines = lines.filter((line) => !line.match(importLine));
//       lines = lines.map((line) => {
//         return line.replace(matchRegex, (match) => {
//           console.log(match);
//           return `(await document.getModuleFromCache("${modulePath}"))`;
//         });
//       });
//     }
//     // Check for named imports
//     if (matches[3]) {
//       const namedImports: string[] = matches[3]
//         .split(",")
//         .map((name: string) => name.trim());
//       // console.log("Named Imports:", namedImports); // Logs named imports as an array
//       const importLine = RegExp(
//         String.raw`^import\s+\{(\s+)?${namedImports.join(
//           ", "
//         )}(\s+)?\}\s+from\s+['"]${modulePath}['"]`
//       );
//       lines = lines.filter((line) => !line.match(importLine));
//       lines = lines.map((line) => {
//         let tmp = line;
//         namedImports.forEach((value) => {
//           const matchRegex = new RegExp(
//             String.raw`(?<!\bconst\s+\w+\s*=\s*${value}\b)(?<!\blet\s+\w+\s*=\s*${value}\b)(?<!\bvar\s+\w+\s*=\s*${value}\b)\b${value}\b`
//           );
//           tmp = tmp.replace(matchRegex, (match) => {
//             console.log(match);
//             return `(await document.getModuleFromCache("${modulePath}"))`;
//           });
//         });
//         return tmp;
//       });
//     }
//     // Check for default import
//     if (matches[4]) {
//       // console.log("Default Import:", matches[4]); // Logs the default import name
//       const importLine = RegExp(
//         String.raw`^import\s+${matches[4]}\s+from\s+['"]${modulePath}['"]`
//       );
//       const matchRegex = new RegExp(
//         String.raw`(?<!\bconst\s+\w+\s*=\s*${matches[4]}\b)(?<!\blet\s+\w+\s*=\s*${matches[4]}\b)(?<!\bvar\s+\w+\s*=\s*${matches[4]}\b)\b${matches[4]}\b`
//       );
//       lines = lines.filter((line) => !line.match(importLine));
//       lines = lines.map((line) => {
//         return line.replace(matchRegex, (match) => {
//           console.log(match);
//           return `(await document.getModuleFromCache("${modulePath}")).default`;
//         });
//       });
//     }
//   }
//   // Remove all imports
//   lines = lines.filter(
//     (line) => !(line.includes(`import`) || line.includes(" from "))
//   );
//   // Join the lines back into a single string
//   const updatedCode = lines.join("\n");
//   console.log("\nUpdated Code:\n", updatedCode);
//   return updatedCode;
// }
