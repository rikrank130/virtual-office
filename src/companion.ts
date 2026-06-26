import type { Person } from './data'
import type { UserPublic } from '../shared/protocol'

// 会話できる相手。ダミー(bot)＝ローカル、実ユーザー(user)＝サーバ経由。
export type Companion =
  | { kind: 'bot'; person: Person }
  | { kind: 'user'; user: UserPublic }

export const companionKey = (c: Companion): string =>
  c.kind === 'bot' ? `bot:${c.person.id}` : `user:${c.user.id}`
