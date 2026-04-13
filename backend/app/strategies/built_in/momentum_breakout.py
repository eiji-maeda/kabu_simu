"""
モメンタムブレイクアウト戦略
銘柄ユニバース: 中小型グロース株（US + TSE）
ロジック:
  BUY  — 終値が過去252バー（約1年）の高値を更新（52週高値ブレイクアウト）
  SELL — 終値が30日移動平均を下回る、または取得単価から-12%以下（損切り）
"""
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class MomentumBreakoutStrategy(Strategy):
    name = "momentum_breakout"
    description = "中小型グロース株 × 52週高値ブレイクアウト モメンタム戦略"

    universe = [
        # US — 中小型グロース株
        "AXON",   # Axon Enterprise（公安テック）
        "CRWD",   # CrowdStrike（サイバーセキュリティ）
        "DDOG",   # Datadog（クラウド監視）
        "SNOW",   # Snowflake（データクラウド）
        "NET",    # Cloudflare（クラウドネットワーク）
        "FTNT",   # Fortinet（ネットワークセキュリティ）
        "ZS",     # Zscaler（クラウドセキュリティ）
        "CELH",   # Celsius Holdings（飲料グロース）
        "ENPH",   # Enphase Energy（ソーラー）
        "SMCI",   # Super Micro Computer（サーバー）
        # TSE — 中小型グロース株
        "4385.T",  # メルカリ
        "3697.T",  # SHIFT（IT人材）
        "4369.T",  # トリケミカル研究所
        "4477.T",  # BASE（ECプラットフォーム）
    ]

    def __init__(self, lookback: int = 252, ma_exit: int = 30, stop_loss: float = -0.12) -> None:
        self.lookback = lookback   # 52週高値の計算期間
        self.ma_exit = ma_exit     # 売りトリガーの移動平均
        self.stop_loss = stop_loss  # 損切りライン（-12%）

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        symbol = ctx.symbol

        min_bars = max(self.lookback, self.ma_exit) + 5
        if len(df) < min_bars:
            return TradeSignal.hold(symbol, reasoning="データ不足")

        close = df["close"]
        high = df["high"]
        current_price = float(ctx.current_price)

        # 52週高値（現在バー除く）
        week52_high = float(high.iloc[-(self.lookback + 1):-1].max())
        ma_exit_val = float(close.rolling(self.ma_exit).mean().iloc[-1])

        pos = ctx.current_position

        if pos is None:
            # 52週高値ブレイクアウト → 買い
            if current_price > week52_high:
                return TradeSignal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    sizing_mode=SizingMode.PERCENT_EQUITY,
                    quantity=0.07,  # 1銘柄あたり7%（多銘柄分散）
                    reasoning=f"52週高値ブレイク: {current_price:.2f} > {week52_high:.2f}",
                )
        else:
            avg_cost = float(pos.avg_cost)
            pnl_pct = (current_price - avg_cost) / avg_cost

            # 損切り
            if pnl_pct <= self.stop_loss:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=f"損切り: {pnl_pct:.2%}（閾値: {self.stop_loss:.2%}）",
                )
            # MA割れ → トレンド終了
            if current_price < ma_exit_val:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=f"MA{self.ma_exit}割れ: {current_price:.2f} < {ma_exit_val:.2f}",
                )

        return TradeSignal.hold(symbol)
