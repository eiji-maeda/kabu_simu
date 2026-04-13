import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Trading from './pages/Trading'
import Backtest from './pages/Backtest'
import Comparison from './pages/Comparison'
import History from './pages/History'
import Report from './pages/Report'
import StrategyDetail from './pages/StrategyDetail'
import ThemePortfolio from './pages/ThemePortfolio'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="trading" element={<Trading />} />
          <Route path="report" element={<Report />} />
          <Route path="comparison" element={<Comparison />} />
          <Route path="history" element={<History />} />
          <Route path="strategy" element={<StrategyDetail />} />
          <Route path="theme" element={<ThemePortfolio />} />
          <Route path="backtest" element={<Backtest />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
