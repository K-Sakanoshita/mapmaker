# 描画・保存の回帰確認（Issue #43）

## 自動確認

既存の `node tests/maplibre.cjs` / `node tests/birdseye.cjs` を維持し、以下を追加。

```sh
node tests/marker-popup.cjs
node tests/wiki-article-close.cjs
node tests/request-failures.cjs
node tests/startup-failures.cjs
node tests/language-routing.cjs
node tests/address-search.cjs
node tests/roof-shapes.cjs
node tests/model3d-rules.cjs
node tests/source-boundaries.cjs
node tests/building-parts.cjs
node tests/elevated-paths.cjs
node tests/fence3d.cjs
node tests/rope3d.cjs
node tests/flagpole3d.cjs
node tests/national-flags.cjs
node tests/map-presets.cjs
node tests/retaining-wall.cjs
node tests/map-data-acquisition.cjs
node tests/map-data-simplify.cjs
node tests/seasons.cjs
node tests/palette-processing.cjs
node tests/coloring-palette.cjs
```

実ブラウザーは Playwright と Chromium を使用。別ターミナルでリポジトリを配信してから実行する。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# Playwright がない場合は作業ディレクトリ外へ導入
npm install --prefix /tmp/mapmaker-test-deps playwright
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs --startup
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs --language
# 独自のローカルサーバーで旧HTMLのHTTPキャッシュを作り、更新後のアイコン追加を確認
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/startup-cache-browser.cjs
# 万博実データの屋上通路・階段、3D画面とSVG/PNG保存、2D復帰
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/elevated-paths-browser.cjs
# 塗り絵の3D屋根・壁の不透明表示、PNG保存、表示とパレットの切替
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/coloring-3d-browser.cjs
# 7680×4088 PNG保存時の応答性、局所マスク、アイコン名前空間と隠面の画素
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/png-responsiveness-browser.cjs
# 復帰シナリオだけを再確認する場合
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs --recovery
```

`CHROMIUM_PATH`（既定 `/usr/bin/google-chrome`）、`MAPMAKER_URL`（既定 `http://127.0.0.1:8765`）、`MAPMAKER_ARTIFACTS`（既定 `/tmp/mapmaker-regression`）で実行環境を変更できる。外部JS/CSSのCDNへの接続とWebGLが必要。

- PC 1280×900 / スマートフォン相当 390×844 のChromium。
- 2D・3D・手書き風で作成→建物の色/線幅編集→A4/A3縦横のSVG/PNG保存→リセット→再作成。
- 手書き風・保存・描画待機が同じ処理中DOMを使うこと、同時処理の一方の終了で閉じないこと、キャンセル・失敗時の解放とPC/スマホでの表示範囲を検査。
- 屋上から始まる塔がある場合も土台の建物を残すことを、共通判定・ネイティブ画面・SVGで検査。京都タワー周辺の実データでも画面とSVG/PNGを確認。
- 塗り絵の3D画面でも白い屋根・壁で奥の線を隠し、PNGと同じ立体の隠れ方になること、表示の非表示・復元と通常色／塗り絵の切替を検査。
- 屋上歩道の色・線幅・破線を地上の歩道と共通にし、細い白い縁取りで屋上面と区別すること、固定幅の塗りつぶし帯を作らないこと、カメラ移動時の破線間隔・折れ点の位相、線幅変更・非表示、Worker/SVG出力への反映を検査。
- 高架歩道の高さタグ・接続する同階の通路・屋上面、複数wayの折り返し階段、逆向きのinclineタグ、地下道・地上道・中庭の除外、非表示と2D復帰、実際のWorkerとGPUメッシュの一致を検査。高さが未指定の独立した高架歩道は階高から推定し、屋上通路は簡略化した建物に埋まらないよう屋上面まで持ち上げる。実データを固定する場合は `EXPO_OSM_FIXTURE` に既存設定URLから取得したOSM JSONを指定する。
- 地面より上にある小さな部分だけでは環状の建物全体を消さず、中庭・高さ・部分との関連を画面とSVGで保つことを検査。
- 部分の上端/下端、階数・単位、外周との2D/3D切替、中庭・単なる重なり・単独部分、実データWorkerのリレーション保持を検査。ブラウザーでは張り出しを含む外周＋低層部＋地上4mから始まる高層部を確認。
- 同じ外周の部分どうしで、交差する面の手前側だけをマスクすること、未塗り面が他の面を隠さないこと、回転・入力順によらず隠面マスクを出力することを検査。国会議事堂の中央塔・左右の屋根を実データの通常／手書き風SVG/PNGで確認。手書き変換後も、見える面と隠れた面の画素色をブラウザーで検査。
- 3Dモデル選択の優先順、複数タグのAND／OR／NOT、不正条件、既定モデル、旧設定互換、タグ・座標の保持と実際のWorker状態によるSVG一致を検査。
- 樹冠の斜面と丸い先端、外向き法線、全高・幹の寸法維持、GPUとSVGの高さ一致、非表示・復元、2D維持とWorker出力一致を検査。
- 擁壁の右側を指す三角、ウェイ反転・折れ曲がり・重複点、ズーム時の間隔更新、高さ非依存、破線、非表示、2D/3Dの共通記号を検査。
- 屋根の法線・共通陰影・RGBのみの明度変更・透明度保持・輪郭の集約と背面除外をNodeで検査。
- 切妻・寄棟・ピラミッド型とbuilding:partを含む固定地物で、通常3DのSVGに屋根形状の識別属性が残ることを検査。手書き風は変換後のパスと保存画像で確認する。
- 砂場・すべり台・遊具の実アイコンをSVGとPNGへ保存し、キャッシュ利用時にベクター形状を保つこと、画像代替時にも透明度と図柄の白い抜けを保ち、黒い四角にならないことを画素で検査。
- SVGのXML解析・地物パス・変更色・NaN不在、PNGシグネチャ・用紙寸法（72dpi）と保存UIの復帰を検査。
- `--startup` では日本語/英語ページでHTML・設定・言語データ404、設定破損、通信失敗と通常起動を実ブラウザーでも検査。
- 即時HTTP 503後のエラーダイアログ終了と再作成、保存失敗後の再保存を検査。
- マーカー名/属性、Wikipediaポップアップ/記事にHTML・引用符・イベント属性相当の文字列を渡し、実DOMで文字として残ることと不正画像URLの拒否を検査。
- `report.json` にURL・カメラ・ビューポート・Chromium版・コンソールログを記録。SVG/PNGと編集画面のスクリーンショットも保存する。

`tests/fixtures/browser-cases.json` の座標・非整数ズーム・回転/傾きを固定する。建物密集地・港湾部・公園住宅地を想定した3地点を使用するが、地物は `tests/helpers/osm-fixture.cjs` が生成する**合成データ**であり、実際のOSMスナップショットではない。背景も空の固定スタイルへ置換し、OSM/タイル更新による不安定さを避ける。Googleへのアクセスログ送信もテスト時に置換する。

## 手動の外観・リリース確認

自動テストは画面と画像の完全なピクセル一致を判定しない。次を実データ・300dpiでも確認し、日付、ブラウザー、再現URL、保存画像、取得エラーを記録する。

| 地点 | URL（カメラの基準） | 確認項目 |
| --- | --- | --- |
| 大阪・梅田 | `/#17.3/34.7025/135.4983/0/0` | 大量建物、屋根/側面、壁との重なり、リセット負荷 |
| 横浜・大さん橋 | `/#17.3/35.451/139.646/28/40` | 海岸線/水面、用紙境界、回転・傾斜とクリップ |
| 東京・井の頭公園 | `/#17.3/35.700/139.574/12/25` | 樹木/生垣/道路、POI、手書き風の編集・保存 |

1. 各地点で作成し、色・線幅・表示を変更。画面の選択範囲と保存画像の地物・色・線幅・著作権を比べる。A4/A3縦横、2D/3D、非整数ズームとズーム別の傾き上限を確認する。
2. POIを選択し、日本語/英語・サイズ・スタイルを変更。コメント付き目印ピン、Wikipedia記事の移動・折り返し・✕での終了を確認する。SVG/PNGのアイコン・文字位置も比べる。
3. 手書き風Onのまま色・線幅・POI・ピンを変更し、プレビューの更新後に保存する。設定パネルはEscまたは外側のクリックで閉じてからリセットする。メニュー背後も用紙範囲へ含まれることを確認する。
4. スマートフォンの縦/横で下部シート・保存バー・ダイアログの重なり、保存・リセットの繰り返しを確認する。
5. 開発者ツールでOverpassのオフライン/タイムアウト、CSV 404を再現し、処理中表示が消え、閉じる・再試行を操作できることを確認する。

厳密な3D遮蔽・地形・立体交差はREADME記載の未対応仕様に従って判断する。フォント/OS差や手書き風の変動を無条件のピクセル不一致エラーにしない。fixtureや期待寸法を更新するときは、変更理由と前後の画面/保存画像を確認し、`report.json` と共に記録する。

季節表示は「通常→春→秋→通常」で桜・イチョウと森林の色を比較する。常緑林は維持、落葉林は強め、指定なしは控えめに変わり、草地は変わらないことを確認する。2D・3D・SVG/PNG・手書き風、PCとスマートフォンの色・線幅パネルを確認し、モノクロ・ぬりえでは季節色を適用しない。

旗竿の実ブラウザー確認は、ローカルサーバー起動後に `node tests/flagpole-browser.cjs` を実行する（PlaywrightとChromeが必要）。既定の確認先は `http://127.0.0.1:8765/`、変更する場合は `MAPMAKER_TEST_URL` を指定する。PC・スマートフォン幅で、自動取得、支柱・旗の共通メッシュ、非表示／復元、SVG・PNG保存、2D切り替えを確認し、画像は `/tmp/mapmaker-flagpole-*` に出力する。

万博メニューは `node tests/map-presets-browser.cjs` で確認する（ローカルサーバー・Playwright・Chromeが必要、確認先は`MAPMAKER_URL`で変更可能）。実際の閉幕時PMTilesと道路入り公開OSM JSONへアクセスし、日本語390px・英語1280pxで会場移動だけが行われること、作成時の道路・旗竿と、施設エリアとは別に追加されたオマーン館の建物（`way/1380324416`）、SVG/PNG、通常地図への復帰を検査する。結果は`/tmp/mapmaker-expo-*`へ保存する。

大屋根リングは `node tests/grand-ring-browser.cjs` で実データを確認する（ローカルサーバー・Playwright・Chromeが必要、確認先は`MAPMAKER_URL`）。リング全体の描画モデルと高さ20m、SVG内のリングID、PNG保存を検査し、`/tmp/mapmaker-ring-fixed*`へ保存する。画像ではリング中央の空間が塗り潰されていないことも確認する。

メニュー末尾の「通常のマップを作る」「EXPO2025 万博マップを作る」と万博限定の移動範囲は `node tests/preset-navigation-browser.cjs` で確認する（ローカルサーバー・Playwright・Chromeが必要）。日英・390/1280pxでメニュー順・画面内への収まり、範囲外へのドラッグ・ズームアウト・URL指定、通常モードでの制限解除を検査する。

国旗の実ブラウザー確認は`node tests/national-flags-browser.cjs`で実行する（ローカルサーバー・Playwright・Chromeが必要）。PCとスマートフォン幅で日本・カナダ・ベトナムなど12種類、素材404時の単色復帰、団体旗・国コードのみの除外、配色変更・非表示復元と手書き風の図柄保持を確認し、埋め込みSVGとPNGを`/tmp/mapmaker-national-flags-*`へ保存する。

アイコン一覧の種類フィルターは`node tests/list-category-browser.cjs`で確認する（Playwright・Chromeと外部CDNへの接続が必要）。種類列の完全一致、名前に同じ文字を含む別種類の除外、括弧を含む種類名、キーワードとの併用、各フィルターの解除、表示結果の全選択を実ブラウザーで検証する。
