import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  getPortfolioComparison, getPortfolios, getTrades, adviseStrategy, getConfigStatus,
  type PortfolioSummaryApi, type PortfolioOut, type TradeOut,
} from '../lib/api'
import { EquityAreaChart } from '../components/charts/EquityChart'
import { PORTFOLIO_COLORS, formatJPY, formatChange, formatPct } from '../lib/mockData'

// ─── Strategy metadata ────────────────────────────────────────────────────────

interface LogicStep {
  label: string
  detail: string
  formula?: string
}

interface StrategyMeta {
  key: string
  label: string
  color: string
  description: string
  philosophy: string
  universe: { symbol: string; name: string; market: 'TSE' | 'US' }[]
  logicFlow: LogicStep[]
  riskManagement: string[]
  bestCondition: string
  weakCondition: string
  sizing: string
  params: { label: string; value: string; description?: string }[]
  isTheme?: boolean
}

const STRATEGIES: StrategyMeta[] = [
  {
    key: 'trend_follow',
    label: 'トレンドフォロー',
    color: '#10D9A0',
    description: '大型株（TOPIX100 / S&P500）× SMA/MACD トレンドフォロー戦略',
    philosophy: 'トレンドは継続するという前提のもと、移動平均のクロスとMACDのダブルシグナルで高精度にトレンド転換を検知します。誤シグナルを減らすため、2つの指標が一致したときだけ売買します。',
    universe: [
      { symbol: '7203.T', name: 'トヨタ自動車',         market: 'TSE' },
      { symbol: '6758.T', name: 'ソニーグループ',       market: 'TSE' },
      { symbol: '8306.T', name: '三菱UFJフィナンシャル',market: 'TSE' },
      { symbol: '9984.T', name: 'ソフトバンクグループ', market: 'TSE' },
      { symbol: '6861.T', name: 'キーエンス',           market: 'TSE' },
      { symbol: '7974.T', name: '任天堂',               market: 'TSE' },
      { symbol: '8411.T', name: 'みずほフィナンシャル', market: 'TSE' },
      { symbol: '6902.T', name: 'デンソー',             market: 'TSE' },
      { symbol: '4063.T', name: '信越化学工業',         market: 'TSE' },
      { symbol: '9433.T', name: 'KDDI',                market: 'TSE' },
      { symbol: 'AAPL',   name: 'Apple',               market: 'US'  },
      { symbol: 'MSFT',   name: 'Microsoft',           market: 'US'  },
      { symbol: 'AMZN',   name: 'Amazon',              market: 'US'  },
      { symbol: 'NVDA',   name: 'NVIDIA',              market: 'US'  },
      { symbol: 'GOOGL',  name: 'Alphabet',            market: 'US'  },
      { symbol: 'META',   name: 'Meta Platforms',      market: 'US'  },
      { symbol: 'TSLA',   name: 'Tesla',               market: 'US'  },
      { symbol: 'JPM',    name: 'JPMorgan Chase',      market: 'US'  },
      { symbol: 'V',      name: 'Visa',                market: 'US'  },
      { symbol: 'JNJ',    name: 'Johnson & Johnson',   market: 'US'  },
    ],
    logicFlow: [
      {
        label: '① SMA クロス判定',
        detail: '50日単純移動平均（SMA50）と200日単純移動平均（SMA200）の位置関係を確認します。SMA50 > SMA200 なら上昇トレンド、SMA50 < SMA200 なら下降トレンドと判定します。',
        formula: 'SMA(n) = Σ Close(i) / n  （i = t-n+1 〜 t）',
      },
      {
        label: '② MACD 計算',
        detail: '12日EMAと26日EMAの差がMACDライン、そのMACDラインの9日EMAがシグナルラインです。MACD > シグナルで上昇モメンタム、MACD < シグナルで下降モメンタムと判定します。',
        formula: 'MACD = EMA(12) − EMA(26)\nSignal = EMA(MACD, 9)',
      },
      {
        label: '③ 買いシグナル生成',
        detail: '前セッションに SMA50 < SMA200 だったが今回 SMA50 > SMA200 になった（ゴールデンクロス）、または MACD がシグナルを上抜けしたとき、かつ未保有の場合に買いシグナルを発します。',
        formula: '買い: (prev_cross=="below" AND curr_cross=="above") OR (prev_macd<signal AND curr_macd>signal)\n        AND position == None',
      },
      {
        label: '④ 売りシグナル生成',
        detail: 'デスクロス（SMA50がSMA200を下抜け）またはMACDデスクロスのとき、かつ保有中の場合に全量売りシグナルを発します。',
        formula: '売り: (prev_cross=="above" AND curr_cross=="below") OR (prev_macd>signal AND curr_macd<signal)\n        AND position != None',
      },
      {
        label: '⑤ ポジションサイジング',
        detail: '1銘柄への投入額をポートフォリオ総額の8%に固定します。20銘柄全てが買いシグナルになった場合でも最大160%にはならず、現金が不足した時点で新規買いを行いません。',
        formula: '買い株数 = floor( portfolio_value × 0.08 / price )',
      },
    ],
    riskManagement: [
      'ダブルシグナル方式で誤トレードを削減（SMAクロスだけでは発火しない）',
      '1銘柄あたり8%上限で過度な集中を防ぐ',
      'デスクロスで即座に全量売却して損失を限定',
      '個別損切りラインなし（トレンド反転時に売り）',
    ],
    bestCondition: '強いトレンド相場（強気相場・弱気相場）',
    weakCondition: 'レンジ相場・ボラティリティが高い横ばい相場（ダマシが増える）',
    sizing: '1銘柄 = portfolio_value × 8%',
    params: [
      { label: 'SMA 短期', value: '50日', description: '短期トレンドを表す移動平均。小さくすると感度が上がり誤シグナルが増える' },
      { label: 'SMA 長期', value: '200日', description: '長期トレンドを表す移動平均。大きくするとシグナルが遅れるが信頼性が上がる' },
      { label: 'MACD Fast', value: '12日', description: '短期EMAの期間' },
      { label: 'MACD Slow', value: '26日', description: '長期EMAの期間' },
      { label: 'MACD Signal', value: '9日', description: 'シグナルラインのEMA期間' },
      { label: 'ポジションサイズ', value: '8%', description: '1銘柄あたりのポートフォリオ比率' },
    ],
  },
  {
    key: 'factor_selection',
    label: 'ファクター選択',
    color: '#5AA3F5',
    description: '高配当・バリュー株 × Value + Quality 複合ファクター戦略',
    philosophy: '割安かつ安定した銘柄（低ボラ）だけを買う「守りの戦略」です。MA乖離でバリューを計測し、ボラティリティでクオリティを判断します。どちらか一方だけでなく両方満たす時だけ買うことで、割安トラップを避けます。',
    universe: [
      { symbol: '8306.T', name: '三菱UFJフィナンシャル', market: 'TSE' },
      { symbol: '8411.T', name: 'みずほフィナンシャル',  market: 'TSE' },
      { symbol: '8316.T', name: '三井住友フィナンシャル',market: 'TSE' },
      { symbol: '5020.T', name: 'ENEOSホールディングス', market: 'TSE' },
      { symbol: '9101.T', name: '日本郵船',              market: 'TSE' },
      { symbol: '9104.T', name: '商船三井',              market: 'TSE' },
      { symbol: '8031.T', name: '三井物産',              market: 'TSE' },
      { symbol: '8058.T', name: '三菱商事',              market: 'TSE' },
      { symbol: 'VYM',    name: 'Vanguard高配当ETF',     market: 'US'  },
      { symbol: 'SCHD',   name: 'Schwab配当ETF',         market: 'US'  },
      { symbol: 'JNJ',    name: 'Johnson & Johnson',     market: 'US'  },
      { symbol: 'KO',     name: 'Coca-Cola',             market: 'US'  },
      { symbol: 'PG',     name: 'P&G',                  market: 'US'  },
      { symbol: 'XOM',    name: 'ExxonMobil',            market: 'US'  },
      { symbol: 'CVX',    name: 'Chevron',               market: 'US'  },
    ],
    logicFlow: [
      {
        label: '① MA20 乖離率（Value ファクター）',
        detail: '現在値と20日移動平均の乖離率を計算します。乖離率が -3% 以下（MA より 3% 以上安い）なら割安と判定します。',
        formula: 'deviation = (price − MA20) / MA20\n買い条件: deviation ≤ −0.03',
      },
      {
        label: '② 20日ボラティリティ（Quality ファクター）',
        detail: '過去20日間の日次リターンの標準偏差でボラティリティを測定します。日次ボラが 2.5% 未満の銘柄を「安定した高品質銘柄」と判定します。',
        formula: 'vol = std( Close[t] / Close[t-1] − 1,  period=20 )\n買い条件: vol < 0.025',
      },
      {
        label: '③ 複合条件で買いシグナル',
        detail: 'Value（割安）AND Quality（低ボラ）の両条件が揃い、かつ未保有の場合に10%の資金を投入します。片方だけでは買いません。',
        formula: '買い: deviation ≤ −0.03 AND vol < 0.025 AND position == None',
      },
      {
        label: '④ 損切り（ストップロス）',
        detail: '取得単価から -8% 以上の損失が発生したら即座に全量売却します。',
        formula: '売り(損切り): (price − avg_cost) / avg_cost ≤ −0.08',
      },
      {
        label: '⑤ 利確（オーバーバリュー）',
        detail: 'MA20 を 10% 以上上回ったら「割高」と判断して利確売りをします。',
        formula: '売り(利確): deviation > 0.10',
      },
    ],
    riskManagement: [
      'ダブルファクター（バリュー + クオリティ）で割安トラップを回避',
      '損切り -8% で大損失を防ぐ',
      '1銘柄10%上限で分散リスク管理',
      '高配当・ディフェンシブ銘柄中心でダウンサイドを限定',
    ],
    bestCondition: '横ばい〜緩やかな上昇相場。配当収入も含めた安定運用に向く',
    weakCondition: '強い上昇トレンド相場（モメンタム銘柄に後れを取る）',
    sizing: '1銘柄 = portfolio_value × 10%',
    params: [
      { label: 'MA 期間', value: '20日', description: 'バリュー計測の基準となる移動平均期間' },
      { label: '買いしきい値', value: '−3%', description: 'MAからどれだけ下落したら割安と見なすか' },
      { label: '利確しきい値', value: '+10%', description: 'MAからどれだけ上昇したら割高と見なすか' },
      { label: '損切りライン', value: '−8%', description: '取得単価からの最大許容損失率' },
      { label: '低ボラ閾値', value: '2.5%/日', description: 'これ以下の日次ボラを「高品質」と判定' },
      { label: 'ポジションサイズ', value: '10%', description: '1銘柄あたりのポートフォリオ比率' },
    ],
  },
  {
    key: 'sector_rotation',
    label: 'セクターローテーション',
    color: '#C97BDB',
    description: '米国セクターETF × 3ヶ月相対モメンタムによるローテーション戦略',
    philosophy: '経済サイクルに応じてパフォーマンスの良いセクターは変化します。3ヶ月モメンタムで直近の相対強度を計測し、最も勢いのある上位2セクターだけを保有します。ETFを使うことで個別銘柄リスクを排除しています。',
    universe: [
      { symbol: 'XLK',  name: '情報技術（Technology）',   market: 'US' },
      { symbol: 'XLE',  name: 'エネルギー（Energy）',     market: 'US' },
      { symbol: 'XLV',  name: 'ヘルスケア（Health Care）',market: 'US' },
      { symbol: 'XLF',  name: '金融（Financials）',       market: 'US' },
      { symbol: 'XLI',  name: '資本財（Industrials）',    market: 'US' },
      { symbol: 'XLY',  name: '一般消費財（Consumer Disc）',market: 'US'},
      { symbol: 'XLU',  name: '公益（Utilities）',        market: 'US' },
      { symbol: 'XLRE', name: '不動産（Real Estate）',    market: 'US' },
      { symbol: 'XLB',  name: '素材（Materials）',        market: 'US' },
    ],
    logicFlow: [
      {
        label: '① 全セクターの3ヶ月モメンタム計算',
        detail: '9つのセクターETF全てについて、63営業日前の終値と現在の終値の騰落率を計算します。これが「相対モメンタムスコア」になります。',
        formula: 'momentum(s) = Close[t] / Close[t−63] − 1\n（63日 ≈ 3ヶ月）',
      },
      {
        label: '② モメンタムランキング作成',
        detail: '9セクターをモメンタムスコアの高い順（強い順）にランキングします。このランキングは1セッション実行するごとに毎回再計算されます。',
        formula: 'ranking = sorted(all_sectors, key=momentum, reverse=True)',
      },
      {
        label: '③ 上位2セクターの買い判定',
        detail: 'ランキング上位2セクターに入っており、かつ未保有の場合に買いシグナルを発します。各セクターに45%を配分（合計90%投資）。',
        formula: '買い: rank(s) ≤ 2 AND position == None\n配分: 45% per sector',
      },
      {
        label: '④ 下位セクターの売り判定',
        detail: '保有しているセクターがランキング上位2位から脱落した場合、全量売却して次の強いセクターに乗り換えます。',
        formula: '売り: rank(s) > 2 AND position != None',
      },
    ],
    riskManagement: [
      'ETFで個別銘柄リスクを排除し、セクター全体の動きに乗る',
      '常に上位2セクターだけを保有し集中リスクを管理',
      '10%の現金バッファーを維持（2×45%=90%投資）',
      '3ヶ月モメンタムで短期ノイズを排除',
    ],
    bestCondition: '明確なセクターローテーション相場（景気サイクルが뚜렷な相場）',
    weakCondition: 'セクター間の格差がない均一な相場（全セクター同時上昇/下落）',
    sizing: '1セクター = portfolio_value × 45%（2セクター保有時 合計90%）',
    params: [
      { label: 'モメンタム期間', value: '63日（3ヶ月）', description: '短くすると反応が早い代わりに売買頻度が増加' },
      { label: '保有セクター数', value: '上位2本', description: '多いほど分散するが差別化が薄れる' },
      { label: '1セクター配分', value: '45%', description: '配分を上げると上昇時の利益が増えるがリスクも増す' },
    ],
  },
  {
    key: 'momentum_breakout',
    label: 'モメンタムブレイクアウト',
    color: '#FF8C57',
    description: '中小型グロース株 × 52週高値ブレイクアウトによるモメンタム戦略',
    philosophy: '52週（1年）の最高値を更新した銘柄は強いモメンタムにあり、そのトレンドが継続しやすいという「ブレイクアウト理論」に基づきます。新高値を付けた瞬間に乗り、トレンドが終わったら素早く撤退します。',
    universe: [
      { symbol: 'AXON',   name: 'Axon Enterprise',     market: 'US'  },
      { symbol: 'CRWD',   name: 'CrowdStrike',         market: 'US'  },
      { symbol: 'DDOG',   name: 'Datadog',             market: 'US'  },
      { symbol: 'SNOW',   name: 'Snowflake',           market: 'US'  },
      { symbol: 'NET',    name: 'Cloudflare',          market: 'US'  },
      { symbol: 'FTNT',   name: 'Fortinet',            market: 'US'  },
      { symbol: 'ZS',     name: 'Zscaler',             market: 'US'  },
      { symbol: 'CELH',   name: 'Celsius Holdings',    market: 'US'  },
      { symbol: 'ENPH',   name: 'Enphase Energy',      market: 'US'  },
      { symbol: 'SMCI',   name: 'Super Micro Computer',market: 'US'  },
      { symbol: '4385.T', name: 'メルカリ',            market: 'TSE' },
      { symbol: '3697.T', name: 'SHIFT',               market: 'TSE' },
      { symbol: '4369.T', name: 'トリケミカル研究所',  market: 'TSE' },
      { symbol: '4477.T', name: 'BASE',                market: 'TSE' },
    ],
    logicFlow: [
      {
        label: '① 52週高値の計算',
        detail: '過去252営業日（約1年）の高値を計算します。直近バーを除いた期間で計算することで、「現在の価格がブレイクしたかどうか」を判定できます。',
        formula: 'week52_high = max( High[t−252 〜 t−1] )',
      },
      {
        label: '② ブレイクアウト判定（買いシグナル）',
        detail: '現在の終値が52週高値を上回った場合、新高値ブレイクアウトとして買いシグナルを発します。未保有の場合のみ発動します。',
        formula: '買い: Close[t] > week52_high AND position == None',
      },
      {
        label: '③ MA30 割れ判定（トレンド終了）',
        detail: '30日移動平均を下回った場合、上昇トレンドが終了したと判断して全量売却します。',
        formula: '売り(MA割れ): Close[t] < MA30  AND position != None',
      },
      {
        label: '④ 損切り（ストップロス）',
        detail: '取得単価から -12% 以上の損失が発生した場合、即座に全量売却します。ブレイクアウト失敗による損失を限定します。',
        formula: '売り(損切り): (price − avg_cost) / avg_cost ≤ −0.12',
      },
    ],
    riskManagement: [
      '損切り -12% でブレイクアウト失敗時の損失を限定',
      'MA30割れで素早くトレンド終了を検知',
      '1銘柄7%の小さい配分で多銘柄に分散（最大14銘柄）',
      '中小型株のため個別リスクが高い — 分散が重要',
    ],
    bestCondition: '強気相場でグロース株が上昇トレンドにある局面',
    weakCondition: '弱気相場・金利上昇局面（グロース株が売られやすい）',
    sizing: '1銘柄 = portfolio_value × 7%',
    params: [
      { label: '高値ルックバック', value: '252日（52週）', description: '長くするほどブレイクの信頼性が上がるが機会が減る' },
      { label: 'MA 出口', value: '30日', description: '短くすると素早く撤退できるが誤シグナルが増える' },
      { label: '損切りライン', value: '−12%', description: '厳しくすると損失限定だが機会損失が増える' },
      { label: 'ポジションサイズ', value: '7%', description: '小さく保つことで多銘柄に分散できる' },
    ],
  },
  {
    key: 'theme_follow',
    label: 'テーマ型投資',
    color: '#A78BFA',
    description: 'ユーザー定義テーマ × Claude AI が毎回選定する動的ユニバース + モメンタム追従',
    philosophy: '「今注目されているテーマ」の銘柄群に特化して投資します。銘柄ユニバースは固定せず、毎回の実行時に Claude AI がその日の市場状況を踏まえてテーマに関連する最も適切な銘柄を選定します。',
    universe: [],
    logicFlow: [
      {
        label: '① 動的ユニバース生成（Claude AI）',
        detail: '売買実行のたびに Claude AI（Haiku）が登録テーマに関連する10〜15銘柄を選定します。市場状況や最新のトレンドを反映した銘柄が選ばれます。',
        formula: 'universe = Claude.suggest( theme, today )',
      },
      {
        label: '② MA20 上昇トレンド判定',
        detail: '現在値が20日移動平均を上回っているかを確認します。MA20 を上回っている銘柄は短期的な上昇トレンドにあると判断します。',
        formula: 'trend_up = Close[t] > MA20',
      },
      {
        label: '③ 1ヶ月モメンタム判定',
        detail: '21営業日前の価格と現在価格を比較し、1ヶ月リターンを計算します。プラスであれば上昇モメンタムありと判定します。',
        formula: 'momentum_1m = Close[t] / Close[t−21] − 1\n買い条件: momentum_1m > 0',
      },
      {
        label: '④ 買いシグナル（条件の積）',
        detail: 'MA20 上回りと1ヶ月プラスモメンタムの両方が揃い、かつ未保有の場合に買いシグナルを発します。',
        formula: '買い: trend_up AND momentum_1m > 0 AND position == None',
      },
      {
        label: '⑤ 売りシグナル（MA割れ / 損切り）',
        detail: 'MA20の5%以上下落またはエントリーから-12%の損失で売却します。ポジションサイズはユニバース銘柄数で等分（最大15%）。',
        formula: '売り(MA割れ): price < MA20 × 0.95\n売り(損切り): (price − avg_cost) / avg_cost ≤ −0.12\nsize = min(15%, 1/N)',
      },
    ],
    riskManagement: [
      '毎回新鮮な銘柄選定で陳腐化を防ぐ',
      '1銘柄 1/N の等分配分（最大15%）で分散',
      'MA割れ(-5%) + 損切り(-12%) の二重保護',
      'テーマ銘柄は変動が大きい傾向 → 小さいポジションサイズが重要',
    ],
    bestCondition: 'テーマ株が注目されている相場（テック、EVブームなど）',
    weakCondition: 'テーマが逆風を受けているとき（規制、金利上昇など）',
    sizing: '1銘柄 = min(15%, 1/N) × portfolio_value',
    params: [
      { label: 'MA 期間', value: '20日', description: '短期トレンドの基準' },
      { label: 'MA 売りしきい値', value: '−5%', description: 'MA からどれだけ下落したら売るか' },
      { label: '損切りライン', value: '−12%', description: '取得単価からの最大許容損失' },
      { label: 'モメンタム期間', value: '21日（1ヶ月）', description: '上昇トレンド確認の期間' },
      { label: '最大ポジションサイズ', value: '15%', description: '1銘柄への最大配分上限' },
    ],
    isTheme: true,
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcMetrics(trades: TradeOut[]) {
  const sells = trades.filter(t => t.side === 'SELL' && t.pnl !== null)
  const totalRealizedPnl = sells.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const wins = sells.filter(t => (t.pnl ?? 0) > 0)
  const losses = sells.filter(t => (t.pnl ?? 0) <= 0)
  const winRate = sells.length > 0 ? wins.length / sells.length : null
  return {
    totalRealizedPnl,
    winRate,
    wins: wins.length,
    losses: losses.length,
    tradeCount: trades.length,
    sellCount: sells.length,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '8px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function LogicSection({ meta }: { meta: StrategyMeta }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Philosophy */}
      <div style={{ padding: 14, background: `${meta.color}08`, borderRadius: 'var(--radius-sm)', borderLeft: `2px solid ${meta.color}60` }}>
        <div style={{ fontSize: 10, color: meta.color, fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.08em' }}>戦略コンセプト</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{meta.philosophy}</div>
      </div>

      {/* Logic flow */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: '0.08em' }}>アルゴリズム フロー</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meta.logicFlow.map((step, i) => (
            <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 6 }}>{step.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: step.formula ? 8 : 0 }}>{step.detail}</div>
              {step.formula && (
                <pre style={{ margin: 0, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: meta.color, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                  {step.formula}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Risk management */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.08em' }}>リスク管理</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {meta.riskManagement.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r}</li>
            ))}
          </ul>
        </div>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '10px 14px', background: 'rgba(74,222,128,0.06)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid rgba(74,222,128,0.3)' }}>
            <div style={{ fontSize: 10, color: 'var(--positive)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>得意な相場</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{meta.bestCondition}</div>
          </div>
          <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.06)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid rgba(248,113,113,0.3)' }}>
            <div style={{ fontSize: 10, color: 'var(--negative)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>苦手な相場</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{meta.weakCondition}</div>
          </div>
        </div>
      </div>

      {/* Params */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.08em' }}>パラメータ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {meta.params.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', minWidth: 150 }}>{p.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: meta.color, minWidth: 100 }}>{p.value}</span>
              {p.description && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>{p.description}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Universe (fixed strategies only) */}
      {!meta.isTheme && meta.universe.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.08em' }}>
            銘柄ユニバース（{meta.universe.length}銘柄）
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {(['TSE', 'US'] as const).map(mkt => {
              const items = meta.universe.filter(u => u.market === mkt)
              if (!items.length) return null
              return (
                <div key={mkt} style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                    {mkt === 'TSE' ? '🇯🇵 東証' : '🇺🇸 米国'}
                  </div>
                  {items.map(u => (
                    <div key={u.symbol} style={{ display: 'flex', gap: 10, padding: '3px 0' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 72 }}>{u.symbol}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{u.name}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Theme: dynamic universe notice */}
      {meta.isTheme && (
        <div style={{ padding: 14, background: 'rgba(167,139,250,0.06)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid rgba(167,139,250,0.3)' }}>
          <div style={{ fontSize: 10, color: '#A78BFA', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>動的ユニバース</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            テーマ型投資の銘柄ユニバースは固定されていません。売買セッションを実行するたびに Claude AI（Haiku）がその日の市場状況を踏まえてテーマに関連する 10〜15 銘柄を自動選定します。登録テーマが「生成AI」なら NVDA や MSFT などが選ばれる可能性があります。
          </div>
        </div>
      )}
    </div>
  )
}

function PositionTable({ portfolio }: { portfolio: PortfolioOut }) {
  if (!portfolio.positions.length) return (
    <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>現在保有ポジションはありません</div>
  )
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>銘柄</th><th>市場</th>
          <th className="text-right">数量</th><th className="text-right">取得単価</th>
          <th className="text-right">現在値</th><th className="text-right">評価損益</th>
          <th className="text-right">損益率</th>
        </tr>
      </thead>
      <tbody>
        {portfolio.positions.map(pos => (
          <tr key={pos.id}>
            <td><span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{pos.symbol}</span></td>
            <td><span className={`badge badge-${pos.market.toLowerCase()}`}>{pos.market}</span></td>
            <td className="mono text-right">{pos.quantity.toLocaleString()}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(Number(pos.avg_cost))}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(Number(pos.current_price))}</td>
            <td className={`mono text-right ${pos.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>{formatChange(Number(pos.unrealized_pnl))}</td>
            <td className={`mono text-right ${pos.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'}`}>{formatPct(pos.unrealized_pnl_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TradeHistoryTable({ trades }: { trades: TradeOut[] }) {
  if (!trades.length) return (
    <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>取引履歴はありません</div>
  )
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>約定日時</th><th>銘柄</th><th>市場</th><th>売買</th>
          <th className="text-right">数量</th><th className="text-right">約定価格</th>
          <th className="text-right">取引金額</th><th className="text-right">実現損益</th>
        </tr>
      </thead>
      <tbody>
        {[...trades].sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()).map(t => (
          <tr key={t.id}>
            <td className="mono faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {new Date(t.executed_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: t.market === 'TSE' ? 'Asia/Tokyo' : 'America/New_York' })}
            </td>
            <td><span className="mono" style={{ fontWeight: 500, fontSize: 13 }}>{t.symbol}</span></td>
            <td><span className={`badge badge-${t.market.toLowerCase()}`}>{t.market}</span></td>
            <td><span className={`badge badge-${t.side.toLowerCase()}`}>{t.side === 'BUY' ? '買い' : '売り'}</span></td>
            <td className="mono text-right">{t.quantity.toLocaleString()}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(t.price)}</td>
            <td className="mono text-right">{new Intl.NumberFormat('ja-JP').format(t.price * t.quantity)}</td>
            <td className="text-right">
              {t.pnl === null ? <span className="faint mono">—</span>
                : <span className={`pnl-pill ${t.pnl >= 0 ? 'positive' : 'negative'}`}>{formatChange(t.pnl)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Strategy Advisor ─────────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'assistant'; text: string }

const ADVISOR_EXAMPLES = [
  '現在の成績を分析して改善点を教えて',
  '損切りラインを変えたらどうなる？',
  'この戦略に向いている相場環境は？',
  '他の戦略との組み合わせ方は？',
  'リターンを上げるにはどうすればいい？',
]

function AdvisorPanel({
  portfolioId,
  strategyKey,
  metrics,
  apiKeySet,
}: {
  portfolioId: number | undefined
  strategyKey: string
  metrics: Record<string, unknown>
  apiKeySet: boolean
}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const adviseMutation = useMutation({
    mutationFn: (msg: string) => adviseStrategy(portfolioId!, msg, metrics),
    onSuccess: (data, msg) => {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: msg },
        { role: 'assistant', text: data.advice },
      ])
      setInput('')
    },
    onError: (e: Error, msg) => {
      setMessages(prev => [
        ...prev,
        { role: 'user', text: msg },
        { role: 'assistant', text: `エラー: ${e.message}` },
      ])
      setInput('')
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || !portfolioId || adviseMutation.isPending) return
    adviseMutation.mutate(msg)
  }

  if (!apiKeySet) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        ANTHROPIC_API_KEY が未設定です<br />
        <span style={{ fontSize: 10 }}>バックエンドの .env に設定するとアドバイザーが使えます</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Chat history */}
      {messages.length > 0 && (
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: m.role === 'user' ? 'var(--bg-elevated)' : 'rgba(167,139,250,0.08)',
              borderLeft: m.role === 'assistant' ? '2px solid rgba(167,139,250,0.4)' : 'none',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
            }}>
              {m.role === 'assistant' && (
                <div style={{ fontSize: 9, color: '#A78BFA', fontFamily: 'var(--font-mono)', marginBottom: 5, letterSpacing: '0.1em' }}>CLAUDE</div>
              )}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Examples */}
      {messages.length === 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>質問の例</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ADVISOR_EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                style={{
                  padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 10,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 4, cursor: 'pointer', color: 'var(--text-tertiary)',
                  transition: 'all 0.12s',
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="戦略への質問・改善指示を入力…（Enterで送信、Shift+Enterで改行）"
          rows={2}
          style={{
            flex: 1, resize: 'none',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          disabled={!input.trim() || !portfolioId || adviseMutation.isPending}
          onClick={handleSend}
          style={{
            padding: '10px 16px',
            background: input.trim() && portfolioId ? 'rgba(167,139,250,0.15)' : 'var(--bg-elevated)',
            border: `1px solid ${input.trim() && portfolioId ? 'rgba(167,139,250,0.4)' : 'var(--border)'}`,
            color: input.trim() && portfolioId ? '#A78BFA' : 'var(--text-tertiary)',
            borderRadius: 'var(--radius-md)',
            cursor: input.trim() && portfolioId && !adviseMutation.isPending ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            transition: 'all 0.15s', alignSelf: 'stretch',
          }}
        >
          {adviseMutation.isPending ? '…' : '送信'}
        </button>
      </div>
    </div>
  )
}

// ─── Strategy Panel ────────────────────────────────────────────────────────────

function StrategyPanel({
  meta, summary, portfolio, trades, apiKeySet,
}: {
  meta: StrategyMeta
  summary: PortfolioSummaryApi | undefined
  portfolio: PortfolioOut | undefined
  trades: TradeOut[]
  apiKeySet: boolean
}) {
  const [tab, setTab] = useState<'logic' | 'positions' | 'trades' | 'advisor'>('logic')
  const color = meta.color
  const metrics = calcMetrics(trades)
  const returnPct = portfolio?.total_return_pct ?? 0
  const totalValue = portfolio?.total_value ?? 1_000_000
  const cashBalance = portfolio?.cash_balance ?? 1_000_000
  const cashPct = totalValue > 0 ? (Number(cashBalance) / Number(totalValue)) * 100 : 100
  const posCount = portfolio?.positions.length ?? 0

  const metricsForAdvisor: Record<string, unknown> = {
    total_return_pct: returnPct,
    win_rate: metrics.winRate,
    wins: metrics.wins,
    losses: metrics.losses,
    trade_count: metrics.tradeCount,
    total_realized_pnl: metrics.totalRealizedPnl,
    position_count: posCount,
    cash_pct: cashPct,
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'logic',     label: '戦略ロジック' },
    { key: 'positions', label: `ポジション（${posCount}）` },
    { key: 'trades',    label: `取引履歴（${metrics.tradeCount}）` },
    { key: 'advisor',   label: 'アドバイザー' },
  ]

  return (
    <div className="card" style={{ borderTop: `3px solid ${color}` }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}80` }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>{meta.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 600 }}>{meta.description}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <MetricChip label="総評価額" value={portfolio ? formatJPY(Number(totalValue)) : '—'} />
        <MetricChip label="累計リターン" value={portfolio ? (returnPct >= 0 ? '+' : '') + formatPct(returnPct) : '—'} color={portfolio ? (returnPct >= 0 ? 'var(--positive)' : 'var(--negative)') : undefined} />
        <MetricChip label="現金比率" value={portfolio ? cashPct.toFixed(0) + '%' : '—'} />
        <MetricChip label="保有銘柄数" value={String(posCount)} />
        <MetricChip label="総取引数" value={String(metrics.tradeCount)} />
        {metrics.winRate !== null && (
          <MetricChip label="勝率" value={(metrics.winRate * 100).toFixed(0) + '%'} color={metrics.winRate >= 0.5 ? 'var(--positive)' : 'var(--negative)'} />
        )}
        {metrics.totalRealizedPnl !== 0 && (
          <MetricChip label="実現損益" value={formatChange(metrics.totalRealizedPnl)} color={metrics.totalRealizedPnl >= 0 ? 'var(--positive)' : 'var(--negative)'} />
        )}
      </div>

      {/* Equity chart */}
      {summary && summary.equity_curve.length > 1 ? (
        <div style={{ marginBottom: 20 }}>
          <EquityAreaChart data={summary.equity_curve} height={180} color={color} initialCapital={1_000_000} />
        </div>
      ) : (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 20 }}>
          セッションを実行するとエクイティカーブが表示されます
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: tab === t.key ? color : 'var(--text-tertiary)', borderBottom: tab === t.key ? `2px solid ${color}` : '2px solid transparent', marginBottom: -1, transition: 'color 0.15s' }}>
            {t.label}
            {t.key === 'advisor' && <span style={{ marginLeft: 4, fontSize: 9, color: '#A78BFA' }}>AI</span>}
          </button>
        ))}
      </div>

      {tab === 'logic' && <LogicSection meta={meta} />}
      {tab === 'positions' && portfolio && <PositionTable portfolio={portfolio} />}
      {tab === 'positions' && !portfolio && <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>データなし</div>}
      {tab === 'trades' && <TradeHistoryTable trades={trades} />}
      {tab === 'advisor' && (
        <AdvisorPanel
          portfolioId={portfolio?.id}
          strategyKey={meta.key}
          metrics={metricsForAdvisor}
          apiKeySet={apiKeySet}
        />
      )}
    </div>
  )
}

// ─── Theme portfolios for theme_follow tab ────────────────────────────────────

function ThemePortfolioList() {
  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  })
  const themePortfolios = portfolios.filter(p => p.portfolio_type === 'theme')

  if (themePortfolios.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        テーマ型ポートフォリオが未作成です。<br />
        <span style={{ fontSize: 10 }}>「テーマ投資」ページからテーマを登録してください。</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {themePortfolios.map(p => {
        const themeName = (p as any).theme_name ?? p.name
        const colors = ['#A78BFA', '#FB923C', '#34D399', '#60A5FA', '#F472B6']
        const c = colors[p.id % colors.length]
        return (
          <div key={p.id} style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', borderLeft: `2px solid ${c}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{themeName}</span>
                <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {p.positions.length}銘柄保有
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{formatJPY(Number(p.total_value))}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: p.total_return_pct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  {p.total_return_pct >= 0 ? '+' : ''}{formatPct(p.total_return_pct)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategyDetail() {
  const [selectedKey, setSelectedKey] = useState<string>(STRATEGIES[0].key)

  const { data: configStatus } = useQuery({
    queryKey: ['configStatus'],
    queryFn: getConfigStatus,
    staleTime: 60_000,
  })
  const apiKeySet = configStatus?.anthropic_api_key_set ?? false

  const { data: summaries = [], isLoading: loadingSummaries } = useQuery({
    queryKey: ['portfolioComparison'],
    queryFn: getPortfolioComparison,
    refetchInterval: 60_000,
  })

  const { data: portfolios = [], isLoading: loadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
    refetchInterval: 60_000,
  })

  const selectedMeta = STRATEGIES.find(s => s.key === selectedKey)!
  const isThemeTab = selectedKey === 'theme_follow'

  // テーマタブの場合は最初のテーマポートフォリオを使う
  const selectedPortfolio = isThemeTab
    ? portfolios.find(p => p.portfolio_type === 'theme')
    : portfolios.find(p => p.strategy_name === selectedKey)

  const selectedSummary = isThemeTab
    ? summaries.find(s => s.portfolio_type === 'theme')
    : summaries.find(s => s.strategy_name === selectedKey)

  const { data: trades = [], isLoading: loadingTrades } = useQuery({
    queryKey: ['trades', selectedPortfolio?.id],
    queryFn: () => selectedPortfolio ? getTrades({ portfolio_id: selectedPortfolio.id }) : Promise.resolve([]),
    enabled: !!selectedPortfolio,
  })

  const isLoading = loadingSummaries || loadingPortfolios || loadingTrades

  return (
    <div>
      {/* APIキー警告 */}
      {!apiKeySet && (
        <div style={{ background: 'rgba(248,113,113,0.08)', borderBottom: '1px solid rgba(248,113,113,0.2)', padding: '6px 20px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--negative)' }}>
          ⚠ ANTHROPIC_API_KEY が未設定です — アドバイザー機能とテーマ型投資は利用できません
        </div>
      )}

      <div className="page-container">
        <div className="page-header anim-fade-up">
          <div>
            <div className="page-title">戦略詳細</div>
            <div className="page-subtitle">各手法のロジック詳解・パフォーマンス・AI アドバイザー</div>
          </div>
        </div>

        {/* Strategy selector */}
        <div className="card anim-fade-up" style={{ padding: '4px 0', marginBottom: 16 }}>
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {STRATEGIES.map(s => {
              const active = s.key === selectedKey
              const sm = summaries.find(sm => sm.strategy_name === s.key || (s.key === 'theme_follow' && sm.portfolio_type === 'theme'))
              return (
                <button key={s.key} onClick={() => setSelectedKey(s.key)} style={{ flex: '1 1 0', minWidth: 120, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: active ? `2px solid ${s.color}` : '2px solid transparent', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, boxShadow: active ? `0 0 8px ${s.color}80` : 'none' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: active ? s.color : 'var(--text-tertiary)', fontWeight: active ? 600 : 400 }}>{s.label}</span>
                  </div>
                  {sm && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sm.total_return_pct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {sm.total_return_pct >= 0 ? '+' : ''}{sm.total_return_pct.toFixed(1)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {isLoading && (
          <div className="card" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>読み込み中…</div>
          </div>
        )}

        {!isLoading && !isThemeTab && (
          <div className="anim-fade-up">
            <StrategyPanel
              meta={selectedMeta}
              summary={selectedSummary}
              portfolio={selectedPortfolio}
              trades={trades as TradeOut[]}
              apiKeySet={apiKeySet}
            />
          </div>
        )}

        {/* テーマ型は登録テーマ一覧 + ロジック説明 */}
        {!isLoading && isThemeTab && (
          <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ borderTop: `3px solid #A78BFA` }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: '#A78BFA20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 10px #A78BFA80' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>テーマ型投資</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedMeta.description}</div>
                </div>
              </div>
              <LogicSection meta={selectedMeta} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>登録済みテーマ</div>
              <ThemePortfolioList />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
