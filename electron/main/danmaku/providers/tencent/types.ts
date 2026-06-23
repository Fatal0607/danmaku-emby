// Tencent Video (v.qq.com) raw API shapes (docs 04 §4.5). Only the fields we
// actually read are modelled; everything is optional because the upstream
// payloads are large and loosely typed.

export interface TxSearchResponse {
  data?: {
    normalList?: { itemList?: TxSearchItem[] }
  }
}

export interface TxSearchItem {
  videoInfo?: {
    title?: string
    year?: number
    typeName?: string
    imgUrl?: string
  }
  doc?: { id?: string }
}

export interface TxPageResponse {
  data?: {
    module_list_datas?: TxModuleListData[]
  }
}

export interface TxModuleListData {
  module_datas?: TxModuleData[]
}

export interface TxModuleData {
  item_data_lists?: { item_datas?: TxPageItem[] }
}

export interface TxPageItem {
  item_params?: {
    vid?: string
    title?: string
    union_title?: string
    is_trailer?: string
  }
}

export interface TxBarrageBase {
  segment_index?: Record<string, TxSegmentIndex>
}

export interface TxSegmentIndex {
  segment_name?: string
  segment_start?: string
}

export interface TxSegmentResponse {
  barrage_list?: TxBarrageItem[]
}

export interface TxBarrageItem {
  /** Milliseconds from the start of the episode (string in practice). */
  time_offset?: string | number
  content?: string
  /** JSON string carrying color / gradient info, when the comment is styled. */
  content_style?: string
}
