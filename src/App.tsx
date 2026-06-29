import { useEffect, useRef, useState } from 'react'
import { WORLD, ZONES, PEOPLE, FACES, TALK_DISTANCE } from './data'
import type { Me, Person, Vec } from './data'
import type { UserPublic, ChatMessage } from '../shared/protocol'
import type { Companion } from './companion'
import { connect, type Net } from './net'
import { getClientId } from './clientId'
import EntryScreen from './EntryScreen'
import ChatPanel from './ChatPanel'

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
const pct = (v: number, total: number): string => `${(v / total) * 100}%`
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

const place = (el: HTMLElement | null, x: number, y: number): void => {
  if (!el) return
  el.style.left = pct(x, WORLD.w)
  el.style.top = pct(y, WORLD.h)
}

// 操作の閾値
const DRAG_THRESHOLD = 12
const JOY_RADIUS = 56
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_DIST = 50

interface DragState {
  id: number | null
  downX: number
  downY: number
  downT: number
  moved: boolean
  active: boolean
}

interface Joystick {
  baseX: number
  baseY: number
}

// 他ユーザーの位置（ネットワーク値 tx,ty に向けて x,y を補間する）
type RemotePos = UserPublic & { tx: number; ty: number }

const companionName = (c: Companion): string =>
  c.kind === 'bot' ? c.person.name : c.user.name
const companionId = (c: Companion): string =>
  c.kind === 'bot' ? c.person.id : c.user.id

export default function App() {
  const [selfId] = useState(getClientId)
  const [me, setMe] = useState<Me | null>(null)
  const [near, setNear] = useState<Companion | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [joystick, setJoystick] = useState<Joystick | null>(null)

  const [remotes, setRemotes] = useState<UserPublic[]>([])      // 在室中の他ユーザー（描画用）
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({}) // peerId -> 会話
  const [online, setOnline] = useState(false)                   // サーバ接続状態
  const [bubbles, setBubbles] = useState<Record<string, { text: string; seq: number }>>({}) // 発言の吹き出し

  // 位置などは ref で保持し、毎フレーム DOM を直接更新
  const posRef = useRef<Vec>({ x: WORLD.w / 2, y: WORLD.h / 2 })
  const targetRef = useRef<Vec>({ x: WORLD.w / 2, y: WORLD.h / 2 })
  const peopleRef = useRef<Person[]>(PEOPLE.map((p) => ({ ...p })))   // ダミー(bot)
  const wanderRef = useRef<Record<string, Vec>>({})
  const remotePosRef = useRef<Record<string, RemotePos>>({})         // 実ユーザー
  const keysRef = useRef<Record<string, boolean>>({})
  const joyVecRef = useRef<Vec>({ x: 0, y: 0 })
  const sentRef = useRef<Vec>({ x: -999, y: -999 }) // 最後にサーバへ送った位置
  const bubbleSeqRef = useRef(0)

  const dragRef = useRef<DragState>({ id: null, downX: 0, downY: 0, downT: 0, moved: false, active: false })
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 })

  const boardRef = useRef<HTMLDivElement>(null)
  const meElRef = useRef<HTMLDivElement>(null)
  const otherElsRef = useRef<Record<string, HTMLDivElement | null>>({})
  const joyKnobRef = useRef<HTMLDivElement>(null)
  const netRef = useRef<Net | null>(null)

  // アバターの上に発言を吹き出し表示（一定時間で自動的に消える）
  const speak = (id: string, text: string) => {
    const seq = ++bubbleSeqRef.current
    setBubbles((prev) => ({ ...prev, [id]: { text, seq } }))
    window.setTimeout(() => {
      setBubbles((prev) => {
        if (prev[id]?.seq !== seq) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 4500)
  }

  // ===== リアルタイム接続 =====
  useEffect(() => {
    if (!me) return
    const net = connect({
      onOpen: () => {
        setOnline(true)
        net.send({
          type: 'join', id: selfId, name: me.name, face: me.face,
          x: Math.round(posRef.current.x), y: Math.round(posRef.current.y),
        })
      },
      onClose: () => { setOnline(false); setRemotes([]); remotePosRef.current = {} },
      onMessage: (msg) => {
        switch (msg.type) {
          case 'welcome': {
            for (const u of msg.users) remotePosRef.current[u.id] = { ...u, tx: u.x, ty: u.y }
            setRemotes(msg.users)
            break
          }
          case 'joined': {
            remotePosRef.current[msg.user.id] = { ...msg.user, tx: msg.user.x, ty: msg.user.y }
            setRemotes((prev) => prev.some((u) => u.id === msg.user.id) ? prev : [...prev, msg.user])
            break
          }
          case 'left': {
            delete remotePosRef.current[msg.id]
            delete otherElsRef.current[msg.id]
            setRemotes((prev) => prev.filter((u) => u.id !== msg.id))
            break
          }
          case 'moved': {
            const u = remotePosRef.current[msg.id]
            if (u) { u.tx = msg.x; u.ty = msg.y }
            break
          }
          case 'chat': {
            const m = msg.message
            const peer = m.fromId === selfId ? m.toId : m.fromId
            setChats((prev) => ({ ...prev, [peer]: [...(prev[peer] ?? []), m] }))
            speak(m.fromId, m.text) // 発言者の頭上に吹き出し
            break
          }
          case 'history': {
            setChats((prev) => ({ ...prev, [msg.withId]: msg.messages }))
            break
          }
        }
      },
    })
    netRef.current = net
    return () => { net.close(); netRef.current = null }
  }, [me, selfId])

  // 矢印キー（PC）
  useEffect(() => {
    if (!me) return
    const KEYS: Record<string, boolean> = { ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true }
    const down = (e: KeyboardEvent) => { if (KEYS[e.key]) { e.preventDefault(); keysRef.current[e.key] = true } }
    const up = (e: KeyboardEvent) => { if (KEYS[e.key]) keysRef.current[e.key] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [me])

  // アニメーションループ
  useEffect(() => {
    if (!me) return
    place(meElRef.current, posRef.current.x, posRef.current.y)
    for (const person of peopleRef.current) place(otherElsRef.current[person.id], person.x, person.y)

    let raf = 0
    let nearKey: string | null = null
    let framesSinceSend = 0
    const step = () => {
      const p = posRef.current
      const joy = joyVecRef.current
      const joyMag = Math.hypot(joy.x, joy.y)
      const k = keysRef.current
      const kx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0)
      const ky = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0)

      if (joyMag > 0.15) {
        const SPEED = 8
        const sp = SPEED * Math.min(1, joyMag * 1.25)
        p.x = clamp(p.x + (joy.x / joyMag) * sp, 30, WORLD.w - 30)
        p.y = clamp(p.y + (joy.y / joyMag) * sp, 30, WORLD.h - 30)
        targetRef.current = { x: p.x, y: p.y }
        place(meElRef.current, p.x, p.y)
      } else if (kx || ky) {
        const SPEED = 7
        const len = Math.hypot(kx, ky)
        p.x = clamp(p.x + (kx / len) * SPEED, 30, WORLD.w - 30)
        p.y = clamp(p.y + (ky / len) * SPEED, 30, WORLD.h - 30)
        targetRef.current = { x: p.x, y: p.y }
        place(meElRef.current, p.x, p.y)
      } else {
        const t = targetRef.current
        const d = dist(p, t)
        if (d > 1) {
          const speed = Math.min(d, 7)
          p.x += ((t.x - p.x) / d) * speed
          p.y += ((t.y - p.y) / d) * speed
          place(meElRef.current, p.x, p.y)
        }
      }

      // ダミー(bot)の散歩
      for (const person of peopleRef.current) {
        if (!person.move) continue
        let target = wanderRef.current[person.id]
        if (!target || dist(person, target) < 8) {
          const zone = ZONES.find((z) => z.id === person.zone)!
          target = {
            x: zone.x + 60 + Math.random() * (zone.w - 120),
            y: zone.y + 60 + Math.random() * (zone.h - 120),
          }
          wanderRef.current[person.id] = target
        }
        const dd = dist(person, target)
        const sp = Math.min(dd, 1.4)
        person.x += ((target.x - person.x) / dd) * sp
        person.y += ((target.y - person.y) / dd) * sp
        place(otherElsRef.current[person.id], person.x, person.y)
      }

      // 他ユーザーの位置をネットワーク値へ補間
      for (const id in remotePosRef.current) {
        const u = remotePosRef.current[id]
        const d = Math.hypot(u.tx - u.x, u.ty - u.y)
        if (d > 0.5) {
          const sp = Math.min(d, 12)
          u.x += ((u.tx - u.x) / d) * sp
          u.y += ((u.ty - u.y) / d) * sp
          place(otherElsRef.current[id], u.x, u.y)
        }
      }

      // 自分の移動をサーバへ送信（約4フレームごと・動いたときだけ）
      framesSinceSend += 1
      const net = netRef.current
      if (net && framesSinceSend >= 4) {
        if (Math.abs(p.x - sentRef.current.x) > 1.5 || Math.abs(p.y - sentRef.current.y) > 1.5) {
          net.send({ type: 'move', x: Math.round(p.x), y: Math.round(p.y) })
          sentRef.current = { x: p.x, y: p.y }
        }
        framesSinceSend = 0
      }

      // 近くの相手（bot ∪ 実ユーザー）を判定
      let bestKind: 'bot' | 'user' | null = null
      let bestId: string | null = null
      let bestD = TALK_DISTANCE
      for (const person of peopleRef.current) {
        const dd = dist(p, person)
        if (dd < bestD) { bestD = dd; bestKind = 'bot'; bestId = person.id }
      }
      for (const id in remotePosRef.current) {
        const dd = dist(p, remotePosRef.current[id])
        if (dd < bestD) { bestD = dd; bestKind = 'user'; bestId = id }
      }
      const key = bestId ? `${bestKind}:${bestId}` : null
      if (key !== nearKey) {
        nearKey = key
        if (!bestId) setNear(null)
        else if (bestKind === 'bot') {
          const person = peopleRef.current.find((pp) => pp.id === bestId)
          setNear(person ? { kind: 'bot', person } : null)
        } else {
          const u = remotePosRef.current[bestId]
          setNear(u ? { kind: 'user', user: u } : null)
        }
      }

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [me])

  // 近接の強調表示（bot・実ユーザー両方）
  useEffect(() => {
    const nearId = near ? companionId(near) : null
    for (const id in otherElsRef.current) {
      otherElsRef.current[id]?.classList.toggle('is-near', id === nearId)
    }
  }, [near, remotes])

  // 近づいたら自動で開き、離れたら閉じる
  useEffect(() => { setChatOpen(!!near) }, [near])

  // 実ユーザーに近づいたら会話履歴をサーバへ要求
  useEffect(() => {
    if (near?.kind === 'user') netRef.current?.send({ type: 'history', withId: near.user.id })
  }, [near])

  const moveToScreenPoint = (clientX: number, clientY: number) => {
    if (!boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * WORLD.w
    const y = ((clientY - rect.top) / rect.height) * WORLD.h
    targetRef.current = { x: clamp(x, 30, WORLD.w - 30), y: clamp(y, 30, WORLD.h - 30) }
  }

  // ===== 指/マウス操作 =====
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (showIntro) setShowIntro(false)
    const d = dragRef.current
    d.id = e.pointerId
    d.downX = e.clientX; d.downY = e.clientY; d.downT = e.timeStamp
    d.moved = false; d.active = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (d.id !== e.pointerId) return
    const dx = e.clientX - d.downX
    const dy = e.clientY - d.downY
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true; d.active = true
      setJoystick({ baseX: d.downX, baseY: d.downY })
    }
    if (d.active) {
      const len = Math.hypot(dx, dy)
      const reach = Math.min(len, JOY_RADIUS)
      const ux = len ? dx / len : 0
      const uy = len ? dy / len : 0
      joyVecRef.current = { x: ux * (reach / JOY_RADIUS), y: uy * (reach / JOY_RADIUS) }
      if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (d.id !== e.pointerId) return
    if (d.active) {
      joyVecRef.current = { x: 0, y: 0 }
      setJoystick(null)
    } else if (e.timeStamp - d.downT < 500) {
      const now = e.timeStamp
      const last = lastTapRef.current
      if (now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_DIST) {
        moveToScreenPoint(e.clientX, e.clientY)
        lastTapRef.current = { t: 0, x: 0, y: 0 }
      } else {
        lastTapRef.current = { t: now, x: e.clientX, y: e.clientY }
      }
    }
    d.id = null; d.active = false; d.moved = false
  }

  if (!me) return <EntryScreen faces={FACES} onEnter={setMe} />

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">🏡 みんなのひろば</div>
        <div className="topbar-right">
          <span className={`online-chip ${online ? '' : 'offline'}`}>
            {online ? `🟢 ${remotes.length + 1}人` : '🔴 接続中…'}
          </span>
          <span className="me-chip">{me.face} {me.name}</span>
          <button className="help-btn" onClick={() => setShowHelp(true)}>つかい方</button>
        </div>
      </header>

      <div className="board-wrap">
        <div
          className="board"
          ref={boardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {ZONES.map((z) => (
            <div key={z.id} className="zone" style={{
              left: pct(z.x, WORLD.w), top: pct(z.y, WORLD.h),
              width: pct(z.w, WORLD.w), height: pct(z.h, WORLD.h),
              background: z.color,
            }}>
              <span className="zone-label">{z.emoji} {z.label}</span>
            </div>
          ))}

          <div className="fountain" style={{ left: pct(WORLD.w / 2, WORLD.w), top: pct(WORLD.h / 2, WORLD.h) }}>⛲</div>

          {/* ダミー(bot)＝NPC。色と「NPC」バッジで実ユーザーと区別 */}
          {peopleRef.current.map((person) => (
            <div key={person.id} className="avatar other bot"
              ref={(el) => { otherElsRef.current[person.id] = el }}>
              {bubbles[person.id] && <div className="speech-bubble">{bubbles[person.id].text}</div>}
              <span className="npc-badge">NPC</span>
              <div className="talk-hint" aria-hidden="true">💬</div>
              <div className="avatar-face">{person.face}</div>
              <div className="avatar-name">{person.name}</div>
            </div>
          ))}

          {/* 実ユーザー */}
          {remotes.map((u) => (
            <div key={u.id} className="avatar other user"
              ref={(el) => { otherElsRef.current[u.id] = el; const rp = remotePosRef.current[u.id]; if (el && rp) place(el, rp.x, rp.y) }}>
              {bubbles[u.id] && <div className="speech-bubble">{bubbles[u.id].text}</div>}
              <div className="talk-hint" aria-hidden="true">💬</div>
              <div className="avatar-face">{u.face}</div>
              <div className="avatar-name">{u.name}</div>
            </div>
          ))}

          {/* 自分 */}
          <div className="avatar me" ref={meElRef}>
            {bubbles[selfId] && <div className="speech-bubble">{bubbles[selfId].text}</div>}
            <div className="avatar-face">{me.face}</div>
            <div className="avatar-name">あなた</div>
          </div>

          {showIntro && (
            <div className="intro">
              <div className="intro-gesture">
                <div className="intro-icon">👆</div>
                <div className="intro-text">ホールドして<br /><b>ドラッグで移動</b></div>
              </div>
              <div className="intro-or">または</div>
              <div className="intro-gesture">
                <div className="intro-icon tap">👆</div>
                <div className="intro-text"><b>2回タップ</b>でその場所へ</div>
              </div>
            </div>
          )}
        </div>

        {joystick && (
          <div className="joystick" style={{ left: joystick.baseX, top: joystick.baseY }}>
            <div className="joystick-knob" ref={joyKnobRef} />
          </div>
        )}
      </div>

      {near && chatOpen && (
        <ChatPanel
          key={companionId(near)}
          companion={near}
          selfId={selfId}
          messages={near.kind === 'user' ? (chats[near.user.id] ?? []) : undefined}
          onSendUser={near.kind === 'user'
            ? (text) => netRef.current?.send({ type: 'chat', toId: near.user.id, text })
            : undefined}
          onSpeak={speak}
          onClose={() => setChatOpen(false)}
        />
      )}

      {near && !chatOpen && (
        <button className="talk-cta" onClick={() => setChatOpen(true)}>
          💬 {companionName(near)} と話す
        </button>
      )}

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h2>つかい方</h2>
            <ul>
              <li>👆 画面を <b>ドラッグ</b> すると、その向きに歩きます。</li>
              <li>👆👆 行きたい場所を <b>2回タップ</b> でもOK。</li>
              <li>⌨️ パソコンは <b>やじるしキー</b> でも歩けます。</li>
              <li>💬 だれかに <b>近づく</b> と、お話のまどが出ます。</li>
              <li>🟢 右上は <b>いま広場にいる人数</b> です。</li>
            </ul>
            <button className="big-btn" onClick={() => setShowHelp(false)}>とじる</button>
          </div>
        </div>
      )}
    </div>
  )
}
