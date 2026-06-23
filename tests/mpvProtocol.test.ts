import { describe, expect, test } from 'vitest'
import {
  consumeMessages,
  encodeCommand,
  isEvent,
  parseLine,
} from '@/../electron/main/player/mpv/protocol'

describe('mpv protocol codec', () => {
  test('encodeCommand emits a newline-terminated request', () => {
    expect(encodeCommand(['loadfile', 'x.mkv'], 7)).toBe(
      '{"command":["loadfile","x.mkv"],"request_id":7}\n',
    )
  })

  test('parseLine returns null for malformed JSON', () => {
    expect(parseLine('{not json')).toBeNull()
    expect(parseLine('42')).toBeNull() // not an object
  })

  test('consumeMessages splits multiple lines and keeps the remainder', () => {
    const { messages, rest } = consumeMessages(
      '{"request_id":1,"error":"success","data":3}\n{"event":"pause"}\n{"partial":',
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ request_id: 1, data: 3 })
    expect(messages[1]).toMatchObject({ event: 'pause' })
    expect(rest).toBe('{"partial":')
  })

  test('consumeMessages reassembles a line split across chunks', () => {
    const first = consumeMessages('{"event":"property-change","name":"time-pos"')
    expect(first.messages).toHaveLength(0)
    const second = consumeMessages(`${first.rest},"data":12.5}\n`)
    expect(second.messages[0]).toMatchObject({ name: 'time-pos', data: 12.5 })
    expect(second.rest).toBe('')
  })

  test('isEvent distinguishes notifications from command replies', () => {
    expect(isEvent({ event: 'end-file' })).toBe(true)
    expect(isEvent({ request_id: 1, error: 'success' })).toBe(false)
  })
})
