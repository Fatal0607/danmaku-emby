const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const HOMEBREW_PREFIXES = ['/opt/homebrew/', '/usr/local/', '/opt/local/']
const SYSTEM_PREFIXES = ['/System/Library/', '/usr/lib/']

function parseOtoolLibraries(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(.+?)\s+\(compatibility version/.exec(line)
      return match ? match[1] : undefined
    })
    .filter(Boolean)
}

function isBundledDylibCandidate(dep) {
  return (
    path.isAbsolute(dep) &&
    dep.endsWith('.dylib') &&
    HOMEBREW_PREFIXES.some((prefix) => dep.startsWith(prefix)) &&
    !SYSTEM_PREFIXES.some((prefix) => dep.startsWith(prefix))
  )
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'pipe' })
}

function readLibraries(file) {
  return parseOtoolLibraries(execFileSync('otool', ['-L', file], { encoding: 'utf8' }))
}

function findFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) findFiles(p, predicate, out)
    else if (entry.isFile() && predicate(p)) out.push(p)
  }
  return out
}

function collectDylibs(entryFiles) {
  const byBasename = new Map()
  const queue = []

  const enqueue = (dep) => {
    if (!isBundledDylibCandidate(dep)) return
    if (!fs.existsSync(dep)) {
      throw new Error(`Required dylib does not exist: ${dep}`)
    }
    const realPath = fs.realpathSync(dep)
    const basename = path.basename(dep)
    const existing = byBasename.get(basename)
    if (existing && existing.realPath !== realPath) {
      throw new Error(`Dylib basename collision: ${existing.realPath} and ${realPath}`)
    }
    if (!existing) {
      const entry = { basename, realPath, installNames: new Set([dep]) }
      byBasename.set(basename, entry)
      queue.push(entry)
    } else {
      existing.installNames.add(dep)
    }
  }

  for (const file of entryFiles) {
    for (const dep of readLibraries(file)) enqueue(dep)
  }

  for (let i = 0; i < queue.length; i += 1) {
    const dep = queue[i]
    for (const child of readLibraries(dep.realPath)) {
      if (path.basename(child) !== dep.basename) enqueue(child)
    }
  }

  return [...byBasename.values()]
}

function copyDylibs(dylibs, frameworksDir) {
  fs.mkdirSync(frameworksDir, { recursive: true })
  const copied = new Map()
  for (const dep of dylibs) {
    const dest = path.join(frameworksDir, dep.basename)
    fs.copyFileSync(dep.realPath, dest)
    fs.chmodSync(dest, 0o755)
    copied.set(dep.basename, { ...dep, dest })
  }
  return copied
}

function rewriteNodeLoads(nodeFile, dylibs) {
  for (const dep of dylibs) {
    const replacement = `@executable_path/../Frameworks/${dep.basename}`
    for (const installName of dep.installNames) {
      run('install_name_tool', ['-change', installName, replacement, nodeFile])
    }
  }
}

function rewriteDylibLoads(copied) {
  for (const { basename, dest } of copied.values()) {
    run('install_name_tool', ['-id', `@rpath/${basename}`, dest])
    for (const dep of readLibraries(dest)) {
      if (!isBundledDylibCandidate(dep) || path.basename(dep) === basename) continue
      run('install_name_tool', ['-change', dep, `@loader_path/${path.basename(dep)}`, dest])
    }
  }
}

function appPathFromContext(context) {
  const productFilename = context.packager.appInfo.productFilename
  return path.join(context.appOutDir, `${productFilename}.app`)
}

function bundleMpvDylibsForApp(appPath) {
  const nativeNodes = findFiles(
    path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked'),
    (file) => path.basename(file) === 'mpv_render.node',
  )

  if (nativeNodes.length === 0) {
    console.warn('[bundle-mpv-dylibs] no mpv_render.node files found')
    return
  }

  const dylibs = collectDylibs(nativeNodes)
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks')
  const copied = copyDylibs(dylibs, frameworksDir)
  rewriteDylibLoads(copied)
  for (const nodeFile of nativeNodes) rewriteNodeLoads(nodeFile, dylibs)
  console.log(`[bundle-mpv-dylibs] bundled ${dylibs.length} dylibs for ${nativeNodes.length} native module(s)`)
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  bundleMpvDylibsForApp(appPathFromContext(context))
}

module.exports.parseOtoolLibraries = parseOtoolLibraries
module.exports.isBundledDylibCandidate = isBundledDylibCandidate
module.exports.bundleMpvDylibsForApp = bundleMpvDylibsForApp
