import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Bundle the Electron main + preload TypeScript into dist-electron/ (the
// `main` field target). Vite only builds the renderer; this fills the gap so
// `electron .` has JS to load. Type-checking stays with `tsc --noEmit`.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const alias = { '@shared': resolve(root, 'shared') }
const watch = process.argv.includes('--watch')

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  alias,
  logLevel: 'info',
}

// Main runs as ESM (package.json type=module). `electron` and the native
// better-sqlite3 addon stay external and resolve from node_modules at runtime.
const main = {
  ...shared,
  entryPoints: [resolve(root, 'electron/main/index.ts')],
  outfile: resolve(root, 'dist-electron/main/index.js'),
  format: 'esm',
  external: ['electron', 'better-sqlite3'],
}

// Preload is emitted as CommonJS (.cjs) for the widest Electron compatibility
// regardless of the package's ESM type.
const preload = {
  ...shared,
  entryPoints: [resolve(root, 'electron/preload/index.ts')],
  outfile: resolve(root, 'dist-electron/preload/index.cjs'),
  format: 'cjs',
  external: ['electron'],
}

if (watch) {
  const { context } = await import('esbuild')
  const ctxs = await Promise.all([context(main), context(preload)])
  await Promise.all(ctxs.map((c) => c.watch()))
  console.log('[electron] watching main + preload…')
} else {
  await Promise.all([build(main), build(preload)])
  console.log('[electron] built main + preload → dist-electron/')
}
