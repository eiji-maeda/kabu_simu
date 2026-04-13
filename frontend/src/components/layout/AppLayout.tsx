import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  const toggle = () => {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v))
      return !v
    })
  }

  return (
    <div className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
