# SPEC - Ganjuntar PDF Merger

## Project Overview
- **Name**: Ganjuntar (PDF Merger)
- **Type**: Single-page offline web app
- **Core Functionality**: Merge PDF files from subfolders into single files per folder
- **Target Users**: Anyone needing to combine PDFs organized in folders

## UI/UX Specification

### Layout Structure
- Single page app with centered card container
- No external dependencies (CDN for pdf-lib allowed for PDF processing)
- Sections: Header, Folder Selection, Processing Status, Results

### Visual Design
- **Theme**: Glassmorphism
- **Colors**:
  - Primary: Egg yolk yellow (#FFD700 / #F7C500)
  - Secondary: Lead gray (#4A4A4A / #2D2D2D)
  - Background dark: #1A1A1A with transparency
  - Background light: #F5F5F0 with transparency
  - Accent: Bright yellow (#FFE44D)
- **Typography**:
  - Font: 'DM Sans' from Google Fonts (offline fallback: system sans-serif)
  - Headings: Bold, 1.5rem-2rem
  - Body: Regular, 1rem
- **Effects**:
  - Background blur on cards (backdrop-filter: blur(20px))
  - Subtle shadows
  - Smooth transitions (0.3s ease)

### Components
1. **Theme Toggle**: Switch between light/dark (sun/moon icon)
2. **Folder Selector**: Custom styled button to select directory
3. **Folder Tree View**: Display selected folder structure
4. **Progress Bar**: Visual progress during processing
5. **Status Messages**: Step-by-step feedback
6. **Results List**: Show merged files with status

### Responsive
- Mobile-friendly (min-width: 320px)
- Card max-width: 600px centered

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
- [ ] Glassmorphism visual with yellow/gray colors
- [ ] Theme toggle (light/dark) works
- [ ] Custom folder selector (not OS native)
- [ ] Shows folder structure after selection
- [ ] Merges PDFs per subfolder
- [ ] Sorts files before merging
- [ ] Names output after folder
- [ ] Progress feedback visible
- [ ] Downloads work