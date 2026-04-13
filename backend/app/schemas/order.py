from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class OrderCreate(BaseModel):
    portfolio_id: int
    symbol: str
    order_type: str = "MARKET"  # MARKET | LIMIT | STOP
    side: str                    # BUY | SELL
    quantity: int
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None
    notes: str | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    portfolio_id: int
    symbol: str
    market: str
    order_type: str
    side: str
    quantity: int
    limit_price: Decimal | None
    stop_price: Decimal | None
    status: str
    filled_quantity: int
    avg_fill_price: Decimal | None
    commission: Decimal
    strategy_id: str | None
    notes: str | None
    created_at: datetime
    filled_at: datetime | None


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    portfolio_id: int
    symbol: str
    market: str
    side: str
    quantity: int
    price: Decimal
    currency: str
    commission: Decimal
    exchange_rate: Decimal
    pnl: Decimal | None
    executed_at: datetime
