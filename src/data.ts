// ===== 型定義 =====
export interface Vec {
  x: number
  y: number
}

/** 入室した自分のプロフィール */
export interface Me {
  name: string
  face: string
}

/** 話題ごとの「場所」 */
export interface Zone {
  id: string
  label: string
  emoji: string
  x: number
  y: number
  w: number
  h: number
  color: string
}

/** ダミーのご近所さん */
export interface Person {
  id: string
  name: string
  face: string
  x: number
  y: number
  zone: string
  greeting: string
  replies: string[]
  /** true ならゾーン内をゆっくり歩く */
  move?: boolean
}

// ===== データ =====

// 仮想空間のサイズ（仮想座標）。画面表示はこの比率(3:2)を保ってスケールする。
export const WORLD = { w: 1200, h: 800 } as const

// 近づいたと判定する距離（仮想座標）。これより近いと会話パネルが開く。
export const TALK_DISTANCE = 180

// 話題ごとの「場所」。x,y,w,h は仮想座標。
export const ZONES: Zone[] = [
  { id: 'tea',    label: 'お茶の間',   emoji: '🍵', x: 60,  y: 70,  w: 480, h: 300, color: '#fce8d5' },
  { id: 'game',   label: '囲碁・将棋', emoji: '♟️', x: 660, y: 70,  w: 480, h: 300, color: '#d9ead3' },
  { id: 'taisou', label: '健康体操',   emoji: '🤸', x: 60,  y: 440, w: 480, h: 300, color: '#d0e6f5' },
  { id: 'photo',  label: '写真じまん', emoji: '📷', x: 660, y: 440, w: 480, h: 300, color: '#f4d9e6' },
]

// ダミーのご近所さんたち。move:true の人はゾーン内をゆっくり歩く。
export const PEOPLE: Person[] = [
  { id: 'p1', name: 'はなこ さん', face: '👵', x: 200, y: 200, zone: 'tea', move: true,
    greeting: 'あら、こんにちは。よく来てくれたわね。',
    replies: ['今日はいいお天気ね。', 'お茶でもいかが？', 'また話しましょうね。'] },
  { id: 'p2', name: 'たけし さん', face: '👴', x: 380, y: 280, zone: 'tea', move: false,
    greeting: 'やあ、はじめましてかな？',
    replies: ['ゆっくりしていってください。', '昔の話でもしますか。', 'はっはっは、それはいい。'] },
  { id: 'p3', name: 'しげる さん', face: '🧓', x: 820, y: 180, zone: 'game', move: false,
    greeting: '一局どうですか？将棋なら相手しますよ。',
    replies: ['ふむ、なかなかの手ですな。', '次はこちらの番ですね。', 'いい勝負でした。'] },
  { id: 'p4', name: 'みえ さん', face: '👵', x: 200, y: 560, zone: 'taisou', move: true,
    greeting: 'いっしょに体操しませんか？',
    replies: ['深呼吸をしましょう。', '無理は禁物ですよ。', '体を動かすと気持ちいいわね。'] },
  { id: 'p5', name: 'かずお さん', face: '👴', x: 900, y: 580, zone: 'photo', move: false,
    greeting: 'この前の旅行の写真、見てくれますか？',
    replies: ['きれいな景色だったんですよ。', 'カメラが趣味でしてね。', 'また撮りに行きたいなあ。'] },
]

// 入室時に選べるアバターの顔。
export const FACES: string[] = ['🧓', '👵', '👴', '🙂', '😊', '🤗']
