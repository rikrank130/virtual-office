// ビルド済みフロント（dist/）を配信する依存ゼロの静的サーバ。
// 本番は Node 1プロセスで「画面配信＋WebSocket」を同一ポートで提供する。
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

export const distExists = (): boolean => existsSync(join(DIST, 'index.html'))

export function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  let filePath = normalize(join(DIST, urlPath))

  // ディレクトリ抜け出し対策
  if (!filePath.startsWith(DIST)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  // 見つからない/ディレクトリ → SPA フォールバックで index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html')
  }
  if (!existsSync(filePath)) {
    res.statusCode = 404
    res.end('Not found（先に npm run build を実行してください）')
    return
  }

  res.setHeader('Content-Type', TYPES[extname(filePath)] ?? 'application/octet-stream')
  createReadStream(filePath).pipe(res)
}
