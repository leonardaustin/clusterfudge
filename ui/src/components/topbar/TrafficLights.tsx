import { useState } from 'react'
import { Quit, WindowMinimise, WindowToggleFullscreen } from '@/wailsjs/runtime/runtime'
import { useOS } from '@/hooks/useOS'

export function TrafficLights() {
  const isMac = useOS() === 'mac'
  const [hovered, setHovered] = useState(false)

  if (!isMac) return null

  const buttons = [
    { color: '#FF5F57', onClick: Quit, label: 'Close', icon: (
      <>
        <line x1="3.5" y1="3.5" x2="7.5" y2="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="7.5" y1="3.5" x2="3.5" y2="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )},
    { color: '#FEBC2E', onClick: WindowMinimise, label: 'Minimise', icon: (
      <line x1="3" y1="5.5" x2="9" y2="5.5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />
    )},
    { color: '#28C840', onClick: WindowToggleFullscreen, label: 'Fullscreen', icon: (
      <>
        <polygon points="3,2.5 7,2.5 3,6.5" fill="rgba(0,0,0,0.5)" />
        <polygon points="9,8.5 5,8.5 9,4.5" fill="rgba(0,0,0,0.5)" />
      </>
    )},
  ]

  return (
    <div
      className="flex items-center gap-2 px-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ['--wails-draggable' as string]: 'no-drag' }}
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.onClick}
          className="w-2.5 h-2.5 rounded-full border-0 p-0 cursor-default"
          style={{ backgroundColor: btn.color }}
          aria-label={btn.label}
        >
          {hovered && (
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">{btn.icon}</svg>
          )}
        </button>
      ))}
    </div>
  )
}
