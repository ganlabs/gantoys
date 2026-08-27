#!/usr/bin/env node
import { readFileSync } from "fs";

function normalizeName(text) {
  if (!text) return "";
  let s = text.normalize("NFKD").replace(/[^A-Za-z0-9 _-]/g, "");
  return s.toUpperCase().trim();
}

function formatDoc(text) {
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length === 11)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length === 14)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  return digits;
}

function val(v) {
  return v != null ? String(v) : "";
}

function parseTSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split("\t");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const row = {};
    header.forEach((h, j) => { row[h.trim()] = (cols[j] || "").trim(); });
    rows.push(row);
  }
  return { header, rows };
}

function processInput(text, polo, tsv) {
  const { header, rows } = parseTSV(text);

  const outHeader = ["Processo", "Nome", "Documento"];
  const lawyerCols = [];
  for (let i = 1; i <= 9; i++) {
    const nk = `Nome Advogado ${i}`;
    const ok = `OAB Advogado ${i}`;
    const ck = `CPF Advogado ${i}`;
    if (header.includes(nk)) {
      lawyerCols.push(nk, ok, ck);
      outHeader.push(`Nome_Adv_${i}`, `OAB_Adv_${i}`, `CPF_Adv_${i}`);
    } else break;
  }

  if (tsv) console.log(outHeader.join("\t"));

  polo = polo.toUpperCase();
  for (const row of rows) {
    if (val(row.Polo).toUpperCase() !== polo) continue;
    const processo = val(row.Processo);
    const nome = normalizeName(val(row.Nome));
    const doc = formatDoc(val(row["Número do Documento"]));

    const out = [processo, nome, doc];
    for (let i = 0; i < lawyerCols.length; i += 3) {
      out.push(normalizeName(val(row[lawyerCols[i]])));
      out.push(val(row[lawyerCols[i + 1]]));
      out.push(formatDoc(val(row[lawyerCols[i + 2]])));
    }
    console.log(out.join("\t"));
  }
}

const args = process.argv.slice(2);
let file, text, polo = "ATIVO", tsv = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--polo" && i + 1 < args.length) polo = args[++i];
  else if (args[i] === "--no-tsv") tsv = false;
}

if (file) {
  processInput(readFileSync(file, "utf-8"), polo, tsv);
} else if (text) {
  processInput(text, polo, tsv);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, polo, tsv));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
