export type Market = 'TSE' | 'US';
export type Currency = 'JPY' | 'USD';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'REJECTED';
export type BacktestStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface Portfolio {
  id: number;
  name: string;
  currency: Currency;
  initial_capital: number;
  cash_balance: number;
  total_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_return_pct: number;
  today_pnl: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  portfolio_id: number;
  symbol: string;
  market: Market;
  currency: Currency;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  opened_at: string;
}

export interface Order {
  id: number;
  portfolio_id: number;
  symbol: string;
  market: Market;
  order_type: OrderType;
  side: OrderSide;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  status: OrderStatus;
  filled_quantity: number;
  avg_fill_price: number | null;
  commission: number;
  strategy_id: string | null;
  notes: string | null;
  created_at: string;
  filled_at: string | null;
}

export interface Trade {
  id: number;
  order_id: number;
  portfolio_id: number;
  symbol: string;
  market: Market;
  side: OrderSide;
  quantity: number;
  price: number;
  currency: Currency;
  commission: number;
  exchange_rate: number;
  pnl: number | null;
  executed_at: string;
}

export interface EquityPoint {
  date: string;
  value: number;
}

export interface PerformanceMetrics {
  total_return: number;
  total_return_pct: number;
  annualized_return: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  max_drawdown_duration: number;
  win_rate: number;
  profit_factor: number;
  avg_win: number;
  avg_loss: number;
  total_trades: number;
  calmar_ratio: number;
}

export interface BacktestRun {
  id: number;
  strategy_name: string;
  strategy_display: string;
  symbols: string[];
  start_date: string;
  end_date: string;
  initial_capital: number;
  status: BacktestStatus;
  metrics: PerformanceMetrics | null;
  equity_curve: EquityPoint[];
  trades: Trade[];
  created_at: string;
  completed_at: string | null;
}

// ポートフォリオ比較ダッシュボード用
export interface PortfolioSummary {
  id: number;
  name: string;
  portfolio_type: 'user' | 'strategy';
  strategy_name: string | null;
  initial_capital: number;
  total_value: number;
  total_return_pct: number;
  cash_balance: number;
  position_count: number;
  equity_curve: EquityPoint[];
}

export interface ComparisonRun {
  id: number;
  name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  runs: BacktestRun[];
  created_at: string;
}

export interface Quote {
  symbol: string;
  market: Market;
  currency: Currency;
  price: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  change: number;
  change_pct: number;
  volume: number;
  timestamp: string;
}

export interface StrategyInfo {
  name: string;
  display_name: string;
  description: string;
  is_ai: boolean;
  requires_api_key: boolean;
}
