import { useState } from 'react'
import type { Me } from './data'

interface EntryScreenProps {
  faces: string[]
  onEnter: (me: Me) => void
}

export default function EntryScreen({ faces, onEnter }: EntryScreenProps) {
  const [name, setName] = useState('')
  const [face, setFace] = useState(faces[0])

  const canEnter = name.trim().length > 0

  return (
    <div className="entry">
      <div className="entry-card">
        <h1>🏡 みんなのひろば</h1>
        <p className="entry-lead">なまえを入れて、広場に入りましょう。</p>

        <label className="entry-label">① おなまえ</label>
        <input
          className="entry-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="れい：たろう"
          maxLength={12}
        />

        <label className="entry-label">② あなたの顔をえらぶ</label>
        <div className="face-picker">
          {faces.map((f) => (
            <button
              key={f}
              className={`face-option ${face === f ? 'selected' : ''}`}
              onClick={() => setFace(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          className="big-btn enter-btn"
          disabled={!canEnter}
          onClick={() => onEnter({ name: name.trim(), face })}
        >
          広場に入る
        </button>
      </div>
    </div>
  )
}
