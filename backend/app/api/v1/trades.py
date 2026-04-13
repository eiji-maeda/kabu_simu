from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.trade import Trade
from app.schemas.order import TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("", response_model=list[TradeOut])
async def list_trades(
    portfolio_id: int | None = None,
    symbol: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Trade)
    if portfolio_id is not None:
        stmt = stmt.where(Trade.portfolio_id == portfolio_id)
    if symbol is not None:
        stmt = stmt.where(Trade.symbol == symbol.upper())
    stmt = stmt.order_by(Trade.executed_at.desc()).limit(200)
    result = await db.execute(stmt)
    return result.scalars().all()
