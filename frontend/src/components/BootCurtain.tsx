import { useState } from 'react'

/**
 * §8 BOOT / SEED — a sheet of paper over the hero until the first catalogue is
 * on the shelf, then lifted away with a clip (not a fade).
 */
export function BootCurtain({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <div
      className={ready ? 'boot is-lifting' : 'boot'}
      aria-hidden={ready}
      onAnimationEnd={(e) => {
        if (ready && e.target === e.currentTarget) setGone(true)
      }}
    >
      <div>
        <div className="label">Bibliotheca Obscura</div>
        <div className="label" style={{ color: 'var(--muted)', marginTop: 6 }}>
          Opening the Archive
        </div>
        <div className="boot-rule" />
      </div>
    </div>
  )
}
