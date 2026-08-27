#!/usr/bin/env node
import { readFileSync } from "fs";

function processInput(text, suffix, tsv) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = items.map(item => [
    item,
    item.endsWith(suffix) ? item.slice(0, -suffix.length) : item,
  ]);

  if (tsv) {
    for (const [orig, stripped] of results) console.log(`${orig}\t${stripped}`);
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Original".padEnd(colW)} | Sem sufixo |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(11)}|`);
  for (const [orig, stripped] of results) {
    console.log(`| ${orig.padEnd(colW)} | ${stripped.padEnd(10)} |`);
  }
}

const args = process.argv.slice(2);
let file, text, suffix = "-PI", tsv = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--suffix" && i + 1 < args.length) suffix = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
}

if (file) {
  processInput(readFileSync(file, "utf-8"), suffix, tsv);
} else if (text) {
  processInput(text, suffix, tsv);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, suffix, tsv));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
