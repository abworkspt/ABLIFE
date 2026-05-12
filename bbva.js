const https = require('https')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const APP_ID = '7f5e0470-c182-40d7-b068-d009747480d5'
const REDIRECT_URL = 'https://abworkspt.github.io/ABLIFE/callback'
const KEY_PATH = path.join(__dirname, 'bbva-key.pem')

const API_HOST = 'api.enablebanking.com'

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
      path: endpoint,
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

function waitForCallback() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      global.pendingOAuthCallback = null
      reject(new Error('Timeout: autenticação não concluída em 5 minutos'))
    }, 5 * 60 * 1000)

    global.pendingOAuthCallback = (params) => {
      clearTimeout(timeout)
      global.pendingOAuthCallback = null
      resolve(params)
    }
  })
}

function mapTransaction(tx) {
  const amount = parseFloat(tx.transaction_amount?.amount ?? 0)
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
  const state = crypto.randomBytes(16).toString('hex')
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // 1. Criar URL de autenticação BBVA
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

  // 2. Abrir browser para o utilizador autenticar no BBVA
  await shell.openExternal(url)

  // 3. Aguardar o redirect com o código
  const params = await waitForCallback()
  if (params.error) throw new Error(`Erro na autenticação: ${params.error_description || params.error}`)
  if (!params.code) throw new Error('Sem código de autorização no callback')

  // 4. Trocar código por sessão
  const sessionResp = await apiCall('POST', '/sessions', { code: params.code })
  if (sessionResp.status !== 200 && sessionResp.status !== 201) {
    throw new Error(`Erro ao criar sessão (${sessionResp.status}): ${JSON.stringify(sessionResp.data)}`)
  }

  const session_id = sessionResp.data.session_id
  const accountIds = sessionResp.data.accounts || []

  // 5. Ir buscar transações de cada conta
  const transactions = []
  const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  for (const accountId of accountIds) {
    const txResp = await apiCall('GET', `/accounts/${accountId}/transactions?date_from=${dateFrom}`)
    const txs = txResp.data?.transactions || []
    transactions.push(...txs.map(mapTransaction))
  }

  return { count: transactions.length, transactions }
}

module.exports = { startSync }
