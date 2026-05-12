const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

let db = null
let SQL = null

async function setupDatabase(userDataPath) {
  try {
    const initSqlJs = require('sql.js')
    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')

    SQL = await initSqlJs({ locateFile: () => wasmPath })

    const dbPath = path.join(userDataPath, 'myapp.db')

    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath))
    } else {
      db = new SQL.Database()
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        date TEXT,
        type TEXT,
        icon TEXT
      );
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        bank TEXT,
        last_sync TEXT
      );
    `)

    const count = db.exec('SELECT COUNT(*) FROM transactions')[0]
    if (!count || count.values[0][0] === 0) seedDemoData()

    global.saveDb = () => {
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    }
    saveDb()
  } catch (e) {
    console.error('DB error:', e.message)
    db = null
  }
}

function seedDemoData() {
  const txs = [
    ['Renda - Apartamento',-650,'Habitação','2026-05-01','expense','🏠'],
    ['Salário - Empresa XYZ',2100,'Receita','2026-05-05','income','💼'],
    ['Continente - Compras',-87.43,'Alimentação','2026-05-06','expense','🛒'],
    ['Galp - Combustível',-62,'Transportes','2026-05-07','expense','⛽'],
    ['Freelance - Cliente A',550,'Receita','2026-05-09','income','💻'],
    ['Restaurante Zé da Esquina',-34.50,'Lazer','2026-05-10','expense','🍕'],
    ['NOS - Telemóvel',-28.99,'Subscrições','2026-05-12','expense','📱'],
    ['Netflix',-15.99,'Subscrições','2026-05-13','expense','🎬'],
    ['Pingo Doce',-54.20,'Alimentação','2026-05-14','expense','🛒'],
    ['Andante - Metro',-40,'Transportes','2026-05-15','expense','🚇'],
    ['Farmácia Saúde',-22.80,'Saúde','2026-05-16','expense','💊'],
    ['FNAC - Livros',-41,'Lazer','2026-05-18','expense','📚'],
    ['Lidl',-67.10,'Alimentação','2026-05-20','expense','🛒'],
    ['Ginásio Holmes Place',-49.90,'Saúde','2026-05-22','expense','🏋️'],
    ['Delta Q - Café mês',-9.90,'Subscrições','2026-05-21','expense','☕'],
    ['Renda - Apartamento',-650,'Habitação','2026-04-01','expense','🏠'],
    ['Salário - Empresa XYZ',2100,'Receita','2026-04-05','income','💼'],
    ['Continente',-91.20,'Alimentação','2026-04-08','expense','🛒'],
    ['Repsol - Combustível',-55,'Transportes','2026-04-10','expense','⛽'],
    ['NOS - Telemóvel',-28.99,'Subscrições','2026-04-12','expense','📱'],
    ['Netflix',-15.99,'Subscrições','2026-04-13','expense','🎬'],
    ['Pingo Doce',-78.40,'Alimentação','2026-04-18','expense','🛒'],
  ]
  for (const row of txs) {
    db.run('INSERT INTO transactions (name,amount,category,date,type,icon) VALUES (?,?,?,?,?,?)', row)
  }
  db.run('INSERT INTO accounts (name,balance,bank,last_sync) VALUES (?,?,?,?)',
    ['Conta Principal', 3847.22, 'BBVA', new Date().toISOString()])
}

function rowsToObjects(result) {
  if (!result[0]) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((c, i) => obj[c] = row[i])
    return obj
  })
}

function setupIPC() {
  ipcMain.handle('get-transactions', (_, month, year) => {
    if (!db) return []
    const m = String(month).padStart(2, '0'), y = String(year)
    return rowsToObjects(db.exec(
      `SELECT id,name,amount,category,date,type,icon FROM transactions
       WHERE substr(date,1,4)=? AND substr(date,6,2)=? ORDER BY date DESC`, [y, m]
    ))
  })

  ipcMain.handle('get-summary', (_, month, year) => {
    if (!db) return { income:0, expenses:0, balance:0, bank:'N/A' }
    const m = String(month).padStart(2,'0'), y = String(year)
    const inc = db.exec(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE amount>0 AND substr(date,1,4)=? AND substr(date,6,2)=?`,[y,m])
    const exp = db.exec(`SELECT COALESCE(SUM(amount),0) FROM transactions WHERE amount<0 AND substr(date,1,4)=? AND substr(date,6,2)=?`,[y,m])
    const acc = db.exec('SELECT balance,bank FROM accounts LIMIT 1')
    return {
      income: inc[0]?.values[0][0] || 0,
      expenses: Math.abs(exp[0]?.values[0][0] || 0),
      balance: acc[0]?.values[0][0] || 0,
      bank: acc[0]?.values[0][1] || 'N/A'
    }
  })

  ipcMain.handle('add-transaction', (_, tx) => {
    if (!db) return { ok:false }
    db.run('INSERT INTO transactions (name,amount,category,date,type,icon) VALUES (?,?,?,?,?,?)',
      [tx.name, tx.amount, tx.category, tx.date, tx.type, tx.icon||'💳'])
    saveDb()
    return { ok:true }
  })

  ipcMain.handle('delete-transaction', (_, id) => {
    if (!db) return { ok:false }
    db.run('DELETE FROM transactions WHERE id=?', [id])
    saveDb()
    return { ok:true }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 700, minWidth: 820, minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    backgroundColor: '#0e0f11'
  })
  win.loadFile('index.html')
  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(async () => {
  await setupDatabase(app.getPath('userData'))
  setupIPC()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
