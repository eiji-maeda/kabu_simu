from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import InsufficientFundsError, InsufficientPositionError, OrderError
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.schemas.order import OrderCreate, OrderOut, TradeOut
from app.services.market_data import detect_market, get_quote
from app.services.order_engine import execute_order

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
async def list_orders(
    portfolio_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Order)
    if portfolio_id is not None:
        stmt = stmt.where(Order.portfolio_id == portfolio_id)
    stmt = stmt.order_by(Order.created_at.desc()).limit(100)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", status_code=201)
async def place_order(body: OrderCreate, db: AsyncSession = Depends(get_db)):
    portfolio = await db.get(Portfolio, body.portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="ポートフォリオが見つかりません")

    symbol = body.symbol.upper()
    market = detect_market(symbol)

    order = Order(
        portfolio_id=body.portfolio_id,
        symbol=symbol,
        market=market,
        order_type=body.order_type,
        side=body.side.upper(),
        quantity=body.quantity,
        limit_price=body.limit_price,
        stop_price=body.stop_price,
        notes=body.notes,
    )
    db.add(order)
    await db.flush()  # order.id を確定

    # MARKET 注文は即時約定
    if body.order_type == "MARKET":
        try:
            quote = get_quote(symbol)
            market_price = quote["price"]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"価格取得失敗: {e}")

        positions = list(portfolio.positions)
        try:
            trade, positions = execute_order(order, portfolio, market_price, positions)
        except (InsufficientFundsError, InsufficientPositionError, OrderError) as e:
            await db.rollback()
            raise HTTPException(status_code=400, detail=str(e))

        db.add(trade)
        # 更新されたポジションを永続化
        for pos in positions:
            if pos.id is None:
                db.add(pos)

    await db.commit()
    await db.refresh(order)
    return order


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="注文が見つかりません")
    return order


@router.delete("/{order_id}", status_code=204)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="注文が見つかりません")
    if order.status != "PENDING":
        raise HTTPException(status_code=400, detail="未約定注文のみキャンセル可能です")
    order.status = "CANCELLED"
    await db.commit()
