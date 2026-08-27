#!/usr/bin/env node
import { readFileSync } from "fs";

// Schema conhecido: as colunas que PODEM faltar (sempre vazias no dado original)
const VOLATILE = new Set([
  "Assunto GNA",  // header[21]
  "Migrado",       // header[35]
  "CNPJ",          // header[44]
  "Workflow",      // header[45]
  "Natureza",      // header[46]
]);

const WANTED = [
  "Pasta Iris",  // inicio
  "Contratação", "Núm. Processo", "Pasta Cliente", "Carteira",
  "Num", "Órgão", "Comarca", "Parte Autora", "CPFAUTOR",
  "Distribuição", "Valor da Causa", "Tipo Sistema", "Parte Ré",
  "Causa Raiz",  // apos Parte Ré
  "Advogado Adverso", "OAB Advogado Adverso", "UF OAB Advogado Adverso",
  "Data Audiencia", "Hora Audicencia", "Tipo Audiencia",
];

const args = process.argv.slice(2);
let file, text, raw;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
}

if (file)      { raw = readFileSync(file, "utf-8"); run(); }
else if (text) { raw = text; run(); }
else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => { raw = buf; run(); });
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}

function run() {
  const lines = raw.trimEnd().split("\n");
  const header = lines[0].split("\t");
  const hIdx = {};
  header.forEach((h, i) => { hIdx[h] = i; });

  for (const w of WANTED) {
    if (hIdx[w] === undefined) {
      console.error(`Coluna "${w}" não encontrada no header`);
      process.exit(1);
    }
  }

  // Para cada linha de dados:
  // 1. Listamos as colunas VOLATILE que realmente estão faltando
  //    (comparando posição esperada vs tamanho real do dado)
  // 2. Para cada coluna pedida, calculamos o shift = quantas VOLATILE
  //    faltantes têm índice menor que o dela

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const data = lines[i].split("\t");

    // Descobre quais VOLATILE estão faltando nesta linha
    const missing = [];
    // Multiplas passadas ate estabilizar (detectar coluna no meio pode
    // afetar a deteccao de colunas seguintes)
    let changed = true;
    while (changed) {
      changed = false;
      for (let hi = 0; hi < header.length; hi++) {
        if (!VOLATILE.has(header[hi])) continue;
        if (missing.includes(hi)) continue;
        const shift = missing.filter(m => m < hi).length;
        const di = hi - shift;
        // Caso 1: a posicao esperada simplesmente nao existe no dado
        if (di >= data.length) {
          missing.push(hi);
          changed = true;
          break;
        }
        // Caso 2: a posicao existe mas o valor NAO condiz com uma coluna vazia
        // (coluna volatile deveria estar vazia, mas tem conteudo)
        const val = data[di].trim();
        if (val.length > 1) {
          missing.push(hi);
          changed = true;
          break;
        }
      }
    }

    const out = WANTED.map(name => {
      const hi = hIdx[name];
      const shift = missing.filter(m => m < hi).length;
      const di = hi - shift;
      return di < data.length ? data[di].trim() : "";
    });
    console.log(out.join("\t"));
  }
}
