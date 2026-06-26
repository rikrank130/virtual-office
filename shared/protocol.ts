// クライアント / サーバ 共通の WebSocket メッセージ定義。
// フロント(src)とサーバ(server)の両方から import される。

export interface UserPublic {
  id: string
  name: string
  face: string
  x: number
  y: number
}

export interface ChatMessage {
  id: string
  fromId: string
  toId: string
  text: string
  at: number
}

// ===== クライアント → サーバ =====
export type ClientMessage =
  | { type: 'join'; id: string; name: string; face: string; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'chat'; toId: string; text: string }
  | { type: 'history'; withId: string }

// ===== サーバ → クライアント =====
export type ServerMessage =
  | { type: 'welcome'; selfId: string; users: UserPublic[] }
  | { type: 'joined'; user: UserPublic }
  | { type: 'left'; id: string }
  | { type: 'moved'; id: string; x: number; y: number }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'history'; withId: string; messages: ChatMessage[] }

export const WS_PATH = '/ws'
export const WS_PORT = 8787

// 2者間の会話を一意に識別するキー（順不同）
export const conversationKey = (a: string, b: string): string =>
  [a, b].sort().join('|')
