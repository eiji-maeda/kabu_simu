from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolios.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    market: Mapped[str] = mapped_column(String(10), nullable=False)
    order_type: Mapped[str] = mapped_column(String(10), nullable=False)   # MARKET | LIMIT | STOP
    side: Mapped[str] = mapped_column(String(4), nullable=False)          # BUY | SELL
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    stop_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="PENDING")
    filled_quantity: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    commission: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    strategy_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    portfolio: Mapped["Portfolio"] = relationship(  # type: ignore[name-defined]
        "Portfolio", back_populates="orders"
    )
    trades: Mapped[list["Trade"]] = relationship(  # type: ignore[name-defined]
        "Trade", back_populates="order", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Order id={self.id} {self.side} {self.quantity}x{self.symbol} [{self.status}]>"
