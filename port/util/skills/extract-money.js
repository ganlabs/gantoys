#!/usr/bin/env node
import { readFileSync } from "fs";

function extract(raw) {
  let text = raw.replace(/[^\d,.-]/g, "");
  if (!text) return null;

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "");
      text = text.replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
    text = text.replace(/\./g, ",");
  } else if (text.includes(".")) {
    text = text.replace(/\./g, ",");
  }

  if (text.endsWith(",00")) text = text.slice(0, -3);
  return text;
}

function processInput(text, tsv) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = items.map(item => [item, extract(item)]);

  if (tsv) {
    for (const [, ext] of results) console.log(ext || "");
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Original".padEnd(colW)} | Extraído |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(9)}|`);
  for (const [orig, ext] of results) {
    console.log(`| ${orig.padEnd(colW)} | ${(ext || "?").padEnd(8)} |`);
  }
}

const args = process.argv.slice(2);
let file, text, tsv = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
}

if (file) {
  processInput(readFileSync(file, "utf-8"), tsv);
} else if (text) {
  processInput(text, tsv);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, tsv));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
