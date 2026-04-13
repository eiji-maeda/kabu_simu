from app.strategies.base import Strategy
from app.strategies.built_in.buy_and_hold import BuyAndHoldStrategy
from app.strategies.built_in.moving_average import MovingAverageCrossStrategy
from app.strategies.built_in.rsi_strategy import RSIStrategy
from app.strategies.built_in.trend_follow import TrendFollowStrategy
from app.strategies.built_in.factor_selection import FactorSelectionStrategy
from app.strategies.built_in.sector_rotation import SectorRotationStrategy
from app.strategies.built_in.momentum_breakout import MomentumBreakoutStrategy
from app.strategies.built_in.theme_follow import ThemeFollowStrategy

STRATEGY_REGISTRY: dict[str, type[Strategy]] = {
    "buy_and_hold":       BuyAndHoldStrategy,
    "moving_average":     MovingAverageCrossStrategy,
    "rsi":                RSIStrategy,
    "trend_follow":       TrendFollowStrategy,
    "factor_selection":   FactorSelectionStrategy,
    "sector_rotation":    SectorRotationStrategy,
    "momentum_breakout":  MomentumBreakoutStrategy,
    "theme_follow":       ThemeFollowStrategy,
}

STRATEGY_INFO: list[dict] = [
    {
        "name": "buy_and_hold",
        "display_name": "Buy & Hold",
        "description": "最初にポジションを取り保有し続ける",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "moving_average",
        "display_name": "Moving Average Cross",
        "description": "SMA50/SMA200 のゴールデンクロス・デスクロス",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "rsi",
        "display_name": "RSI Strategy",
        "description": "RSI 30以下で買い、70以上で売り",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "trend_follow",
        "display_name": "トレンドフォロー",
        "description": "大型株（TOPIX100/S&P500）× SMA/MACD トレンドフォロー",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "factor_selection",
        "display_name": "ファクター選択",
        "description": "高配当・バリュー株 × Value + Quality 複合ファクター",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "sector_rotation",
        "display_name": "セクターローテーション",
        "description": "セクターETF × 相対モメンタム ローテーション戦略",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "momentum_breakout",
        "display_name": "モメンタムブレイクアウト",
        "description": "中小型グロース株 × 52週高値ブレイクアウト",
        "is_ai": False,
        "requires_api_key": False,
    },
    {
        "name": "claude",
        "display_name": "Claude AI",
        "description": "Claude APIによるLLM自動売買（要APIキー）",
        "is_ai": True,
        "requires_api_key": True,
    },
]
