import { createHash } from 'node:crypto'

// bilibili WBI signing (docs 04 §4.5). Search endpoints require a `w_rid` =
// md5(sortedQuery + mixinKey), where mixinKey is derived by reordering the
// concatenated img/sub keys from the `nav` endpoint. This is bilibili's public
// web-API signing scheme, implemented from spec.

// Public reorder table used to build the mixin key.
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

export interface WbiKeys {
  imgKey: string
  subKey: string
}

/** Strip a wbi key from an image URL: `.../<key>.png` → `<key>`. */
export function extractWbiKey(url: string): string {
  const file = url.split('/').pop() ?? ''
  return file.split('.')[0]
}

export function getMixinKey(imgKey: string, subKey: string): string {
  const concat = imgKey + subKey
  return MIXIN_KEY_ENC_TAB.map((i) => concat[i] ?? '')
    .join('')
    .slice(0, 32)
}

/**
 * Sign query params with WBI. Returns the canonical query string including the
 * appended `wts` and `w_rid`. Values are filtered of `!'()*` per spec.
 */
export function encodeWbi(
  params: Record<string, string | number>,
  keys: WbiKeys,
  wts: number = Math.floor(Date.now() / 1000),
): string {
  const mixinKey = getMixinKey(keys.imgKey, keys.subKey)
  const withTs: Record<string, string | number> = { ...params, wts }
  const query = Object.keys(withTs)
    .sort()
    .map((k) => {
      const value = String(withTs[k]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`
    })
    .join('&')
  const wRid = createHash('md5').update(query + mixinKey).digest('hex')
  return `${query}&w_rid=${wRid}`
}
