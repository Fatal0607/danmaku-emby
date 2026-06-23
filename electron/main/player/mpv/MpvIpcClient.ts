import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import {
  consumeMessages,
  encodeCommand,
  isEvent,
  type MpvEvent,
  type MpvReply,
} from './protocol'

export interface MpvIpcOptions {
  binaryPath?: string
  socketPath?: string
  /** Extra mpv CLI flags (e.g. --hwdec, --vo for headless tests). */
  extraArgs?: string[] | (() => string[])
  connectTimeoutMs?: number
}

interface Pending {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}

const CONNECT_TIMEOUT_MS = 6000
const CONNECT_RETRY_MS = 80

/**
 * Spawns `mpv --input-ipc-server` and speaks JSON IPC over its unix socket
 * (docs 03 §3.4, L1). Correlates command replies by `request_id` and re-emits
 * mpv `event` notifications. Only process/socket concerns live here — the wire
 * codec is in protocol.ts so it stays unit-testable without a real mpv.
 *
 * Emits: `event` (MpvEvent), `error` (Error), `exit` (number | null).
 */
export class MpvIpcClient extends EventEmitter {
  private proc?: ChildProcess
  private socket?: Socket
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private buffer = ''
  private readonly binaryPath: string
  private readonly socketPath: string
  private readonly extraArgs: string[] | (() => string[])
  private readonly connectTimeoutMs: number

  constructor(opts: MpvIpcOptions = {}) {
    super()
    this.binaryPath = opts.binaryPath ?? 'mpv'
    this.socketPath =
      opts.socketPath ?? join(tmpdir(), `dmemby-mpv-${process.pid}-${Date.now()}.sock`)
    this.extraArgs = opts.extraArgs ?? []
    this.connectTimeoutMs = opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
  }

  /** Launch mpv (idle) and connect to its IPC socket. */
  async start(): Promise<void> {
    const extraArgs = typeof this.extraArgs === 'function' ? this.extraArgs() : this.extraArgs
    this.proc = spawn(
      this.binaryPath,
      [
        `--input-ipc-server=${this.socketPath}`,
        '--idle=yes',
        '--no-terminal',
        '--no-config',
        ...extraArgs,
      ],
      { stdio: 'ignore' },
    )
    this.proc.once('error', (e) => this.emit('error', e))
    this.proc.once('exit', (code) => this.emit('exit', code))
    await this.connect()
  }

  /** mpv creates the socket asynchronously after launch — retry until it's up. */
  private async connect(): Promise<void> {
    const deadline = Date.now() + this.connectTimeoutMs
    let lastErr: unknown
    while (Date.now() < deadline) {
      try {
        this.socket = await this.openSocket()
        return
      } catch (e) {
        lastErr = e
        await delay(CONNECT_RETRY_MS)
      }
    }
    throw new Error(`MpvIpcClient: IPC socket connect timed out (${String(lastErr)})`)
  }

  private openSocket(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const sock = createConnection(this.socketPath)
      sock.once('connect', () => {
        sock.removeListener('error', reject)
        sock.setEncoding('utf8')
        sock.on('data', (chunk: string) => this.onData(chunk))
        sock.on('error', (e) => this.emit('error', e))
        resolve(sock)
      })
      sock.once('error', reject)
    })
  }

  private onData(chunk: string): void {
    const { messages, rest } = consumeMessages(this.buffer + chunk)
    this.buffer = rest
    for (const msg of messages) {
      if (isEvent(msg)) this.emit('event', msg as MpvEvent)
      else this.resolveReply(msg as MpvReply)
    }
  }

  private resolveReply(reply: MpvReply): void {
    if (reply.request_id == null) return
    const p = this.pending.get(reply.request_id)
    if (!p) return
    this.pending.delete(reply.request_id)
    if (reply.error && reply.error !== 'success') p.reject(new Error(`mpv: ${reply.error}`))
    else p.resolve(reply.data)
  }

  /** Send a command and resolve with its reply `data`. */
  command(...args: unknown[]): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error('MpvIpcClient: not connected'))
    const id = this.nextId++
    const line = encodeCommand(args, id)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket!.write(line)
    })
  }

  setProperty(name: string, value: unknown): Promise<unknown> {
    return this.command('set_property', name, value)
  }

  getProperty(name: string): Promise<unknown> {
    return this.command('get_property', name)
  }

  observeProperty(id: number, name: string): Promise<unknown> {
    return this.command('observe_property', id, name)
  }

  async stop(): Promise<void> {
    try {
      if (this.socket) await this.command('quit')
    } catch {
      /* mpv may already be gone — best-effort */
    }
    for (const p of this.pending.values()) p.reject(new Error('MpvIpcClient: stopped'))
    this.pending.clear()
    this.socket?.destroy()
    this.proc?.kill()
    this.socket = undefined
    this.proc = undefined
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
