"""
バックテストエンジン。

ルックアヘッドバイアス防止:
- 各バー t で戦略に渡す ohlcv は bars[0..t] のみ（未来データなし）
- MARKET 注文は t+1 バーの open 価格で約定
"""
import json
from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal

import pandas as pd

from app.services.market_data import get_history, get_fx_rate, detect_market, detect_currency
from app.services.metrics import compute_metrics
from app.strategies.base import Strategy
from app.strategies.context import MarketContext, PositionSnapshot
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


def _resolve_quantity(signal: TradeSignal, price: float, portfolio_value: float, cash: float) -> int:
    """TradeSignal の sizing_mode に応じて株数を計算。"""
    if signal.sizing_mode == SizingMode.FIXED_SHARES:
        return max(0, int(signal.quantity))
    if signal.sizing_mode == SizingMode.PERCENT_EQUITY:
        amount = portfolio_value * signal.quantity
        qty = int(amount / price) if price > 0 else 0
        return max(0, qty)
    if signal.sizing_mode == SizingMode.FIXED_CASH:
        qty = int(signal.quantity / price) if price > 0 else 0
        return max(0, qty)
    return 0


def run_backtest(
    strategy: Strategy,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 1_000_000,
) -> dict:
    """
    Returns
    -------
    {
      "equity_curve": [{"date": str, "value": float}, ...],
      "trades": [...],
      "metrics": {...}
    }
    """
    df = get_history(symbol, period="max", interval="1d")

    # 期間フィルタ
    df = df[(df.index >= pd.Timestamp(start_date, tz="UTC"))
          & (df.index <= pd.Timestamp(end_date,   tz="UTC"))]

    if len(df) < 10:
        raise ValueError(f"データ不足: {symbol} ({start_date}〜{end_date})")

    market   = detect_market(symbol)
    currency = detect_currency(symbol)
    fx_rate  = get_fx_rate("USD", "JPY") if currency == "USD" else 1.0

    # シミュレーション状態
    cash        = float(initial_capital)
    position_qty   = 0
    position_cost  = 0.0
    equity_curve: list[dict] = []
    trades: list[dict] = []
    pnl_list: list[float] = []

    commission_rate = 0.001 if market == "US" else 0.00055

    def portfolio_value() -> float:
        pos_value = position_qty * float(df["close"].iloc[bar_idx]) * fx_rate if currency == "USD" else position_qty * float(df["close"].iloc[bar_idx])
        return cash + pos_value

    bar_idx = 0

    for bar_idx in range(len(df) - 1):
        row  = df.iloc[bar_idx]
        date = df.index[bar_idx].date().isoformat()
        close = float(row["close"])

        # 現在ポジションスナップショット
        pos_snapshot = None
        if position_qty > 0:
            price_jpy = close * fx_rate if currency == "USD" else close
            avg_cost_jpy = position_cost * fx_rate if currency == "USD" else position_cost
            pnl_pct = (price_jpy - avg_cost_jpy) / avg_cost_jpy * 100 if avg_cost_jpy > 0 else 0
            pos_snapshot = PositionSnapshot(
                symbol=symbol, market=market,
                quantity=position_qty,
                avg_cost=Decimal(str(avg_cost_jpy)),
                current_price=Decimal(str(price_jpy)),
                unrealized_pnl=Decimal(str((price_jpy - avg_cost_jpy) * position_qty)),
                unrealized_pnl_pct=pnl_pct,
            )

        ctx = MarketContext(
            timestamp=df.index[bar_idx].to_pydatetime(),
            symbol=symbol,
            market=market,
            currency=currency,
            current_price=Decimal(str(close)),
            ohlcv=df.iloc[: bar_idx + 1],   # ルックアヘッド防止
            cash_available=Decimal(str(cash)),
            current_position=pos_snapshot,
            portfolio_value=Decimal(str(portfolio_value())),
        )

        signal = strategy.generate_signal(ctx)

        # 翌バーの open で約定
        next_open = float(df["open"].iloc[bar_idx + 1])
        next_date = df.index[bar_idx + 1].date().isoformat()

        if signal.action == SignalAction.BUY and position_qty == 0:
            qty = _resolve_quantity(signal, next_open, portfolio_value(), cash)
            cost = next_open * qty
            commission = cost * commission_rate
            total = (cost + commission) * (fx_rate if currency == "USD" else 1)
            if qty > 0 and cash >= total:
                cash -= total
                position_qty  = qty
                position_cost = next_open
                trades.append({
                    "date": next_date, "side": "BUY", "symbol": symbol,
                    "quantity": qty, "price": next_open,
                    "commission": commission, "pnl": None,
                    "reasoning": signal.reasoning,
                })
                strategy.on_fill(signal, next_open, qty)

        elif signal.action == SignalAction.SELL and position_qty > 0:
            qty = (
                position_qty
                if signal.sizing_mode == SizingMode.PERCENT_EQUITY
                else min(position_qty, _resolve_quantity(signal, next_open, portfolio_value(), cash))
            )
            if qty > 0:
                proceeds = next_open * qty
                commission = proceeds * commission_rate
                net_proceeds = (proceeds - commission) * (fx_rate if currency == "USD" else 1)
                cost_basis = position_cost * qty * (fx_rate if currency == "USD" else 1)
                pnl = net_proceeds - cost_basis
                cash += net_proceeds
                pnl_list.append(pnl)
                trades.append({
                    "date": next_date, "side": "SELL", "symbol": symbol,
                    "quantity": qty, "price": next_open,
                    "commission": commission, "pnl": round(pnl, 2),
                    "reasoning": signal.reasoning,
                })
                position_qty -= qty
                if position_qty == 0:
                    position_cost = 0.0
                strategy.on_fill(signal, next_open, qty)

        # エクイティカーブを記録
        pv = portfolio_value()
        equity_curve.append({"date": date, "value": round(pv, 2)})

    # 最終バーも追記
    last_close = float(df["close"].iloc[-1])
    last_date  = df.index[-1].date().isoformat()
    pv_final   = cash + position_qty * last_close * (fx_rate if currency == "USD" else 1)
    equity_curve.append({"date": last_date, "value": round(pv_final, 2)})

    metrics = compute_metrics(
        equity_curve=[p["value"] for p in equity_curve],
        pnl_list=pnl_list,
    )

    return {
        "equity_curve": equity_curve,
        "trades": trades,
        "metrics": asdict(metrics),
    }
