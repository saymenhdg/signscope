import type { GuidePoint } from '../../lib/types'
import { cn } from '../../lib/utils'

type HandGuideOverlayProps = {
  label: string
  points: GuidePoint[]
  connections: Array<[number, number]>
  highlighted?: boolean
  className?: string
}

const PALM_INDICES = [0, 1, 5, 9, 13, 17]

export function HandGuideOverlay({
  label,
  points,
  connections,
  highlighted = false,
  className,
}: HandGuideOverlayProps) {
  const strokeColor = highlighted ? '#62fae3' : '#bdc2ff'
  const glowColor = highlighted ? 'rgba(98, 250, 227, 0.28)' : 'rgba(189, 194, 255, 0.18)'
  const palmPath = PALM_INDICES.map((index) => `${points[index]?.x ?? 0.5},${points[index]?.y ?? 0.5}`).join(' ')

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center',
        className,
      )}
    >
      <div className="relative aspect-square w-[68%] max-w-[26rem] rounded-[36px] border border-white/10 bg-[#131b2e]/18 shadow-[0_40px_120px_rgba(8,20,40,0.55)] backdrop-blur-[2px]">
        <div
          className="absolute inset-5 rounded-[28px] border border-dashed border-white/12"
          style={{ boxShadow: `0 0 70px ${glowColor}` }}
        />
        <svg viewBox="0 0 1 1" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <filter id={`guide-glow-${label}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="0.02" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <polygon
            points={palmPath}
            fill={highlighted ? 'rgba(98, 250, 227, 0.18)' : 'rgba(189, 194, 255, 0.12)'}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.008"
          />

          {connections.map(([start, end]) => (
            <line
              key={`${start}-${end}`}
              x1={points[start]?.x ?? 0.5}
              y1={points[start]?.y ?? 0.5}
              x2={points[end]?.x ?? 0.5}
              y2={points[end]?.y ?? 0.5}
              stroke={strokeColor}
              strokeWidth={highlighted ? 0.028 : 0.022}
              strokeLinecap="round"
              filter={`url(#guide-glow-${label})`}
            />
          ))}

          {points.map((point, index) => (
            <circle
              key={`${label}-${index}`}
              cx={point.x}
              cy={point.y}
              r={index === 0 ? 0.03 : 0.02}
              fill={index === 0 ? '#44e2cd' : strokeColor}
              opacity={index === 0 ? 0.95 : 0.88}
            />
          ))}
        </svg>

        <div className="absolute inset-x-0 bottom-6 text-center">
          <span className="font-headline text-7xl font-extrabold tracking-[0.2em] text-white/7">{label}</span>
        </div>
      </div>
    </div>
  )
}
