"""
テーマフォロー戦略
銘柄ユニバース: ユーザーが自然言語テーマから Claude API を使って選定した動的な銘柄リスト
ロジック:
  BUY  — 現在値が MA20 を上回り、かつ 1ヶ月リターンが プラス（上昇モメンタム確認）
  SELL — 現在値が MA20 の 5% 以上下落 または 取得単価から -12% 以下（損切り）
"""
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class ThemeFollowStrategy(Strategy):
    name = "theme_follow"
    description = "ユーザー定義テーマ × モメンタム追従戦略（Claude APIで銘柄選定）"

    # strategy_runner が portfolio.universe_json で上書きする
    universe: list[str] = []

    def __init__(
        self,
        ma_period: int = 20,
        ma_exit_pct: float = 0.05,   # MA を何% 下回ったら売り
        stop_loss: float = -0.12,    # 取得単価から -12% で損切り
        lookback_days: int = 21,     # 1ヶ月モメンタム計算期間（営業日）
    ) -> None:
        self.ma_period = ma_period
        self.ma_exit_pct = ma_exit_pct
        self.stop_loss = stop_loss
        self.lookback_days = lookback_days

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        df = ctx.ohlcv
        symbol = ctx.symbol

        min_bars = max(self.ma_period, self.lookback_days) + 5
        if len(df) < min_bars:
            return TradeSignal.hold(symbol, reasoning="データ不足")

        close = df["close"]
        current_price = float(ctx.current_price)

        # MA20 計算
        ma = float(close.rolling(self.ma_period).mean().iloc[-1])

        # 1ヶ月モメンタム（約 21 営業日前との比較）
        past_price = float(close.iloc[-(self.lookback_days + 1)])
        momentum_1m = (close.iloc[-1] - past_price) / past_price if past_price > 0 else 0.0

        pos = ctx.current_position

        # ポジションサイズ: ユニバース銘柄数に応じて分散（上限 15%）
        n = max(len(self.universe), 1)
        position_pct = min(0.15, 1.0 / n)

        if pos is None:
            # 上昇トレンド + モメンタム正 → 買い
            if current_price > ma and momentum_1m > 0:
                return TradeSignal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    sizing_mode=SizingMode.PERCENT_EQUITY,
                    quantity=position_pct,
                    reasoning=(
                        f"モメンタム買い: 現在値={current_price:.2f} > MA{self.ma_period}={ma:.2f}, "
                        f"1ヶ月リターン={momentum_1m:.2%}"
                    ),
                )
        else:
            avg_cost = float(pos.avg_cost)
            pnl_pct = (current_price - avg_cost) / avg_cost if avg_cost > 0 else 0.0

            # 損切り
            if pnl_pct <= self.stop_loss:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=f"損切り: {pnl_pct:.2%}（閾値: {self.stop_loss:.2%}）",
                )

            # MA 割れ（5% 以上下）
            ma_exit_threshold = ma * (1.0 - self.ma_exit_pct)
            if current_price < ma_exit_threshold:
                return TradeSignal(
                    action=SignalAction.SELL,
                    symbol=symbol,
                    sizing_mode=SizingMode.FIXED_SHARES,
                    quantity=float(pos.quantity),
                    reasoning=(
                        f"MA割れ売り: {current_price:.2f} < MA{self.ma_period}×{1-self.ma_exit_pct:.0%}={ma_exit_threshold:.2f}"
                    ),
                )

        hold_reason = (
            f"様子見: MA{self.ma_period}={ma:.2f}, 1ヶ月={momentum_1m:.2%}"
            + (f", 損益={pnl_pct:.2%}" if pos else "")
        )
        return TradeSignal.hold(symbol, reasoning=hold_reason)
