from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Integer, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PortfolioSnapshot(Base):
    """
    ポートフォリオの時系列評価額スナップショット。
    スケジューラが取引セッションごとに記録する（1日2回）。
    エクイティカーブの描画に使用。
    """
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(Integer, ForeignKey("portfolios.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    total_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)  # 円換算総評価額
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    session: Mapped[str] = mapped_column(String(10), nullable=False)  # "TSE_AM"|"TSE_PM"|"US_AM"|"US_PM"

    __table_args__ = (
        Index("ix_snapshot_portfolio_time", "portfolio_id", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<Snapshot portfolio={self.portfolio_id} {self.session} val={self.total_value}>"
