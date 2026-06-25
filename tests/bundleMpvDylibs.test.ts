import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const {
  parseOtoolLibraries,
  isBundledDylibCandidate,
} = require('../scripts/bundle-mpv-dylibs.cjs') as {
  parseOtoolLibraries: (output: string) => string[]
  isBundledDylibCandidate: (dep: string) => boolean
}

describe('bundle-mpv-dylibs helpers', () => {
  test('parses linked libraries from otool output', () => {
    const output = `/tmp/mpv_render.node:
\t/opt/homebrew/opt/mpv/lib/libmpv.2.dylib (compatibility version 2.0.0, current version 2.0.0)
\t/System/Library/Frameworks/OpenGL.framework/Versions/A/OpenGL (compatibility version 1.0.0, current version 1.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)
`

    expect(parseOtoolLibraries(output)).toEqual([
      '/opt/homebrew/opt/mpv/lib/libmpv.2.dylib',
      '/System/Library/Frameworks/OpenGL.framework/Versions/A/OpenGL',
      '/usr/lib/libSystem.B.dylib',
    ])
  })

  test('bundles Homebrew dylibs and leaves system libraries alone', () => {
    expect(isBundledDylibCandidate('/opt/homebrew/opt/mpv/lib/libmpv.2.dylib')).toBe(true)
    expect(isBundledDylibCandidate('/usr/local/opt/mpv/lib/libmpv.2.dylib')).toBe(true)
    expect(isBundledDylibCandidate('/System/Library/Frameworks/OpenGL.framework/Versions/A/OpenGL')).toBe(false)
    expect(isBundledDylibCandidate('/usr/lib/libSystem.B.dylib')).toBe(false)
    expect(isBundledDylibCandidate('@rpath/libmpv.2.dylib')).toBe(false)
  })
})
