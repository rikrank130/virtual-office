// 会話履歴を localStorage に保存する簡易ストア。
// 相手（person.id）ごとに 1 件のキーで保存する。
// ※ あくまでブラウザ内の保存です。複数人での本当のリアルタイム会話には
//   サーバ（DB）が必要で、ここはその差し替え口を意識した最小実装です。

export interface Message {
  from: 'me' | 'them'
  text: string
  /** 送信時刻(ms)。表示や並び替えに使える */
  at: number
}

const PREFIX = 'hiroba.chat.'
const VERSION = 1

interface StoredChat {
  v: number
  messages: Message[]
}

const keyFor = (personId: string): string => PREFIX + personId

/** 相手との会話履歴を読み込む。無ければ空配列。 */
export function loadMessages(personId: string): Message[] {
  try {
    const raw = localStorage.getItem(keyFor(personId))
    if (!raw) return []
    const data = JSON.parse(raw) as StoredChat
    if (data?.v !== VERSION || !Array.isArray(data.messages)) return []
    return data.messages
  } catch {
    // JSON 破損・localStorage 不可（プライベートモード等）でも落とさない
    return []
  }
}

/** 相手との会話履歴を保存する。 */
export function saveMessages(personId: string, messages: Message[]): void {
  try {
    const data: StoredChat = { v: VERSION, messages }
    localStorage.setItem(keyFor(personId), JSON.stringify(data))
  } catch {
    // 保存できなくても会話自体は継続できるようにする
  }
}

/** 相手との会話履歴を消す。 */
export function clearMessages(personId: string): void {
  try {
    localStorage.removeItem(keyFor(personId))
  } catch {
    // noop
  }
}
