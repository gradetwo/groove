import fs from "fs";
import path from "path";

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

const files = walk("./src");
let count = 0;
const fileCounts = {};

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const matches = content.match(/language === ["']zh["']/g);
  if (matches) {
    fileCounts[file] = matches.length;
    count += matches.length;
  }
}

console.log(JSON.stringify(fileCounts, null, 2));
console.log("Total occurrences of language === 'zh':", count);
