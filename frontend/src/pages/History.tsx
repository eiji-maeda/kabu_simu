import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatJPY, formatChange } from '../lib/mockData'
import { getTrades, type TradeOut } from '../lib/api'

type FilterSide = 'ALL' | 'BUY' | 'SELL'
type FilterMarket = 'ALL' | 'TSE' | 'US'

export default function History() {
  const [filterSide, setFilterSide] = useState<FilterSide>('ALL')
  const [filterMarket, setFilterMarket] = useState<FilterMarket>('ALL')
  const [searchSymbol, setSearchSymbol] = useState('')

  const { data: allTrades = [], isLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: () => getTrades(),
    refetchInterval: 30_000,
  })

  const filtered = (allTrades as TradeOut[]).filter((t: TradeOut) => {
    if (filterSide !== 'ALL' && t.side !== filterSide) return false
    if (filterMarket !== 'ALL' && t.market !== filterMarket) return false
    if (searchSymbol && !t.symbol.toLowerCase().includes(searchSymbol.toLowerCase())) return false
    return true
  })

  const totalPnl = filtered.reduce((sum: number, t: TradeOut) => sum + (t.pnl ?? 0), 0)
  const winTrades = filtered.filter((t: TradeOut) => (t.pnl ?? 0) > 0).length
  const lossTrades = filtered.filter((t: TradeOut) => (t.pnl ?? 0) < 0).length

  return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">取引履歴</div>
          <div className="page-subtitle">
            全約定履歴と実現損益
            {isLoading && <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>読み込み中…</span>}
          </div>
        </div>
      </div>

      {/* ── Summary Stats ─────────────────────────────────────── */}
      <div className="grid-4 mb-20 anim-fade-up anim-d1">
        <div className="metric-card">
          <div className="metric-label">総実現損益</div>
          <div className={`metric-value ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {formatChange(totalPnl)}
          </div>
          <div className={`metric-sub ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {totalPnl >= 0 ? '利益' : '損失'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">総取引数</div>
          <div className="metric-value">{filtered.length}</div>
          <div className="metric-sub">件</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">勝ち / 負け</div>
          <div className="metric-value">
            <span className="positive">{winTrades}</span>
            <span className="faint" style={{ fontSize: 20 }}> / </span>
            <span className="negative">{lossTrades}</span>
          </div>
          <div className="metric-sub">
            {filtered.filter(t => t.pnl !== null).length > 0
              ? `勝率 ${Math.round(winTrades / (winTrades + lossTrades) * 100)}%`
              : '—'
            }
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">総手数料</div>
          <div className="metric-value">
            {formatJPY(filtered.reduce((s: number, t: TradeOut) => s + Number(t.commission), 0))}
          </div>
          <div className="metric-sub muted">コスト計</div>
        </div>
      </div>

      {/* ── Filter Bar ────────────────────────────────────────── */}
      <div className="card mb-16 anim-fade-up anim-d2">
        <div className="flex gap-12 items-center" style={{ flexWrap: 'wrap' }}>
          {/* Symbol search */}
          <div style={{ position: 'relative', flex: '0 0 160px' }}>
            <input
              className="form-input mono"
              type="text"
              placeholder="銘柄で絞り込み"
              value={searchSymbol}
              onChange={e => setSearchSymbol(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}
              width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            >
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3 3" strokeLinecap="round" />
            </svg>
          </div>

          {/* Side filter */}
          <div className="toggle-group" style={{ width: 'auto' }}>
            {(['ALL', 'BUY', 'SELL'] as FilterSide[]).map(s => (
              <button
                key={s}
                className={`toggle-btn ${
                  filterSide === s
                    ? s === 'BUY' ? 'active-buy' : s === 'SELL' ? 'active-sell' : 'active-neutral'
                    : ''
                }`}
                onClick={() => setFilterSide(s)}
                style={{ minWidth: 56 }}
              >
                {s === 'ALL' ? 'すべて' : s === 'BUY' ? '買い' : '売り'}
              </button>
            ))}
          </div>

          {/* Market filter */}
          <div className="toggle-group" style={{ width: 'auto' }}>
            {(['ALL', 'TSE', 'US'] as FilterMarket[]).map(m => (
              <button
                key={m}
                className={`toggle-btn ${filterMarket === m ? 'active-neutral' : ''}`}
                onClick={() => setFilterMarket(m)}
                style={{ minWidth: 52 }}
              >
                {m === 'ALL' ? 'すべて' : m}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {filtered.length} 件
          </div>
        </div>
      </div>

      {/* ── Trade Table ───────────────────────────────────────── */}
      <div className="card anim-fade-up anim-d3">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">≡</div>
            <div className="empty-state-text">条件に一致する取引がありません</div>
          </div>
        ) : (
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
                <th className="text-right">手数料</th>
                <th className="text-right">実現損益</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: TradeOut) => {
                const amount = t.price * t.quantity
                return (
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
                    <td className="mono text-right">
                      {new Intl.NumberFormat('ja-JP').format(t.price)}
                    </td>
                    <td className="mono text-right">
                      {new Intl.NumberFormat('ja-JP').format(amount)}
                    </td>
                    <td className="mono text-right faint text-sm">
                      {new Intl.NumberFormat('ja-JP').format(t.commission)}
                    </td>
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Total Row ─────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div
          className="flex justify-between items-center anim-fade-up anim-d4"
          style={{
            marginTop: 12,
            padding: '12px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--text-tertiary)' }}>
            表示中 {filtered.length} 件の合計実現損益
          </span>
          <span
            className={totalPnl >= 0 ? 'positive' : 'negative'}
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {formatChange(totalPnl)} 円
          </span>
        </div>
      )}
    </div>
  )
}
