from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    portfolio_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolios.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    market: Mapped[str] = mapped_column(String(10), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)   # ネイティブ通貨
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    commission: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=1)  # JPY/USD
    pnl: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)  # SELL時のみ
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="trades")  # type: ignore[name-defined]
    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="trades")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<Trade id={self.id} {self.side} {self.quantity}x{self.symbol} @{self.price}>"
