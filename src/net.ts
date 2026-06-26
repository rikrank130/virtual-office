// フロント側の WebSocket クライアント。自動再接続つき。
// 同一オリジンの wss://<host>/ws へつなぎ、Vite が裏のサーバへ中継する。
import { WS_PATH, type ClientMessage, type ServerMessage } from '../shared/protocol'

export interface NetHandlers {
  onMessage: (msg: ServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
}

export interface Net {
  send: (msg: ClientMessage) => void
  close: () => void
}

export function connect(handlers: NetHandlers): Net {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`
  let ws: WebSocket | null = null
  let disposed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const open = () => {
    ws = new WebSocket(url)
    ws.onopen = () => handlers.onOpen?.()
    ws.onmessage = (e) => {
      try {
        handlers.onMessage(JSON.parse(e.data as string) as ServerMessage)
      } catch {
        /* 不正なメッセージは無視 */
      }
    }
    ws.onclose = () => {
      handlers.onClose?.()
      if (!disposed && !retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; open() }, 1000)
      }
    }
    ws.onerror = () => ws?.close()
  }

  open()

  return {
    send: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    },
    close: () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    },
  }
}
