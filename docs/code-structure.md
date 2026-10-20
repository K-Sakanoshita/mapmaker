# JavaScriptの配置と依存関係

既存のルート`data/`は設定・定義データの置き場です。JavaScriptは`lib/`以下に置きます。

```text
lib/
  domain/                 タグ・モデル選択・スタイル・編集状態
    feature-tags.js       タグ取得、単位、建物の基本判定
    flags.js              国旗タグと対応する国コードの判定
    model-rules.js        設定による3Dモデル選択
    styles.js             季節色、ポイント・カテゴリのスタイル、描画順
    layer-state.js        表示・線幅・パレット・地物ごとの編集記録
  geometry/               地図エンジンに依存しない形状計算
    buildings.js          高さ、建物外周と部分の関連付け
    roofs.js              屋根の共有メッシュ
    barriers.js           壁・生垣・擁壁・金網フェンス・ロープの形状
    trees.js              幹・樹冠の共有メッシュとキャッシュ
    point-models.js       樹木・旗竿の3D部品と旗竿の共有メッシュ
    elevated-paths.js      屋上通路・階段の高さ接続と共有メッシュ
    coordinates.js        座標配列のクリップ・平坦化・代表点
    coastline.js          明示された範囲内での海岸線処理（Turfを注入）
    simplify.js           取得したGeoJSONの簡略化
  osm/                    取得・変換の実処理
    query.js              ズーム別取得計画とOverpassクエリ
    classifier.js         取得カテゴリ・地下地物・建物リレーションの判定
    map-data.js           HTTP受信、上限検査、変換・分類・簡略化
    csv.js                定義に基づくCSV→GeoJSON変換
  renderers/maplibre/     MapLibre固有の実装
    adapter.js            地図・マーカー・ポップアップと既存APIの接続
    editor.js             地物の描画、表示更新、クリック判定
    vector-editor.js      ベクトルタイルとの照合と再利用
    mesh-renderer.js      屋根・樹冠などのGPU描画と輪郭
  export/                 保存用の出力処理
    svg-features.js       データだけを受けてSVG文字列を生成
    svg-document.js       アイコン・記事の合成、手書き変換、保存の組立て
    svg-text.js           ブラウザーでの文字計測・SVGテキスト配置
    png.js                SVG文書をCanvasでPNG化
  workers/                Workerの入口
    map-data.js           取得処理の呼び出しと進捗・結果・エラー返却
    svg-export.js         保存スナップショットからSVGを生成して返却
  application/            画面と共有処理の接続・進行管理
    resource-loader.js    補助ライブラリと住所検索データの初回読み込み・再試行
    language-router.js    初回言語判定・明示指定・選択した言語の保持
    map-presets.js        プリセットURL・初期地図・データ取得先の選択
    feature-context.js    既存のgetMapMaker* API・PrintSVGExporterとの互換接続
    export-snapshot.js    保存用データの取り出し
    flag-assets.js        必要な国旗SVGの取得・埋め込みと画像アトラス
    layer-controller.js   カテゴリ操作と描画更新の進行管理
    layer-render-registry.js  編集状態と分離した描画オブジェクトの管理
    map-data-worker-client.js 取得用Workerの通信・タイムアウト・解放
    svg-worker-client.js  保存用Workerの直列実行・キャンセル・結果照合
    overpass-controller.js 取得範囲・サーバー切替・画面への進捗通知
    map-controls.js       地図操作・表示範囲と計算処理の接続
    poi-controller.js     POIの追加・編集
    browser-services.js   既存の通信・画像・リトライ処理
  ui/                     パネル・ダイアログ・一覧・用紙マスク・手動ピン
  vendor/                 取り込んだ外部ライブラリ
```

## 依存のルール

- `domain/`・`geometry/`・`osm/`は`Conf`、`Layers`、DOM、MapLibreを直接参照しません。設定、色、範囲、通知関数などを引数で受け取ります。
- `MapMakerDomain`と`MapMakerGeometry`は共有計算の名前空間です。設定を必要とする関数は第1引数に`{config, palette, season}`を受け取ります。単純なタグ取得などは対象だけを受け取ります。
- MapLibreのsource/layer ID、GPUバッファ、イベント処理は`renderers/maplibre/`に置きます。屋根・樹冠の元メッシュは`geometry/`を使い、SVGと別々に形状を定義しません。
- UIとControllerは地図Viewの`on/off`、`getPitch/getBearing`、`setPitch`、`setNavigationEnabled`、`addUIControl`などを使い、`.gl`を直接操作しません。MapLibreのコントロールDOMもAdapter側で扱います。
- Workerの入口にはメッセージ受付と返却だけを置き、処理本体は共有側へ置きます。ブラウザー向けControllerを`importScripts`しません。
- `export/svg-features.js`はDOMを使いません。`svg-document.js`・`svg-text.js`・`png.js`はブラウザーのDOM／Canvasを使う処理です。
- `application/`は既存のグローバル変数と共有処理を接続する移行境界です。既存APIを維持していますが、新しい共有処理からControllerや`mapmaker.js`を参照しないでください。

取得カテゴリの判定と3Dモデル選択は別の設定です。取得条件の`area`・否定条件などを、モデル選択のAND／OR条件へ暗黙に読み替えません。

## 編集状態と描画オブジェクト

`Layers[category]`はGeoJSON、色、線幅、カテゴリ表示状態、`edits`を持ちます。`edits`は地物ID・編集ID・描画順・スタイルを持つデータです。

`LayerRenderRegistry`はカテゴリをキーにした`WeakMap`で描画オブジェクトを保持します。登録時にオブジェクトの`options`を編集記録へ接続するため、既存の`setStyle`による変更も状態側へ反映されます。表示・線幅・パレットの状態操作は`LayerState`、DOMの反映は`LayerPanel`が担当します。

既存の外部呼び出し・VMテストのため、Registryは旧`category.svg`入力も受け付けます。新規コードでは`category.svg`へ描画オブジェクトを保存しないでください。

## SVG Workerの契約

リクエストは次の形です。`snapshot.version`は現在`1`です。

```js
{
  id, revision,
  snapshot: {
    version: 1,
    context: {config, palette, season},
    layerKeys,
    layers: {category: {features, opacity, edits}},
    styles: {category: [baseStyle, overlayStyle]}
  },
  exporterOptions, bbox, options
}
```

DOM・地図インスタンス・関数・イベントハンドラーは含めません。編集スタイルは取り出す際に複製し、Workerへの送受信で構造化クローンされます。取得済みのGeoJSONをWorker呼び出しのたびに事前複製することは避け、転送時のクローンを使います。

Workerは`{id, revision, svgText}`または`{id, revision, error}`を返します。ClientはIDと世代を照合し、キャンセル後の古い応答を無視します。キャンセルは処理中・待機中の要求に反映され、後続の新しい要求ではWorkerを作り直せます。

取得用Workerは1回の取得で終了し、保存用Workerは直列処理で再利用します。両者の寿命を同じ仕組みへ統合しません。

## 読み込みと確認

従来のclassic script方式を維持しています。`index.html`と`en/index.html`の順序・バージョン、Worker内の`importScripts`を合わせて更新してください。Workerの相対パスはWorker自身の配置を基準に解決します。

`tests/helpers/lib-source.cjs`のソースグループは、従来のVMテストに分割後のファイルを読み込ませるためのテスト専用補助です。製品側のローダーや互換ファイルではありません。

`node tests/source-boundaries.cjs`で、共有処理の単独実行、編集状態の分離、実Workerとの出力一致、古い応答・キャンセル、日英ページの参照先を検査します。形状・取得・保存・ブラウザーの確認方法は[回帰確認](../tests/REGRESSION.md)を参照してください。

国旗素材は`image/flags/`に同梱し、ライセンスと取得元も同じ場所に置きます。国旗の判定と折れ目のUVは共有処理に置き、GPUは画像アトラス、SVGは同じSVG素材を埋め込んで描画します。保存スナップショットの`context.config.flagImages`には使用する国のデータURIだけを追加し、WorkerからHTTP取得は行いません。

補助ライブラリ（Turf、住所検索、施設一覧、色選択、手書き、QRコード）は各機能の初回利用時に読み込み、同時要求を共有します。失敗時は次の操作で再試行できます。SVGアイコンは保存前に表示中の種類だけ読み込み、取得できなければ元の画像へフォールバックします。
