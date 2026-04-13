from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, DateTime, Date, ForeignKey, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comparison_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("backtest_comparisons.id"), nullable=True
    )
    strategy_name: Mapped[str] = mapped_column(String(50), nullable=False)
    symbols: Mapped[str] = mapped_column(Text, nullable=False)   # JSON list
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="RUNNING")
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)   # serialized result
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    comparison: Mapped["BacktestComparison | None"] = relationship(
        "BacktestComparison", back_populates="runs"
    )

    def __repr__(self) -> str:
        return f"<BacktestRun id={self.id} strategy={self.strategy_name} [{self.status}]>"


class BacktestComparison(Base):
    __tablename__ = "backtest_comparisons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    runs: Mapped[list["BacktestRun"]] = relationship(
        "BacktestRun", back_populates="comparison", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<BacktestComparison id={self.id} name={self.name!r}>"
