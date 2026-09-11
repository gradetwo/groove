import fs from "fs";
import path from "path";

const REPLACEMENTS = [
  // Accent #f5b73d
  { regex: /hover:text-\[#f5b73d\]/g, replacement: "hover:text-accent" },
  { regex: /hover:border-\[#f5b73d\]/g, replacement: "hover:border-accent" },
  { regex: /hover:bg-\[#f5b73d\]/g, replacement: "hover:bg-accent" },
  { regex: /text-\[#f5b73d\]/g, replacement: "text-accent" },
  { regex: /bg-\[#f5b73d\]/g, replacement: "bg-accent" },
  { regex: /border-\[#f5b73d\]/g, replacement: "border-accent" },
  { regex: /accent-\[#f5b73d\]/g, replacement: "accent-accent" },

  // Text #e9e7e0
  { regex: /hover:text-\[#e9e7e0\]/g, replacement: "hover:text-text" },
  { regex: /text-\[#e9e7e0\]/g, replacement: "text-text" },

  // Text Sub #8b8f99
  { regex: /hover:text-\[#8b8f99\]/g, replacement: "hover:text-text-sub" },
  { regex: /text-\[#8b8f99\]/g, replacement: "text-text-sub" },

  // Text Dim #5a5e68
  { regex: /hover:text-\[#5a5e68\]/g, replacement: "hover:text-text-dim" },
  { regex: /text-\[#5a5e68\]/g, replacement: "text-text-dim" },

  // Line #23262d
  { regex: /hover:border-\[#23262d\]/g, replacement: "hover:border-line" },
  { regex: /hover:bg-\[#23262d\]/g, replacement: "hover:bg-line" },
  { regex: /border-\[#23262d\]/g, replacement: "border-line" },
  { regex: /bg-\[#23262d\]/g, replacement: "bg-line" },

  // Line Strong #393d46
  { regex: /hover:border-\[#393d46\]/g, replacement: "hover:border-line-strong" },
  { regex: /border-\[#393d46\]/g, replacement: "border-line-strong" },

  // Line Subtle #1a1c21
  { regex: /border-\[#1a1c21\]/g, replacement: "border-line-subtle" },
  { regex: /bg-\[#1a1c21\]/g, replacement: "bg-line-subtle" },

  // Panel #121317
  { regex: /hover:bg-\[#121317\]/g, replacement: "hover:bg-panel" },
  { regex: /bg-\[#121317\]/g, replacement: "bg-panel" },

  // Panel2 #0d0e12
  { regex: /hover:bg-\[#0d0e12\]/g, replacement: "hover:bg-panel2" },
  { regex: /bg-\[#0d0e12\]/g, replacement: "bg-panel2" },

  // Bg #0a0b0d
  { regex: /bg-\[#0a0b0d\]/g, replacement: "bg-bg" },
];

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith(".tsx")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      let modified = false;

      for (const { regex, replacement } of REPLACEMENTS) {
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content, "utf-8");
        console.log(`Updated tokens in: ${fullPath}`);
      }
    }
  }
}

console.log("Running design token codemod on src/...");
processDir(path.join(process.cwd(), "src"));
console.log("Codemod completed.");
