"""
注文執行エンジン。

ルール:
- MARKET 注文: 現在値で即時約定
- LIMIT 注文: 現在値が指値以下（BUY）/ 以上（SELL）なら約定
- STOP 注文: 現在値が逆指値以上（BUY）/ 以下（SELL）なら約定
- 手数料: 米国株 0.1%、日本株 0.055%
- P&L: FIFO コスト基準で実現損益を計算
- 通貨: USD株のコストは JPY ポートフォリオに換算して保存
"""
from datetime import datetime, timezone
from decimal import Decimal

from app.core.config import settings
from app.core.exceptions import InsufficientFundsError, InsufficientPositionError, OrderError
from app.models.order import Order
from app.models.portfolio import Portfolio, Position
from app.models.trade import Trade
from app.services.market_data import detect_currency, detect_market, get_fx_rate


def _commission_rate(market: str) -> float:
    return settings.commission_rate_us if market == "US" else settings.commission_rate_tse


def _to_portfolio_currency(
    amount: Decimal,
    trade_currency: str,
    portfolio_currency: str,
    fx_rate: float,
) -> Decimal:
    """trade_currency → portfolio_currency に変換。"""
    if trade_currency == portfolio_currency:
        return amount
    if trade_currency == "USD" and portfolio_currency == "JPY":
        return amount * Decimal(str(fx_rate))
    if trade_currency == "JPY" and portfolio_currency == "USD":
        return amount / Decimal(str(fx_rate))
    return amount


def execute_order(
    order: Order,
    portfolio: Portfolio,
    market_price: float,
    positions: list[Position],
) -> tuple[Trade, list[Position]]:
    """
    注文を約定させ Trade を返す。ポジション一覧を更新する。

    Returns
    -------
    (trade, updated_positions)
    """
    price = Decimal(str(market_price))
    market = detect_market(order.symbol)
    currency = detect_currency(order.symbol)
    fx_rate = get_fx_rate("USD", "JPY") if currency == "USD" else 1.0

    # ── 約定可否チェック ────────────────────────────────────────────────────
    if order.order_type == "LIMIT" and order.limit_price:
        if order.side == "BUY"  and price > order.limit_price:
            raise OrderError("指値未達（BUY）")
        if order.side == "SELL" and price < order.limit_price:
            raise OrderError("指値未達（SELL）")
    if order.order_type == "STOP" and order.stop_price:
        if order.side == "BUY"  and price < order.stop_price:
            raise OrderError("逆指値未達（BUY）")
        if order.side == "SELL" and price > order.stop_price:
            raise OrderError("逆指値未達（SELL）")

    commission = Decimal(str(
        float(price) * order.quantity * _commission_rate(market)
    )).quantize(Decimal("0.01"))

    pnl: Decimal | None = None
    existing = next((p for p in positions if p.symbol == order.symbol), None)

    # ── BUY ───────────────────────────────────────────────────────────────
    if order.side == "BUY":
        cost_native = price * order.quantity
        cost_portfolio = _to_portfolio_currency(cost_native, currency, portfolio.currency, fx_rate)
        total_debit = cost_portfolio + _to_portfolio_currency(commission, currency, portfolio.currency, fx_rate)

        if portfolio.cash_balance < total_debit:
            raise InsufficientFundsError(
                f"資金不足: 必要 {float(total_debit):.0f}, 残高 {float(portfolio.cash_balance):.0f}"
            )

        portfolio.cash_balance -= total_debit

        if existing:
            # 平均取得単価の再計算
            total_qty  = existing.quantity + order.quantity
            total_cost = existing.avg_cost * existing.quantity + price * order.quantity
            existing.avg_cost = (total_cost / total_qty).quantize(Decimal("0.0001"))
            existing.quantity = total_qty
            existing.current_price = price
        else:
            new_pos = Position(
                portfolio_id=portfolio.id,
                symbol=order.symbol,
                market=market,
                currency=currency,
                quantity=order.quantity,
                avg_cost=price,
                current_price=price,
            )
            positions.append(new_pos)

    # ── SELL ──────────────────────────────────────────────────────────────
    else:
        if existing is None or existing.quantity < order.quantity:
            raise InsufficientPositionError(
                f"ポジション不足: {order.symbol} 保有 {existing.quantity if existing else 0}, "
                f"売却希望 {order.quantity}"
            )

        # 実現損益（FIFO: avg_cost ベース）
        pnl_native = (price - existing.avg_cost) * order.quantity - commission
        pnl = _to_portfolio_currency(pnl_native, currency, portfolio.currency, fx_rate)

        proceeds_native = price * order.quantity
        proceeds_portfolio = _to_portfolio_currency(proceeds_native, currency, portfolio.currency, fx_rate)
        commission_portfolio = _to_portfolio_currency(commission, currency, portfolio.currency, fx_rate)
        portfolio.cash_balance += proceeds_portfolio - commission_portfolio

        existing.quantity -= order.quantity
        if existing.quantity == 0:
            positions.remove(existing)

    # ── Trade 作成 ─────────────────────────────────────────────────────────
    trade = Trade(
        order_id=order.id,
        portfolio_id=portfolio.id,
        symbol=order.symbol,
        market=market,
        side=order.side,
        quantity=order.quantity,
        price=price,
        currency=currency,
        commission=commission,
        exchange_rate=Decimal(str(fx_rate)),
        pnl=pnl.quantize(Decimal("0.01")) if pnl is not None else None,
        executed_at=datetime.now(timezone.utc),
    )

    order.status = "FILLED"
    order.filled_quantity = order.quantity
    order.avg_fill_price = price
    order.commission = commission
    order.filled_at = trade.executed_at

    return trade, positions
