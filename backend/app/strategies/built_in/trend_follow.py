"""
トレンドフォロー戦略
銘柄ユニバース: 大型株（TOPIX100 + S&P500）
ロジック: SMA50/SMA200 クロス + MACD (12/26/9) で買い・売りシグナルを判断
"""
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class TrendFollowStrategy(Strategy):
    name = "trend_follow"
    description = "大型株（TOPIX100/S&P500）× SMA/MACD トレンドフォロー"

    universe = [
        # TSE — TOPIX100 大型株
        "7203.T",  # トヨタ自動車
        "6758.T",  # ソニーグループ
        "8306.T",  # 三菱UFJフィナンシャル
        "9984.T",  # ソフトバンクグループ
        "6861.T",  # キーエンス
        "7974.T",  # 任天堂
        "8411.T",  # みずほフィナンシャル
        "6902.T",  # デンソー
        "4063.T",  # 信越化学工業
        "9433.T",  # KDDI
        # US — S&P500 大型株
        "AAPL",
        "MSFT",
        "AMZN",
        "NVDA",
        "GOOGL",
        "META",
        "TSLA",
        "JPM",
        "V",
        "JNJ",
    ]

    def __init__(self, fast: int = 50, slow: int = 200, macd_fast: int = 12, macd_slow: int = 26, macd_signal: int = 9) -> None:
        self.fast = fast
        self.slow = slow
        self.macd_fast = macd_fast
        self.macd_slow = macd_slow
        self.macd_signal = macd_signal
        self._prev_cross: dict[str, str] = {}  # symbol → "above"|"below"
        self._prev_macd_above: dict[str, bool] = {}  # symbol → macd > signal line

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        symbol = ctx.symbol

        if len(df) < self.slow + self.macd_signal:
            return TradeSignal.hold(symbol, reasoning="データ不足")

        close = df["close"]

        # SMA クロス
        sma_fast = float(close.rolling(self.fast).mean().iloc[-1])
        sma_slow = float(close.rolling(self.slow).mean().iloc[-1])
        current_cross = "above" if sma_fast > sma_slow else "below"

        # MACD
        ema_fast = close.ewm(span=self.macd_fast, adjust=False).mean()
        ema_slow = close.ewm(span=self.macd_slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=self.macd_signal, adjust=False).mean()
        macd_above = bool(macd_line.iloc[-1] > signal_line.iloc[-1])

        prev_cross = self._prev_cross.get(symbol)
        prev_macd_above = self._prev_macd_above.get(symbol)

        result = TradeSignal.hold(symbol)

        if prev_cross is not None and prev_macd_above is not None:
            golden_cross = (prev_cross == "below" and current_cross == "above")
            macd_bullish = (not prev_macd_above and macd_above)
            death_cross = (prev_cross == "above" and current_cross == "below")
            macd_bearish = (prev_macd_above and not macd_above)

            if (golden_cross or macd_bullish) and ctx.current_position is None:
                trigger = "ゴールデンクロス" if golden_cross else "MACDゴールデンクロス"
                result = TradeSignal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    sizing_mode=SizingMode.PERCENT_EQUITY,
                    quantity=0.08,  # 1銘柄あたり資産の8%（多銘柄分散）
                    reasoning=f"{trigger}: SMA{self.fast}={sma_fast:.2f}, SMA{self.slow}={sma_slow:.2f}",
                )
            elif (death_cross or macd_bearish) and ctx.current_position is not None and ctx.current_position.quantity > 0:
                trigger = "デスクロス" if death_cross else "MACDデスクロス"
                result = TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(ctx.current_position.quantity),
                    reasoning=f"{trigger}: SMA{self.fast}={sma_fast:.2f}, SMA{self.slow}={sma_slow:.2f}",
                )

        self._prev_cross[symbol] = current_cross
        self._prev_macd_above[symbol] = macd_above
        return result
