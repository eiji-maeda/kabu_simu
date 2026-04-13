class KabuSimuError(Exception):
    pass


class NotFoundError(KabuSimuError):
    pass


class InsufficientFundsError(KabuSimuError):
    pass


class InsufficientPositionError(KabuSimuError):
    pass


class MarketDataError(KabuSimuError):
    pass


class OrderError(KabuSimuError):
    pass
