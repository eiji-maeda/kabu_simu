from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, computed_field


# ─── Signal Report ───────────────────────────────────────────────────────────

class SignalLogOut(BaseModel):
    symbol: str
    market: str
    action: str        # "BUY" | "SELL" | "HOLD" | "ERROR"
    price: float
    reasoning: str
    executed_at: datetime


class SignalSummary(BaseModel):
    buy: int
    sell: int
    hold: int
    error: int
    total: int


class StrategySignalReport(BaseModel):
    portfolio_id: int
    strategy_name: str | None
    portfolio_name: str
    session: str
    executed_at: datetime
    signals: list[SignalLogOut]
    summary: SignalSummary


class PortfolioCreate(BaseModel):
    name: str
    currency: str = "JPY"
    initial_capital: Decimal = Decimal("1000000")


# ─── Theme Portfolio ──────────────────────────────────────────────────────────

class ThemeSymbolItem(BaseModel):
    symbol: str
    name: str
    market: str  # "TSE" | "US"


class ThemeSuggestRequest(BaseModel):
    theme: str


class ThemeSuggestResponse(BaseModel):
    theme: str
    symbols: list[ThemeSymbolItem]
    reasoning: str


class ThemePortfolioCreate(BaseModel):
    theme_name: str
    symbols: list[str]  # ["NVDA", "7203.T", ...]


class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    portfolio_id: int
    symbol: str
    market: str
    currency: str
    quantity: int
    avg_cost: Decimal
    current_price: Decimal
    opened_at: datetime
    updated_at: datetime
    # USD→JPY 換算レート。list_portfolios がセットする（JPY建て銘柄は 1.0）
    fx_rate: float = 1.0

    @computed_field
    @property
    def market_value(self) -> Decimal:
        return self.current_price * self.quantity * Decimal(str(self.fx_rate))

    @computed_field
    @property
    def unrealized_pnl(self) -> Decimal:
        return (self.current_price - self.avg_cost) * self.quantity * Decimal(str(self.fx_rate))

    @computed_field
    @property
    def unrealized_pnl_pct(self) -> float:
        if self.avg_cost == 0:
            return 0.0
        return float((self.current_price - self.avg_cost) / self.avg_cost * 100)


class PortfolioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    currency: str
    initial_capital: Decimal
    cash_balance: Decimal
    portfolio_type: str = "user"
    strategy_name: str | None = None
    theme_name: str | None = None
    created_at: datetime
    updated_at: datetime
    positions: list[PositionOut] = []

    @computed_field
    @property
    def total_value(self) -> Decimal:
        return self.cash_balance + sum(p.market_value for p in self.positions)

    @computed_field
    @property
    def unrealized_pnl(self) -> Decimal:
        return sum(p.unrealized_pnl for p in self.positions)

    @computed_field
    @property
    def total_return_pct(self) -> float:
        if self.initial_capital == 0:
            return 0.0
        return float((self.total_value - self.initial_capital) / self.initial_capital * 100)
