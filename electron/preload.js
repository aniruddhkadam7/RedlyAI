const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eaDesktop', {
  saveProject: (args) => ipcRenderer.invoke('ea:saveProject', args),
  openProject: () => ipcRenderer.invoke('ea:openProject'),
  openProjectAtPath: (filePath) => ipcRenderer.invoke('ea:openProjectAtPath', { filePath }),
  pickProjectFolder: () => ipcRenderer.invoke('ea:pickProjectFolder'),
  openDevTools: () => ipcRenderer.invoke('ea:openDevTools'),
});
