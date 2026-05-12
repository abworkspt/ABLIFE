const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('db', {
  getTransactions: (month, year) => ipcRenderer.invoke('get-transactions', month, year),
  getSummary: (month, year) => ipcRenderer.invoke('get-summary', month, year),
  addTransaction: (tx) => ipcRenderer.invoke('add-transaction', tx),
  deleteTransaction: (id) => ipcRenderer.invoke('delete-transaction', id),
  syncBank: () => ipcRenderer.invoke('sync-bank'),
  onAutoSynced: (cb) => ipcRenderer.on('auto-synced', (_, data) => cb(data)),
  getGroups: () => ipcRenderer.invoke('get-groups'),
  addGroup: (name, color) => ipcRenderer.invoke('add-group', name, color),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),
  getTasks: (groupId) => ipcRenderer.invoke('get-tasks', groupId),
  addTask: (groupId, title) => ipcRenderer.invoke('add-task', groupId, title),
  toggleTask: (id, done) => ipcRenderer.invoke('toggle-task', id, done),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
})
