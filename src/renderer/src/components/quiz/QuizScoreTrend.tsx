import { useRef, useState } from 'react'

interface TrendPoint {
  score: number
  submittedAt: string
}

interface QuizScoreTrendProps {
  points: TrendPoint[] // theo thu tu thoi gian: cu -> moi
}

const VB_W = 600
const VB_H = 170
const PAD = { top: 12, right: 14, bottom: 22, left: 30 }

function fmtDate(sqliteDatetime: string): string {
  const d = new Date(`${sqliteDatetime.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? sqliteDatetime : d.toLocaleDateString('vi-VN')
}

function QuizScoreTrend({ points }: QuizScoreTrendProps): React.JSX.Element | null {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) return null

  const plotW = VB_W - PAD.left - PAD.right
  const plotH = VB_H - PAD.top - PAD.bottom
  const x = (i: number): number => PAD.left + (plotW * i) / (points.length - 1)
  const y = (score: number): number => PAD.top + plotH * (1 - Math.max(0, Math.min(10, score)) / 10)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.score)}`).join(' ')
  const areaPath = `${linePath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`

  const best = points.reduce((m, p) => Math.max(m, p.score), 0)
  const last = points[points.length - 1].score

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = ((e.clientX - rect.left) / rect.width) * VB_W
    const i = Math.round(((relX - PAD.left) / plotW) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  return (
    <div
      className="lms-trend"
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Biểu đồ điểm qua ${points.length} lượt, gần nhất ${last.toFixed(1)}, cao nhất ${best.toFixed(1)}`}
      >
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(g) + 3} textAnchor="end" className="lms-trend-axis">
              {g}
            </text>
          </g>
        ))}
        <path d={areaPath} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.score)} r={hover === i ? 5 : 3} fill="var(--accent)" />
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--border)"
            strokeWidth={1}
          />
        )}
        <text x={x(0)} y={VB_H - 6} textAnchor="start" className="lms-trend-axis">
          {fmtDate(points[0].submittedAt)}
        </text>
        <text x={x(points.length - 1)} y={VB_H - 6} textAnchor="end" className="lms-trend-axis">
          {fmtDate(points[points.length - 1].submittedAt)}
        </text>
      </svg>
      {hover != null && (
        <div
          className="lms-trend-tooltip"
          style={{ left: `${(x(hover) / VB_W) * 100}%` }}
        >
          <strong>Điểm {points[hover].score.toFixed(1)}</strong>
          <span>{fmtDate(points[hover].submittedAt)}</span>
        </div>
      )}
    </div>
  )
}

export default QuizScoreTrend
