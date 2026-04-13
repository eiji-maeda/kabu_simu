import { useState } from 'react'
import { EquityAreaChart } from '../components/charts/EquityChart'
import { mockStrategies, mockBacktestRuns, formatJPY, formatPct } from '../lib/mockData'

export default function Backtest() {
  const [selectedStrategy, setSelectedStrategy] = useState('moving_average')
  const [symbol, setSymbol] = useState('AAPL')
  const [startDate, setStartDate] = useState('2024-01-04')
  const [endDate, setEndDate] = useState('2024-12-20')
  const [hasRun, setHasRun] = useState(true)

  const result = hasRun
    ? mockBacktestRuns.find(r => r.strategy_name === selectedStrategy) ?? null
    : null

  const metrics = result?.metrics ?? null

  function MetricRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
    return (
      <div className="flex justify-between items-center" style={{
        padding: '9px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span className={`mono text-sm ${className}`} style={{ fontWeight: 500 }}>{value}</span>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header anim-fade-up">
        <div>
          <div className="page-title">バックテスト</div>
          <div className="page-subtitle">ヒストリカルデータでストラテジを検証する</div>
        </div>
      </div>

      <div className="grid-sidebar" style={{ alignItems: 'start' }}>
        {/* ── Config Panel ─────────────────────────────────── */}
        <div>
          <div className="card card-gold anim-fade-up anim-d1">
            <div className="section-label">バックテスト設定</div>

            <div className="form-group mb-12">
              <label className="form-label">ストラテジ</label>
              <select
                className="form-input form-select"
                value={selectedStrategy}
                onChange={e => setSelectedStrategy(e.target.value)}
              >
                {mockStrategies.filter(s => !s.requires_api_key).map(s => (
                  <option key={s.name} value={s.name}>{s.display_name}</option>
                ))}
              </select>
            </div>

            {selectedStrategy && (
              <div style={{
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                marginBottom: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}>
                {mockStrategies.find(s => s.name === selectedStrategy)?.description}
              </div>
            )}

            <div className="form-group mb-12">
              <label className="form-label">銘柄コード</label>
              <input
                className="form-input mono"
                type="text"
                placeholder="例: AAPL, 7203.T"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
              />
            </div>

            <div className="grid-2 mb-12">
              <div className="form-group">
                <label className="form-label">開始日</label>
                <input
                  className="form-input mono"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">終了日</label>
                <input
                  className="form-input mono"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group mb-16">
              <label className="form-label">初期資本</label>
              <div className="form-input mono" style={{ background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>¥</span>
                <span style={{ color: 'var(--gold)' }}>1,000,000</span>
              </div>
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => setHasRun(true)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6" />
                <path d="M6 5l5 3-5 3V5z" fill="currentColor" stroke="none" />
              </svg>
              バックテスト実行
            </button>
          </div>

          {/* Running info */}
          {result && (
            <div className="card mt-16 anim-fade-up anim-d2">
              <div className="section-label">実行情報</div>
              <MetricRow label="ストラテジ" value={result.strategy_display} />
              <MetricRow label="銘柄" value={result.symbols.join(', ')} />
              <MetricRow label="期間" value={`${result.start_date} 〜 ${result.end_date}`} />
              <MetricRow label="初期資本" value={formatJPY(result.initial_capital)} />
              <MetricRow label="実行時間" value="0.32 秒" />
            </div>
          )}
        </div>

        {/* ── Results Panel ─────────────────────────────────── */}
        <div>
          {!result ? (
            <div className="card" style={{ minHeight: 400 }}>
              <div className="empty-state">
                <div className="empty-state-icon">⟳</div>
                <div className="empty-state-text">
                  左のフォームでバックテストを<br />設定して実行してください
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Equity Curve */}
              <div className="card mb-16 anim-fade-up anim-d1">
                <div className="flex justify-between items-center mb-16">
                  <div className="section-label" style={{ marginBottom: 0 }}>エクイティカーブ</div>
                  <div className="flex gap-8 items-center" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <div style={{ width: 16, height: 2, background: 'var(--gold)', borderRadius: 1 }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{result.strategy_display}</span>
                  </div>
                </div>
                <EquityAreaChart
                  data={result.equity_curve}
                  height={260}
                  initialCapital={result.initial_capital}
                />
              </div>

              {/* Metrics Grid */}
              {metrics && (
                <div className="card anim-fade-up anim-d2">
                  <div className="section-label">パフォーマンス指標</div>
                  <div className="grid-2" style={{ gap: 12 }}>
                    {[
                      { label: '総リターン', value: formatPct(metrics.total_return_pct), cls: metrics.total_return_pct >= 0 ? 'positive' : 'negative' },
                      { label: '年率リターン', value: formatPct(metrics.annualized_return), cls: metrics.annualized_return >= 0 ? 'positive' : 'negative' },
                      { label: 'シャープ比', value: metrics.sharpe_ratio.toFixed(2), cls: metrics.sharpe_ratio >= 1 ? 'gold' : '' },
                      { label: 'ソルティノ比', value: metrics.sortino_ratio.toFixed(2), cls: '' },
                      { label: '最大ドローダウン', value: formatPct(metrics.max_drawdown), cls: 'negative' },
                      { label: 'DD期間', value: `${metrics.max_drawdown_duration} 日`, cls: '' },
                      { label: '勝率', value: formatPct(metrics.win_rate * 100, 1), cls: metrics.win_rate > 0.5 ? 'positive' : '' },
                      { label: 'プロフィットファクター', value: metrics.profit_factor.toFixed(2), cls: metrics.profit_factor >= 1.5 ? 'positive' : '' },
                      { label: '平均利益', value: formatJPY(metrics.avg_win), cls: 'positive' },
                      { label: '平均損失', value: formatJPY(metrics.avg_loss), cls: 'negative' },
                      { label: '総取引数', value: `${metrics.total_trades} 回`, cls: '' },
                      { label: 'カルマー比', value: metrics.calmar_ratio.toFixed(2), cls: '' },
                    ].map(m => (
                      <div key={m.label} className="metric-card" style={{ padding: '14px 16px', gap: 4 }}>
                        <div className="metric-label">{m.label}</div>
                        <div className={`metric-value ${m.cls}`} style={{ fontSize: 20 }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
