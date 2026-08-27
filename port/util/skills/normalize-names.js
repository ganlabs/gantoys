#!/usr/bin/env node
import { readFileSync } from "fs";

function normalize(text) {
  let s = text.normalize("NFKD").replace(/[^A-Za-z0-9 _-]/g, "");
  s = s.toUpperCase().trim();
  if (s === "SEM ADV") return "SEM ADVOGADO";
  if (s === "SEM OAB") return "0";
  if (s === "SEM UF") return "TJ";
  return s;
}

function processInput(text, sep, tsv) {
  if (sep === "\\n") sep = "\n";
  if (text.includes("\n") && !text.includes(sep)) sep = "\n";

  const items = text.split(sep).map(s => s.trim()).filter(Boolean);
  const results = items.map(n => {
    const beforeSep = n.split(/[;|]/)[0].trim();
    return normalize(beforeSep);
  });

  if (tsv) {
    for (const norm of results) console.log(norm);
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Original".padEnd(colW)} | Normalizado |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(12)}|`);
  for (let i = 0; i < items.length; i++) {
    console.log(`| ${items[i].padEnd(colW)} | ${results[i].padEnd(11)} |`);
  }
}

const args = process.argv.slice(2);
let file, text, sep = ",", tsv = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--sep" && i + 1 < args.length) sep = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
}

if (file) {
  processInput(readFileSync(file, "utf-8"), sep, tsv);
} else if (text) {
  processInput(text, sep, tsv);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, sep, tsv));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
