import type {
  Portfolio, Position, Order, Trade,
  EquityPoint, BacktestRun, ComparisonRun, Quote, StrategyInfo, PerformanceMetrics,
  PortfolioSummary,
} from '../types';

// ─── Deterministic pseudo-random ────────────────────────────────────────────
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateEquityCurve(
  startDate: string,
  tradingDays: number,
  initial: number,
  annualReturn: number,
  annualVol: number,
  seed: number
): EquityPoint[] {
  const rand = seeded(seed);
  const data: EquityPoint[] = [];
  let value = initial;
  const start = new Date(startDate);
  let day = 0;

  for (let i = 0; day < tradingDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    // Box-Muller for approximate normal distribution
    const u1 = rand(), u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
    const dailyReturn = annualReturn / 252 + (annualVol / Math.sqrt(252)) * z;
    value = value * (1 + dailyReturn);

    data.push({
      date: d.toISOString().split('T')[0],
      value: Math.round(value)
    });
    day++;
  }
  return data;
}

// ─── Mock Portfolio ──────────────────────────────────────────────────────────
export const mockPortfolio: Portfolio = {
  id: 1,
  name: 'メインポートフォリオ',
  currency: 'JPY',
  initial_capital: 1_000_000,
  cash_balance: 412_680,
  total_value: 1_124_680,
  unrealized_pnl: 87_430,
  realized_pnl: 37_250,
  total_return_pct: 12.47,
  today_pnl: +3_210,
  created_at: '2024-01-04T09:00:00Z',
  updated_at: '2024-12-20T14:32:00Z',
};

// ─── Mock Positions ──────────────────────────────────────────────────────────
export const mockPositions: Position[] = [
  {
    id: 1,
    portfolio_id: 1,
    symbol: 'AAPL',
    market: 'US',
    currency: 'USD',
    quantity: 10,
    avg_cost: 21_450,     // JPY equivalent
    current_price: 25_354, // JPY equivalent (~$168.30 × 150.6)
    market_value: 253_540,
    unrealized_pnl: 38_900,
    unrealized_pnl_pct: 18.13,
    opened_at: '2024-01-08T14:31:00Z',
  },
  {
    id: 2,
    portfolio_id: 1,
    symbol: '7203.T',
    market: 'TSE',
    currency: 'JPY',
    quantity: 100,
    avg_cost: 2_480,
    current_price: 2_763,
    market_value: 276_300,
    unrealized_pnl: 28_300,
    unrealized_pnl_pct: 11.41,
    opened_at: '2024-02-15T09:05:00Z',
  },
  {
    id: 3,
    portfolio_id: 1,
    symbol: 'NVDA',
    market: 'US',
    currency: 'USD',
    quantity: 5,
    avg_cost: 59_850,     // JPY equivalent
    current_price: 72_160,
    market_value: 360_800,
    unrealized_pnl: 61_550,
    unrealized_pnl_pct: 20.60,
    opened_at: '2024-03-01T15:00:00Z',
  },
];

// ─── Mock Quotes ─────────────────────────────────────────────────────────────
export const mockQuotes: Record<string, Quote> = {
  'AAPL': {
    symbol: 'AAPL', market: 'US', currency: 'USD',
    price: 168.30, open: 166.50, high: 169.20, low: 165.90,
    prev_close: 166.10, change: 2.20, change_pct: 1.32,
    volume: 48_320_000, timestamp: '2024-12-20T21:00:00Z',
  },
  'NVDA': {
    symbol: 'NVDA', market: 'US', currency: 'USD',
    price: 479.30, open: 472.00, high: 482.50, low: 469.80,
    prev_close: 474.20, change: 5.10, change_pct: 1.08,
    volume: 62_140_000, timestamp: '2024-12-20T21:00:00Z',
  },
  '7203.T': {
    symbol: '7203.T', market: 'TSE', currency: 'JPY',
    price: 2_763, open: 2_745, high: 2_780, low: 2_735,
    prev_close: 2_748, change: 15, change_pct: 0.55,
    volume: 8_450_000, timestamp: '2024-12-20T06:30:00Z',
  },
  '6758.T': {
    symbol: '6758.T', market: 'TSE', currency: 'JPY',
    price: 3_115, open: 3_098, high: 3_130, low: 3_085,
    prev_close: 3_102, change: 13, change_pct: 0.42,
    volume: 3_210_000, timestamp: '2024-12-20T06:30:00Z',
  },
};

// ─── Mock Orders ─────────────────────────────────────────────────────────────
export const mockOrders: Order[] = [
  {
    id: 101, portfolio_id: 1, symbol: 'AAPL', market: 'US',
    order_type: 'MARKET', side: 'BUY', quantity: 10,
    limit_price: null, stop_price: null,
    status: 'FILLED', filled_quantity: 10, avg_fill_price: 21_450,
    commission: 214, strategy_id: null, notes: null,
    created_at: '2024-01-08T14:30:52Z', filled_at: '2024-01-08T14:31:03Z',
  },
  {
    id: 102, portfolio_id: 1, symbol: '7203.T', market: 'TSE',
    order_type: 'MARKET', side: 'BUY', quantity: 100,
    limit_price: null, stop_price: null,
    status: 'FILLED', filled_quantity: 100, avg_fill_price: 2_480,
    commission: 1_364, strategy_id: null, notes: null,
    created_at: '2024-02-15T09:04:41Z', filled_at: '2024-02-15T09:05:02Z',
  },
  {
    id: 103, portfolio_id: 1, symbol: 'NVDA', market: 'US',
    order_type: 'LIMIT', side: 'BUY', quantity: 5,
    limit_price: 60_000, stop_price: null,
    status: 'FILLED', filled_quantity: 5, avg_fill_price: 59_850,
    commission: 299, strategy_id: null, notes: null,
    created_at: '2024-03-01T14:58:00Z', filled_at: '2024-03-01T15:00:12Z',
  },
  {
    id: 104, portfolio_id: 1, symbol: '9984.T', market: 'TSE',
    order_type: 'LIMIT', side: 'BUY', quantity: 50,
    limit_price: 8_500, stop_price: null,
    status: 'PENDING', filled_quantity: 0, avg_fill_price: null,
    commission: 0, strategy_id: null, notes: null,
    created_at: '2024-12-20T09:15:00Z', filled_at: null,
  },
  {
    id: 98, portfolio_id: 1, symbol: 'TSLA', market: 'US',
    order_type: 'MARKET', side: 'BUY', quantity: 8,
    limit_price: null, stop_price: null,
    status: 'FILLED', filled_quantity: 8, avg_fill_price: 28_100,
    commission: 225, strategy_id: null, notes: null,
    created_at: '2024-11-10T14:45:00Z', filled_at: '2024-11-10T14:45:12Z',
  },
  {
    id: 99, portfolio_id: 1, symbol: 'TSLA', market: 'US',
    order_type: 'MARKET', side: 'SELL', quantity: 8,
    limit_price: null, stop_price: null,
    status: 'FILLED', filled_quantity: 8, avg_fill_price: 32_520,
    commission: 260, strategy_id: null, notes: null,
    created_at: '2024-12-05T15:30:00Z', filled_at: '2024-12-05T15:30:08Z',
  },
];

// ─── Mock Trades ─────────────────────────────────────────────────────────────
export const mockTrades: Trade[] = [
  {
    id: 201, order_id: 99, portfolio_id: 1, symbol: 'TSLA', market: 'US',
    side: 'SELL', quantity: 8, price: 32_520, currency: 'JPY',
    commission: 260, exchange_rate: 150.4, pnl: 34_700,
    executed_at: '2024-12-05T15:30:08Z',
  },
  {
    id: 200, order_id: 98, portfolio_id: 1, symbol: 'TSLA', market: 'US',
    side: 'BUY', quantity: 8, price: 28_100, currency: 'JPY',
    commission: 225, exchange_rate: 149.8, pnl: null,
    executed_at: '2024-11-10T14:45:12Z',
  },
  {
    id: 199, order_id: 103, portfolio_id: 1, symbol: 'NVDA', market: 'US',
    side: 'BUY', quantity: 5, price: 59_850, currency: 'JPY',
    commission: 299, exchange_rate: 149.2, pnl: null,
    executed_at: '2024-03-01T15:00:12Z',
  },
  {
    id: 198, order_id: 102, portfolio_id: 1, symbol: '7203.T', market: 'TSE',
    side: 'BUY', quantity: 100, price: 2_480, currency: 'JPY',
    commission: 1_364, exchange_rate: 1, pnl: null,
    executed_at: '2024-02-15T09:05:02Z',
  },
  {
    id: 197, order_id: 101, portfolio_id: 1, symbol: 'AAPL', market: 'US',
    side: 'BUY', quantity: 10, price: 21_450, currency: 'JPY',
    commission: 214, exchange_rate: 144.6, pnl: null,
    executed_at: '2024-01-08T14:31:03Z',
  },
  {
    id: 195, order_id: 95, portfolio_id: 1, symbol: '6861.T', market: 'TSE',
    side: 'SELL', quantity: 30, price: 4_120, currency: 'JPY',
    commission: 617, exchange_rate: 1, pnl: 18_900,
    executed_at: '2024-09-18T14:52:00Z',
  },
  {
    id: 194, order_id: 94, portfolio_id: 1, symbol: '6861.T', market: 'TSE',
    side: 'BUY', quantity: 30, price: 3_490, currency: 'JPY',
    commission: 524, exchange_rate: 1, pnl: null,
    executed_at: '2024-07-02T09:12:00Z',
  },
  {
    id: 192, order_id: 92, portfolio_id: 1, symbol: 'META', market: 'US',
    side: 'SELL', quantity: 3, price: 71_200, currency: 'JPY',
    commission: 213, exchange_rate: 151.2, pnl: -12_300,
    executed_at: '2024-06-14T20:15:00Z',
  },
  {
    id: 191, order_id: 91, portfolio_id: 1, symbol: 'META', market: 'US',
    side: 'BUY', quantity: 3, price: 75_300, currency: 'JPY',
    commission: 226, exchange_rate: 148.5, pnl: null,
    executed_at: '2024-04-20T13:42:00Z',
  },
];

// ─── Mock Equity Curves ───────────────────────────────────────────────────────
export const portfolioEquityCurve: EquityPoint[] =
  generateEquityCurve('2024-01-04', 252, 1_000_000, 0.125, 0.16, 42);

// ─── Strategies ───────────────────────────────────────────────────────────────
export const mockStrategies: StrategyInfo[] = [
  {
    name: 'buy_and_hold',
    display_name: 'Buy & Hold',
    description: '最初にポジションを取り保有し続ける',
    is_ai: false,
    requires_api_key: false,
  },
  {
    name: 'moving_average',
    display_name: 'Moving Average Cross',
    description: 'SMA50/SMA200 のゴールデンクロス・デスクロス',
    is_ai: false,
    requires_api_key: false,
  },
  {
    name: 'rsi',
    display_name: 'RSI Strategy',
    description: 'RSI 30以下で買い、70以上で売り',
    is_ai: false,
    requires_api_key: false,
  },
  {
    name: 'claude',
    display_name: 'Claude AI',
    description: 'Claude APIによるLLM自動売買（要APIキー）',
    is_ai: true,
    requires_api_key: true,
  },
];

// ─── Mock Backtest Results ─────────────────────────────────────────────────────
function makeMetrics(
  totalReturn: number, sharpe: number, maxDD: number, winRate: number, trades: number
): PerformanceMetrics {
  return {
    total_return: 1_000_000 * totalReturn,
    total_return_pct: totalReturn * 100,
    annualized_return: totalReturn * 100 * 0.9,
    sharpe_ratio: sharpe,
    sortino_ratio: sharpe * 1.3,
    max_drawdown: maxDD,
    max_drawdown_duration: Math.round(40 / sharpe),
    win_rate: winRate,
    profit_factor: winRate > 0.5 ? 1.8 : 0.9,
    avg_win: 28_000,
    avg_loss: -14_000,
    total_trades: trades,
    calmar_ratio: (totalReturn * 100 * 0.9) / Math.abs(maxDD),
  };
}

export const mockBacktestRuns: BacktestRun[] = [
  {
    id: 1,
    strategy_name: 'buy_and_hold',
    strategy_display: 'Buy & Hold',
    symbols: ['AAPL'],
    start_date: '2024-01-04',
    end_date: '2024-12-20',
    initial_capital: 1_000_000,
    status: 'COMPLETED',
    metrics: makeMetrics(0.482, 1.21, -12.3, 1.0, 1),
    equity_curve: generateEquityCurve('2024-01-04', 252, 1_000_000, 0.48, 0.24, 101),
    trades: [],
    created_at: '2024-12-20T10:00:00Z',
    completed_at: '2024-12-20T10:00:04Z',
  },
  {
    id: 2,
    strategy_name: 'moving_average',
    strategy_display: 'Moving Average Cross',
    symbols: ['AAPL'],
    start_date: '2024-01-04',
    end_date: '2024-12-20',
    initial_capital: 1_000_000,
    status: 'COMPLETED',
    metrics: makeMetrics(0.314, 0.94, -8.7, 0.583, 12),
    equity_curve: generateEquityCurve('2024-01-04', 252, 1_000_000, 0.31, 0.18, 202),
    trades: [],
    created_at: '2024-12-20T10:00:05Z',
    completed_at: '2024-12-20T10:00:09Z',
  },
  {
    id: 3,
    strategy_name: 'rsi',
    strategy_display: 'RSI Strategy',
    symbols: ['AAPL'],
    start_date: '2024-01-04',
    end_date: '2024-12-20',
    initial_capital: 1_000_000,
    status: 'COMPLETED',
    metrics: makeMetrics(0.221, 0.71, -9.1, 0.615, 26),
    equity_curve: generateEquityCurve('2024-01-04', 252, 1_000_000, 0.22, 0.20, 303),
    trades: [],
    created_at: '2024-12-20T10:00:10Z',
    completed_at: '2024-12-20T10:00:15Z',
  },
];

export const mockComparison: ComparisonRun = {
  id: 1,
  name: 'AAPL 2024年 戦略比較',
  symbol: 'AAPL',
  start_date: '2024-01-04',
  end_date: '2024-12-20',
  initial_capital: 1_000_000,
  runs: mockBacktestRuns,
  created_at: '2024-12-20T10:00:00Z',
};

// ─── Multi-Portfolio Comparison (Dashboard) ───────────────────────────────────

// 5ポートフォリオのカラー定義（Kintsugii パレット）
export const PORTFOLIO_COLORS: Record<string, string> = {
  user:               '#E8A837', // ゴールド — ユーザー自身
  trend_follow:       '#10D9A0', // 翡翠グリーン — トレンドフォロー
  factor_selection:   '#5AA3F5', // ブルー — ファクター選択
  sector_rotation:    '#C97BDB', // パープル — セクターローテーション
  momentum_breakout:  '#FF8C57', // オレンジ — モメンタムブレイクアウト
  theme_follow:       '#A78BFA', // バイオレット — テーマ型
};

export const PORTFOLIO_COLOR_FALLBACK = ['#E8A837', '#10D9A0', '#5AA3F5', '#C97BDB', '#FF8C57'];

// 各戦略のエクイティカーブ（開始日を揃えてフラットスタート）
const START = '2024-01-04';
const DAYS = 252;
const CAPITAL = 1_000_000;

export const mockPortfolioSummaries: PortfolioSummary[] = [
  {
    id: 1,
    name: 'ユーザーポートフォリオ',
    portfolio_type: 'user',
    strategy_name: null,
    initial_capital: CAPITAL,
    total_value: 1_124_680,
    total_return_pct: 12.47,
    cash_balance: 412_680,
    position_count: 3,
    equity_curve: generateEquityCurve(START, DAYS, CAPITAL, 0.125, 0.16, 1001),
  },
  {
    id: 2,
    name: 'トレンドフォロー',
    portfolio_type: 'strategy',
    strategy_name: 'trend_follow',
    initial_capital: CAPITAL,
    total_value: 1_198_400,
    total_return_pct: 19.84,
    cash_balance: 82_300,
    position_count: 12,
    equity_curve: generateEquityCurve(START, DAYS, CAPITAL, 0.20, 0.22, 2002),
  },
  {
    id: 3,
    name: 'ファクター選択',
    portfolio_type: 'strategy',
    strategy_name: 'factor_selection',
    initial_capital: CAPITAL,
    total_value: 1_073_200,
    total_return_pct: 7.32,
    cash_balance: 312_100,
    position_count: 7,
    equity_curve: generateEquityCurve(START, DAYS, CAPITAL, 0.073, 0.09, 3003),
  },
  {
    id: 4,
    name: 'セクターローテーション',
    portfolio_type: 'strategy',
    strategy_name: 'sector_rotation',
    initial_capital: CAPITAL,
    total_value: 1_141_500,
    total_return_pct: 14.15,
    cash_balance: 145_200,
    position_count: 2,
    equity_curve: generateEquityCurve(START, DAYS, CAPITAL, 0.14, 0.14, 4004),
  },
  {
    id: 5,
    name: 'モメンタムブレイクアウト',
    portfolio_type: 'strategy',
    strategy_name: 'momentum_breakout',
    initial_capital: CAPITAL,
    total_value: 1_312_800,
    total_return_pct: 31.28,
    cash_balance: 51_600,
    position_count: 9,
    equity_curve: generateEquityCurve(START, DAYS, CAPITAL, 0.31, 0.38, 5005),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const STRATEGY_COLORS = [
  'var(--strategy-0)',
  'var(--strategy-1)',
  'var(--strategy-2)',
  'var(--strategy-3)',
] as const;

export const STRATEGY_COLORS_HEX = [
  '#E8A837',
  '#10D9A0',
  '#5AA3F5',
  '#B48EAD',
] as const;

export function formatJPY(n: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);
}

export function formatPct(n: number, decimals = 2): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

export function formatChange(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('ja-JP').format(Math.round(n))}`;
}
