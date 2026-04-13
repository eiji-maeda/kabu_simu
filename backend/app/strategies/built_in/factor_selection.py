"""
ファクター選択戦略
銘柄ユニバース: 高配当・バリュー株（TSE + US）
ロジック: 20日移動平均乖離率（バリューファクター）+ 低ボラティリティ（クオリティファクター）
価格が20日MAを下回ったら買い候補、上回り始めたら保有継続、急落したら売り
"""
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class FactorSelectionStrategy(Strategy):
    name = "factor_selection"
    description = "高配当・バリュー株 × Value + Quality 複合ファクター"

    universe = [
        # TSE — 高配当・バリュー株
        "8306.T",  # 三菱UFJフィナンシャル（高配当・メガバンク）
        "8411.T",  # みずほフィナンシャル（高配当・メガバンク）
        "8316.T",  # 三井住友フィナンシャル（高配当）
        "5020.T",  # ENEOSホールディングス（エネルギー・高配当）
        "9101.T",  # 日本郵船（海運・高配当）
        "9104.T",  # 商船三井（海運・高配当）
        "8031.T",  # 三井物産（商社・高配当）
        "8058.T",  # 三菱商事（商社・高配当）
        # US — バリュー/高配当ETF・個別株
        "VYM",    # Vanguard High Dividend Yield ETF
        "SCHD",   # Schwab US Dividend Equity ETF
        "JNJ",    # Johnson & Johnson（ディフェンシブ高配当）
        "KO",     # Coca-Cola（ディフェンシブ高配当）
        "PG",     # P&G（ディフェンシブ高配当）
        "XOM",    # ExxonMobil（エネルギー高配当）
        "CVX",    # Chevron（エネルギー高配当）
    ]

    def __init__(self, ma_period: int = 20, vol_period: int = 20, buy_threshold: float = -0.03, stop_loss: float = -0.08) -> None:
        self.ma_period = ma_period
        self.vol_period = vol_period
        self.buy_threshold = buy_threshold  # MAから-3%乖離で買い
        self.stop_loss = stop_loss  # -8%で損切り

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        symbol = ctx.symbol

        if len(df) < self.ma_period + 5:
            return TradeSignal.hold(symbol, reasoning="データ不足")

        close = df["close"]
        current_price = float(ctx.current_price)

        ma = float(close.rolling(self.ma_period).mean().iloc[-1])
        deviation = (current_price - ma) / ma  # MA乖離率

        # ボラティリティ（低ければクオリティが高い）
        returns = close.pct_change().dropna()
        vol = float(returns.rolling(self.vol_period).std().iloc[-1]) if len(returns) >= self.vol_period else 0.05
        is_low_vol = vol < 0.025  # 日次ボラ2.5%未満をクオリティ銘柄とみなす

        pos = ctx.current_position

        if pos is None:
            # 価格がMAを下回っており、かつ低ボラ銘柄 → バリュー買い
            if deviation <= self.buy_threshold and is_low_vol:
                return TradeSignal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    sizing_mode=SizingMode.PERCENT_EQUITY,
                    quantity=0.10,  # 1銘柄あたり10%
                    reasoning=f"バリュー買い: MA乖離={deviation:.2%}, ボラ={vol:.2%}",
                )
        else:
            # 損切りチェック
            avg_cost = float(pos.avg_cost)
            pnl_pct = (current_price - avg_cost) / avg_cost
            if pnl_pct <= self.stop_loss:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=f"損切り: {pnl_pct:.2%}",
                )
            # 価格がMAを大きく上回った → 利確（オーバーバリュー）
            if deviation > 0.10:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=f"利確: MA乖離={deviation:.2%}（割高）",
                )

        return TradeSignal.hold(symbol)
