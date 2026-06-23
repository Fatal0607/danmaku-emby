import { createHash } from 'node:crypto'

// dandanplay official API request signing (X-AppId / X-Signature / X-Timestamp).
// Signature = base64(SHA256(appId + timestamp + apiPath + appSecret)).
//
// SECURITY (docs 06 §6.2): the appSecret must NOT ship in a distributed client.
// Production routes signing through a self-hosted proxy. This helper exists for
// dev/self-host use where credentials come from config/env, never hard-coded.

export interface DandanplayCredentials {
  appId: string
  appSecret: string
}

export interface SignedHeaders {
  'X-AppId': string
  'X-Signature': string
  'X-Timestamp': string
}

export function signRequest(
  creds: DandanplayCredentials,
  apiPath: string,
  timestampSec: number = Math.floor(Date.now() / 1000),
): SignedHeaders {
  const payload = `${creds.appId}${timestampSec}${apiPath}${creds.appSecret}`
  const signature = createHash('sha256').update(payload).digest('base64')
  return {
    'X-AppId': creds.appId,
    'X-Signature': signature,
    'X-Timestamp': String(timestampSec),
  }
}
