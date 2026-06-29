import { useEffect, useRef, useState } from 'react'
import type { Person } from './data'
import type { ChatMessage } from '../shared/protocol'
import type { Companion } from './companion'
import { loadMessages, saveMessages, clearMessages, type Message } from './chatStore'

const QUICK = ['こんにちは', 'お元気ですか？', 'またね']

interface Bubble {
  mine: boolean
  text: string
}

// ===== 見た目（bot/user 共通）=====
interface ChatViewProps {
  face: string
  name: string
  bubbles: Bubble[]
  onSend: (text: string) => void
  onClose: () => void
  onReset?: () => void
}

function ChatView({ face, name, bubbles, onSend, onClose, onReset }: ChatViewProps) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight)
  }, [bubbles])

  const submit = (value?: string) => {
    const t = (value ?? text).trim()
    if (!t) return
    onSend(t)
    setText('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-face">{face}</span>
        <span className="chat-name">{name} とお話し中</span>
        {onReset && (
          <button className="chat-reset" onClick={onReset} aria-label="お話をはじめから">はじめから</button>
        )}
        <button className="chat-close" onClick={onClose} aria-label="とじる">✕</button>
      </div>

      <div className="chat-list" ref={listRef}>
        {bubbles.map((b, i) => (
          <div key={i} className={`bubble ${b.mine ? 'mine' : 'theirs'}`}>{b.text}</div>
        ))}
      </div>

      <div className="quick-row">
        {QUICK.map((q) => (
          <button key={q} className="quick-btn" onClick={() => submit(q)}>{q}</button>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="メッセージを書く…"
        />
        <button className="send-btn" onClick={() => submit()}>送る</button>
      </div>
    </div>
  )
}

// ===== ダミー(bot)：ローカル保存＋定型の自動返信 =====
const greetingMessage = (person: Person): Message => ({ from: 'them', text: person.greeting, at: Date.now() })

function BotChat(
  { person, selfId, onSpeak, onClose }:
  { person: Person; selfId: string; onSpeak?: (id: string, text: string) => void; onClose: () => void },
) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const stored = loadMessages(person.id)
    return stored.length ? stored : [greetingMessage(person)]
  })

  useEffect(() => { saveMessages(person.id, messages) }, [person.id, messages])

  const onSend = (text: string) => {
    setMessages((m) => [...m, { from: 'me', text, at: Date.now() }])
    onSpeak?.(selfId, text) // 自分の頭上に吹き出し
    const themSoFar = messages.filter((x) => x.from === 'them').length
    const reply = person.replies[Math.max(0, themSoFar - 1) % person.replies.length]
    window.setTimeout(() => {
      setMessages((m) => [...m, { from: 'them', text: reply, at: Date.now() }])
      onSpeak?.(person.id, reply) // 相手(NPC)の頭上に吹き出し
    }, 700)
  }

  const onReset = () => {
    if (!window.confirm('このお話を消して、はじめからにしますか？')) return
    clearMessages(person.id)
    setMessages([greetingMessage(person)])
  }

  return (
    <ChatView
      face={person.face}
      name={person.name}
      bubbles={messages.map((m) => ({ mine: m.from === 'me', text: m.text }))}
      onSend={onSend}
      onClose={onClose}
      onReset={onReset}
    />
  )
}

// ===== 実ユーザー：サーバ経由のリアルタイム会話 =====
function UserChat(
  { name, face, selfId, messages, onSendUser, onClose }:
  { name: string; face: string; selfId: string; messages: ChatMessage[]; onSendUser: (text: string) => void; onClose: () => void },
) {
  return (
    <ChatView
      face={face}
      name={name}
      bubbles={messages.map((m) => ({ mine: m.fromId === selfId, text: m.text }))}
      onSend={onSendUser}
      onClose={onClose}
    />
  )
}

export interface ChatPanelProps {
  companion: Companion
  selfId: string
  onClose: () => void
  // 発言を頭上の吹き出しに表示するコールバック
  onSpeak?: (id: string, text: string) => void
  // 実ユーザー会話のときのみ使う
  messages?: ChatMessage[]
  onSendUser?: (text: string) => void
}

export default function ChatPanel({ companion, selfId, onClose, onSpeak, messages, onSendUser }: ChatPanelProps) {
  if (companion.kind === 'bot') {
    return <BotChat person={companion.person} selfId={selfId} onSpeak={onSpeak} onClose={onClose} />
  }
  return (
    <UserChat
      name={companion.user.name}
      face={companion.user.face}
      selfId={selfId}
      messages={messages ?? []}
      onSendUser={onSendUser ?? (() => {})}
      onClose={onClose}
    />
  )
}
