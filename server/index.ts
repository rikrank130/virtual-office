// みんなのひろば リアルタイムサーバ
// - WebSocket で在室者(presence)と移動を同期
// - 1対1チャットを中継し、JSONファイルに保存
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  WS_PORT,
  WS_PATH,
  type ClientMessage,
  type ServerMessage,
  type UserPublic,
} from '../shared/protocol'
import { initStore, appendMessage, getHistory } from './store'
import { serveStatic, distExists } from './static'

initStore()

// ポートは環境変数で上書き可能（本番は PORT=80 等）。既定は dev と揃えて 8787。
const PORT = Number(process.env.PORT) || WS_PORT

interface Client {
  id: string
  user: UserPublic
  socket: WebSocket
}

// id（クライアント永続ID）ごとに 1 接続。再接続時は古い方を置き換える。
const clients = new Map<string, Client>()

const send = (socket: WebSocket, msg: ServerMessage): void => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
}

const broadcastExcept = (exceptId: string, msg: ServerMessage): void => {
  for (const c of clients.values()) {
    if (c.id !== exceptId) send(c.socket, msg)
  }
}

// HTTP サーバ：ビルド済みフロント(dist/)を配信。
// 同じサーバに WebSocket(WS_PATH) を相乗りさせ、1ポートで提供する。
const httpServer = createServer((req, res) => serveStatic(req, res))
const wss = new WebSocketServer({ server: httpServer, path: WS_PATH })

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[server] ポート ${PORT} は既に使用中です。\n` +
      `  既に起動済みのサーバがあるかもしれません。停止するには:\n` +
      `    pkill -f "server/index.ts"\n` +
      `  そのうえで再度起動してください。\n`,
    )
    process.exit(1)
  }
  console.error('[server] エラー:', err)
})

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}  (WebSocket: ${WS_PATH})`)
  if (!distExists()) {
    console.log('[server] 注意: dist/ が見つかりません。本番配信には先に `npm run build` が必要です（開発中は Vite 5173 を使うのでOK）。')
  }
})

wss.on('connection', (socket) => {
  let selfId: string | null = null

  socket.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      return // 不正なメッセージは無視
    }

    switch (msg.type) {
      case 'join': {
        selfId = msg.id
        // 同一IDの既存接続があれば閉じる（多重ログイン防止）
        const existing = clients.get(selfId)
        if (existing && existing.socket !== socket) {
          try { existing.socket.close() } catch { /* noop */ }
        }
        const user: UserPublic = {
          id: selfId,
          name: msg.name,
          face: msg.face,
          x: msg.x,
          y: msg.y,
        }
        clients.set(selfId, { id: selfId, user, socket })

        // 本人へ：自分のID＋現在の在室者一覧（自分以外）
        const others = [...clients.values()]
          .filter((c) => c.id !== selfId)
          .map((c) => c.user)
        send(socket, { type: 'welcome', selfId, users: others })
        // 他の人へ：参加通知
        broadcastExcept(selfId, { type: 'joined', user })
        break
      }

      case 'move': {
        if (!selfId) break
        const c = clients.get(selfId)
        if (!c) break
        c.user.x = msg.x
        c.user.y = msg.y
        broadcastExcept(selfId, { type: 'moved', id: selfId, x: msg.x, y: msg.y })
        break
      }

      case 'chat': {
        if (!selfId) break
        const text = msg.text.trim()
        if (!text) break
        const message = {
          id: randomUUID(),
          fromId: selfId,
          toId: msg.toId,
          text,
          at: Date.now(),
        }
        appendMessage(message)
        // 送信者と相手の双方へ届ける（相手がオフラインでも保存はされる）
        send(socket, { type: 'chat', message })
        const peer = clients.get(msg.toId)
        if (peer) send(peer.socket, { type: 'chat', message })
        break
      }

      case 'history': {
        if (!selfId) break
        const messages = getHistory(selfId, msg.withId)
        send(socket, { type: 'history', withId: msg.withId, messages })
        break
      }
    }
  })

  const handleClose = () => {
    if (!selfId) return
    // 自分の接続が現役の場合のみ退室扱い（再接続で置き換わっていれば何もしない）
    const c = clients.get(selfId)
    if (c && c.socket === socket) {
      clients.delete(selfId)
      broadcastExcept(selfId, { type: 'left', id: selfId })
    }
  }

  socket.on('close', handleClose)
  socket.on('error', handleClose)
})
