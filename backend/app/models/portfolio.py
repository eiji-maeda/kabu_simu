from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    portfolio_type: Mapped[str] = mapped_column(String(20), default="user")  # "user" | "strategy" | "theme"
    strategy_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    theme_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    universe_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON配列: ["NVDA","7203.T",...]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    positions: Mapped[list["Position"]] = relationship(
        "Position", back_populates="portfolio", lazy="selectin"
    )
    orders: Mapped[list["Order"]] = relationship(  # type: ignore[name-defined]
        "Order", back_populates="portfolio", lazy="selectin"
    )
    trades: Mapped[list["Trade"]] = relationship(  # type: ignore[name-defined]
        "Trade", back_populates="portfolio", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Portfolio id={self.id} name={self.name!r} cash={self.cash_balance}>"


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolios.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    market: Mapped[str] = mapped_column(String(10), nullable=False)   # TSE | US
    currency: Mapped[str] = mapped_column(String(3), nullable=False)  # JPY | USD
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_cost: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    current_price: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False, default=0)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="positions")

    @property
    def market_value(self) -> Decimal:
        return self.current_price * self.quantity

    @property
    def unrealized_pnl(self) -> Decimal:
        return (self.current_price - self.avg_cost) * self.quantity

    @property
    def unrealized_pnl_pct(self) -> float:
        if self.avg_cost == 0:
            return 0.0
        return float((self.current_price - self.avg_cost) / self.avg_cost * 100)

    def __repr__(self) -> str:
        return f"<Position {self.symbol} qty={self.quantity} avg={self.avg_cost}>"
