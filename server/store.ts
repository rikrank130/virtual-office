// 会話履歴を JSON ファイルに保存する簡易DB。
// 2者間(conversationKey)ごとに ChatMessage[] を保持する。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conversationKey, type ChatMessage } from '../shared/protocol'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'chats.json')
const MAX_PER_CONVO = 500

type Db = Record<string, ChatMessage[]>

let db: Db = {}
let saveTimer: ReturnType<typeof setTimeout> | null = null

function load(): void {
  try {
    const raw = readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Db
    if (parsed && typeof parsed === 'object') db = parsed
  } catch {
    db = {} // 初回など。ファイルが無ければ空で開始。
  }
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(DATA_FILE, JSON.stringify(db), 'utf8')
    } catch (err) {
      console.error('[store] 保存に失敗:', err)
    }
  }, 300) // 連続書き込みをまとめる
}

export function initStore(): void {
  load()
}

export function appendMessage(msg: ChatMessage): void {
  const key = conversationKey(msg.fromId, msg.toId)
  const list = db[key] ?? (db[key] = [])
  list.push(msg)
  if (list.length > MAX_PER_CONVO) list.splice(0, list.length - MAX_PER_CONVO)
  scheduleSave()
}

export function getHistory(a: string, b: string, limit = 100): ChatMessage[] {
  const list = db[conversationKey(a, b)] ?? []
  return list.slice(-limit)
}
