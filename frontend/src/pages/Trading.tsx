import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatJPY, formatPct } from '../lib/mockData'
import {
  getPortfolios, getOrders, getQuote, createOrder, cancelOrder,
  type PortfolioOut, type OrderOut, type QuoteOut,
} from '../lib/api'

type Side = 'BUY' | 'SELL'
type OrderType = 'MARKET' | 'LIMIT' | 'STOP'

// ─── Quote Display ────────────────────────────────────────────────────────────
function QuoteDisplay({ quote, isLoading, isError }: {
  quote: QuoteOut | undefined
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) return (
    <div style={{ padding: '20px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>
      取得中…
    </div>
  )
  if (isError) return (
    <div style={{ padding: '16px', color: 'var(--negative)', fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(255,87,87,0.08)', borderRadius: 8, marginBottom: 16 }}>
      銘柄が見つかりません
    </div>
  )
  if (!quote) return (
    <div style={{ padding: '20px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>
      銘柄コードを入力してください
    </div>
  )

  const up = quote.change >= 0
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: 16,
    }}>
      <div className="flex items-center justify-between mb-8">
        <span className="mono" style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>{quote.symbol}</span>
        <span className={`badge badge-${quote.market.toLowerCase()}`}>{quote.market}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 300, lineHeight: 1, marginBottom: 6 }}>
        {quote.currency === 'JPY'
          ? new Intl.NumberFormat('ja-JP').format(quote.price)
          : `$${quote.price.toFixed(2)}`}
      </div>
      <div className="flex gap-8 items-center" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <span className={up ? 'positive' : 'negative'}>
          {up ? '▲' : '▼'} {Math.abs(quote.change).toFixed(quote.currency === 'JPY' ? 0 : 2)} ({formatPct(quote.change_pct)})
        </span>
        <span className="faint">
          前日終値 {quote.currency === 'JPY' ? quote.prev_close.toLocaleString('ja-JP') : `$${quote.prev_close.toFixed(2)}`}
        </span>
      </div>
      <div className="flex gap-16 mt-8" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
        <span>始値 {quote.open.toLocaleString()}</span>
        <span>高値 {quote.high.toLocaleString()}</span>
        <span>安値 {quote.low.toLocaleString()}</span>
        <span>出来高 {(quote.volume / 1_000_000).toFixed(1)}M</span>
      </div>
    </div>
  )
}

// ─── Main Trading Page ────────────────────────────────────────────────────────
export default function Trading() {
  const qc = useQueryClient()
  const [symbol, setSymbol] = useState('')
  const [debouncedSymbol, setDebouncedSymbol] = useState('')
  const [side, setSide] = useState<Side>('BUY')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [quantity, setQuantity] = useState('10')
  const [limitPrice, setLimitPrice] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Symbol debounce — 800ms後にクエリ発行
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSymbol(symbol.toUpperCase()), 800)
    return () => clearTimeout(t)
  }, [symbol])

  // ── Queries ──
  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  })
  const userPortfolio: PortfolioOut | undefined = portfolios.find(p => p.portfolio_type === 'user') ?? portfolios[0]

  const { data: quote, isLoading: quoteLoading, isError: quoteError } = useQuery({
    queryKey: ['quote', debouncedSymbol],
    queryFn: () => getQuote(debouncedSymbol),
    enabled: debouncedSymbol.length >= 2,
    retry: false,
    staleTime: 30_000,
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', userPortfolio?.id],
    queryFn: () => getOrders(userPortfolio!.id),
    enabled: !!userPortfolio,
    refetchInterval: 15_000,
  })

  // ── Mutations ──
  const orderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['trades'] })
      setToast({ msg: '注文が約定しました', ok: true })
      setTimeout(() => setToast(null), 3000)
      setQuantity('10')
      setLimitPrice('')
    },
    onError: (e: Error) => {
      setToast({ msg: e.message, ok: false })
      setTimeout(() => setToast(null), 4000)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const pendingOrders: OrderOut[] = orders.filter((o: OrderOut) => o.status === 'PENDING')
  const recentOrders: OrderOut[] = orders.filter((o: OrderOut) => o.status !== 'PENDING').slice(0, 10)

  const estimatedCost = quote && quantity
    ? quote.price * parseInt(quantity || '0') * (quote.currency === 'USD' ? 150.0 : 1)
    : null

  function handleSubmit() {
    if (!userPortfolio || !quote) return
    const qty = parseInt(quantity)
    if (!qty || qty <= 0) return
    orderMutation.mutate({
      portfolio_id: userPortfolio.id,
      symbol: quote.symbol,
      side,
      order_type: orderType,
      quantity: qty,
      limit_price: (orderType === 'LIMIT' && limitPrice) ? parseFloat(limitPrice) : null,
      stop_price: (orderType === 'STOP' && limitPrice) ? parseFloat(limitPrice) : null,
    })
  }

  return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">売買注文</div>
          <div className="page-subtitle">
            {userPortfolio
              ? `${userPortfolio.name} — 現金残高 ${formatJPY(Number(userPortfolio.cash_balance))}`
              : 'MARKET / LIMIT / STOP 注文対応'}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 100,
          background: toast.ok ? 'rgba(16,217,160,0.15)' : 'rgba(255,87,87,0.15)',
          border: `1px solid ${toast.ok ? 'rgba(16,217,160,0.4)' : 'rgba(255,87,87,0.4)'}`,
          color: toast.ok ? 'var(--positive)' : 'var(--negative)',
          borderRadius: 8, padding: '12px 20px',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          backdropFilter: 'blur(12px)',
        }}>
          {toast.msg}
        </div>
      )}

      <div className="grid-sidebar">
        {/* ── Order Form Panel ───────────────────────────────── */}
        <div>
          <div className="anim-fade-up anim-d1">
            <QuoteDisplay quote={quote} isLoading={quoteLoading && debouncedSymbol.length >= 2} isError={quoteError} />
          </div>

          <div className="card card-gold anim-fade-up anim-d2">
            <div className="section-label" style={{ marginBottom: 18 }}>注文入力</div>

            {/* BUY / SELL Toggle */}
            <div className="toggle-group mb-16">
              <button className={`toggle-btn ${side === 'BUY' ? 'active-buy' : ''}`} onClick={() => setSide('BUY')}>
                買い (BUY)
              </button>
              <button className={`toggle-btn ${side === 'SELL' ? 'active-sell' : ''}`} onClick={() => setSide('SELL')}>
                売り (SELL)
              </button>
            </div>

            {/* Symbol */}
            <div className="form-group mb-12">
              <label className="form-label">銘柄コード</label>
              <input
                className="form-input mono"
                type="text"
                placeholder="例: AAPL, 7203.T"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            {/* Order Type */}
            <div className="form-group mb-12">
              <label className="form-label">注文種別</label>
              <select
                className="form-input form-select"
                value={orderType}
                onChange={e => setOrderType(e.target.value as OrderType)}
              >
                <option value="MARKET">成行 (MARKET)</option>
                <option value="LIMIT">指値 (LIMIT)</option>
                <option value="STOP">逆指値 (STOP)</option>
              </select>
            </div>

            {/* Quantity */}
            <div className="form-group mb-12">
              <label className="form-label">数量（株）</label>
              <input
                className="form-input mono"
                type="number" min="1" placeholder="0"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>

            {/* Limit / Stop Price */}
            {orderType !== 'MARKET' && (
              <div className="form-group mb-16">
                <label className="form-label">
                  {orderType === 'LIMIT' ? '指値価格' : '逆指値価格'}
                </label>
                <input
                  className="form-input mono"
                  type="number"
                  placeholder={quote ? String(Math.round(quote.price)) : '0'}
                  value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                />
              </div>
            )}

            {/* Estimated cost */}
            {estimatedCost != null && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                padding: '10px 14px', marginBottom: 16,
                fontFamily: 'var(--font-mono)', fontSize: 11,
              }}>
                <div className="flex justify-between">
                  <span className="faint">概算金額</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatJPY(estimatedCost)}</span>
                </div>
                <div className="flex justify-between mt-8">
                  <span className="faint">手数料 (概算)</span>
                  <span className="faint">{formatJPY(Math.round(estimatedCost * 0.001))}</span>
                </div>
              </div>
            )}

            <button
              className={`btn btn-full btn-lg ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
              style={{ marginTop: 4 }}
              disabled={!quote || !userPortfolio || orderMutation.isPending || !quantity}
              onClick={handleSubmit}
            >
              {orderMutation.isPending ? '送信中…' : (side === 'BUY' ? '買い注文を送信' : '売り注文を送信')}
            </button>

            {!userPortfolio && (
              <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                バックエンドに接続できません
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ──────────────────────────────────── */}
        <div>
          {/* Positions */}
          <div className="card mb-16 anim-fade-up anim-d1">
            <div className="section-label">保有ポジション</div>
            {!userPortfolio || userPortfolio.positions.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                保有ポジションなし
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th>市場</th>
                    <th className="text-right">数量</th>
                    <th className="text-right">現在値</th>
                    <th className="text-right">損益率</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {userPortfolio.positions.map(pos => (
                    <tr key={pos.id}>
                      <td><span className="mono" style={{ fontWeight: 500 }}>{pos.symbol}</span></td>
                      <td><span className={`badge badge-${pos.market.toLowerCase()}`}>{pos.market}</span></td>
                      <td className="mono text-right">{pos.quantity}</td>
                      <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(Number(pos.current_price))}</td>
                      <td className="text-right">
                        <span className={`pnl-pill ${Number(pos.unrealized_pnl_pct) >= 0 ? 'positive' : 'negative'}`}>
                          {formatPct(Number(pos.unrealized_pnl_pct))}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setSymbol(pos.symbol); setSide('SELL') }}
                        >
                          売る
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending Orders */}
          {pendingOrders.length > 0 && (
            <div className="card mb-16 anim-fade-up anim-d2">
              <div className="section-label">未約定注文</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th>種別</th>
                    <th className="text-right">数量</th>
                    <th className="text-right">指値</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map((o: OrderOut) => (
                    <tr key={o.id}>
                      <td>
                        <span className="mono" style={{ fontWeight: 500 }}>{o.symbol}</span>
                        <span className={`badge badge-${o.side.toLowerCase()}`} style={{ marginLeft: 6 }}>
                          {o.side === 'BUY' ? '買' : '売'}
                        </span>
                      </td>
                      <td><span className="badge badge-limit">{o.order_type}</span></td>
                      <td className="mono text-right">{o.quantity}</td>
                      <td className="mono text-right faint">
                        {o.limit_price ? new Intl.NumberFormat('ja-JP').format(o.limit_price) : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--negative)', borderColor: 'var(--negative-border)' }}
                          onClick={() => cancelMutation.mutate(o.id)}
                          disabled={cancelMutation.isPending}
                        >
                          取消
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Orders */}
          <div className="card anim-fade-up anim-d3">
            <div className="section-label">注文履歴</div>
            {recentOrders.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                注文履歴なし
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
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o: OrderOut) => (
                    <tr key={o.id}>
                      <td className="mono faint text-sm">
                        {new Date(o.created_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}
                      </td>
                      <td className="mono" style={{ fontWeight: 500 }}>{o.symbol}</td>
                      <td>
                        <span className={`badge badge-${o.side.toLowerCase()}`}>
                          {o.side === 'BUY' ? '買い' : '売り'}
                        </span>
                      </td>
                      <td className="mono text-right">{o.quantity}</td>
                      <td className="mono text-right">
                        {o.avg_fill_price
                          ? new Intl.NumberFormat('ja-JP').format(o.avg_fill_price)
                          : <span className="faint">—</span>}
                      </td>
                      <td>
                        <span className={`badge badge-${o.status.toLowerCase()}`}>
                          {o.status === 'FILLED' ? '約定' : o.status === 'PENDING' ? '未約定' : o.status === 'CANCELLED' ? 'キャンセル' : o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
