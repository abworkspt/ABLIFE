const https = require('https')
const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const APP_ID = 'fe028778-fad0-4980-9e39-586d49fcbce6'
const REDIRECT_URL = 'https://abworkspt.github.io/ABLIFE/callback'
const KEY_PATH = path.join(__dirname, 'bbva-key.pem')
const SESSION_PATH = path.join(__dirname, 'bbva-session.json')

const API_HOST = 'api.enablebanking.com'

function loadSession() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      const s = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'))
      if (new Date(s.valid_until) > new Date()) return s
    }
  } catch {}
  return null
}

function saveSession(session) {
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session), 'utf8')
}

function toBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createJWT() {
  const privateKey = fs.readFileSync(KEY_PATH, 'utf8')
  const header = toBase64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid: APP_ID, typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = toBase64url(Buffer.from(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 })))
  const data = `${header}.${payload}`
  const sign = crypto.createSign('SHA256')
  sign.update(data)
  return `${data}.${sign.sign(privateKey, 'base64url')}`
}

function apiCall(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const options = {
      hostname: API_HOST,
      path: endpoint.split('?')[0].split('/').map(s => encodeURIComponent(s)).join('/') + (endpoint.includes('?') ? '?' + endpoint.split('?')[1] : ''),
      method,
      headers: {
        'Authorization': `Bearer ${createJWT()}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, data: raw }) }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

let callbackServer = null

function waitForCallback() {
  return new Promise((resolve, reject) => {
    if (callbackServer) {
      try { callbackServer.close() } catch {}
      callbackServer = null
    }

    const timeout = setTimeout(() => {
      callbackServer?.close()
      callbackServer = null
      reject(new Error('Timeout: autenticação não concluída em 5 minutos'))
    }, 5 * 60 * 1000)

    let handled = false
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0e0f11;color:#fff">
        <h2 style="color:#16a97d">✅ Podes fechar esta janela!</h2>
        <p style="color:#6b7280">A importar transações no ABLIFE...</p>
      </body></html>`)
      if (handled) return
      handled = true
      clearTimeout(timeout)
      callbackServer = null
      setImmediate(() => server.close())
      const url = new URL(req.url, 'http://localhost:7890')
      resolve(Object.fromEntries(url.searchParams))
    })
    callbackServer = server

    callbackServer.on('error', err => { clearTimeout(timeout); reject(err) })
    callbackServer.listen(7890)
  })
}

function mapTransaction(tx) {
  let amount = parseFloat(tx.transaction_amount?.amount ?? 0)
  const isDebit = tx.credit_debit_indicator === 'DBIT'
  if (isDebit && amount > 0) amount = -amount
  const desc =
    tx.creditor_name ||
    tx.debtor_name ||
    (tx.remittance_information || [])[0] ||
    'Transação BBVA'
  return {
    name: desc,
    amount,
    category: 'Outro',
    date: tx.booking_date || tx.value_date || new Date().toISOString().split('T')[0],
    type: amount >= 0 ? 'income' : 'expense',
    icon: '🏦'
  }
}

async function startSync(shell) {
  let session = loadSession()

  if (!session) {
    // Sem sessão guardada — autenticar no BBVA
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const state = crypto.randomBytes(16).toString('hex')

    const authResp = await apiCall('POST', '/auth', {
      access: { valid_until: validUntil },
      aspsp: { name: 'BBVA', country: 'PT' },
      state,
      redirect_url: REDIRECT_URL,
      psu_type: 'personal'
    })

    if (authResp.status !== 200 && authResp.status !== 201) {
      throw new Error(`Erro Enable Banking (${authResp.status}): ${JSON.stringify(authResp.data)}`)
    }

    const { url } = authResp.data
    if (!url) throw new Error('Enable Banking não devolveu URL de autenticação')

    await shell.openExternal(url)

    const params = await waitForCallback()
    if (params.error) throw new Error(`Erro na autenticação: ${params.error_description || params.error}`)
    if (!params.code) throw new Error('Sem código de autorização no callback')

    const sessionResp = await apiCall('POST', '/sessions', { code: params.code })
    if (sessionResp.status !== 200 && sessionResp.status !== 201) {
      throw new Error(`Erro ao criar sessão (${sessionResp.status}): ${JSON.stringify(sessionResp.data)}`)
    }

    const TARGET_IBAN = 'PT50001900040020006799985'
    const allAccounts = sessionResp.data.accounts || []
    const filtered = allAccounts.filter(a => a.account_id?.iban === TARGET_IBAN)
    const accountUids = (filtered.length ? filtered : allAccounts).map(a => a.uid)

    session = {
      session_id: sessionResp.data.session_id,
      accounts: accountUids,
      valid_until: validUntil
    }
    saveSession(session)
    fs.writeFileSync(path.join(__dirname, '.bbva-connected'), '')
  }

  // Ir buscar saldo e transações de cada conta
  const transactions = []
  const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  let balance = null

  for (const accountId of session.accounts) {
    // Saldo real
    const balResp = await apiCall('GET', `/accounts/${accountId}/balances`)
    if (balResp.status === 200) {
      const balances = balResp.data?.balances || []
      const b = balances.find(b => b.balance_type === 'closingBooked') || balances[0]
      if (b) balance = parseFloat(b.balance_amount?.amount ?? 0)
    }

    // Transações
    const txResp = await apiCall('GET', `/accounts/${accountId}/transactions?date_from=${dateFrom}`)
    if (txResp.status === 429) {
      throw new Error('O BBVA atingiu o limite diário de acessos via API (máx. 4/dia). Tenta amanhã.')
    }
    if (txResp.status === 401 || txResp.status === 403) {
      fs.unlinkSync(SESSION_PATH)
      throw new Error('Sessão expirada. Clica em sincronizar de novo para autenticar.')
    }
    const txs = txResp.data?.transactions || []
    transactions.push(...txs.map(mapTransaction))
  }

  return { count: transactions.length, transactions, balance }
}

async function autoSync(db, saveDb) {
  const session = loadSession()
  if (!session || !session.accounts?.length) return { imported: 0 }

  const lastSync = session.lastSync ? new Date(session.lastSync) : null
  const hoursSinceLast = lastSync ? (Date.now() - lastSync) / 3600000 : Infinity
  if (hoursSinceLast < 23) return { imported: 0, skipped: true }

  const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const transactions = []

  for (const accountId of session.accounts) {
    const txResp = await apiCall('GET', `/accounts/${accountId}/transactions?date_from=${dateFrom}`)
    if (txResp.status === 401 || txResp.status === 403) {
      fs.unlinkSync(SESSION_PATH)
      return { imported: 0, error: 'Sessão expirada' }
    }
    const txs = txResp.data?.transactions || []
    transactions.push(...txs.map(mapTransaction))
  }

  let imported = 0
  for (const tx of transactions) {
    const exists = db.exec('SELECT id FROM transactions WHERE name=? AND date=? AND amount=?', [tx.name, tx.date, tx.amount])
    if (!exists[0]) {
      db.run('INSERT INTO transactions (name,amount,category,date,type,icon) VALUES (?,?,?,?,?,?)',
        [tx.name, tx.amount, tx.category, tx.date, tx.type, tx.icon])
      imported++
    }
  }

  if (imported > 0) saveDb()

  session.lastSync = new Date().toISOString()
  saveSession(session)

  return { imported }
}

module.exports = { startSync, autoSync }
