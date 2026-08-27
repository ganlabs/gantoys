#!/usr/bin/env node
import { readFileSync } from "fs";

function fmtCpf(d) {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtCnpj(d) {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function normalize(doc) {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) return ["CPF", fmtCpf(digits)];
  if (digits.length === 14) return ["CNPJ", fmtCnpj(digits)];
  return ["INVALIDO", digits];
}

function processInput(text, tsv) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = items.map(n => normalize(n));

  if (tsv) {
    for (let i = 0; i < items.length; i++) {
      const [tipo, norm] = results[i];
      console.log(`${tipo}\t${norm}`);
    }
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Original".padEnd(colW)} | Tipo | Normalizado |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(5)}-|${"-".repeat(12)}|`);
  for (let i = 0; i < items.length; i++) {
    const [tipo, norm] = results[i];
    console.log(`| ${items[i].padEnd(colW)} | ${tipo.padEnd(4)} | ${norm.padEnd(11)} |`);
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
