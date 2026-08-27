# NovoDiv

> **Divisor automático e inteligente de PDFs de Petições Iniciais para processos jurídicos brasileiros.**

[![Status](https://img.shields.io/badge/status-Est%C3%A1vel_v7-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Offline](https://img.shields.io/badge/100%25-Client--Side-blue)]()
[![Privacy](https://img.shields.io/badge/LGPD-100%25_Local-orange)]()

O **NovoDiv** é um aplicativo web *single-file* de alta performance que processa PDFs **integrais** de processos judiciais e administrativos brasileiros (PJe, Projudi, eProc, PROCON), identificando e separando automaticamente a **Petição Inicial** do restante dos documentos.

Gera diretamente na pasta local do usuário:
- 📄 `Inicial_{CNJ}.pdf` — apenas as páginas da Petição Inicial
- 📂 `Docs_{CNJ}.pdf` — o restante do processo (documentos anexos, procuração, custas, certidões, etc.)

---

## ✨ Principais Funcionalidades

- ⚡ **Detecção Heurística Automática (Algorithm v7):** Análise multi-fase de vocativos, conectivos, marcadores de sistema e sinalizadores de encerramento (pedidos, valores de causa e assinaturas OAB/Defensoria).
- 👁️ **OCR de Emergência (Tesseract.js v5):** Fallback automático com reconhecimento óptico de caracteres para PDFs digitalizados/imagem sem camada de texto.
- 🎯 **Visualizador Customizado & Correção Manual Interativa:**
  - Visualização nativa em `iframe` para consulta rápida.
  - Modo **"✏️ Corrigir"** com Canvas dinâmico e botões **"Marcar Início"** e **"Marcar Fim"** diretamente na leitura do documento.
  - **Zoom Inteligente:** Ajuste automático à tela (*Fit Page* calculado dinamicamente) e controles de Zoom (+/-).
  - **Rolagem Fluida (Scroll Engine):** Navegação por roda do mouse/trackpad com trava de *cooldown* de 120ms, permitindo troca de páginas suave sem saltos múltiplos em mouses de alta sensibilidade (ex: Logitech MX).
- 📊 **Dashboard de Auditoria & Estatísticas:**
  - Métricas em tempo real (Total, Concluídos, A Revisar, Erros).
  - Barra de progresso animada com log rotativo em tempo real (*mini-log*).
  - Modal de relatório detalhado com badges de status (✅ OK, ⚠️ Revisar, ❌ Erro).
- 📈 **Exportação de Dados:** Exportação em formato CSV com suporte a acentuação UTF-8 (BOM nativo) para integração com planilhas e sistemas jurídicos.
- 🔒 **Privacidade Absoluta (Zero Backend):** Processamento 100% *client-side* via File System Access API. Nenhum byte de dado processado sai da máquina do usuário.

---

## 🛠️ Tech Stack & Decisões Arquiteturais

| Componente | Tecnologia | Função / Motivo |
|------------|------------|-----------------|
| **Arquitetura** | HTML5 + CSS3 + JS Vanilla (ES2020+) | *Single-file* (`index.html`), sem necessidade de `npm install`, servidor ou build steps. |
| **Escrita PDF** | `pdf-lib` v1.17.1 (CDN) | Extração e fusão de páginas sem re-compressão nem perda de qualidade visual. |
| **Leitura PDF** | `pdf.js` v3.11.174 (CDN) | Leitura rápida da camada de texto e renderização em Canvas no visualizador customizado. |
| **OCR Fallback** | `Tesseract.js` v5 (CDN) | OCR local para converter PDFs em imagem quando a camada de texto nativa não for detectada. |
| **I/O Local** | File System Access API | Permite leitura e escrita direta em pastas locais no navegador sem downloads manuais. |
| **Interface** | Glassmorphism & Modern CSS | Interface limpa, responsiva e focada em produtividade operacional. |

---

## 🚀 Como Usar

1. **Abra o app:** Clique duas vezes no arquivo `index.html` em um navegador compatível (**Google Chrome**, **Microsoft Edge** ou **Opera**).
2. **Selecione os processos:** Arraste um lote de PDFs integrais para a zona de upload (os arquivos devem conter o número CNJ no nome).
3. **Escolha a pasta de destino:** Clique em **"Avançar e Escolher Destino"** e selecione a pasta onde os arquivos divididos (`Inicial_*.pdf` e `Docs_*.pdf`) serão salvos.
4. **Acompanhe o processamento:** O dashboard exibirá o progresso e estatísticas em tempo real.
5. **Audite e Corrija:** 
   - Abra o **Relatório Detalhado**.
   - Se algum processo receber a flag **⚠️ Revisar**, clique em **"✏️ Corrigir"** para abrir o visualizador Canvas interativo, ajustar o intervalo de páginas e clicar em **"✂️ Dividir"** para re-gerar os arquivos imediatamente.
6. **Exporte o relatório:** Baixe o resumo das operações em CSV.

> ⚠️ **Requisito de Navegador:** O suporte à escrita direta em pastas requer navegadores baseados em Chromium (**Chrome 86+**, **Edge 86+**, **Opera 72+**). Firefox e Safari não suportam a File System Access API.

---

## 📁 Estrutura do Projeto

```text
novodiv/
├── index.html              # 🏆 Aplicação Completa (UI, Algoritmo v7, Viewer & Worker)
├── logo.png                # Logo da aplicação
├── favicon.png             # Ícone de aba do navegador
│
├── .untracked/             # 🙈 Diretório raiz não-versionado contendo PDFs de teste e trabalho:
│   ├── Baixados/           #    - PDFs baixados de demonstração
│   ├── processos/          #    - Amostra de PDFs integrais de entrada
│   ├── NOVOS/              #    - Amostra de PDFs novos a processar
│   ├── erros/              #    - Amostra de PDFs de casos extremos
│   ├── procon/             #    - Amostra de notificações do PROCON
│   └── teste1/             #    - Amostra de PDFs divididos (saída)
│
├── README.md               # Este arquivo
├── SPEC.md                 # Especificação técnica e arquitetural
├── AGENTS.md               # Diretrizes para agentes de IA e desenvolvedores
└── LICENSE                 # Licença MIT
```

---

## 🧠 Algoritmo de Detecção (Resumo v7)

O algoritmo atua em 4 fases sequenciais:

1. **Fase 0 (Detecção PROCON):** Procura por marcadores de notificações administrativas estaduais.
2. **Fase 0.5 (OCR de Emergência):** Se as 10 primeiras páginas tiverem menos de 500 caracteres somados, o Tesseract.js renderiza e lê o conteúdo visual.
3. **Fase 1 (Início da Petição):** Procura vocativos jurídicos formais (`START_PATTERNS`) com refinamentos para petições curtas (`pattern_alt`), sistemas eProc (`inic1`) e termos de autuação (`termo2`).
4. **Fase 2 (Fim da Petição):** Avalia 5 métricas concorrentes de encerramento (`endById`, `endByContent`, `endByClosingConfirmed`, `endByClosingNoOab`, `endByClosingOnly`) e adota a página final mais **conservadora** (`min`).

---

## 🤝 Contribuição e Convenções

Ao contribuir para o projeto, siga rigorosamente as diretrizes em [`AGENTS.md`](AGENTS.md):
- **Zero build dependencies:** Não adicionar `package.json`, TypeScript, bundlers ou frameworks.
- **Single-file core:** Todo o código do app deve permanecer em `index.html`.
- **Commits:** Padrão *Conventional Commits* em português (ex: `feat(ui): adiciona suporte a zoom fit`).
- **Privacidade:** Nenhuma chamada externa para envio de dados deve ser introduzida.

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja [`LICENSE`](LICENSE) para mais detalhes.

---

## 🏢 GanLabs

Desenvolvido e mantido por **[GanLabs](https://github.com/ganlabs)** — Ferramentas jurídicas com foco em inteligência local e privacidade por padrão.
