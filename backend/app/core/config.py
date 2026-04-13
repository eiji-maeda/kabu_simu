from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite+aiosqlite:///./data/simulator.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]
    initial_capital: int = 1_000_000

    # 手数料率
    commission_rate_us: float = 0.001   # 0.1%
    commission_rate_tse: float = 0.00055  # 0.055%

    # 価格キャッシュ TTL（秒）
    quote_cache_ttl: int = 60

    # AI strategy (optional)
    anthropic_api_key: str = ""


settings = AppConfig()
