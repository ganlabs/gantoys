#!/usr/bin/env node
import { readFileSync } from "fs";

function processInput(ref, text, tsv) {
  const refs = {};
  const rawRef = readFileSync(ref, "utf-8");
  const lines = rawRef.trim().split("\n").slice(1);
  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const oab = cols[1].trim().replace(/\D/g, "") || "0";
    refs[oab] = { adv: cols[0].trim(), uf: cols[2].trim().toUpperCase() };
  }

  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = [];

  for (const item of items) {
    const cols = item.split("\t");
    const nome = cols[0]?.trim() || "";
    const oabRaw = cols[1]?.trim() || "";
    const oab = oabRaw.replace(/\D/g, "") || "0";

    let uf;
    if (!oab || oab === "0") uf = "TJ";
    else if (refs[oab]) uf = refs[oab].uf;
    else uf = `? OAB ${nome} ${oab}`;

    results.push([nome, oabRaw, uf]);
  }

  if (tsv) {
    for (const [nome, oabRaw, uf] of results) {
      console.log(`${nome}\t${oabRaw}\t${uf}`);
    }
    return;
  }

  const colW = Math.max(...results.map(r => r[0].length), 10);
  console.log(`| ${"Advogado".padEnd(colW)} | OAB | UF |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(5)}-|${"-".repeat(4)}|`);
  for (const [nome, oabRaw, uf] of results) {
    console.log(`| ${nome.padEnd(colW)} | ${oabRaw.padEnd(4)} | ${uf.padEnd(3)} |`);
  }
}

const args = process.argv.slice(2);
let ref, text, tsv = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ref" && i + 1 < args.length) ref = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
}

if (!ref) {
  // default: procura oab-ref.tsv no mesmo diretório
  const { dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const here = dirname(fileURLToPath(import.meta.url));
  ref = `${here}/oab-ref.tsv`;
}

if (text) {
  processInput(ref, text, tsv);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(ref, buf, tsv));
} else {
  console.error("forneça --text ou pipe");
  process.exit(1);
}
