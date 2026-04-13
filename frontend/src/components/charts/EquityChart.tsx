import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { EquityPoint } from '../../types'
import { STRATEGY_COLORS_HEX } from '../../lib/mockData'

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null

  const fmt = (v: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(v)

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{label}</div>
      {payload.map((entry, i) => (
        <div className="chart-tooltip-row" key={i}>
          <div className="chart-tooltip-dot" style={{ background: entry.color }} />
          {payload.length > 1 && (
            <span className="chart-tooltip-label">{entry.name}</span>
          )}
          <span className="chart-tooltip-value">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Single Equity Area Chart ─────────────────────────────────────────────────
interface EquityAreaChartProps {
  data: EquityPoint[]
  height?: number
  color?: string
  showGrid?: boolean
  initialCapital?: number
}

export function EquityAreaChart({
  data,
  height = 260,
  color = '#E8A837',
  showGrid = true,
  initialCapital,
}: EquityAreaChartProps) {
  const gradId = `grad-${color.replace('#', '')}`

  // Sample data to ~60 points for performance
  const sample = data.length > 60
    ? data.filter((_, i) => i % Math.floor(data.length / 60) === 0)
    : data

  const yMin = Math.min(...sample.map(d => d.value)) * 0.97
  const yMax = Math.max(...sample.map(d => d.value)) * 1.02

  const fmt = (v: number) =>
    new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sample} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
          )}

          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d: string) => d.slice(5)} // MM-DD
            interval="preserveStartEnd"
          />

          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={52}
          />

          <Tooltip content={<CustomTooltip />} />

          {initialCapital && (
            <ReferenceLine
              y={initialCapital}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="4 4"
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Multi-Strategy Comparison Chart ─────────────────────────────────────────
interface ComparisonDataPoint {
  date: string
  [key: string]: number | string
}

interface ComparisonChartProps {
  runs: Array<{ name: string; equity_curve: EquityPoint[] }>
  height?: number
  colors?: string[]
}

export function ComparisonChart({ runs, height = 340, colors }: ComparisonChartProps) {
  if (!runs.length) return null

  // Merge all equity curves on the same date axis
  const dateSet = new Set<string>()
  runs.forEach(r => r.equity_curve.forEach(p => dateSet.add(p.date)))
  const dates = Array.from(dateSet).sort()

  // Sample ~80 dates
  const sampledDates = dates.length > 80
    ? dates.filter((_, i) => i % Math.floor(dates.length / 80) === 0)
    : dates

  const merged: ComparisonDataPoint[] = sampledDates.map(date => {
    const point: ComparisonDataPoint = { date }
    runs.forEach(r => {
      const match = r.equity_curve.find(p => p.date === date)
      if (match) point[r.name] = match.value
    })
    return point
  })

  const fmt = (v: number) =>
    new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d: string) => d.slice(5)}
            interval="preserveStartEnd"
          />

          <YAxis
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={56}
          />

          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            y={1_000_000}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="4 4"
          />

          {runs.map((run, i) => {
            const colorArr = colors ?? STRATEGY_COLORS_HEX
            const stroke = colorArr[i % colorArr.length]
            return (
              <Line
                key={run.name}
                type="monotone"
                dataKey={run.name}
                name={run.name}
                stroke={stroke}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
interface SparklineProps {
  data: EquityPoint[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 120, height = 36, color = '#E8A837' }: SparklineProps) {
  const sample = data.slice(-30)
  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={sample} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill="url(#spark-grad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
