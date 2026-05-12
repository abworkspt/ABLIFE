const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CAT_COLORS = {
  'Habitação': '#3b82c4', 'Alimentação': '#c99a2e', 'Saúde': '#10b981',
  'Transportes': '#e05252', 'Lazer': '#8b5cf6', 'Subscrições': '#f97316',
  'Receita': '#16a97d', 'Outro': '#6b7280'
}

const CAT_ICONS = {
  'Habitação': '🏠', 'Alimentação': '🛒', 'Saúde': '💊',
  'Transportes': '⛽', 'Lazer': '🎬', 'Subscrições': '📱',
  'Receita': '💰', 'Outro': '💳'
}

let cur = new Date()
let curMonth = cur.getMonth() + 1
let curYear = cur.getFullYear()
let allTransactions = []
let activeFilter = 'all'
let currentView = 'dashboard'

// ── DB layer (works with Electron IPC or falls back to demo data) ──
const dbApi = window.db || {
  getTransactions: async (m, y) => getDemoTransactions(m, y),
  getSummary: async (m, y) => getDemoSummary(m, y),
  addTransaction: async (tx) => { allTransactions.unshift({id: Date.now(), ...tx}); return {ok:true} },
  deleteTransaction: async (id) => { allTransactions = allTransactions.filter(t=>t.id!==id); return {ok:true} }
}

function getDemoTransactions(month, year) {
  const m = String(month).padStart(2,'0')
  const base = [
    {id:1,icon:'🏠',name:'Renda - Apartamento',date:`${year}-${m}-01`,category:'Habitação',amount:-650,type:'expense'},
    {id:2,icon:'💼',name:'Salário - Empresa XYZ',date:`${year}-${m}-05`,category:'Receita',amount:2100,type:'income'},
    {id:3,icon:'🛒',name:'Continente - Compras',date:`${year}-${m}-06`,category:'Alimentação',amount:-87.43,type:'expense'},
    {id:4,icon:'⛽',name:'Galp - Combustível',date:`${year}-${m}-07`,category:'Transportes',amount:-62,type:'expense'},
    {id:5,icon:'💻',name:'Freelance - Cliente A',date:`${year}-${m}-09`,category:'Receita',amount:550,type:'income'},
    {id:6,icon:'🍕',name:'Restaurante Zé da Esquina',date:`${year}-${m}-10`,category:'Lazer',amount:-34.50,type:'expense'},
    {id:7,icon:'📱',name:'NOS - Telemóvel',date:`${year}-${m}-12`,category:'Subscrições',amount:-28.99,type:'expense'},
    {id:8,icon:'🎬',name:'Netflix',date:`${year}-${m}-13`,category:'Subscrições',amount:-15.99,type:'expense'},
    {id:9,icon:'🛒',name:'Pingo Doce',date:`${year}-${m}-14`,category:'Alimentação',amount:-54.20,type:'expense'},
    {id:10,icon:'💊',name:'Farmácia Saúde',date:`${year}-${m}-16`,category:'Saúde',amount:-22.80,type:'expense'},
    {id:11,icon:'📚',name:'FNAC - Livros',date:`${year}-${m}-18`,category:'Lazer',amount:-41,type:'expense'},
    {id:12,icon:'🛒',name:'Lidl',date:`${year}-${m}-20`,category:'Alimentação',amount:-67.10,type:'expense'},
    {id:13,icon:'🏋️',name:'Ginásio Holmes Place',date:`${year}-${m}-22`,category:'Saúde',amount:-49.90,type:'expense'},
    {id:14,icon:'☕',name:'Delta Q - Café mês',date:`${year}-${m}-21`,category:'Subscrições',amount:-9.90,type:'expense'},
  ]
  return base
}

function getDemoSummary(month, year) {
  return { income: 2650, expenses: 1847, balance: 3847.22, bank: 'BBVA' }
}

// ── Render ──
async function renderAll() {
  const [txs, summary] = await Promise.all([
    dbApi.getTransactions(curMonth, curYear),
    dbApi.getSummary(curMonth, curYear)
  ])
  allTransactions = txs

  const mn = MONTHS[curMonth - 1]
  document.getElementById('mnav-lbl').textContent = MONTHS_SHORT[curMonth-1] + ' ' + curYear
  document.getElementById('hdr-sub').textContent = mn.toLowerCase() + ' ' + curYear + ' · BBVA **** 4821'

  const income = summary.income || txs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)
  const expenses = summary.expenses || Math.abs(txs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))
  const balance = summary.balance || 0
  const save = income - expenses
  const savePct = income > 0 ? Math.round(save/income*100) : 0

  document.getElementById('bal-val').textContent = '€ ' + fmt(balance)
  document.getElementById('kpi-in').textContent = '€ ' + fmt(income)
  document.getElementById('kpi-out').textContent = '€ ' + fmt(expenses)
  document.getElementById('kpi-save').textContent = '€ ' + fmt(save)
  document.getElementById('kpi-save-sub').textContent = savePct + '% do rendimento'
  document.getElementById('kpi-count').textContent = txs.length
  document.getElementById('bal-save').textContent = '€ ' + fmt(save) + ' poupados'

  renderCategories(txs)
  renderRecent(txs.slice(0, 6))
  renderAllTxs()
}

function renderCategories(txs) {
  const cats = {}
  txs.filter(t=>t.amount<0).forEach(t => {
    cats[t.category] = (cats[t.category]||0) + Math.abs(t.amount)
  })
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1])
  const max = sorted[0]?.[1] || 1
  const total = sorted.reduce((s,[,v])=>s+v,0)
  document.getElementById('cat-total').textContent = '€ ' + fmt(total) + ' total'
  document.getElementById('cat-list').innerHTML = sorted.map(([name, val]) => {
    const color = CAT_COLORS[name] || '#6b7280'
    return `<div class="cat-item">
      <div class="cat-dot" style="background:${color}"></div>
      <span class="cat-name">${name}</span>
      <div class="cat-track"><div class="cat-fill" style="width:${Math.round(val/max*100)}%;background:${color}"></div></div>
      <span class="cat-val">€ ${fmt(val)}</span>
    </div>`
  }).join('')
}

function renderRecent(txs) {
  document.getElementById('recent-list').innerHTML = txs.map(t => txRow(t, false)).join('')
}

function renderAllTxs() {
  let txs = [...allTransactions]
  if (activeFilter === 'income') txs = txs.filter(t=>t.type==='income'||t.amount>0)
  else if (activeFilter === 'expense') txs = txs.filter(t=>t.type==='expense'||t.amount<0)
  else if (activeFilter.startsWith('cat-')) txs = txs.filter(t=>t.category===activeFilter.slice(4))

  document.getElementById('all-tx-count').textContent = txs.length + ' transações'
  document.getElementById('all-tx-list').innerHTML = txs.map(t => txRow(t, true)).join('')

  document.querySelectorAll('#all-tx-list .tx-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id)
      await dbApi.deleteTransaction(id)
      await renderAll()
    })
  })
}

function txRow(t, showDelete) {
  const pos = t.amount > 0
  const color = pos ? '#16a97d' : '#e05252'
  const sign = pos ? '+' : ''
  const cc = CAT_COLORS[t.category] || '#6b7280'
  const icon = t.icon || CAT_ICONS[t.category] || '💳'
  const dateStr = t.date ? t.date.slice(5).replace('-','/') : ''
  const del = showDelete ? `<button class="tx-del" data-id="${t.id}" title="Apagar">✕</button>` : ''
  return `<div class="tx-row">
    <div class="tx-icon" style="background:${cc}22">${icon}</div>
    <div class="tx-info">
      <div class="tx-name">${t.name}</div>
      <div class="tx-date">${dateStr}</div>
    </div>
    <span class="tx-cat" style="background:${cc}22;color:${cc}">${t.category}</span>
    <span class="tx-amt" style="color:${color}">${sign}€ ${fmt(Math.abs(t.amount))}</span>
    ${del}
  </div>`
}

function fmt(n) {
  return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Navigation ──
function setView(view) {
  currentView = view
  document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'flex' : 'none'
  document.getElementById('view-transactions').style.display = view === 'transactions' ? 'flex' : 'none'
  document.getElementById('view-tarefas').style.display = view === 'tarefas' ? 'flex' : 'none'
  const titles = { dashboard: 'Dashboard', transactions: 'Transações', tarefas: 'Tarefas' }
  document.getElementById('page-title').textContent = titles[view] || view
  document.querySelectorAll('.sb-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view)
  })
  if (view === 'transactions') renderAllTxs()
  if (view === 'tarefas') renderGroups()
}

// ── Event listeners ──
document.getElementById('prev-month').addEventListener('click', () => {
  curMonth--
  if (curMonth < 1) { curMonth = 12; curYear-- }
  renderAll()
})

document.getElementById('next-month').addEventListener('click', () => {
  curMonth++
  if (curMonth > 12) { curMonth = 1; curYear++ }
  renderAll()
})

document.querySelectorAll('.sb-item[data-view]').forEach(el => {
  el.addEventListener('click', () => setView(el.dataset.view))
})

document.querySelector('.sb-item[data-module="tarefas"]')?.addEventListener('click', () => setView('tarefas'))

document.querySelectorAll('.tx-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter
    document.querySelectorAll('.tx-btn').forEach(b => b.classList.remove('on'))
    btn.classList.add('on')
    renderAllTxs()
  })
})

// Modal
const overlay = document.getElementById('modal-overlay')
document.getElementById('add-tx-btn').addEventListener('click', () => {
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0]
  overlay.style.display = 'flex'
})
document.getElementById('modal-close').addEventListener('click', () => overlay.style.display = 'none')
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none' })

document.getElementById('save-tx-btn').addEventListener('click', async () => {
  const name = document.getElementById('f-name').value.trim()
  const amount = parseFloat(document.getElementById('f-amount').value)
  const type = document.getElementById('f-type').value
  const category = document.getElementById('f-cat').value
  const date = document.getElementById('f-date').value

  if (!name || isNaN(amount) || amount <= 0) return

  const tx = {
    name,
    amount: type === 'expense' ? -amount : amount,
    category,
    date,
    type,
    icon: CAT_ICONS[category] || '💳'
  }

  await dbApi.addTransaction(tx)
  overlay.style.display = 'none'
  document.getElementById('f-name').value = ''
  document.getElementById('f-amount').value = ''
  await renderAll()
})

// Sync BBVA
const syncBtn = document.getElementById('sync-btn')
const syncStatus = document.getElementById('sync-status')
const bankName = document.getElementById('bank-name')

if (syncBtn && window.db?.syncBank) {
  syncBtn.addEventListener('click', async () => {
    syncBtn.style.opacity = '0.5'
    syncBtn.style.pointerEvents = 'none'
    bankName.textContent = 'A sincronizar...'
    syncStatus.style.display = 'block'
    syncStatus.textContent = 'A abrir autenticação BBVA no browser...'

    const result = await window.db.syncBank()

    syncBtn.style.opacity = ''
    syncBtn.style.pointerEvents = ''

    if (result.ok) {
      bankName.textContent = 'BBVA · sincronizado'
      syncStatus.textContent = `✅ ${result.imported} novas transações importadas (${result.total} no banco)`
      await renderAll()
    } else {
      bankName.textContent = 'BBVA · erro'
      syncStatus.textContent = `❌ ${result.error}`
    }
  })
}

// ── Módulo de Tarefas ──
let activeGroupId = null
let activeGroupColor = '#8b5cf6'
let selectedColor = '#8b5cf6'

const groupModal = document.getElementById('group-modal-overlay')

document.getElementById('add-group-btn').addEventListener('click', () => {
  document.getElementById('g-name').value = ''
  groupModal.style.display = 'flex'
  document.getElementById('g-name').focus()
})
document.getElementById('group-modal-close').addEventListener('click', () => groupModal.style.display = 'none')
groupModal.addEventListener('click', e => { if (e.target === groupModal) groupModal.style.display = 'none' })

document.querySelectorAll('.color-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'))
    opt.classList.add('selected')
    selectedColor = opt.dataset.color
  })
})

document.getElementById('save-group-btn').addEventListener('click', async () => {
  const name = document.getElementById('g-name').value.trim()
  if (!name) return
  const result = await window.db.addGroup(name, selectedColor)
  groupModal.style.display = 'none'
  await renderGroups()
  if (result.id) selectGroup(result.id, name, selectedColor)
})

async function renderGroups() {
  const groups = await window.db.getGroups()
  const list = document.getElementById('groups-list')
  list.innerHTML = groups.map(g => `
    <div class="group-item${g.id === activeGroupId ? ' active' : ''}" data-id="${g.id}" data-name="${g.name}" data-color="${g.color}">
      <div class="group-dot" style="background:${g.color}"></div>
      <span>${g.name}</span>
    </div>
  `).join('')
  list.querySelectorAll('.group-item').forEach(el => {
    el.addEventListener('click', () => selectGroup(Number(el.dataset.id), el.dataset.name, el.dataset.color))
  })
}

async function selectGroup(id, name, color) {
  activeGroupId = id
  activeGroupColor = color
  document.getElementById('tasks-empty-state').style.display = 'none'
  const panel = document.getElementById('tasks-panel')
  panel.style.display = 'flex'
  document.getElementById('tasks-group-name').textContent = name
  document.getElementById('tasks-group-name').style.color = color
  document.querySelectorAll('.group-item').forEach(el => el.classList.toggle('active', Number(el.dataset.id) === id))
  await renderTasks()
}

async function renderTasks() {
  if (!activeGroupId) return
  const tasks = await window.db.getTasks(activeGroupId)
  document.getElementById('task-list').innerHTML = tasks.map(t => `
    <div class="task-item${t.done ? ' done' : ''}" data-id="${t.id}">
      <div class="task-check${t.done ? ' checked' : ''}" style="color:${activeGroupColor}" data-id="${t.id}" data-done="${t.done}"></div>
      <span class="task-title">${t.title}</span>
      <button class="task-del" data-id="${t.id}">✕</button>
    </div>
  `).join('')

  document.querySelectorAll('.task-check').forEach(el => {
    el.addEventListener('click', async () => {
      await window.db.toggleTask(Number(el.dataset.id), !Number(el.dataset.done))
      await renderTasks()
    })
  })
  document.querySelectorAll('.task-del').forEach(el => {
    el.addEventListener('click', async () => {
      await window.db.deleteTask(Number(el.dataset.id))
      await renderTasks()
    })
  })
}

document.getElementById('new-task-input').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return
  const title = e.target.value.trim()
  if (!title || !activeGroupId) return
  await window.db.addTask(activeGroupId, title)
  e.target.value = ''
  await renderTasks()
})

document.getElementById('del-group-btn').addEventListener('click', async () => {
  if (!activeGroupId) return
  if (!confirm('Apagar grupo e todas as suas tarefas?')) return
  await window.db.deleteGroup(activeGroupId)
  activeGroupId = null
  document.getElementById('tasks-panel').style.display = 'none'
  document.getElementById('tasks-empty-state').style.display = 'flex'
  await renderGroups()
})

// Auto-sync em segundo plano
window.db?.onAutoSynced?.((result) => {
  if (result.imported > 0) {
    bankName.textContent = 'BBVA · sincronizado'
    syncStatus.style.display = 'block'
    syncStatus.textContent = `✅ ${result.imported} novas transações (auto-sync)`
    renderAll()
  }
})

// Init
renderAll()
