# 描画・保存の回帰確認（Issue #43）

## 自動確認

既存の `node tests/maplibre.cjs` / `node tests/birdseye.cjs` を維持し、以下を追加。

```sh
node tests/marker-popup.cjs
node tests/wiki-article-close.cjs
node tests/request-failures.cjs
node tests/startup-failures.cjs
node tests/address-search.cjs
```

実ブラウザーは Playwright と Chromium を使用。別ターミナルでリポジトリを配信してから実行する。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# Playwright がない場合は作業ディレクトリ外へ導入
npm install --prefix /tmp/mapmaker-test-deps playwright
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs --startup
# 復帰シナリオだけを再確認する場合
NODE_PATH=/tmp/mapmaker-test-deps/node_modules node tests/browser-smoke.cjs --recovery
```

`CHROMIUM_PATH`（既定 `/usr/bin/google-chrome`）、`MAPMAKER_URL`（既定 `http://127.0.0.1:8765`）、`MAPMAKER_ARTIFACTS`（既定 `/tmp/mapmaker-regression`）で実行環境を変更できる。外部JS/CSSのCDNへの接続とWebGLが必要。

- PC 1280×900 / スマートフォン相当 390×844 のChromium。
- 2D・3D・手書き風で作成→建物の色/線幅編集→A4/A3縦横のSVG/PNG保存→リセット→再作成。
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
