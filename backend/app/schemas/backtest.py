from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class PerformanceMetrics(BaseModel):
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


class EquityPoint(BaseModel):
    date: str
    value: float


class BacktestRunRequest(BaseModel):
    strategy_name: str
    symbols: list[str]
    start_date: date
    end_date: date
    initial_capital: Decimal = Decimal("1000000")
    comparison_id: int | None = None


class BacktestRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    strategy_name: str
    symbols: list[str]
    start_date: date
    end_date: date
    initial_capital: Decimal
    status: str
    metrics: PerformanceMetrics | None = None
    equity_curve: list[EquityPoint] = []
    created_at: datetime
    completed_at: datetime | None


class ComparisonRequest(BaseModel):
    name: str
    symbol: str
    start_date: date
    end_date: date
    strategy_names: list[str]
    initial_capital: Decimal = Decimal("1000000")


class ComparisonOut(BaseModel):
    id: int
    name: str
    symbol: str
    start_date: date
    end_date: date
    initial_capital: Decimal
    runs: list[BacktestRunOut]
    created_at: datetime
