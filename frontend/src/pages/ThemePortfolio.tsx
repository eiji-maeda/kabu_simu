import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConfigStatus, createThemePortfolio, getPortfolios,
  type PortfolioOut,
} from '../lib/api'
import { formatJPY, formatPct } from '../lib/mockData'

const THEME_EXAMPLES = [
  '生成AI・大規模言語モデル',
  '半導体・チップ製造',
  '電気自動車・EV',
  '高配当日本株',
  'サイバーセキュリティ',
  'クラウドインフラ',
  '再生可能エネルギー',
  'フィンテック・決済',
  '宇宙開発・衛星',
  '医療・バイオテック',
  '防衛・セキュリティ',
  'ロボティクス・自動化',
]

// ─── Components ──────────────────────────────────────────────────────────────

function ApiKeyWarning() {
  const { data } = useQuery({
    queryKey: ['configStatus'],
    queryFn: getConfigStatus,
    staleTime: 60_000,
  })
  if (!data || data.anthropic_api_key_set) return null
  return (
    <div style={{
      background: 'rgba(248,113,113,0.08)',
      borderBottom: '1px solid rgba(248,113,113,0.2)',
      padding: '6px 20px',
      fontFamily: 'var(--font-mono)', fontSize: 11,
      color: 'var(--negative)', letterSpacing: '0.03em',
    }}>
      ⚠ ANTHROPIC_API_KEY が未設定です — バックエンドの .env に設定してください
    </div>
  )
}

function ThemeCard({ portfolio, onDelete }: { portfolio: PortfolioOut; onDelete: () => void }) {
  const returnPct = portfolio.total_return_pct
  const themeName = (portfolio as any).theme_name ?? portfolio.name
  const colors = ['#A78BFA', '#FB923C', '#34D399', '#60A5FA', '#F472B6', '#FBBF24']
  const color = colors[portfolio.id % colors.length]

  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}60` }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{themeName}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px',
              borderRadius: 4, background: 'rgba(167,139,250,0.12)', color: '#A78BFA',
              letterSpacing: '0.08em',
            }}>テーマ型</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 16 }}>
            銘柄ユニバースは毎回の売買実行時に Claude AI が選定します
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}>
            {formatJPY(Number(portfolio.total_value))}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            background: returnPct >= 0 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
            color: returnPct >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}>
            {returnPct >= 0 ? '+' : ''}{formatPct(returnPct)}
          </div>
          <button
            onClick={onDelete}
            style={{
              background: 'none', border: '1px solid rgba(248,113,113,0.3)',
              color: 'var(--negative)', borderRadius: 'var(--radius-sm)',
              padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ThemePortfolio() {
  const qc = useQueryClient()
  const [theme, setTheme] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
    refetchInterval: 30_000,
  })
  const themePortfolios = portfolios.filter(p => p.portfolio_type === 'theme')

  const createMutation = useMutation({
    mutationFn: () => createThemePortfolio({ theme_name: theme.trim(), symbols: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['portfolioComparison'] })
      showToast(`「${theme.trim()}」テーマを登録しました`, true)
      setTheme('')
    },
    onError: (e: Error) => showToast(e.message, false),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/portfolios/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除失敗')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      showToast('テーマを削除しました', true)
    },
  })

  const canCreate = theme.trim().length > 0 && !createMutation.isPending

  return (
    <div style={{ position: 'relative' }}>
      <ApiKeyWarning />

      <div className="page-container">
        <div className="page-header anim-fade-up">
          <div>
            <div className="page-title">テーマ型投資</div>
            <div className="page-subtitle">
              テーマを登録すると、毎回の売買実行時に Claude AI が関連銘柄を自動選定して売買します
            </div>
          </div>
        </div>

        {/* 登録フォーム */}
        <div className="card anim-fade-up" style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            新しいテーマを登録
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="例: 生成AI・大規模言語モデル、半導体、高配当日本株…"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) createMutation.mutate() }}
              style={{ flex: 1 }}
            />
            <button
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
              style={{
                background: canCreate ? 'rgba(167,139,250,0.15)' : 'var(--bg-elevated)',
                border: `1px solid ${canCreate ? 'rgba(167,139,250,0.4)' : 'var(--border)'}`,
                color: canCreate ? '#A78BFA' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                padding: '10px 20px', borderRadius: 'var(--radius-md)',
                cursor: canCreate ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {createMutation.isPending ? '登録中…' : '登録'}
            </button>
          </div>

          {/* テーマ例 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {THEME_EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setTheme(ex)}
                style={{
                  padding: '3px 10px',
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  background: theme === ex ? 'rgba(167,139,250,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${theme === ex ? 'rgba(167,139,250,0.35)' : 'var(--border)'}`,
                  color: theme === ex ? '#A78BFA' : 'var(--text-tertiary)',
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* 仕組み説明 */}
          <div style={{
            marginTop: 16, padding: 12,
            background: 'rgba(167,139,250,0.06)',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '2px solid rgba(167,139,250,0.3)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#A78BFA', marginBottom: 6, letterSpacing: '0.08em' }}>
              仕組み
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              テーマを登録すると、毎日の東証・米国セッション実行時に Claude AI がその日の市場状況を踏まえてテーマに合った銘柄を10〜15本自動選定します。選定された銘柄に対して「MA20上 + 1ヶ月モメンタム正」で買い、「MA割れ / -12%損切り」で売るモメンタム追従ロジックが動きます。
            </div>
          </div>
        </div>

        {/* 登録済みテーマ */}
        {isLoading && (
          <div className="card" style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>読み込み中…</span>
          </div>
        )}

        {!isLoading && themePortfolios.length > 0 && (
          <div className="anim-fade-up">
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10,
            }}>
              登録済みテーマ（{themePortfolios.length}件）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {themePortfolios.map(p => (
                <ThemeCard
                  key={p.id}
                  portfolio={p}
                  onDelete={() => deleteMutation.mutate(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {!isLoading && themePortfolios.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--text-tertiary)' }}>◎</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              テーマを入力して登録してください
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 100,
          background: toast.ok ? 'rgba(16,217,160,0.15)' : 'rgba(248,113,113,0.15)',
          border: `1px solid ${toast.ok ? 'rgba(16,217,160,0.4)' : 'rgba(248,113,113,0.4)'}`,
          color: toast.ok ? 'var(--positive)' : 'var(--negative)',
          borderRadius: 8, padding: '12px 20px',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          backdropFilter: 'blur(12px)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
