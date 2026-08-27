#!/usr/bin/env node
import { readFileSync } from "fs";

class Entry {
  constructor(carteira, reu) {
    this.carteira = carteira;
    this.reu = reu;
  }
}

const REFS = [
  new Entry("Saneamento - Águas do Rio 4", "AGUAS DO RIO 4 SPE S.A."),
  new Entry("Saneamento - Águas do Rio 1", "AGUAS DO RIO 1 SPE S.A."),
  new Entry("Saneamento - Rio+", "RIO+ SANEAMENTO BL3 S.A."),
  new Entry("Mercado Livre - Mercado Livre - JC", "REU A DEFINIR"),
  new Entry("Mercado Livre - Mercado Livre - JEC", "REU A DEFINIR"),
  new Entry("Saneamento - Prolagos - Consumidor", "PROLAGOS S.A. - CONCESSIONÁRIA DE SERVIÇOS PÚBLICOS DE ÁGUA E ESGOTO"),
  new Entry("Saneamento - Prolagos - Cobranca", "PROLAGOS S.A. - CONCESSIONÁRIA DE SERVIÇOS PÚBLICOS DE ÁGUA E ESGOTO"),
  new Entry("Saneamento - FAB", "F.AB. ZONA OESTE S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – REGIÃO METROPOLITANA DO RECIFE/GOIANA SPE S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL BLUMENAU S.A"),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – CAÇADOR S.A"),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – CACHOEIRO DE ITAPEMIRIM S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – GOIAS S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – LIMEIRA S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – MACAÉ S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – REGIÃO METROPOLITANA DE MACEIO S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – MARANHÃO S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – MAUÁ S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL PARTICIPAÇÕES"),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – PORTO FERREIRA S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – RIO CLARO S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – SANTA GERTRUDES S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL SUMARÉ S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – ARAGUAIA SANEAMENTO S.A."),
  new Entry("Saneamento - BRK", "BRK AMBIENTAL – URUGUAIANA S.A."),
  new Entry("Saneamento - BRK", "SANEAQUA MAIRINQUE S.A."),
  new Entry("Saneamento - BRK", "Companhia de Saneamento do Tocantins – SANEATINS"),
  new Entry("Mercado Livre", "EBAZAR.COM.BR LTDA."),
  new Entry("Mercado Livre", "MERCADOLIVRE.COM ATIVIDADES DE INTERNET LTDA."),
  new Entry("Mercado Livre", "MERCADO CRÉDITO SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A."),
  new Entry("Mercado Livre", "MERCADO ENVIOS TRANSPORTE LTDA."),
  new Entry("Mercado Livre", "MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA"),
  new Entry("Mercado Livre", "KANGU PARTICIPAÇÕES S.A."),
  new Entry("Mercado Livre", "K21 INTERMEDIACAO LTDA."),
  new Entry("Mercado Livre", "IBAZAR.COM ATIVIDADES DE INTERNET LTDA."),
];

const MANUAL_ALIASES = {
  "mlvc": 3, "ml vc": 3, "ml": 3, "vc": 3,
  "mljec": 4, "ml jec": 4, "jec": 4, "cejusc": 4,
  "mercado livre vc": 3, "mercado livre jec": 4,
  "distribuidora": 1,
  "agua do rio distribuidora": 1,
  "aguas do rio distribuidora": 1,
  "fab": 7,
  "prolagos": 5, "prolagos consumidor": 5, "prolagos cobranca": 6,
  "brk": 8, "brk recife": 8, "brk goiana": 8,
  "brk blumenau": 9, "brk cacaor": 10, "brk cachoeiro": 11,
  "brk goias": 12, "brk limeira": 13, "brk macae": 14,
  "brk maceio": 15, "brk maranhao": 16, "brk maua": 17,
  "brk participacoes": 18, "brk porto ferreira": 19,
  "brk rio claro": 20, "brk santa gertrudes": 21,
  "brk sumare": 22, "brk araguaia": 23, "brk uruguaiana": 24,
  "saneaqua": 25, "saneatins": 26,
  "mercado livre": 28, "mercado pago": 31,
  "mercado credito": 29, "mercado envios": 30,
  "ebazar": 27, "ibazar": 34, "kangu": 32, "k21": 33,
};

function norm(text) {
  let s = text.normalize("NFKD").replace(/[^A-Za-z0-9+]/g, " ").replace(/\s+/g, " ");
  return s.toUpperCase().trim();
}

function tokens(text) {
  return new Set(text.split(/\s+/));
}

function splitConcat(text) {
  return text.replace(/([A-Z])(\d)/g, "$1 $2");
}

function queryVariants(q) {
  const v = [q, q.replace(/\s+/g, "")];
  v.push(splitConcat(q));
  v.push(splitConcat(q.replace(/\s+/g, "")));
  if (/MAIS/.test(q)) {
    const base = q.replace(/\s+/g, "");
    v.push(base.replace(/MAIS/g, "+"));
    v.push(splitConcat(base.replace(/MAIS/g, "+")));
  }
  if (q.includes("+")) {
    const ns = q.replace(/\s+/g, "");
    v.push(ns.replace(/\+/g, " MAIS ").trim());
    v.push(ns.replace(/\+/g, ""));
  }
  return [...new Set(v)];
}

const ALIASES = {};
REFS.forEach((ref, i) => { ALIASES[norm(ref.carteira)] = i; });
Object.entries(MANUAL_ALIASES).forEach(([k, v]) => { ALIASES[norm(k)] = v; });

function findReu(query) {
  const q = norm(query);
  if (!q) return null;
  for (const ref of REFS) {
    if (q.includes(norm(ref.reu))) return ref;
  }
  return null;
}

function find(query) {
  const q = norm(query);
  if (!q) return null;

  if (ALIASES[q] !== undefined) return REFS[ALIASES[q]];

  const reuMatch = findReu(query);
  if (reuMatch) return reuMatch;

  const qVariants = queryVariants(q);
  const qt = tokens(q);

  let bestIdx = null, bestScore = 0;

  REFS.forEach((ref, i) => {
    const nc = norm(ref.carteira);
    const nr = norm(ref.reu);
    const combined = nc + " " + nr;
    const allTokens = new Set([...tokens(nc), ...tokens(nr)]);

    for (const qv of qVariants) {
      let score = 0;
      if (qv === nc || qv === nr) score = 10000;
      else if (combined.includes(qv)) score = 5000 + qv.length;
      else {
        const qvt = tokens(qv);
        let overlap = 0;
        for (const t of qvt) if (allTokens.has(t)) overlap++;
        if (overlap > 0) score = overlap * 100;
      }

      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
  });

  if (bestIdx !== null) return REFS[bestIdx];
  return null;
}

function processInput(text, tsv, duo) {
  const items = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
  const results = [];

  for (const item of items) {
    if (duo && item.includes("\t")) {
      const [left, right] = item.split("\t", 2);
      const mLeft = find(left.trim());
      const mRight = find(right.trim());
      const carteira = (mLeft && mLeft.carteira) || (mRight && mRight.carteira) || null;
      const reu = (mRight && mRight.reu) || (mLeft && mLeft.reu) || null;
      results.push([item, carteira, reu]);
    } else {
      const match = find(item);
      results.push([item, match ? match.carteira : null, match ? match.reu : null]);
    }
  }

  if (tsv) {
    console.log(["Consulta", "Carteira", "Réu"].join("\t"));
    for (const [q, c, r] of results) console.log(`${q}\t${c || ""}\t${r || ""}`);
    return;
  }

  const colW = Math.max(...items.map(i => i.length), 10);
  console.log(`| ${"Consulta".padEnd(colW)} | Carteira | Réu |`);
  console.log(`|${"-".repeat(colW + 2)}-|${"-".repeat(9)}-|${"-".repeat(30)}|`);
  for (const [q, c, r] of results) {
    console.log(`| ${q.padEnd(colW)} | ${(c || "?").padEnd(8)} | ${(r || "?").padEnd(29)} |`);
  }
}

const args = process.argv.slice(2);
let file, text, tsv = true, duo = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--file" && i + 1 < args.length) file = args[++i];
  else if (args[i] === "--text" && i + 1 < args.length) text = args[++i];
  else if (args[i] === "--tsv") tsv = true;
  else if (args[i] === "--duo") duo = true;
}

if (file) {
  processInput(readFileSync(file, "utf-8"), tsv, duo);
} else if (text) {
  processInput(text, tsv, duo);
} else if (!process.stdin.isTTY) {
  let buf = "";
  process.stdin.on("data", chunk => buf += chunk);
  process.stdin.on("end", () => processInput(buf, tsv, duo));
} else {
  console.error("forneça --file, --text, ou pipe");
  process.exit(1);
}
