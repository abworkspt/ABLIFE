const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('db', {
  getTransactions: (month, year) => ipcRenderer.invoke('get-transactions', month, year),
  getSummary: (month, year) => ipcRenderer.invoke('get-summary', month, year),
  addTransaction: (tx) => ipcRenderer.invoke('add-transaction', tx),
  deleteTransaction: (id) => ipcRenderer.invoke('delete-transaction', id),
  syncBank: () => ipcRenderer.invoke('sync-bank'),
  onAutoSynced: (cb) => ipcRenderer.on('auto-synced', (_, data) => cb(data)),
})
