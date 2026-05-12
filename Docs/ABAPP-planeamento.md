# ABAPP — Planeamento e Decisões

> Sessão de planeamento: 12 maio 2026

---

## Visão geral

App pessoal desktop (Electron) com quatro módulos principais:

| Módulo | Estado |
|---|---|
| 💰 Finanças | ✅ Em construção (v0.1) |
| ✅ Tarefas | 🔜 Planeado |
| 📅 Calendário | 🔜 Planeado |
| 📝 Notas | 🔜 Planeado |

---

## Decisões técnicas

### Stack
- **Framework:** Electron (desktop) → PWA/Vercel (web, fase 2)
- **Frontend:** HTML + CSS + JS vanilla (sem framework por agora)
- **Base de dados:** `sql.js` (SQLite em WebAssembly — sem dependências nativas)
- **Linguagem:** JavaScript (Node.js)

### Porquê estas escolhas
- **Electron** permite começar local e privado, sem alojamento
- **sql.js** em vez de `better-sqlite3` porque o Windows bloqueia compilação de módulos nativos sem Python + Visual Studio instalados
- **PWA no futuro** — o mesmo código HTML/CSS/JS pode ser servido na web sem reescrever nada

### Armazenamento de dados
- Ficheiro SQLite guardado localmente em:
  - Windows: `%APPDATA%\myapp\myapp.db`
  - macOS: `~/Library/Application Support/myapp/myapp.db`
  - Linux: `~/.config/myapp/myapp.db`
- Dados ficam **no dispositivo**, sem cloud obrigatória
- Sincronização cloud prevista para fase futura (ex: Supabase)

### Autenticação
- PIN local ou biometria (mobile)
- Sem servidor de autenticação externo

---

## Módulo de Finanças — v0.1

### Funcionalidades implementadas
- Dashboard com saldo, KPIs (receitas, despesas, poupança, nº transações)
- Gráfico de barras receitas vs despesas (6 meses)
- Categorias com barra de progresso
- Lista de transações com filtros por tipo e categoria
- Adicionar transação (modal)
- Apagar transação
- Navegação entre meses

### Estrutura da base de dados
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,   -- negativo = despesa, positivo = receita
  category TEXT,
  date TEXT,              -- formato YYYY-MM-DD
  type TEXT,              -- 'expense' | 'income'
  icon TEXT
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  balance REAL DEFAULT 0,
  bank TEXT,
  last_sync TEXT
);
```

### Categorias definidas
- 🏠 Habitação — `#3b82c4`
- 🛒 Alimentação — `#c99a2e`
- 💊 Saúde — `#10b981`
- ⛽ Transportes — `#e05252`
- 🎬 Lazer — `#8b5cf6`
- 📱 Subscrições — `#f97316`
- 💰 Receita — `#16a97d`
- 💳 Outro — `#6b7280`

---

## Integração BBVA (fase futura)

- O BBVA Portugal tem API open banking PSD2
- Melhor opção para uso pessoal: **GoCardless Bank Account Data** (ex-Nordigen) ou **Enable Banking**
- Suporta acesso a transações dos últimos 730 dias
- Fluxo: autenticação OAuth no BBVA → token → pull de transações via API → guardar em SQLite local
- Não é necessário ser TPP registado se usar um agregador

---

## Estrutura de ficheiros do projeto

```
abapp/
├── main.js          ← processo principal Electron + IPC handlers
├── preload.js       ← bridge segura entre main e renderer
├── index.html       ← UI principal
├── style.css        ← estilos (tema escuro, CSS variables)
├── renderer.js      ← lógica do frontend
├── package.json     ← dependências e scripts de build
└── README.md        ← instruções de instalação
```

---

## Scripts disponíveis

```bash
npm start            # correr em desenvolvimento
npm run build-win    # criar .exe portátil (requer admin ou Developer Mode)
npm run build-mac    # criar .dmg
npm run build-linux  # criar .AppImage
```

### Nota sobre build no Windows
O `npm run build-win` requer uma de duas condições:
- Correr o terminal **como Administrador**, ou
- Ativar **Modo de Programador** em Definições → Sistema → Para programadores

---

## Próximos passos

- [ ] Testar e validar v0.1 do módulo de finanças
- [ ] Criar ícone da app (`assets/icon.png`)
- [ ] Adicionar campo de notas às transações
- [ ] Ecrã de orçamentos mensais por categoria
- [ ] Ecrã de relatórios (gráficos mensais/anuais)
- [ ] Prototipar módulo de Tarefas
- [ ] Prototipar módulo de Calendário
- [ ] Prototipar módulo de Notas (com encriptação)
- [ ] Integração BBVA via API open banking
- [ ] Versão web (PWA / Vercel) — fase 2

---

## Roadmap de fases

```
Fase 1 (atual)   → Electron desktop · SQLite local · dados manuais
Fase 2           → Integração BBVA API · sync automático
Fase 3           → Restantes módulos (tarefas, calendário, notas)
Fase 4           → PWA / versão web · sync cloud opcional
```
