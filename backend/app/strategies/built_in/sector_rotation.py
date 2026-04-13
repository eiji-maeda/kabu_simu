"""
セクターローテーション戦略
銘柄ユニバース: 米国セクターETF (SPDR)
ロジック: 3ヶ月（63日）相対モメンタムで上位2セクターを保有、下位は売却
各ETFに対して個別に呼ばれるが、ユニバース全体のランキングを計算するため
MarketContextのmetadataにスコアを渡す（strategy_runner側でrankingを計算）
"""
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal

# 上位何セクターを保有するか
TOP_N = 2
# ポートフォリオ当たりの配分（TOP_N で割る）
ALLOCATION_PER_SECTOR = 0.45  # 2セクター × 45% = 90%


class SectorRotationStrategy(Strategy):
    name = "sector_rotation"
    description = "セクターETF × 相対モメンタム ローテーション戦略"

    universe = [
        "XLK",   # 情報技術
        "XLE",   # エネルギー
        "XLV",   # ヘルスケア
        "XLF",   # 金融
        "XLI",   # 資本財
        "XLY",   # 一般消費財
        "XLU",   # 公益
        "XLRE",  # 不動産
        "XLB",   # 素材
    ]

    def __init__(self, momentum_period: int = 63) -> None:
        self.momentum_period = momentum_period  # 3ヶ月
        # セッションごとにリセットされるランキング
        self._top_symbols: list[str] = []

    def set_rankings(self, top_symbols: list[str]) -> None:
        """strategy_runner が全銘柄のモメンタムを計算してから呼び出す。"""
        self._top_symbols = top_symbols

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        symbol = ctx.symbol

        if len(df) < self.momentum_period + 5:
            return TradeSignal.hold(symbol, reasoning="データ不足")

        # ランキングが未設定の場合はHOLD
        if not self._top_symbols:
            # 自力でモメンタムを計算してシンプルに判断
            close = df["close"]
            momentum = float(close.iloc[-1] / close.iloc[-self.momentum_period] - 1)
            # トップ2かどうかは単体では判断できないのでHOLD
            return TradeSignal.hold(symbol, reasoning=f"ランキング未設定 (momentum={momentum:.2%})")

        pos = ctx.current_position
        in_top = symbol in self._top_symbols

        if in_top and pos is None:
            return TradeSignal(
                action=SignalAction.BUY,
                symbol=symbol,
                sizing_mode=SizingMode.PERCENT_EQUITY,
                quantity=ALLOCATION_PER_SECTOR,
                reasoning=f"上位セクター: {symbol} がトップ{TOP_N}入り",
            )
        elif not in_top and pos is not None and pos.quantity > 0:
            return TradeSignal(
                action=SignalAction.SELL,
                symbol=symbol,
                sizing_mode=SizingMode.FIXED_SHARES,
                quantity=float(pos.quantity),
                reasoning=f"ローテーション売り: {symbol} がトップ{TOP_N}外れ",
            )

        return TradeSignal.hold(symbol)
