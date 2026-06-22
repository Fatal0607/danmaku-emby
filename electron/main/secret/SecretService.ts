import { safeStorage } from 'electron'
import type { AppMetaRepo } from '../store/repositories/KvRepos'

// Token / secret storage via Electron safeStorage (macOS Keychain, docs 06 §6.2).
// AccessTokens are encrypted with the OS keychain; the ciphertext is parked in
// app_meta under a namespaced key so SQLite never holds plaintext.

const PREFIX = 'secret:'

export class SecretService {
  constructor(private readonly meta: AppMetaRepo) {}

  available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /** Store a token for a server id. Throws if encryption is unavailable. */
  setToken(serverId: string, token: string): void {
    if (!this.available()) {
      throw new Error('SECRET_UNAVAILABLE: Keychain encryption not available')
    }
    const encrypted = safeStorage.encryptString(token)
    this.meta.set(PREFIX + serverId, encrypted.toString('base64'))
  }

  getToken(serverId: string): string | null {
    const stored = this.meta.get(PREFIX + serverId)
    if (!stored) return null
    if (!this.available()) return null
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return null
    }
  }

  removeToken(serverId: string): void {
    this.meta.set(PREFIX + serverId, '')
  }
}
