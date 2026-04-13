import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ComparisonChart, Sparkline } from '../components/charts/EquityChart'
import {
  PORTFOLIO_COLORS, PORTFOLIO_COLOR_FALLBACK,
  formatJPY, formatPct, formatChange,
} from '../lib/mockData'
import {
  getPortfolioComparison, getTrades, refreshPortfolio, runSession,
  type PortfolioSummaryApi, type TradeOut, type Session,
} from '../lib/api'

// ─── Icons ──────────────────────────────────────────────────────────────────
function ArrowUp() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9V3M3 6l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ArrowDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3v6M3 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getPortfolioColor(p: PortfolioSummaryApi, idx: number): string {
  if (p.strategy_name && PORTFOLIO_COLORS[p.strategy_name]) return PORTFOLIO_COLORS[p.strategy_name]
  if (p.portfolio_type === 'user') return PORTFOLIO_COLORS['user']
  return PORTFOLIO_COLOR_FALLBACK[idx % PORTFOLIO_COLOR_FALLBACK.length]
}

function LegendDot({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
      boxShadow: `0 0 6px ${color}80`,
    }} />
  )
}

function ReturnBadge({ pct }: { pct: number }) {
  return (
    <span className={`pnl-pill ${pct >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 11 }}>
      {pct >= 0 ? <ArrowUp /> : <ArrowDown />}
      {formatPct(pct)}
    </span>
  )
}

// ─── Market status ───────────────────────────────────────────────────────────

type Market = 'TSE' | 'US'

interface MarketStatus {
  isOpen: boolean
  localTime: string
  hours: string
}

function getMarketStatus(market: Market): MarketStatus {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 6=Sat

  if (market === 'TSE') {
    // JST = UTC+9
    const jstH = (now.getUTCHours() + 9) % 24
    const jstM = now.getUTCMinutes()
    const jstTotal = jstH * 60 + jstM
    const hhmm = `${String(jstH).padStart(2, '0')}:${String(jstM).padStart(2, '0')} JST`
    const isWeekday = day >= 1 && day <= 5
    const isOpen = isWeekday && (
      (jstTotal >= 9 * 60 && jstTotal < 11 * 60 + 30) ||
      (jstTotal >= 12 * 60 + 30 && jstTotal < 15 * 60 + 30)
    )
    return { isOpen, localTime: hhmm, hours: '09:00〜11:30 / 12:30〜15:30 JST' }
  } else {
    // EST = UTC-5  (DST未考慮・簡略化)
    const estH = ((now.getUTCHours() - 5) + 24) % 24
    const estM = now.getUTCMinutes()
    const estTotal = estH * 60 + estM
    const hhmm = `${String(estH).padStart(2, '0')}:${String(estM).padStart(2, '0')} EST`
    const isWeekday = day >= 1 && day <= 5
    const isOpen = isWeekday && estTotal >= 9 * 60 + 30 && estTotal < 16 * 60
    return { isOpen, localTime: hhmm, hours: '09:30〜16:00 EST' }
  }
}

// セッション名にマップ（バックエンドAPIはまだAM/PMを要求）
function marketToSession(market: Market): Session {
  return market === 'TSE' ? 'TSE_AM' : 'US_AM'
}

// ─── Run Session Panel ───────────────────────────────────────────────────────

const RUN_DURATION_SEC = 90

function RunSessionPanel({ onComplete }: { onComplete: () => void }) {
  const [market, setMarket] = useState<Market>('TSE')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tseStatus = getMarketStatus('TSE')
  const usStatus  = getMarketStatus('US')
  const currentStatus = market === 'TSE' ? tseStatus : usStatus

  const runMutation = useMutation({
    mutationFn: () => runSession(marketToSession(market)),
    onSuccess: () => {
      setProgress(1)
      setResult(null)
      const start = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000
        const pct = Math.min(99, (elapsed / RUN_DURATION_SEC) * 100)
        setProgress(pct)
        if (elapsed >= RUN_DURATION_SEC) {
          clearInterval(timerRef.current!)
          setProgress(100)
          setResult(`${market === 'TSE' ? '東証' : '米国'}戦略 完了`)
          onComplete()
        }
      }, 500)
    },
  })

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const isRunning = runMutation.isPending || (progress > 0 && progress < 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Market selector */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(['TSE', 'US'] as Market[]).map(m => {
          const st = m === 'TSE' ? tseStatus : usStatus
          const isSelected = market === m
          return (
            <button
              key={m}
              disabled={isRunning}
              onClick={() => setMarket(m)}
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isSelected ? (st.isOpen ? 'var(--positive)' : 'var(--gold)') : 'var(--border)'}`,
                background: isSelected
                  ? st.isOpen ? 'rgba(74,222,128,0.08)' : 'rgba(232,168,55,0.08)'
                  : 'transparent',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                minWidth: 160,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {m === 'TSE' ? '東証（TSE）' : '米国（US）'}
                </span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  padding: '1px 6px', borderRadius: 4,
                  background: st.isOpen ? 'rgba(74,222,128,0.15)' : 'rgba(148,163,184,0.12)',
                  color: st.isOpen ? 'var(--positive)' : 'var(--text-tertiary)',
                  border: `1px solid ${st.isOpen ? 'rgba(74,222,128,0.3)' : 'var(--border)'}`,
                }}>
                  {st.isOpen ? '開場中' : '閉場中'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                {st.localTime} &nbsp;·&nbsp; {st.hours}
              </div>
            </button>
          )
        })}
      </div>

      {/* Warning if market closed */}
      {!currentStatus.isOpen && !isRunning && !result && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(232,168,55,0.08)',
          border: '1px solid rgba(232,168,55,0.2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--gold)',
        }}>
          現在 {market === 'TSE' ? '東証' : '米国市場'} は閉場中です。
          最終終値を使ってシグナルを計算します。
        </div>
      )}

      {/* Execute button + progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          className="btn btn-primary"
          disabled={isRunning}
          onClick={() => { setProgress(0); setResult(null); runMutation.mutate() }}
          style={{ minWidth: 140 }}
        >
          {isRunning ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                border: '2px solid var(--gold)', borderTopColor: 'transparent',
                display: 'inline-block', animation: 'spin 0.8s linear infinite',
              }} />
              実行中…
            </span>
          ) : `${market === 'TSE' ? '東証' : '米国'}戦略を実行`}
        </button>

        {isRunning && (
          <div style={{ flex: 1, maxWidth: 260 }}>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, var(--gold), #F5A623)',
                width: `${progress}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              価格取得・シグナル計算中 ({Math.round(progress)}%)
            </div>
          </div>
        )}

        {result && !isRunning && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--positive)' }}>
            ✓ {result}
          </span>
        )}
        {runMutation.isError && !isRunning && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--negative)' }}>
            エラー: {(runMutation.error as Error).message}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Loading / Error skeleton ────────────────────────────────────────────────
function LoadingCard({ height = 200 }: { height?: number }) {
  return (
    <div className="card mb-20" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        読み込み中…
      </div>
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // ── Data fetching ──
  const { data: portfolios = [], isLoading, isError } = useQuery({
    queryKey: ['portfolios', 'comparison'],
    queryFn: getPortfolioComparison,
    refetchInterval: 60_000, // 1分ごとに自動更新
  })

  const userPortfolio = portfolios.find(p => p.portfolio_type === 'user') ?? portfolios[0]
  const displayPortfolio = selectedId != null
    ? (portfolios.find(p => p.id === selectedId) ?? userPortfolio)
    : userPortfolio

  const { data: recentTrades = [] } = useQuery({
    queryKey: ['trades', userPortfolio?.id],
    queryFn: () => getTrades({ portfolio_id: userPortfolio!.id }),
    enabled: !!userPortfolio,
  })

  const refreshMutation = useMutation({
    mutationFn: () => refreshPortfolio(userPortfolio!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  // ComparisonChart 用
  const comparisonRuns = useMemo(() =>
    portfolios.map(p => ({ name: p.name, equity_curve: p.equity_curve })),
    [portfolios]
  )
  const comparisonColors = useMemo(() =>
    portfolios.map((p, i) => getPortfolioColor(p, i)),
    [portfolios]
  )

  const totalAssets = portfolios.reduce((s, p) => s + p.total_value, 0)
  const totalCapital = portfolios.reduce((s, p) => s + p.initial_capital, 0)
  const totalReturnPct = totalCapital > 0 ? (totalAssets / totalCapital - 1) * 100 : 0

  const handleRunComplete = () => {
    qc.invalidateQueries({ queryKey: ['portfolios'] })
    qc.invalidateQueries({ queryKey: ['trades'] })
    qc.invalidateQueries({ queryKey: ['signal-report'] })
  }

  if (isLoading) return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div className="page-title">ポートフォリオ比較</div>
      </div>
      <LoadingCard height={280} />
      <LoadingCard height={200} />
    </div>
  )

  if (isError) return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">ポートフォリオ比較</div>
      </div>
      <div className="card" style={{ color: 'var(--negative)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 24 }}>
        APIへの接続に失敗しました。バックエンドサーバーが起動しているか確認してください。
      </div>
    </div>
  )

  return (
    <div className="page-container">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">ポートフォリオ比較</div>
          <div className="page-subtitle">
            {portfolios.length} ポートフォリオ &nbsp;·&nbsp;
            合計元本 {formatJPY(totalCapital)} &nbsp;·&nbsp;
            合計評価額&nbsp;
            <span className={totalReturnPct >= 0 ? 'positive' : 'negative'}>
              {formatJPY(totalAssets)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
            自動売買 10:00 / 14:00 JST
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || !userPortfolio}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M13.5 8A5.5 5.5 0 0 1 3.2 11.5M2.5 8A5.5 5.5 0 0 1 12.8 4.5" strokeLinecap="round" />
              <path d="M12 3l1.5 1.5L12 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 13l-1.5-1.5L4 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {refreshMutation.isPending ? '更新中…' : '価格更新'}
          </button>
        </div>
      </div>

      {/* ── Equity Curve Comparison ─────────────────────────────────── */}
      <div className="card mb-20 anim-fade-up anim-d1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div className="section-label">エクイティカーブ比較</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'flex-end' }}>
            {portfolios.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}>
                <LegendDot color={getPortfolioColor(p, i)} />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: p.id === selectedId ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
        {portfolios.length === 0 ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            取引データなし — 売買後にグラフが表示されます
          </div>
        ) : (
          <ComparisonChart runs={comparisonRuns} height={280} colors={comparisonColors} />
        )}
      </div>

      {/* ── Portfolio Comparison Table ──────────────────────────────── */}
      <div className="card mb-20 anim-fade-up anim-d2">
        <div className="section-label">ポートフォリオ比較</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>種別</th>
              <th className="text-right">総評価額</th>
              <th className="text-right">リターン</th>
              <th className="text-right">現金残高</th>
              <th className="text-right">現金比率</th>
              <th className="text-right">ポジション</th>
              <th style={{ width: 100 }}>推移</th>
            </tr>
          </thead>
          <tbody>
            {portfolios.map((p, i) => {
              const color = getPortfolioColor(p, i)
              const cashPct = p.total_value > 0 ? (p.cash_balance / p.total_value) * 100 : 100
              const isSelected = selectedId === p.id
              return (
                <tr key={p.id}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(232,168,55,0.05)' : undefined,
                    borderLeft: isSelected ? `2px solid ${color}` : '2px solid transparent',
                  }}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <LegendDot color={color} />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</span>
                    </div>
                  </td>
                  <td>
                    {p.portfolio_type === 'user' ? (
                      <span className="badge" style={{ background: 'rgba(232,168,55,0.15)', color: 'var(--gold)', border: '1px solid rgba(232,168,55,0.3)' }}>ユーザー</span>
                    ) : p.portfolio_type === 'theme' ? (
                      <span className="badge" style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' }}>テーマ</span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(90,163,245,0.12)', color: '#5AA3F5', border: '1px solid rgba(90,163,245,0.25)' }}>自動売買</span>
                    )}
                  </td>
                  <td className="mono text-right" style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
                    {formatJPY(p.total_value)}
                  </td>
                  <td className="text-right"><ReturnBadge pct={p.total_return_pct} /></td>
                  <td className="mono text-right faint">{formatJPY(p.cash_balance)}</td>
                  <td className="mono text-right faint">{cashPct.toFixed(1)}%</td>
                  <td className="mono text-right">{p.position_count}</td>
                  <td>
                    <Sparkline data={p.equity_curve} width={100} height={32} color={color} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          {portfolios.length > 1 && (
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td colSpan={2} style={{ color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', paddingTop: 10 }}>合計</td>
                <td className="mono text-right" style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color: 'var(--gold)', paddingTop: 10 }}>
                  {formatJPY(totalAssets)}
                </td>
                <td className="text-right" style={{ paddingTop: 10 }}><ReturnBadge pct={totalReturnPct} /></td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Manual Run Panel ───────────────────────────────────────── */}
      <div className="card mb-20 anim-fade-up anim-d1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="section-label">手動実行</div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
            対象市場の全戦略ポートフォリオを同時に実行
          </span>
        </div>
        <RunSessionPanel onComplete={handleRunComplete} />
      </div>

      {/* ── Selected Portfolio Detail ───────────────────────────────── */}
      {/* {displayPortfolio && (
        <div className="card-hero mb-20 anim-fade-up anim-d3">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            {displayPortfolio.name} — 詳細
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="portfolio-value"
                style={{ color: getPortfolioColor(displayPortfolio, portfolios.indexOf(displayPortfolio)) }}>
                {formatJPY(displayPortfolio.total_value)}
              </div>
              <div className={`portfolio-change ${displayPortfolio.total_return_pct >= 0 ? 'positive' : 'negative'}`}>
                {displayPortfolio.total_return_pct >= 0 ? <ArrowUp /> : <ArrowDown />}
                {formatPct(displayPortfolio.total_return_pct)}&nbsp;&nbsp;
                <span style={{ opacity: 0.7 }}>
                  {formatChange(displayPortfolio.total_value - displayPortfolio.initial_capital)} 円
                </span>
              </div>
              <div className="portfolio-meta">
                元本 {formatJPY(displayPortfolio.initial_capital)} &nbsp;·&nbsp;
                現金 <span style={{ color: 'var(--text-primary)' }}>{formatJPY(displayPortfolio.cash_balance)}</span> &nbsp;·&nbsp;
                ポジション <span style={{ color: 'var(--text-primary)' }}>{displayPortfolio.position_count}</span> 銘柄
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {portfolios.map((p, i) => (
                <button key={p.id}
                  className={`btn btn-sm ${(selectedId === p.id || (selectedId === null && p.id === userPortfolio?.id)) ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderColor: getPortfolioColor(p, i) }}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                >
                  {p.name.length > 9 ? p.name.slice(0, 9) + '…' : p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )} */}

      {/* ── User portfolio positions ────────────────────────────────── */}
      {/* {displayPortfolio?.portfolio_type === 'user' && (
        <div className="card mb-20 anim-fade-up anim-d4">
          <div className="section-label">保有ポジション</div>
          {(displayPortfolio.position_count === 0) ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              保有ポジションなし
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
              売買ページで注文後、ここにポジションが表示されます
            </div>
          )}
        </div>
      )} */}

      {/* ── Strategy portfolio notice ───────────────────────────────── */}
      {/* {displayPortfolio?.portfolio_type === 'strategy' && (
        <div className="card mb-20 anim-fade-up anim-d4" style={{ borderColor: 'rgba(90,163,245,0.2)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>
            <span style={{ color: '#5AA3F5', fontFamily: 'var(--font-mono)', fontSize: 11 }}>自動売買ポートフォリオ</span>
            <br />
            <span style={{ marginTop: 6, display: 'block' }}>
              毎日 10:00 / 14:00（JST・EST）に自動売買を実行します。取引履歴ページで約定を確認できます。
            </span>
          </div>
        </div>
      )} */}

      {/* ── Recent Trades ──────────────────────────────────────────── */}
      {/* <div className="card anim-fade-up anim-d5">
        <div className="section-label">
          最近の取引
          {userPortfolio && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>— {userPortfolio.name}</span>}
        </div>
        {recentTrades.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            取引履歴なし
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>銘柄</th>
                <th>売買</th>
                <th className="text-right">数量</th>
                <th className="text-right">約定価格</th>
                <th className="text-right">実現損益</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.slice(0, 8).map((t: TradeOut) => (
                <tr key={t.id}>
                  <td className="mono faint text-sm">
                    {new Date(t.executed_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', year: '2-digit' })}
                  </td>
                  <td>
                    <span className="mono" style={{ fontWeight: 500 }}>{t.symbol}</span>
                    <span className={`badge badge-${t.market.toLowerCase()}`} style={{ marginLeft: 6 }}>{t.market}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${t.side.toLowerCase()}`}>
                      {t.side === 'BUY' ? '買い' : '売り'}
                    </span>
                  </td>
                  <td className="mono text-right">{t.quantity}</td>
                  <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(t.price)}</td>
                  <td className={`mono text-right ${t.pnl === null ? 'faint' : t.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {t.pnl === null ? '—' : formatChange(t.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div> */}
    </div>
  )
}
