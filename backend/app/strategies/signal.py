from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum


class SignalAction(str, Enum):
    BUY  = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class SizingMode(str, Enum):
    FIXED_SHARES   = "FIXED_SHARES"    # quantity は株数
    PERCENT_EQUITY = "PERCENT_EQUITY"  # quantity はポートフォリオ比率 (0.0–1.0)
    FIXED_CASH     = "FIXED_CASH"      # quantity は投入現金額


@dataclass
class TradeSignal:
    """
    戦略が返す売買シグナル。シリアライズ可能な平坦な構造。
    LLMはこの構造体で応答する。
    """
    action: SignalAction
    symbol: str
    sizing_mode: SizingMode = SizingMode.PERCENT_EQUITY
    quantity: float = 0.0            # SizingMode による解釈が変わる
    limit_price: Decimal | None = None
    stop_price:  Decimal | None = None
    confidence:  float = 1.0         # 0.0–1.0
    reasoning:   str  = ""           # LLMが理由を記述するフィールド
    metadata:    dict = field(default_factory=dict)

    @classmethod
    def hold(cls, symbol: str, reasoning: str = "") -> "TradeSignal":
        return cls(action=SignalAction.HOLD, symbol=symbol, reasoning=reasoning)
