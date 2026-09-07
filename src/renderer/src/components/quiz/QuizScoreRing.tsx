interface QuizScoreRingProps {
  score: number // 0..10
  size?: number
}

// Mau theo muc diem - dung token nen chay ca 2 theme.
function toneColor(score: number): string {
  if (score >= 8) return 'var(--success)'
  if (score >= 5) return 'var(--warning-text)'
  return 'var(--danger)'
}

function QuizScoreRing({ score, size = 132 }: QuizScoreRingProps): React.JSX.Element {
  const stroke = Math.max(6, Math.round(size * 0.09))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, score / 10))
  const color = toneColor(score)

  return (
    <div className="lms-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="lms-score-ring-label">
        <span className="lms-score-ring-value" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="lms-score-ring-scale">/10</span>
      </div>
    </div>
  )
}

export default QuizScoreRing
