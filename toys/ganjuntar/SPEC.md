# SPEC - Ganjuntar PDF Merger

## Project Overview
- **Name**: Ganjuntar (PDF Merger)
- **Type**: Single-page offline web app
- **Core Functionality**: Merge PDF files from subfolders into single files per folder
- **Target Users**: Anyone needing to combine PDFs organized in folders

## UI/UX Specification

### Layout Structure
- Casca compartilhada de `../shared/toy.css`: `<main class="shell">` (máx. 1080px, centralizado)
  com `<header class="brand">` (logo `../../favicon.png` em `.brand-logo`) e cartões
  `<section class="glass-card"><div class="panel">…</div></section>`
- CSS local (`styles.css`) só com o que é específico do toy, sempre via tokens `--toy-*`
- Dependência local: `pdf-lib.min.js` (processamento de PDF)
- Sections: Header, Folder Selection, Processing Status, Results

### Visual Design
- **Theme**: Glassmorphism (tema e variante visual vêm do app; o toy apenas aplica `data-theme`/`data-visual`)
- **Colors**:
  - Todas as cores vêm dos tokens `--toy-*` do shared (ex.: destaque `--toy-accent` amarelo,
    texto `--toy-text`, superfícies `--toy-surface`/`--toy-surface-alt`, bordas `--toy-border`)
  - Estados semânticos: `--toy-success`, `--toy-warning`, `--toy-danger`
  - Nenhuma cor fixa no `styles.css` local
- **Typography**:
  - Fonte: pilha compartilhada `--toy-font` (Inter, com fallback de sistema); sem fontes locais
  - Headings: peso 800; corpo: 1rem/1.5
- **Effects**:
  - Blur, sombras e raios vêm dos tokens (`--toy-backdrop`, `--toy-card-shadow`, `--toy-card-radius`)
  - Transições suaves (0.18s–0.3s ease)

### Components
1. **Theme**: controlado pelo app (barra/tema do shell); o toy respeita `prefers-color-scheme` e `localStorage`
2. **Folder Selector**: botão `.btn .btn-primary .btn-block` (estado `.selected` local)
3. **Folder Tree View**: lista de subpastas (`.subfolders-list`, itens `.subfolder-item`)
4. **Progress Bar**: `.progress-area`/`.progress-top`/`.progress-wrap`/`.progress-bar` (`.visible` alternado pelo script)
5. **Status Messages**: `.progress-status` com pasta atual e arquivo em processamento
6. **Results List**: cartão `.results` com `.result-item` (`.success`/`.error`)

### Responsive
- Mobile-friendly (min-width: 320px)
- Shell fluido até 1080px; o shared reduz paddings em `max-width: 720px`

## Functionality Specification

### Core Features
1. **Theme Toggle**: Persist preference in localStorage
2. **Folder Selection**:
   - Use `<input type="file" webkitdirectory>` for folder selection
   - Browser provides file picker (not OS native)
   - Request write permission after selection
3. **PDF Merging**:
   - Scan all subfolders of selected directory
   - For each folder, collect ALL .pdf files (recursively or direct)
   - Sort files alphabetically before merging
   - Merge using pdf-lib library
   - Save output as "{folder_name}.pdf" to base directory
4. **Progress Feedback**:
   - Show current folder being processed
   - Progress percentage
   - Each file status
5. **Download/Save**:
   - Use File System Access API if available
   - Fallback: Offer individual downloads

### User Flow
1. User opens app
2. Clicks "Selecionar Pasta" button
3. Browser folder picker appears
4. User selects folder
5. App shows folder structure
6. User clicks "Juntar PDFs"
7. Progress shown in real-time
8. Results displayed with download links

### Edge Cases
- Empty subfolders (skip)
- No PDFs in folder (show warning)
- Permission denied (request again)
- Large files (show loading state)

## Acceptance Criteria
- [ ] Works offline via file://
- [ ] Casca glassmorphism do shared (`.shell`/`.brand`/`.glass-card`), cores só por tokens `--toy-*`
- [ ] Tema claro/escuro aplicado pelo app (`data-theme`); abertura direta respeita `prefers-color-scheme`
- [ ] Folder selector with fallback for browsers without File System Access API
- [ ] Shows folder structure after selection
- [ ] Merges PDFs per subfolder
- [ ] Sorts files before merging
- [ ] Names output after folder
- [ ] Progress feedback visible
- [ ] Downloads work