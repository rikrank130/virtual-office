import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { WS_PATH, WS_PORT } from './shared/protocol'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true, // LAN の他端末（スマホ実機）からアクセス可能に
    https: {}, // HTTPS 化（証明書は @vitejs/plugin-basic-ssl が用意）
    proxy: {
      // ブラウザは同一オリジンの wss://<host>/ws に接続し、
      // Vite が裏のリアルタイムサーバ(ws://localhost:8787)へ中継する。
      // → 証明書の二重管理や mixed-content を避けられる。
      [WS_PATH]: {
        target: `ws://localhost:${WS_PORT}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
