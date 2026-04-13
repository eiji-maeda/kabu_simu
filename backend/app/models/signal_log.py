"""
シグナルログモデル。

戦略セッション実行時に BUY / SELL / HOLD すべてのシグナル判定結果を記録する。
HOLD（売買なし）の理由も含めて保存することで、実行レポートページで
「なぜ売買したか / しなかったか」を表示できる。
"""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SignalLog(Base):
    __tablename__ = "signal_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    session: Mapped[str] = mapped_column(String(10))   # "TSE_AM" | "TSE_PM" | "US_AM" | "US_PM"
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(20))
    market: Mapped[str] = mapped_column(String(10))    # "TSE" | "US"
    action: Mapped[str] = mapped_column(String(5))     # "BUY" | "SELL" | "HOLD"
    price: Mapped[Decimal] = mapped_column(Numeric(15, 4))
    reasoning: Mapped[str] = mapped_column(Text, default="")

    __table_args__ = (
        # 直近セッションのログを高速取得するためのインデックス
        Index("ix_signal_logs_portfolio_session", "portfolio_id", "session", "executed_at"),
    )
