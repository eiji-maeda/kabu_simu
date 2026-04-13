from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

import pandas as pd


@dataclass
class PositionSnapshot:
    symbol: str
    market: str
    quantity: int
    avg_cost: Decimal
    current_price: Decimal
    unrealized_pnl: Decimal
    unrealized_pnl_pct: float


@dataclass
class MarketContext:
    """
    戦略が売買シグナルを生成するために必要なすべての情報。
    LLMに渡す際は JSON にシリアライズして使用する。
    """
    timestamp: datetime
    symbol: str
    market: str          # "TSE" | "US"
    currency: str        # "JPY" | "USD"

    current_price: Decimal
    ohlcv: pd.DataFrame  # UTC-aware DatetimeIndex, columns: open high low close volume

    cash_available: Decimal
    current_position: PositionSnapshot | None
    portfolio_value: Decimal

    # 事前計算済みテクニカル指標
    indicators: dict[str, float] = field(default_factory=dict)
    # 追加コンテキスト（LLM用ニュース等）
    metadata: dict = field(default_factory=dict)
