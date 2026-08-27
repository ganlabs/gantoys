#!/usr/bin/env node
import { readFileSync } from "fs";

function normalize(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits[13]}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function processInput(text, tsv) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = items.map(item => [item, normalize(item)]);

  if (tsv) {
    for (const [, norm] of results) console.log(norm || "");
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Original".padEnd(colW)} | Normalizado |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(12)}|`);
  for (const [orig, norm] of results) {
    console.log(`| ${orig.padEnd(colW)} | ${(norm || "invalido").padEnd(11)} |`);
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
