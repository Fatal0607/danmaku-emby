import { contextBridge } from 'electron'

// Typed bridge placeholder. The renderer currently runs on mock data; real
// EmbyService / DanmakuService / PlayerController IPC namespaces will be wired
// here per docs/system-design/01-architecture.md §1.4.
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
})
