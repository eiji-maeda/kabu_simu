from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class BuyAndHoldStrategy(Strategy):
    """最初のバーで全額投資し、以降は何もしない。"""

    name = "buy_and_hold"
    description = "最初にポジションを取り保有し続ける"

    def __init__(self) -> None:
        self._bought = False

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        if not self._bought and ctx.current_position is None:
            self._bought = True
            return TradeSignal(
                action=SignalAction.BUY,
                symbol=ctx.symbol,
                sizing_mode=SizingMode.PERCENT_EQUITY,
                quantity=0.95,  # 資金の 95% を投入
                reasoning="初回バー: 全額買いエントリー",
            )
        return TradeSignal.hold(ctx.symbol)

    def on_fill(self, signal: TradeSignal, fill_price: float, quantity: int) -> None:
        self._bought = True
