#!/usr/bin/env node
import { readFileSync } from "fs";

const NUM_EXT = {
  PRIMEIRA: "1", PRIMEIRO: "1", SEGUNDA: "2", SEGUNDO: "2",
  TERCEIRA: "3", TERCEIRO: "3", QUARTA: "4", QUINTA: "5",
  SEXTA: "6", SETIMA: "7", SETIMO: "7", OITAVA: "8",
  NONA: "9", NONO: "9", DECIMA: "10", DECIMO: "10",
};

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

function normalize(text) {
  let s = text.normalize("NFKD").replace(/[^A-Za-z0-9 _-]/g, "").toUpperCase().trim();
  s = s.replace(/(?<=\d)O(?=\s|$)/g, "");
  return s.trim();
}

function extractNum(t) {
  let m = t.match(/(\d+)[ªº°]?/);
  if (m) return m[1];
  for (const w of t.split(/\s+/)) {
    const word = w.replace(/[ .-]/g, "");
    if (NUM_EXT[word]) return NUM_EXT[word];
    if (ROMAN[word]) return String(ROMAN[word]);
  }
  return "";
}

function extractComarca(t) {
  let c = t.toUpperCase().trim().replace(/\/[A-Z]{2}$/, "").replace(/\.+$/, "");
  if (c.includes("DA COMARCA DE ")) c = c.split("DA COMARCA DE ", 2)[1];
  if (c.includes(" - ")) c = c.split(" - ", 2)[1];
  c = normalize(c);

  const courtPat = /(?:VARA\s+(?:DO\s+)?(?:JEC\s+)?(?:CIVEL|JUDICIAL)?|JUIZADO\s+ESP(?:ECIAL)?\s+CIVEL(?:\s+E)?\s+CRIM(?:INAL)?|JUIZADO\s+ESP(?:ECIAL)?\s+CIVEL|JUIZ?\s+ESP\s+CIV(?:\s+CRIM)?|JUIZADO)\s*/gi;
  const numPat = /\d+[ªº°]?\s*|PRIMEIRA\s+|PRIMEIRO\s+|SEGUNDA\s+|TERCEIRA\s+|TERCEIRO\s+|QUARTA\s+|QUINTA\s+|SEXTA\s+|SETIMA\s+|SETIMO\s+|OITAVA\s+|NONA\s+|NONO\s+|DECIMA\s+|DECIMO\s+/gi;
  const romanPat = /\b[IVXL]+\b\s*/gi;

  for (const pat of [courtPat, numPat, romanPat]) {
    c = c.replace(pat, "").trim();
  }
  c = c.replace(/^DE\s+/, "").trim();
  c = c.replace(/\s+/g, " ").trim();
  return c;
}

function classify(court) {
  const t = String(court).toUpperCase().trim();
  const isJEC = /\bJEC\b/.test(t) || /JUIZADO/.test(t) || /\bJUI[\s.]/.test(t);
  const cls = isJEC ? "JEC" : "VC";
  const tipo = isJEC ? "Juizados" : "Comum";
  let num = extractNum(t);
  if (!num) num = isJEC ? "0" : "1";
  const comarca = extractComarca(t);
  return [tipo, num, cls, comarca];
}

function processInput(text, tsv) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const rows = items.map(item => [item, ...classify(item)]);

  if (tsv) {
    for (const [, tipo, num, cls, comarca] of rows) {
      console.log([tipo, num, cls, comarca].join("\t"));
    }
    return;
  }

  const colWidths = [3, 6, 6, 30];
  if (!rows.length) return;
  for (const [orig] of rows) {
    if (orig.length > colWidths[0]) colWidths[0] = Math.min(orig.length, 60);
  }

  const sep = (w) => "+" + w.map(w => "-".repeat(w + 2)).join("+") + "+";
  const header = "| " + ["Original", "Tipo", "Nº", "Classe", "Comarca"].map((h, i) =>
    h.padEnd(colWidths[i])
  ).join(" | ") + " |";

  console.log(sep([Math.max(...rows.map(r => r[0].length), 8), ...colWidths]));
  console.log(header);
  console.log(sep([Math.max(...rows.map(r => r[0].length), 8), ...colWidths]));

  for (const [orig, tipo, num, cls, comarca] of rows) {
    const cells = [orig.padEnd(Math.max(...rows.map(r => r[0].length), 8)),
      tipo.padEnd(colWidths[0]),
      num.padEnd(colWidths[1]),
      cls.padEnd(colWidths[2]),
      comarca.padEnd(colWidths[3])];
    console.log("| " + cells.join(" | ") + " |");
  }
  console.log(sep([Math.max(...rows.map(r => r[0].length), 8), ...colWidths]));
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
