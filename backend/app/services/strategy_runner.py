"""
戦略実行サービス。

指定されたポートフォリオ・戦略・セッションに対して
銘柄ユニバースを走査し、シグナルを生成・注文を発行する。
セッション終了時にポートフォリオスナップショットを記録する。
"""
import asyncio
import logging
import time
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.order import Order
from app.models.portfolio import Portfolio, Position
from app.models.signal_log import SignalLog
from app.models.snapshot import PortfolioSnapshot
from app.services.market_data import (
    detect_currency, detect_market,
    get_fx_rate, get_history, get_quote,
)
from app.services.order_engine import execute_order
from app.strategies import STRATEGY_REGISTRY
from app.strategies.built_in.sector_rotation import SectorRotationStrategy
from app.strategies.context import MarketContext, PositionSnapshot
from app.strategies.signal import SignalAction

logger = logging.getLogger(__name__)


# ─── Context builder ────────────────────────────────────────────────────────


def _build_context(
    quote: dict,
    history,
    portfolio: Portfolio,
    position: Position | None,
) -> MarketContext:
    pos_snapshot: PositionSnapshot | None = None
    if position is not None:
        unrealized = (position.current_price - position.avg_cost) * position.quantity
        unrealized_pct = float(
            (position.current_price - position.avg_cost) / position.avg_cost * 100
        ) if position.avg_cost != 0 else 0.0
        pos_snapshot = PositionSnapshot(
            symbol=position.symbol,
            market=position.market,
            quantity=position.quantity,
            avg_cost=position.avg_cost,
            current_price=position.current_price,
            unrealized_pnl=unrealized,
            unrealized_pnl_pct=unrealized_pct,
        )

    positions_value = sum(
        float(p.market_value) for p in portfolio.positions
    )
    portfolio_value = float(portfolio.cash_balance) + positions_value

    return MarketContext(
        timestamp=datetime.now(timezone.utc),
        symbol=quote["symbol"],
        market=quote["market"],
        currency=quote["currency"],
        current_price=Decimal(str(quote["price"])),
        ohlcv=history,
        cash_available=portfolio.cash_balance,
        current_position=pos_snapshot,
        portfolio_value=Decimal(str(portfolio_value)),
    )


# ─── Order execution ────────────────────────────────────────────────────────


async def _execute_signal_db(
    db: AsyncSession,
    portfolio: Portfolio,
    signal,
    quote: dict,
    fx_rate: float,
) -> bool:
    """シグナルから注文を作成・約定させ DB に保存。成功時 True を返す。"""
    market = detect_market(signal.symbol)
    currency = detect_currency(signal.symbol)
    price = float(quote["price"])

    # 数量計算
    if signal.sizing_mode.value == "PERCENT_EQUITY":
        portfolio_value = float(portfolio.cash_balance) + sum(
            float(p.market_value) for p in portfolio.positions
        )
        cash_to_use = portfolio_value * signal.quantity
        if currency == "USD":
            qty = int(cash_to_use / (price * fx_rate))
        else:
            qty = int(cash_to_use / price)
    elif signal.sizing_mode.value == "FIXED_SHARES":
        qty = int(signal.quantity)
    else:
        qty = int(signal.quantity)

    if qty <= 0:
        return False

    order = Order(
        portfolio_id=portfolio.id,
        symbol=signal.symbol,
        market=market,
        order_type="MARKET",
        side=signal.action.value,
        quantity=qty,
        status="PENDING",
        strategy_id="auto",
        notes=signal.reasoning,
    )
    db.add(order)
    await db.flush()  # id を取得

    # 既存ポジションのオブジェクトIDを記録（新規作成を検出するため）
    before_ids = {id(p) for p in portfolio.positions}

    try:
        trade, updated_positions = execute_order(order, portfolio, price, list(portfolio.positions))
        db.add(trade)

        # 新規作成されたポジションをDBセッションに追加
        for pos in updated_positions:
            if id(pos) not in before_ids:
                db.add(pos)
                portfolio.positions.append(pos)

        # 数量が0になったポジションを削除
        for pos in list(portfolio.positions):
            if pos.quantity == 0:
                await db.delete(pos)
                portfolio.positions.remove(pos)

        logger.info(
            f"[runner] {signal.action.value} {qty}x{signal.symbol} @{price:.2f} "
            f"(portfolio={portfolio.id})"
        )
        return True
    except Exception as e:
        db.expunge(order)
        logger.warning(f"[runner] 注文失敗 {signal.symbol}: {e}")
        return False


# ─── Portfolio value calc ───────────────────────────────────────────────────


def _calc_total_value_jpy(portfolio: Portfolio, fx_rate: float) -> float:
    """ポートフォリオの総評価額（円換算）を計算する。"""
    total = float(portfolio.cash_balance)
    for pos in portfolio.positions:
        mv = float(pos.current_price) * pos.quantity
        if pos.currency == "USD":
            mv *= fx_rate
        total += mv
    return total


# ─── Momentum ranking for SectorRotation ───────────────────────────────────


def _compute_momentum_ranking(histories: dict, period: int = 63) -> list[str]:
    """各銘柄の period 日モメンタムを計算してランキングを返す。"""
    scores: list[tuple[str, float]] = []
    for symbol, df in histories.items():
        if df is None or len(df) < period + 1:
            continue
        close = df["close"]
        ret = float(close.iloc[-1] / close.iloc[-(period + 1)] - 1)
        scores.append((symbol, ret))
    scores.sort(key=lambda x: x[1], reverse=True)
    return [s for s, _ in scores]


# ─── Universe resolver ───────────────────────────────────────────────────────


async def _resolve_universe(portfolio_id: int, strategy) -> list[str]:
    """
    テーマ型ポートフォリオ（portfolio_type='theme'）の場合、
    theme_name を使って Claude API で銘柄リストをその場生成する。
    それ以外は strategy.universe を返す（固定型）。
    """
    async with AsyncSessionLocal() as db:
        portfolio = await db.get(Portfolio, portfolio_id)
        if portfolio and portfolio.portfolio_type == "theme" and portfolio.theme_name:
            try:
                from app.services.theme_resolver import suggest_symbols
                result = await suggest_symbols(portfolio.theme_name)
                symbols = [s["symbol"] for s in result.get("symbols", [])]
                if symbols:
                    logger.info(
                        f"[runner] テーマ銘柄生成 '{portfolio.theme_name}': {symbols}"
                    )
                    strategy.universe = symbols
                    return symbols
            except Exception as e:
                logger.warning(f"[runner] テーマ銘柄生成失敗: {e}")
    return list(strategy.universe)


# ─── Main runner ─────────────────────────────────────────────────────────────


async def run_strategy_session(
    portfolio_id: int,
    strategy_name: str,
    session: str,
) -> None:
    """
    指定ポートフォリオで戦略を1セッション実行する。

    Parameters
    ----------
    portfolio_id  : DBのPortfolio.id
    strategy_name : STRATEGY_REGISTRY のキー
    session       : "TSE_AM" | "TSE_PM" | "US_AM" | "US_PM"
    """
    if strategy_name not in STRATEGY_REGISTRY:
        logger.error(f"未知の戦略: {strategy_name}")
        return

    strategy_cls = STRATEGY_REGISTRY[strategy_name]
    strategy = strategy_cls()

    if not hasattr(strategy, "universe"):
        logger.warning(f"{strategy_name} には universe が定義されていません")
        return

    # portfolio.universe_json があればそちらを優先（テーマ型ポートフォリオ）
    all_symbols = await _resolve_universe(portfolio_id, strategy)

    # セッションに対応する市場の銘柄だけ処理
    if session.startswith("TSE"):
        symbols = [s for s in all_symbols if s.endswith(".T")]
    else:
        symbols = [s for s in all_symbols if not s.endswith(".T")]

    if not symbols:
        logger.info(f"[runner] {strategy_name}/{session}: 対象銘柄なし")
        # 「このセッションでは対象銘柄なし」をレポートに表示するためダミーログを記録
        market = "TSE" if session.startswith("TSE") else "US"
        async with AsyncSessionLocal() as db:
            db.add(SignalLog(
                portfolio_id=portfolio_id,
                session=session,
                executed_at=datetime.now(timezone.utc),
                symbol="—",
                market=market,
                action="SKIP",
                price=Decimal("0"),
                reasoning=f"このセッション（{session}）では対象銘柄がありません。"
                           f"{'US' if session.startswith('TSE') else 'TSE'}セッションで実行してください。",
            ))
            await db.commit()
        return

    logger.info(f"[runner] 開始: {strategy_name}/{session} ({len(symbols)}銘柄)")

    # FX レート取得
    fx_rate = await asyncio.to_thread(get_fx_rate, "USD", "JPY")

    # 履歴データを事前取得（SectorRotation のランキング計算用）
    histories: dict = {}
    for symbol in symbols:
        await asyncio.sleep(0.3)  # yfinance レート制限対策
        try:
            histories[symbol] = await asyncio.to_thread(get_history, symbol, "2y")
        except Exception as e:
            logger.warning(f"[runner] 履歴取得失敗 {symbol}: {e}")
            histories[symbol] = None

    # SectorRotation: ランキングを事前設定
    if isinstance(strategy, SectorRotationStrategy):
        ranked = _compute_momentum_ranking(histories, strategy.momentum_period)
        from app.strategies.built_in.sector_rotation import TOP_N
        strategy.set_rankings(ranked[:TOP_N])
        logger.info(f"[runner] セクターランキング top{TOP_N}: {ranked[:TOP_N]}")

    # DB セッションを開く
    async with AsyncSessionLocal() as db:
        portfolio = await db.get(Portfolio, portfolio_id)
        if not portfolio:
            logger.error(f"ポートフォリオ {portfolio_id} が見つかりません")
            return

        # 現在のポジションを dict に
        pos_map: dict[str, Position] = {p.symbol: p for p in portfolio.positions}

        for symbol in symbols:
            df = histories.get(symbol)
            if df is None:
                continue
            await asyncio.sleep(0.2)
            try:
                quote = await asyncio.to_thread(get_quote, symbol)
                # 現在値でポジションの current_price を更新
                if symbol in pos_map:
                    pos_map[symbol].current_price = Decimal(str(quote["price"]))

                ctx = _build_context(quote, df, portfolio, pos_map.get(symbol))
                signal = strategy.generate_signal(ctx)

                # 全シグナル（HOLD含む）をログに記録
                db.add(SignalLog(
                    portfolio_id=portfolio.id,
                    session=session,
                    executed_at=datetime.now(timezone.utc),
                    symbol=symbol,
                    market=quote["market"],
                    action=signal.action.value,
                    price=Decimal(str(quote["price"])),
                    reasoning=signal.reasoning or "",
                ))

                if signal.action != SignalAction.HOLD:
                    await _execute_signal_db(db, portfolio, signal, quote, fx_rate)
                    # positions リストをリフレッシュ
                    pos_map = {p.symbol: p for p in portfolio.positions}

            except Exception as e:
                logger.warning(f"[runner] シグナルエラー {symbol}: {e}")
                # エラーもログに記録（データ取得失敗・上場廃止等）
                db.add(SignalLog(
                    portfolio_id=portfolio.id,
                    session=session,
                    executed_at=datetime.now(timezone.utc),
                    symbol=symbol,
                    market="TSE" if symbol.endswith(".T") else "US",
                    action="ERROR",
                    price=Decimal("0"),
                    reasoning=str(e)[:500],
                ))

        # セッション終了スナップショット
        total_value = _calc_total_value_jpy(portfolio, fx_rate)
        snapshot = PortfolioSnapshot(
            portfolio_id=portfolio_id,
            timestamp=datetime.now(timezone.utc),
            total_value=Decimal(str(round(total_value, 2))),
            cash_balance=portfolio.cash_balance,
            session=session,
        )
        db.add(snapshot)
        await db.commit()
        logger.info(
            f"[runner] 完了: {strategy_name}/{session} — 総評価額 ¥{total_value:,.0f}"
        )
