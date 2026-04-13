import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PORTFOLIO_COLORS, formatJPY, formatChange, formatPct } from '../lib/mockData'
import { getPortfolios, getTrades, type PortfolioOut, type PositionOut, type TradeOut } from '../lib/api'

// ─── Strategy meta ───────────────────────────────────────────────────────────

const STRATEGY_META: Record<string, { label: string; universe: string; signal: string }> = {
  trend_follow: {
    label: 'トレンドフォロー',
    universe: '大型株 TOPIX100 / S&P500',
    signal: 'SMA50/200 ゴールデンクロス + MACD',
  },
  factor_selection: {
    label: 'ファクター選択',
    universe: '高配当・バリュー株（TSE + US ETF）',
    signal: 'MA20乖離 -3% & 低ボラ買い / +10%乖離・損切り売り',
  },
  sector_rotation: {
    label: 'セクターローテーション',
    universe: '米国セクターETF 9本',
    signal: '3ヶ月モメンタム上位2セクター保有',
  },
  momentum_breakout: {
    label: 'モメンタムブレイクアウト',
    universe: '中小型グロース株（US + TSE）',
    signal: '52週高値ブレイク買い / MA30割れ・-12%損切り',
  },
}

const STRATEGY_ORDER = ['trend_follow', 'factor_selection', 'sector_rotation', 'momentum_breakout']

// ─── Sub-components ──────────────────────────────────────────────────────────

function PositionTable({ positions }: { positions: PositionOut[] }) {
  if (positions.length === 0) {
    return (
      <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        保有ポジションなし
      </div>
    )
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>銘柄</th>
          <th>市場</th>
          <th className="text-right">数量</th>
          <th className="text-right">取得単価</th>
          <th className="text-right">現在値</th>
          <th className="text-right">評価額</th>
          <th className="text-right">評価損益</th>
          <th className="text-right">損益率</th>
        </tr>
      </thead>
      <tbody>
        {positions.map(pos => (
          <tr key={pos.id}>
            <td>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                {pos.symbol}
              </span>
            </td>
            <td>
              <span className={`badge badge-${pos.market.toLowerCase()}`}>{pos.market}</span>
            </td>
            <td className="mono text-right">{pos.quantity.toLocaleString()}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(pos.avg_cost)}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(pos.current_price)}</td>
            <td className="mono text-right">{formatJPY(pos.market_value)}</td>
            <td className={`mono text-right ${pos.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
              {formatChange(pos.unrealized_pnl)}
            </td>
            <td className={`mono text-right ${pos.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'}`}>
              {formatPct(pos.unrealized_pnl_pct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TradeTable({ portfolioId }: { portfolioId: number }) {
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['trades', portfolioId],
    queryFn: () => getTrades({ portfolio_id: portfolioId }),
  })

  if (isLoading) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '16px 0' }}>読み込み中…</div>
  }
  if (trades.length === 0) {
    return (
      <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
        取引履歴なし
      </div>
    )
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>約定日時</th>
          <th>銘柄</th>
          <th>市場</th>
          <th>売買</th>
          <th className="text-right">数量</th>
          <th className="text-right">約定価格</th>
          <th className="text-right">取引金額</th>
          <th className="text-right">実現損益</th>
        </tr>
      </thead>
      <tbody>
        {(trades as TradeOut[]).map(t => (
          <tr key={t.id}>
            <td className="mono faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {new Date(t.executed_at).toLocaleString('ja-JP', {
                month: '2-digit', day: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
                timeZone: t.market === 'TSE' ? 'Asia/Tokyo' : 'America/New_York',
              })}
            </td>
            <td>
              <span className="mono" style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>
                {t.symbol}
              </span>
            </td>
            <td>
              <span className={`badge badge-${t.market.toLowerCase()}`}>{t.market}</span>
            </td>
            <td>
              <span className={`badge badge-${t.side.toLowerCase()}`}>
                {t.side === 'BUY' ? '買い' : '売り'}
              </span>
            </td>
            <td className="mono text-right">{t.quantity.toLocaleString()}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(t.price)}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(t.price * t.quantity)}</td>
            <td className="text-right">
              {t.pnl === null ? (
                <span className="faint mono text-sm">—</span>
              ) : (
                <span className={`pnl-pill ${t.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatChange(t.pnl)}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Strategy Card ───────────────────────────────────────────────────────────

function StrategyCard({ portfolio }: { portfolio: PortfolioOut }) {
  const [tab, setTab] = useState<'positions' | 'trades'>('positions')
  const sname = portfolio.strategy_name ?? 'user'
  const meta = STRATEGY_META[sname]
  const color = PORTFOLIO_COLORS[sname] ?? PORTFOLIO_COLORS['user']
  const cashPct = portfolio.total_value > 0 ? (portfolio.cash_balance / portfolio.total_value) * 100 : 100
  const returnPct = portfolio.total_return_pct

  return (
    <div className="card mb-16" style={{ borderLeft: `3px solid ${color}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: color,
              display: 'inline-block', boxShadow: `0 0 8px ${color}80`, flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              {meta?.label ?? portfolio.name}
            </span>
          </div>
          {meta && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 20 }}>
              {meta.universe} &nbsp;·&nbsp; {meta.signal}
            </div>
          )}
        </div>

        {/* Stats chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            総評価額 <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatJPY(portfolio.total_value)}</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            background: returnPct >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
            color: returnPct >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}>
            {returnPct >= 0 ? '+' : ''}{formatPct(returnPct)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            現金 {cashPct.toFixed(0)}%
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {portfolio.positions.length} 銘柄保有
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {(['positions', 'trades'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? color : 'var(--text-tertiary)',
              borderBottom: tab === t ? `2px solid ${color}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {t === 'positions' ? `保有ポジション（${portfolio.positions.length}）` : '取引履歴'}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'positions'
        ? <PositionTable positions={portfolio.positions} />
        : <TradeTable portfolioId={portfolio.id} />
      }
    </div>
  )
}

// ─── Theme Strategy Card ─────────────────────────────────────────────────────

function ThemeStrategyCard({ portfolio }: { portfolio: PortfolioOut }) {
  const [tab, setTab] = useState<'positions' | 'trades'>('positions')
  const returnPct = portfolio.total_return_pct
  const themeName = (portfolio as any).theme_name ?? portfolio.name
  const THEME_COLORS = ['#A78BFA', '#FB923C', '#34D399', '#60A5FA', '#F472B6', '#FBBF24']
  const color = THEME_COLORS[portfolio.id % THEME_COLORS.length]
  const cashPct = portfolio.total_value > 0 ? (portfolio.cash_balance / portfolio.total_value) * 100 : 100

  return (
    <div className="card mb-16" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 8px ${color}80`, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{themeName}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(167,139,250,0.12)', color: '#A78BFA', letterSpacing: '0.08em' }}>テーマ型</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 20 }}>
            銘柄ユニバースは実行時に Claude AI が選定 · テーマ内モメンタム追従
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            総評価額 <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatJPY(portfolio.total_value)}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: returnPct >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: returnPct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
            {returnPct >= 0 ? '+' : ''}{formatPct(returnPct)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            現金 {cashPct.toFixed(0)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {(['positions', 'trades'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? color : 'var(--text-tertiary)', borderBottom: tab === t ? `2px solid ${color}` : '2px solid transparent', marginBottom: -1, transition: 'color 0.15s' }}>
            {t === 'positions' ? `保有ポジション（${portfolio.positions.length}）` : '取引履歴'}
          </button>
        ))}
      </div>

      {tab === 'positions' ? <PositionTable positions={portfolio.positions} /> : <TradeTable portfolioId={portfolio.id} />}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Comparison() {
  const { data: portfolios = [], isLoading, isError } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
    refetchInterval: 30_000,
  })

  const strategyPortfolios = STRATEGY_ORDER
    .map(sname => portfolios.find(p => p.strategy_name === sname))
    .filter((p): p is PortfolioOut => p !== undefined)

  const themePortfolios = portfolios.filter(p => p.portfolio_type === 'theme')

  const totalPositions = [...strategyPortfolios, ...themePortfolios]
    .reduce((s, p) => s + p.positions.length, 0)

  return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">戦略別売買一覧</div>
          <div className="page-subtitle">
            各手法の保有ポジション・取引履歴
            {!isLoading && !isError && (
              <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                — 計 {totalPositions} 銘柄保有
              </span>
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="card" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>読み込み中…</div>
        </div>
      )}

      {isError && (
        <div className="card" style={{ color: 'var(--negative)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 24 }}>
          APIへの接続に失敗しました。バックエンドサーバーが起動しているか確認してください。
        </div>
      )}

      {!isLoading && !isError && strategyPortfolios.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⊞</div>
            <div className="empty-state-text">戦略ポートフォリオが見つかりません</div>
          </div>
        </div>
      )}

      {strategyPortfolios.map((p, i) => (
        <div key={p.id} className={`anim-fade-up anim-d${i + 1}`}>
          <StrategyCard portfolio={p} />
        </div>
      ))}

      {/* テーマ型ポートフォリオ */}
      {themePortfolios.length > 0 && (
        <>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            letterSpacing: '0.1em', textTransform: 'uppercase', margin: '20px 0 10px',
          }}>
            テーマ型自動売買
          </div>
          {themePortfolios.map((p, i) => (
            <div key={p.id} className={`anim-fade-up anim-d${i + 1}`}>
              <ThemeStrategyCard portfolio={p} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}
