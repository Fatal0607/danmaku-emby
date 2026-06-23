// mpv JSON IPC line protocol (docs 03 §3.4). mpv speaks newline-delimited JSON
// over its `--input-ipc-server` socket: command replies carry
// `request_id`/`error`/`data`; async notifications carry `event` (plus
// `name`/`data` for property-change). This module is the pure, socket-free codec
// so it can be unit-tested without spawning mpv.

export interface MpvReply {
  request_id?: number
  error?: string
  data?: unknown
}

export interface MpvEvent {
  event: string
  id?: number
  name?: string
  data?: unknown
  reason?: string
}

export type MpvMessage = MpvReply | MpvEvent

export function isEvent(msg: MpvMessage): msg is MpvEvent {
  return typeof (msg as MpvEvent).event === 'string'
}

/**
 * Split a rolling buffer into parsed messages plus the unterminated remainder.
 * Handles partial chunks (a JSON line split across two socket `data` events) by
 * returning everything after the last newline as `rest` for the next call.
 */
export function consumeMessages(buffer: string): { messages: MpvMessage[]; rest: string } {
  const messages: MpvMessage[] = []
  let rest = buffer
  let idx: number
  while ((idx = rest.indexOf('\n')) >= 0) {
    const line = rest.slice(0, idx).trim()
    rest = rest.slice(idx + 1)
    if (!line) continue
    const msg = parseLine(line)
    if (msg) messages.push(msg)
  }
  return { messages, rest }
}

export function parseLine(line: string): MpvMessage | null {
  try {
    const obj = JSON.parse(line) as unknown
    return obj && typeof obj === 'object' ? (obj as MpvMessage) : null
  } catch {
    return null
  }
}

/** Encode a command payload as a newline-terminated IPC line. */
export function encodeCommand(command: unknown[], requestId: number): string {
  return `${JSON.stringify({ command, request_id: requestId })}\n`
}
