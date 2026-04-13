# 株シミュ — 株式売買シミュレータ

日本株（東証）と米国株（NYSE / NASDAQ）を対象にした株式売買シミュレータです。  
複数の売買戦略をバックテストして比較したり、将来的に AI（Claude API）による自動売買のパフォーマンスを検証できます。

---

## 機能

| 機能 | 説明 |
|------|------|
| **ダッシュボード** | ポートフォリオ総評価額・含み損益・エクイティカーブを一覧表示 |
| **売買注文** | 成行 / 指値 / 逆指値注文、ポジション管理、注文履歴 |
| **バックテスト** | 任意の銘柄・期間・戦略でヒストリカル検証。12 指標を算出 |
| **戦略比較** | 同一条件で複数戦略を同時実行し、エクイティカーブ・指標を横並び比較 |
| **取引履歴** | 全約定履歴・実現損益・フィルタリング |
| **AI 自動売買（将来）** | Claude API キー設定で LLM による自動売買が即時利用可能 |

---

## 技術スタック

```
backend/   FastAPI + SQLite + SQLAlchemy (async) + yfinance
frontend/  React + Vite + TypeScript + Recharts
```

---

## セットアップ

### 前提条件

- Python 3.11 以上
- Node.js 18 以上（フロントエンド開発時のみ）

### 1. リポジトリの準備

```bash
git clone <repo-url>
cd kabu_simu_app
```

### 2. バックエンドのセットアップ

```bash
cd backend

# 依存パッケージをインストール
pip install -r requirements.txt

# 環境変数ファイルを作成（デフォルト設定で動作します）
cp .env.example .env
```

**`.env` の主な設定項目（変更不要でも動作します）:**

```env
DATABASE_URL=sqlite+aiosqlite:///./data/simulator.db
CORS_ORIGINS=["http://localhost:5173","http://localhost:5174"]
INITIAL_CAPITAL=1000000

# AI 自動売買を使う場合のみ設定
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. フロントエンドのセットアップ

```bash
cd frontend
npm install
```

---

## 起動方法

### 開発時（バックエンド + フロントエンド を別々に起動）

**ターミナル 1 — バックエンド**

```bash
cd backend
uvicorn app.main:app --reload
```

> `http://localhost:8001` で API サーバーが起動します。

**ターミナル 2 — フロントエンド**

```bash
cd frontend
npm run dev
```

> `http://localhost:5173` でフロントエンドが起動します。  
> `/api` へのリクエストは自動的にバックエンドにプロキシされます。

### 本番時（バックエンド 1 プロセスで完結）

```bash
# React をビルドしてバックエンドに組み込む
cd frontend && npm run build

# バックエンドだけ起動すれば UI も API も提供される
cd ../backend
uvicorn app.main:app
```

> `http://localhost:8001` だけで全機能が使えます。

---

## 画面と操作

### ダッシュボード `/`

ポートフォリオの全体像を確認します。

- **評価額** — 初期資本 ¥1,000,000 に対する現在の総評価額と損益率
- **メトリクスカード** — シャープ比・最大ドローダウン・勝率・ポジション数
- **エクイティカーブ** — 資産推移グラフ（ゴールドグラデーション）
- **ポジション一覧** — 保有銘柄・平均取得単価・含み損益率
- **最近の取引** — 直近の約定履歴

### 売買 `/trading`

注文を入力してシミュレーション取引を行います。

1. 銘柄コードを入力（例: `AAPL`、`7203.T`）
2. **買い / 売り** を切り替え
3. 注文種別を選択：**成行**（即時約定）・**指値**・**逆指値**
4. 数量を入力 → **注文を送信**

> 成行注文は yfinance から現在値を取得して即時約定します。

**銘柄コードの形式:**

| 市場 | 例 | 通貨 |
|------|----|------|
| 東証（TSE） | `7203.T`（トヨタ）、`6758.T`（ソニー） | JPY |
| 米国（US） | `AAPL`、`NVDA`、`TSLA` | USD |

### バックテスト `/backtest`

過去データで戦略を検証します。

1. **ストラテジ** を選択（Buy & Hold / Moving Average Cross / RSI）
2. **銘柄・期間** を設定
3. 初期資本は固定 ¥1,000,000
4. **バックテスト実行** を押す

**算出される指標:**

| 指標 | 説明 |
|------|------|
| 総リターン | 最終損益 / 初期資本 |
| 年率リターン | CAGR（複利年率） |
| シャープ比 | リスク調整後リターン（年率） |
| ソルティノ比 | 下方リスクのみ考慮したシャープ比 |
| 最大ドローダウン | ピーク比の最大下落率 |
| 勝率 | 利益取引 / 全クローズ取引 |
| プロフィットファクター | 総利益 / 総損失 |
| カルマー比 | 年率リターン / 最大ドローダウン |

### 戦略比較 `/comparison`

同一条件で複数戦略を比較します。

1. **銘柄・期間** を入力
2. 比較するストラテジを選択（複数可）
3. **比較実行** を押す

**結果表示:**
- **エクイティカーブ重ねがけ** — 各戦略の資産推移を1グラフに表示
- **メトリクス比較テーブル** — 全指標を列で並べ、最良値を緑・最悪値を赤でハイライト

### 取引履歴 `/history`

全約定履歴を確認します。

- 銘柄・売買・市場でフィルタリング
- 実現損益の列（緑 = 利益、赤 = 損失）
- 表示中取引の合計実現損益を下部に表示

---

## 組み込み戦略

| 名前 | ロジック |
|------|----------|
| **Buy & Hold** | 初回バーで資金の 95% を投入し保有し続ける |
| **Moving Average Cross** | SMA50 > SMA200（ゴールデンクロス）で買い、逆転（デスクロス）で全売り |
| **RSI** | RSI < 30（売られすぎ）で買い、RSI > 70（買われすぎ）で全売り |

---

## AI 自動売買（Claude）

Claude API を使った LLM 自動売買戦略が組み込まれています。

### 設定手順

```bash
# 1. anthropic パッケージをインストール
cd backend
pip install anthropic

# 2. .env に API キーを追記
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 3. サーバーを再起動
uvicorn app.main:app --reload
```

### 動作

バックテスト・戦略比較の画面で **Claude AI** が選択できるようになります。  
各バーで以下の情報を Claude に送り、`BUY / SELL / HOLD` の判断と理由を返させます：

- 現在値・OHLCV 過去 20 本
- テクニカル指標（SMA, RSI）
- 現在のポジション・残金・ポートフォリオ評価額

### カスタマイズ

`backend/app/strategies/ai/claude_strategy.py` の `_build_prompt()` を編集することで  
プロンプトを自由にカスタマイズできます。

---

## 独自戦略の追加

新しい戦略は 3 ファイルの変更だけで追加できます。

```python
# 1. backend/app/strategies/built_in/my_strategy.py を作成
from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal

class MyStrategy(Strategy):
    name = "my_strategy"
    description = "独自戦略の説明"

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        # ctx.ohlcv に過去の OHLCV データが入っています
        # ctx.current_position で現在ポジションを確認できます
        # ctx.cash_available で残金を確認できます
        close = ctx.ohlcv["close"]
        
        # 例: 20日移動平均を上抜けで買い
        if len(close) > 20:
            sma20 = float(close.rolling(20).mean().iloc[-1])
            if float(ctx.current_price) > sma20 and ctx.current_position is None:
                return TradeSignal(
                    action=SignalAction.BUY,
                    symbol=ctx.symbol,
                    sizing_mode=SizingMode.PERCENT_EQUITY,
                    quantity=0.9,
                    reasoning=f"SMA20 上抜け: {sma20:.2f}",
                )
        return TradeSignal.hold(ctx.symbol)
```

```python
# 2. backend/app/strategies/__init__.py に登録
from app.strategies.built_in.my_strategy import MyStrategy

STRATEGY_REGISTRY["my_strategy"] = MyStrategy
STRATEGY_INFO.append({
    "name": "my_strategy",
    "display_name": "独自戦略",
    "description": "独自戦略の説明",
    "is_ai": False,
    "requires_api_key": False,
})
```

> 以上だけで、バックテスト・戦略比較の画面に自動的に表示されます。

---

## API ドキュメント

バックエンド起動中に以下でインタラクティブな API ドキュメントを確認できます。

```
http://localhost:8001/docs       # Swagger UI
http://localhost:8001/redoc      # ReDoc
```

**主なエンドポイント:**

```
GET  /api/v1/market/quote?symbol=7203.T       現在値取得
GET  /api/v1/market/history?symbol=AAPL       OHLCV履歴
GET  /api/v1/market/fx?from=USD&to=JPY        USD/JPY レート

POST /api/v1/portfolios                       ポートフォリオ作成
GET  /api/v1/portfolios/{id}/positions        ポジション一覧
POST /api/v1/portfolios/{id}/refresh          現在値一括更新

POST /api/v1/orders                           注文（成行は即時約定）
GET  /api/v1/orders?portfolio_id=1
DELETE /api/v1/orders/{id}                    指値注文キャンセル

GET  /api/v1/trades?portfolio_id=1            取引履歴

POST /api/v1/backtest/run                     バックテスト開始（非同期）
GET  /api/v1/backtest/run/{id}                結果取得
POST /api/v1/backtest/comparison              複数戦略比較開始
GET  /api/v1/backtest/comparison/{id}         比較結果取得
```

---

## ディレクトリ構成

```
kabu_simu_app/
├── backend/
│   ├── app/
│   │   ├── core/          設定・DB・例外
│   │   ├── models/        SQLAlchemy ORM（Portfolio, Position, Order, Trade, BacktestRun）
│   │   ├── schemas/       Pydantic v2 スキーマ（API I/O）
│   │   ├── services/      ビジネスロジック
│   │   │   ├── market_data.py    yfinance ラッパー・TTL キャッシュ
│   │   │   ├── order_engine.py   注文執行・FIFO 損益・手数料・通貨変換
│   │   │   ├── backtester.py     バックテストエンジン（ルックアヘッド防止）
│   │   │   └── metrics.py        Sharpe・ドローダウン等の計算
│   │   ├── strategies/    戦略レイヤー
│   │   │   ├── base.py           抽象基底クラス（AI 連携の核心）
│   │   │   ├── context.py        MarketContext dataclass
│   │   │   ├── signal.py         TradeSignal dataclass
│   │   │   ├── built_in/         組み込み戦略 3 種
│   │   │   └── ai/               Claude AI 戦略
│   │   ├── api/v1/        FastAPI ルーター
│   │   └── main.py        アプリ起動・CORS・SPA 配信
│   ├── data/              simulator.db（自動生成）
│   ├── .env               環境変数
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/    レイアウト・チャートコンポーネント
    │   ├── pages/         5 ページ（Dashboard / Trading / Backtest / Comparison / History）
    │   ├── lib/mockData.ts モックデータ
    │   └── styles/global.css  デザインシステム
    ├── vite.config.ts     /api → :8001 プロキシ設定
    └── package.json
```

---

## 注意事項

- 本アプリは**シミュレーション専用**です。実際の株式取引には使用できません。
- 市場データは [Yahoo Finance](https://finance.yahoo.com/) から取得しています（yfinance 経由）。
- バックテストの結果は過去のパフォーマンスであり、将来の結果を保証するものではありません。
- 手数料は米国株 0.1%、日本株 0.055% で計算しています（設定変更可）。
