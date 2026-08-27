#!/usr/bin/env node
import { readFileSync } from "fs";

function detectSep(line) {
  // detecta o separador: prioriza tab, depois 2+ espaços
  if (line.includes("\t")) return "\t";
  if (/  +/.test(line)) return / {2,}/;
  return "\t"; // fallback
}

function parseTSV(text) {
  const lines = text.trimEnd().split("\n");
  const sep = detectSep(lines[0]);
  const splitLine = (l) => typeof sep === "string" ? l.split(sep) : l.split(sep);
  const header = splitLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    // padroniza número de colunas (dados podem ter menos que o header
    // se colunas vazias no final foram omitidas)
    while (cols.length < header.length) cols.push("");
    const row = {};
    header.forEach((h, j) => { row[h] = (cols[j] || "").trim(); });
    rows.push(row);
  }
  return { header, rows };
}

function processInput(text, cols, tsv, noHeader) {
  const { header, rows } = parseTSV(text);

  // resolve quais colunas extrair
  let selected;
  if (cols && cols.length > 0) {
    selected = cols;
  } else {
    selected = header; // todas
  }

  // valida se as colunas existem
  for (const c of selected) {
    if (!header.includes(c)) {
      console.error(`coluna "${c}" não encontrada. Colunas disponíveis: ${header.join(", ")}`);
      process.exit(1);
    }
  }

  if (tsv && !noHeader) console.log(selected.join("\t"));

  for (const row of rows) {
    const out = selected.map(c => row[c] || "");
    console.log(out.join("\t"));
  }
}

const args = process.argv.slice(2);
let file, text, tsv = true, noHeader = false;
const cols = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
  else if (args[i] === "--no-header") noHeader = true;
  else if (args[i] === "--cols" && i + 1 < args.length) {
    const raw = args[++i];
    // aceita --cols "Col1,Col2" ou --cols "Col1" --cols "Col2"
    cols.push(...raw.split(",").map(s => s.trim()));
  }
}

if (file) {
  processInput(readFileSync(file, "utf-8"), cols, tsv, noHeader);
} else if (text) {
  processInput(text, cols, tsv, noHeader);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, cols, tsv, noHeader));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
