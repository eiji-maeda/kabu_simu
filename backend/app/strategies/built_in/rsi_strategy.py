from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


def _rsi(series, period: int = 14) -> float:
    delta = series.diff().dropna()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean().iloc[-1]
    avg_loss = loss.rolling(period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100 - 100 / (1 + rs))


class RSIStrategy(Strategy):
    """
    RSI逆張りストラテジ。
    RSI < oversold (30) で買い、RSI > overbought (70) で売り。
    """

    name = "rsi"
    description = "RSI 30以下で買い、70以上で売り"

    def __init__(self, period: int = 14, oversold: float = 30, overbought: float = 70) -> None:
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        if len(df) < self.period + 5:
            return TradeSignal.hold(ctx.symbol, reasoning="データ不足")

        rsi = _rsi(df["close"], self.period)

        if rsi < self.oversold and ctx.current_position is None:
            return TradeSignal(
                action=SignalAction.BUY,
                symbol=ctx.symbol,
                sizing_mode=SizingMode.PERCENT_EQUITY,
                quantity=0.9,
                reasoning=f"RSI={rsi:.1f} < {self.oversold}（売られすぎ）",
                confidence=min(1.0, (self.oversold - rsi) / self.oversold),
            )

        if rsi > self.overbought and ctx.current_position is not None and ctx.current_position.quantity > 0:
            return TradeSignal(
                action=SignalAction.SELL,
                symbol=ctx.symbol,
                sizing_mode=SizingMode.FIXED_SHARES,
                quantity=float(ctx.current_position.quantity),
                reasoning=f"RSI={rsi:.1f} > {self.overbought}（買われすぎ）",
                confidence=min(1.0, (rsi - self.overbought) / (100 - self.overbought)),
            )

        return TradeSignal.hold(ctx.symbol, reasoning=f"RSI={rsi:.1f}（中立）")
