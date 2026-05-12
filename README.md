# MyApp — App Pessoal

App desktop pessoal com gestão de finanças (e mais módulos a caminho).
Construída com Electron + SQLite.

## Instalação e arranque

### Pré-requisitos
- [Node.js](https://nodejs.org) versão 18 ou superior

### Passos

```bash
# 1. Instalar dependências
npm install

# 2. Correr em modo de desenvolvimento
npm start
```

### Criar instalador (opcional)

```bash
# Windows (.exe portátil)
npm run build-win

# macOS (.dmg)
npm run build-mac

# Linux (.AppImage)
npm run build-linux
```

O instalador aparece na pasta `dist/`.

## Dados

Os dados ficam guardados localmente em SQLite:
- **Windows:** `%APPDATA%\myapp\myapp.db`
- **macOS:** `~/Library/Application Support/myapp/myapp.db`
- **Linux:** `~/.config/myapp/myapp.db`

## Módulos

- ✅ **Finanças** — dashboard, transações, categorias
- 🔜 Tarefas
- 🔜 Calendário  
- 🔜 Notas
