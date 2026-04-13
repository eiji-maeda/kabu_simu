import { NavLink } from 'react-router-dom'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  {
    to: '/',
    label: 'ダッシュボード',
    end: true,
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    to: '/report',
    label: '実行レポート',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="1" width="12" height="14" rx="1.5" />
        <path d="M5 5h6M5 8h6M5 11h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/theme',
    label: 'テーマ投資',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2C5 2 2 4.5 2 7.5c0 1.5.6 2.8 1.5 3.8L3 14l2.5-1c.7.3 1.6.5 2.5.5 3 0 6-2.5 6-5.5S11 2 8 2z" strokeLinejoin="round" />
        <circle cx="6" cy="7.5" r=".8" fill="currentColor" stroke="none" />
        <circle cx="8" cy="7.5" r=".8" fill="currentColor" stroke="none" />
        <circle cx="10" cy="7.5" r=".8" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/strategy',
    label: '戦略詳細',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="5" r="3" />
        <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round" />
        <path d="M11 5h3M11 7.5h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/comparison',
    label: '戦略別一覧',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 12l4-5 3 3 3-6 4 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1 8l4-3 3 4 3-5 4 2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: '取引履歴',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/trading',
    label: '売買',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 10l4-7 3 5 2-3 3 5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1 14h14" strokeLinecap="round" />
      </svg>
    ),
  },
]

function ClockRow({ label, tz }: { label: string; tz: string }) {
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit', minute: '2-digit',
    timeZone: tz,
  }).format(new Date())
  return (
    <div className="market-status">
      <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', minWidth: 28 }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
        {time}
      </span>
    </div>
  )
}

function MarketRow({ name, open }: { name: string; open: boolean }) {
  return (
    <div className={`market-status ${open ? 'market-open' : 'market-closed'}`}>
      <div className={`market-dot ${open ? 'open' : 'closed'}`} />
      <span style={{ fontSize: '10px', letterSpacing: '0.08em' }}>{name}</span>
      <span style={{ marginLeft: 'auto', fontSize: '9px', color: open ? 'var(--positive)' : 'var(--text-tertiary)' }}>
        {open ? 'OPEN' : 'CLOSED'}
      </span>
    </div>
  )
}

function isTSEOpen(): boolean {
  const now = new Date()
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const h = jst.getHours(), m = jst.getMinutes()
  const min = h * 60 + m
  const dow = jst.getDay()
  if (dow === 0 || dow === 6) return false
  return (min >= 9*60 && min < 11*60+30) || (min >= 12*60+30 && min < 15*60+30)
}

function isNYSEOpen(): boolean {
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const h = est.getHours(), m = est.getMinutes()
  const min = h * 60 + m
  const dow = est.getDay()
  if (dow === 0 || dow === 6) return false
  return min >= 9*60+30 && min < 16*60
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Brand + toggle */}
      <div className="sidebar-brand">
        {!collapsed && (
          <>
            <div className="sidebar-brand-kanji">株シミュ</div>
            <div className="sidebar-brand-sub">KABU SIMULATOR</div>
          </>
        )}
        {collapsed && (
          <div className="sidebar-brand-kanji" style={{ fontSize: 18, textAlign: 'center' }}>株</div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="sidebar-toggle"
        title={collapsed ? 'サイドバーを開く' : 'サイドバーをしまう'}
      >
        <svg
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
          style={{
            width: 14, height: 14,
            transform: collapsed ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s ease',
          }}
        >
          <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {!collapsed && <div className="sidebar-section-label">メニュー</div>}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${collapsed ? ' nav-item-collapsed' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            {!collapsed && <span className="nav-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="sidebar-footer">
          <MarketRow name="東京証券取引所" open={isTSEOpen()} />
          <MarketRow name="NYSE / NASDAQ" open={isNYSEOpen()} />
          <div className="sep" style={{ margin: '4px 0' }} />
          <ClockRow label="JST" tz="Asia/Tokyo" />
          <ClockRow label="EST" tz="America/New_York" />
        </div>
      )}

      {/* Collapsed: market dots only */}
      {collapsed && (
        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div
            title={`東証 ${isTSEOpen() ? 'OPEN' : 'CLOSED'}`}
            className={`market-dot ${isTSEOpen() ? 'open' : 'closed'}`}
            style={{ flexShrink: 0 }}
          />
          <div
            title={`NYSE ${isNYSEOpen() ? 'OPEN' : 'CLOSED'}`}
            className={`market-dot ${isNYSEOpen() ? 'open' : 'closed'}`}
            style={{ flexShrink: 0 }}
          />
        </div>
      )}
    </aside>
  )
}
