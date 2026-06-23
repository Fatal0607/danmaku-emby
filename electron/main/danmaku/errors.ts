// Danmaku error with an enumerated code (docs 04 §4.9) that the IPC layer maps
// to UI copy.

export type DanmakuErrorCode =
  | 'DM_NOT_LOGGED_IN'
  | 'DM_REGION_BLOCKED'
  | 'DM_RATE_LIMITED'
  | 'DM_NO_MATCH'
  | 'DM_PARSE_FAILED'

export class DanmakuError extends Error {
  constructor(
    public code: DanmakuErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DanmakuError'
  }
}
