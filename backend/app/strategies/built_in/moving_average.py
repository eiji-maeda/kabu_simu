from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class MovingAverageCrossStrategy(Strategy):
    """
    SMA50 / SMA200 クロスストラテジ。
    ゴールデンクロス（SMA50 > SMA200）で買い、
    デスクロス（SMA50 < SMA200）で売り。
    """

    name = "moving_average"
    description = "SMA50/SMA200 のゴールデンクロス・デスクロス"

    def __init__(self, fast: int = 50, slow: int = 200) -> None:
        self.fast = fast
        self.slow = slow
        self._prev_cross: str | None = None  # "above" | "below"

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        if len(df) < self.slow:
            return TradeSignal.hold(ctx.symbol, reasoning="データ不足")

        close = df["close"]
        sma_fast = float(close.rolling(self.fast).mean().iloc[-1])
        sma_slow = float(close.rolling(self.slow).mean().iloc[-1])

        current_cross = "above" if sma_fast > sma_slow else "below"

        signal = TradeSignal.hold(ctx.symbol)

        if self._prev_cross is not None:
            if self._prev_cross == "below" and current_cross == "above":
                # ゴールデンクロス → 買い
                if ctx.current_position is None:
                    signal = TradeSignal(
                        action=SignalAction.BUY,
                        symbol=ctx.symbol,
                        sizing_mode=SizingMode.PERCENT_EQUITY,
                        quantity=0.95,
                        reasoning=f"ゴールデンクロス: SMA{self.fast}={sma_fast:.2f} > SMA{self.slow}={sma_slow:.2f}",
                    )
            elif self._prev_cross == "above" and current_cross == "below":
                # デスクロス → 売り
                if ctx.current_position is not None and ctx.current_position.quantity > 0:
                    signal = TradeSignal(
                        action=SignalAction.SELL,
                        symbol=ctx.symbol,
                        sizing_mode=SizingMode.FIXED_SHARES,
                        quantity=float(ctx.current_position.quantity),
                        reasoning=f"デスクロス: SMA{self.fast}={sma_fast:.2f} < SMA{self.slow}={sma_slow:.2f}",
                    )

        self._prev_cross = current_cross
        return signal
