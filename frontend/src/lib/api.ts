/**
 * API クライアント — FastAPI バックエンドへの全リクエスト
 * Vite dev proxy が /api → localhost:8001 に転送する
 */

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Portfolio ──────────────────────────────────────────────────────────────

export interface PortfolioOut {
  id: number
  name: string
  currency: string
  initial_capital: number
  cash_balance: number
  portfolio_type: string
  strategy_name: string | null
  created_at: string
  updated_at: string
  positions: PositionOut[]
  total_value: number
  unrealized_pnl: number
  total_return_pct: number
}

export interface PositionOut {
  id: number
  portfolio_id: number
  symbol: string
  market: string
  currency: string
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  opened_at: string
}

export interface PortfolioSummaryApi {
  id: number
  name: string
  portfolio_type: string
  strategy_name: string | null
  theme_name?: string | null
  initial_capital: number
  total_value: number
  total_return_pct: number
  cash_balance: number
  position_count: number
  equity_curve: { date: string; value: number }[]
}

export const getPortfolios = () =>
  request<PortfolioOut[]>('/portfolios')

export const getPortfolioComparison = () =>
  request<PortfolioSummaryApi[]>('/portfolios/comparison')

export const refreshPortfolio = (id: number) =>
  request<{ updated: string[] }>(`/portfolios/${id}/refresh`, { method: 'POST' })

export type Session = 'TSE_AM' | 'TSE_PM' | 'US_AM' | 'US_PM'

export const runSession = (session: Session) =>
  request<{ status: string; session: string }>(`/portfolios/run-session?session=${session}`, { method: 'POST' })

// ─── Signal Report ───────────────────────────────────────────────────────────

export interface SignalLogOut {
  symbol: string
  market: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'ERROR' | 'SKIP'
  price: number
  reasoning: string
  executed_at: string
}

export interface SignalSummary {
  buy: number
  sell: number
  hold: number
  error: number
  total: number
}

export interface StrategySignalReport {
  portfolio_id: number
  strategy_name: string | null
  portfolio_name: string
  session: string
  executed_at: string
  signals: SignalLogOut[]
  summary: SignalSummary
}

export const getSignalReport = () =>
  request<StrategySignalReport[]>('/portfolios/signal-report')

// ─── Orders ─────────────────────────────────────────────────────────────────

export interface OrderOut {
  id: number
  portfolio_id: number
  symbol: string
  market: string
  order_type: string
  side: string
  quantity: number
  limit_price: number | null
  stop_price: number | null
  status: string
  filled_quantity: number
  avg_fill_price: number | null
  commission: number
  strategy_id: string | null
  notes: string | null
  created_at: string
  filled_at: string | null
}

export interface OrderCreateBody {
  portfolio_id: number
  symbol: string
  side: 'BUY' | 'SELL'
  order_type: 'MARKET' | 'LIMIT' | 'STOP'
  quantity: number
  limit_price?: number | null
  stop_price?: number | null
}

export const getOrders = (portfolioId: number) =>
  request<OrderOut[]>(`/orders?portfolio_id=${portfolioId}`)

export const createOrder = (body: OrderCreateBody) =>
  request<OrderOut>('/orders', { method: 'POST', body: JSON.stringify(body) })

export const cancelOrder = (orderId: number) =>
  request<void>(`/orders/${orderId}`, { method: 'DELETE' })

// ─── Trades ─────────────────────────────────────────────────────────────────

export interface TradeOut {
  id: number
  order_id: number
  portfolio_id: number
  symbol: string
  market: string
  side: string
  quantity: number
  price: number
  currency: string
  commission: number
  exchange_rate: number
  pnl: number | null
  executed_at: string
}

export const getTrades = (params?: { portfolio_id?: number; symbol?: string }) => {
  const qs = new URLSearchParams()
  if (params?.portfolio_id != null) qs.set('portfolio_id', String(params.portfolio_id))
  if (params?.symbol) qs.set('symbol', params.symbol)
  return request<TradeOut[]>(`/trades${qs.size ? '?' + qs.toString() : ''}`)
}

// ─── Market Data ─────────────────────────────────────────────────────────────

export interface QuoteOut {
  symbol: string
  market: string
  currency: string
  price: number
  open: number
  high: number
  low: number
  prev_close: number
  change: number
  change_pct: number
  volume: number
  timestamp: string
}

export const getQuote = (symbol: string) =>
  request<QuoteOut>(`/market/quote?symbol=${encodeURIComponent(symbol)}`)

// ─── Config ───────────────────────────────────────────────────────────────────

export const getConfigStatus = () =>
  request<{ anthropic_api_key_set: boolean }>('/config/status')

// ─── Theme Portfolio ──────────────────────────────────────────────────────────

export interface ThemeSymbolItem {
  symbol: string
  name: string
  market: string
}

export interface ThemeSuggestResponse {
  theme: string
  symbols: ThemeSymbolItem[]
  reasoning: string
}

export interface ThemePortfolioCreate {
  theme_name: string
  symbols: string[]
}

export const suggestTheme = (theme: string) =>
  request<ThemeSuggestResponse>('/portfolios/theme/suggest', {
    method: 'POST',
    body: JSON.stringify({ theme }),
  })

export const createThemePortfolio = (body: ThemePortfolioCreate) =>
  request<PortfolioOut>('/portfolios/theme', {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ─── Strategy Advisor ─────────────────────────────────────────────────────────

export const adviseStrategy = (
  portfolioId: number,
  message: string,
  metrics: Record<string, unknown>,
) =>
  request<{ advice: string }>(`/portfolios/${portfolioId}/advise`, {
    method: 'POST',
    body: JSON.stringify({ message, metrics }),
  })
