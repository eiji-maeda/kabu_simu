from pydantic import BaseModel


class QuoteOut(BaseModel):
    symbol: str
    market: str
    currency: str
    price: float
    open: float
    high: float
    low: float
    prev_close: float
    change: float
    change_pct: float
    volume: int
    timestamp: str


class FXRateOut(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    timestamp: str
