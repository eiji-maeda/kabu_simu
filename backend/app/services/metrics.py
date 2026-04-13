"""パフォーマンス指標の計算。"""
import math
from dataclasses import dataclass


@dataclass
class PerformanceMetrics:
    total_return: float
    total_return_pct: float
    annualized_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    max_drawdown_duration: int
    win_rate: float
    profit_factor: float
    avg_win: float
    avg_loss: float
    total_trades: int
    calmar_ratio: float


def compute_metrics(
    equity_curve: list[float],
    pnl_list: list[float],
    risk_free_rate: float = 0.0,
    trading_days_per_year: int = 252,
) -> PerformanceMetrics:
    """
    Parameters
    ----------
    equity_curve: ポートフォリオ評価額の時系列（日次）
    pnl_list:     各クローズトレードの損益リスト
    """
    if len(equity_curve) < 2:
        return _empty_metrics(equity_curve[0] if equity_curve else 0)

    initial = equity_curve[0]
    final   = equity_curve[-1]

    # リターン系列
    returns = [
        (equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1]
        for i in range(1, len(equity_curve))
    ]

    # 総リターン
    total_return_pct = (final - initial) / initial * 100
    n_days = len(equity_curve)
    years  = n_days / trading_days_per_year
    annualized_return = ((final / initial) ** (1 / max(years, 0.01)) - 1) * 100

    # Sharpe
    mean_r = sum(returns) / len(returns)
    std_r  = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / max(len(returns) - 1, 1))
    sharpe = (
        ((mean_r - risk_free_rate / trading_days_per_year) / std_r * math.sqrt(trading_days_per_year))
        if std_r > 0 else 0.0
    )

    # Sortino (downside deviation)
    downside = [r for r in returns if r < 0]
    if downside:
        downside_std = math.sqrt(sum(r ** 2 for r in downside) / len(downside))
        sortino = (
            (mean_r - risk_free_rate / trading_days_per_year) / downside_std * math.sqrt(trading_days_per_year)
            if downside_std > 0 else 0.0
        )
    else:
        sortino = sharpe * 1.3

    # Max Drawdown
    peak = equity_curve[0]
    max_dd = 0.0
    dd_start = 0
    dd_duration = 0
    max_dd_dur = 0
    for i, v in enumerate(equity_curve):
        if v > peak:
            peak = v
            dd_start = i
        dd = (v - peak) / peak * 100
        if dd < max_dd:
            max_dd = dd
            max_dd_dur = i - dd_start

    # Trade stats
    wins  = [p for p in pnl_list if p > 0]
    losses = [p for p in pnl_list if p < 0]
    total_trades = len(pnl_list)
    win_rate = len(wins) / total_trades if total_trades > 0 else 0.0
    gross_profit = sum(wins)
    gross_loss   = abs(sum(losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    avg_win  = sum(wins)  / len(wins)   if wins   else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0

    # Calmar
    calmar = annualized_return / abs(max_dd) if max_dd < 0 else 0.0

    return PerformanceMetrics(
        total_return=final - initial,
        total_return_pct=total_return_pct,
        annualized_return=annualized_return,
        sharpe_ratio=round(sharpe, 4),
        sortino_ratio=round(sortino, 4),
        max_drawdown=round(max_dd, 4),
        max_drawdown_duration=max_dd_dur,
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 4),
        avg_win=round(avg_win, 2),
        avg_loss=round(avg_loss, 2),
        total_trades=total_trades,
        calmar_ratio=round(calmar, 4),
    )


def _empty_metrics(initial: float) -> PerformanceMetrics:
    return PerformanceMetrics(
        total_return=0, total_return_pct=0, annualized_return=0,
        sharpe_ratio=0, sortino_ratio=0, max_drawdown=0,
        max_drawdown_duration=0, win_rate=0, profit_factor=0,
        avg_win=0, avg_loss=0, total_trades=0, calmar_ratio=0,
    )
