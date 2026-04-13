import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PORTFOLIO_COLORS } from '../lib/mockData'
import { getSignalReport, type StrategySignalReport, type SignalLogOut } from '../lib/api'

// ─── Strategy meta ────────────────────────────────────────────────────────────

const STRATEGY_LABEL: Record<string, string> = {
  trend_follow:       'トレンドフォロー',
  factor_selection:   'ファクター選択',
  sector_rotation:    'セクターローテーション',
  momentum_breakout:  'モメンタムブレイクアウト',
  theme_follow:       'テーマ型投資',
}

// ─── Symbol names ─────────────────────────────────────────────────────────────

const SYMBOL_NAMES: Record<string, string> = {
  // TSE 大型株
  '7203.T': 'トヨタ自動車',
  '6758.T': 'ソニーグループ',
  '8306.T': '三菱UFJ FG',
  '9984.T': 'ソフトバンクG',
  '6861.T': 'キーエンス',
  '7974.T': '任天堂',
  '8411.T': 'みずほFG',
  '6902.T': 'デンソー',
  '4063.T': '信越化学工業',
  '9433.T': 'KDDI',
  // TSE 高配当
  '8316.T': '三井住友FG',
  '5020.T': 'ENEOSホールディングス',
  '9101.T': '日本郵船',
  // TSE グロース
  '4385.T': 'メルカリ',
  '3697.T': 'SHIFT',
  '4369.T': 'トリケミカル研究所',
  '4477.T': 'BASE',
  // US 大型株
  'AAPL':  'Apple',
  'MSFT':  'Microsoft',
  'AMZN':  'Amazon',
  'NVDA':  'NVIDIA',
  'GOOGL': 'Alphabet',
  'META':  'Meta',
  'TSLA':  'Tesla',
  'JPM':   'JPMorgan Chase',
  'V':     'Visa',
  'JNJ':   'Johnson & Johnson',
  // US バリュー
  'VYM':   'Vanguard高配当ETF',
  'SCHD':  'Schwab高配当ETF',
  'KO':    'コカ・コーラ',
  'PG':    'P&G',
  'XOM':   'ExxonMobil',
  'CVX':   'Chevron',
  // セクターETF
  'XLK':   '情報技術',
  'XLE':   'エネルギー',
  'XLV':   'ヘルスケア',
  'XLF':   '金融',
  'XLI':   '資本財',
  'XLY':   '一般消費財',
  'XLU':   '公益',
  'XLRE':  '不動産',
  'XLB':   '素材',
  // US グロース
  'AXON':  'Axon Enterprise',
  'CRWD':  'CrowdStrike',
  'DDOG':  'Datadog',
  'SNOW':  'Snowflake',
  'NET':   'Cloudflare',
  'FTNT':  'Fortinet',
  'ZS':    'Zscaler',
  'CELH':  'Celsius Holdings',
  'ENPH':  'Enphase Energy',
  'SMCI':  'Super Micro Computer',
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; border: string }> = {
    BUY:   { label: '▲ 約定',   bg: 'rgba(74,222,128,0.15)',  color: 'var(--positive)',      border: 'rgba(74,222,128,0.35)' },
    SELL:  { label: '▼ 約定',   bg: 'rgba(248,113,113,0.15)', color: 'var(--negative)',      border: 'rgba(248,113,113,0.35)' },
    HOLD:  { label: '── 様子見', bg: 'rgba(100,116,139,0.12)', color: 'var(--text-tertiary)', border: 'var(--border)' },
    ERROR: { label: '✕ エラー', bg: 'rgba(251,191,36,0.15)',  color: '#FBB024',             border: 'rgba(251,191,36,0.35)' },
    SKIP:  { label: '◌ 未約定', bg: 'rgba(100,116,139,0.08)', color: 'var(--text-tertiary)', border: 'var(--border)' },
  }
  const c = cfg[action] ?? { label: action, bg: 'transparent', color: 'var(--text-tertiary)', border: 'var(--border)' }

  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

// ─── Summary chips ────────────────────────────────────────────────────────────

function SummaryChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11,
      padding: '3px 10px', borderRadius: 4,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      color: color ?? 'var(--text-secondary)',
    }}>
      {label} <span style={{ fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</span>
    </span>
  )
}

// ─── Strategy section ─────────────────────────────────────────────────────────

function StrategySection({ report }: { report: StrategySignalReport }) {
  const [showHold, setShowHold] = useState(false)
  const sname = report.strategy_name ?? 'user'
  const isTheme = sname === 'theme_follow'
  const color = PORTFOLIO_COLORS[sname] ?? '#888'

  const skipCount = report.signals.filter(s => s.action === 'SKIP').length
  const isSkipped = report.signals.length === 1 && report.signals[0].action === 'SKIP'
  const visibleSignals = showHold
    ? report.signals
    : report.signals.filter(s => s.action !== 'HOLD' && !(s.action === 'SKIP' && !isSkipped))
  const holdCount = report.signals.filter(s => s.action === 'HOLD').length
  const hasAction = report.summary.buy + report.summary.sell + report.summary.error > 0

  const localTime = new Date(report.executed_at).toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: report.session.startsWith('TSE') ? 'Asia/Tokyo' : 'America/New_York',
  })
  const tzLabel = report.session.startsWith('TSE') ? 'JST' : 'EST'

  return (
    <div className="card mb-16" style={{ borderLeft: `3px solid ${color}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 8px ${color}80`, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
              {isTheme ? report.portfolio_name : (STRATEGY_LABEL[sname] ?? sname)}
            </span>
            {isTheme && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px',
                borderRadius: 4, background: 'rgba(167,139,250,0.12)', color: '#A78BFA',
                border: '1px solid rgba(167,139,250,0.25)', letterSpacing: '0.08em',
              }}>
                テーマ型 · Claude AI選定
              </span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
              {report.session} &nbsp;·&nbsp; {localTime} {tzLabel}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 20 }}>
            <SummaryChip label="評価" value={report.summary.total} />
            <SummaryChip label="BUY"  value={report.summary.buy}  color={report.summary.buy > 0  ? 'var(--positive)' : undefined} />
            <SummaryChip label="SELL" value={report.summary.sell} color={report.summary.sell > 0 ? 'var(--negative)' : undefined} />
            <SummaryChip label="HOLD" value={report.summary.hold} />
            {report.summary.error > 0 && <SummaryChip label="ERR" value={report.summary.error} color="#FBB024" />}
          </div>
          {isTheme && report.summary.total > 0 && (
            <div style={{
              paddingLeft: 20, marginTop: 6,
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            }}>
              銘柄ユニバースはこのセッション実行時に Claude AI が動的生成
            </div>
          )}
        </div>

        {isSkipped ? (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 12px',
            borderRadius: 4, background: 'rgba(100,116,139,0.08)',
            border: '1px solid var(--border)', color: 'var(--text-tertiary)',
          }}>
            このセッションでは対象外
          </span>
        ) : !hasAction && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 12px',
            borderRadius: 4, background: 'rgba(100,116,139,0.1)',
            border: '1px solid var(--border)', color: 'var(--text-tertiary)',
          }}>
            売買シグナルなし
          </span>
        )}
      </div>

      {/* Signal table */}
      {!isSkipped && report.signals.length > 0 ? (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>銘柄コード</th>
                <th>銘柄名</th>
                <th>市場</th>
                <th className="text-right">判定時価格</th>
                <th>シグナル</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {visibleSignals.map((s, i) => (
                <tr key={i} style={{ opacity: s.action === 'HOLD' ? 0.65 : 1 }}>
                  <td>
                    <span className="mono" style={{ fontWeight: s.action !== 'HOLD' ? 600 : 400, color: 'var(--text-primary)', fontSize: 13 }}>
                      {s.symbol}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {SYMBOL_NAMES[s.symbol] ?? '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${s.market.toLowerCase()}`}>{s.market}</span>
                  </td>
                  <td className="mono text-right" style={{ fontSize: 12 }}>
                    {s.price > 0 ? new Intl.NumberFormat('ja-JP').format(s.price) : '—'}
                  </td>
                  <td>
                    <ActionBadge action={s.action} />
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 400, wordBreak: 'break-word' }}>
                    {s.reasoning || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 様子見・未約定トグル */}
          {(holdCount > 0 || skipCount > 0) && !isSkipped && (
            <button
              onClick={() => setShowHold(v => !v)}
              style={{
                marginTop: 10, padding: '4px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {showHold
                ? `▲ 隠す`
                : `▼ 様子見${holdCount > 0 ? ` (${holdCount})` : ''}${skipCount > 0 ? ` / 未約定 (${skipCount})` : ''} を表示`}
            </button>
          )}
        </>
      ) : isSkipped ? (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--text-tertiary)', padding: '12px 0',
        }}>
          {report.signals[0]?.reasoning}
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
          このセッションのシグナルデータがありません
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Report() {
  const qc = useQueryClient()

  const { data: reports = [], isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['signal-report'],
    queryFn: getSignalReport,
    refetchInterval: 60_000,
  })

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  // 市場フィルタ
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'TSE' | 'US'>('ALL')
  const filtered = reports.filter(r =>
    marketFilter === 'ALL' || r.session.startsWith(marketFilter)
  )

  const totalBuy  = reports.reduce((s, r) => s + r.summary.buy, 0)
  const totalSell = reports.reduce((s, r) => s + r.summary.sell, 0)
  const totalEval = reports.reduce((s, r) => s + r.summary.total, 0)

  return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">実行レポート</div>
          <div className="page-subtitle">
            各戦略がどの銘柄をなぜ売買したか / しなかったかの詳細
            {lastUpdated && (
              <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                最終更新 {lastUpdated}
              </span>
            )}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['signal-report'] })}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13.5 8A5.5 5.5 0 0 1 3.2 11.5M2.5 8A5.5 5.5 0 0 1 12.8 4.5" strokeLinecap="round" />
            <path d="M12 3l1.5 1.5L12 6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 13l-1.5-1.5L4 10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          更新
        </button>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────── */}
      {!isLoading && !isError && reports.length > 0 && (
        <div className="grid-4 mb-20 anim-fade-up anim-d1">
          <div className="metric-card">
            <div className="metric-label">評価銘柄数</div>
            <div className="metric-value">{totalEval}</div>
            <div className="metric-sub">全戦略合計</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">BUYシグナル</div>
            <div className={`metric-value ${totalBuy > 0 ? 'positive' : ''}`}>{totalBuy}</div>
            <div className="metric-sub">件</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">SELLシグナル</div>
            <div className={`metric-value ${totalSell > 0 ? 'negative' : ''}`}>{totalSell}</div>
            <div className="metric-sub">件</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">実行セッション</div>
            <div className="metric-value" style={{ fontSize: 16 }}>
              {[...new Set(reports.map(r => r.session))].join(' / ')}
            </div>
            <div className="metric-sub muted">
              {reports[0] ? new Date(reports[0].executed_at).toLocaleDateString('ja-JP') : '—'}
            </div>
          </div>
        </div>
      )}

      {/* ── Market filter ────────────────────────────────────────── */}
      {reports.length > 0 && (
        <div className="card mb-16 anim-fade-up anim-d2">
          <div className="flex gap-8 items-center">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>市場:</span>
            <div className="toggle-group" style={{ width: 'auto' }}>
              {(['ALL', 'TSE', 'US'] as const).map(m => (
                <button
                  key={m}
                  className={`toggle-btn ${marketFilter === m ? 'active-neutral' : ''}`}
                  onClick={() => setMarketFilter(m)}
                  style={{ minWidth: 56 }}
                >
                  {m === 'ALL' ? 'すべて' : m}
                </button>
              ))}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
              {filtered.length} 戦略
            </span>
          </div>
        </div>
      )}

      {/* ── States ───────────────────────────────────────────────── */}
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

      {!isLoading && !isError && reports.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">≡</div>
            <div className="empty-state-text">
              まだ実行レポートがありません
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                ダッシュボードの「手動実行」から戦略を実行してください
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Strategy sections ────────────────────────────────────── */}
      {filtered.map((report, i) => (
        <div key={report.portfolio_id} className={`anim-fade-up anim-d${Math.min(i + 3, 6)}`}>
          <StrategySection report={report} />
        </div>
      ))}
    </div>
  )
}
