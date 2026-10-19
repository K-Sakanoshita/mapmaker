# タグによる3D形状の選択

`data/leyers.jsonc` の `model3D` に、対象別の `defaultModel` と `rules` を指定します。上から最初に一致したルールを使います。対応していないモデル名は読み飛ばし、未一致時は既定モデルになります。

| 対象 | 対応するモデル | 未設定時の既定モデル |
| --- | --- | --- |
| `tree` | `cone`, `cherry`, `ginkgo` | `cone` |
| `roof` | `flat`, `gabled`, `hipped`, `pyramidal` | `flat` |
| `barrier` | `flat`, `wall`, `hedge`, `fence`, `rope` | `flat` |

モデル選択は画面表示とSVG/PNG保存で共通です。元のOSMタグ・座標は変更しません。屋根の形状制約や、各対象のジオメトリ制約は従来どおりです。2D表示には立体を追加しません。`barrier`のモデル適用対象は、`barrier`タグ（空・`no`以外）のある地物と`man_made=embankment`です。既定モデルを変えても道路や建物は壁になりません。

## 条件

- `{"tag":"barrier","values":["wall"]}`：指定タグの値と完全一致。
- `{"tags":["species","genus"],"values":["Ginkgo"]}`：いずれかのタグと一致。
- `{"tag":"species","patterns":["^cerasus(?:\\s|$)"]}`：正規表現と一致。
- `{"tag":"height","exists":true}`：空でないタグが存在。`false` は未設定または空。
- `{"all":[条件, 条件]}`：すべて一致（AND）。
- `{"any":[条件, 条件]}`：いずれか一致（OR）。
- `{"not":条件}`：条件に一致しない（NOT）。

複合条件は入れ子にできます。タグ名はそのまま照合し、値は前後の空白と大文字小文字を無視します。`values` と `patterns` はOR、`exists` を併記した場合は存在条件も必要です。不正な条件・空の複合条件は一致せず、不正な正規表現は無視します。正規表現は管理する設定ファイルにのみ記述してください。

## 設定例

次は、木製フェンスを既存の壁モデルで表現する例です。標準設定ではフェンスを金網モデルで表示します。木製だけを壁にする条件を先に置きます。

```json
{
  "barrier": {
    "defaultModel": "flat",
    "rules": [
      {
        "model": "wall",
        "when": {
          "all": [
            {"tag": "barrier", "values": ["fence"]},
            {"tag": "material", "values": ["wood"]}
          ]
        }
      },
      {"model": "rope", "when": {"tag": "barrier", "values": ["rope"]}},
      {"model": "fence", "when": {"tag": "barrier", "values": ["fence"]}},
      {"model": "wall", "when": {"tag": "barrier", "values": ["wall"]}},
      {"model": "hedge", "when": {"tag": "barrier", "values": ["hedge"]}}
    ]
  }
}
```

この `barrier` を `model3D.barrier` に設定します。幅・標準高さは選択されたモデルに従い、地物に有効な `height` があれば優先します。取得・編集カテゴリは別設定のため、この例ではカテゴリを分割しません。

## 拡張と互換性

既存モデルへの条件追加・変更は設定のみで行えます。新しい形状（縦板を並べた柵など）には、`lib/domain/model-rules.js` の対応モデルと`lib/geometry/`の共有ジオメトリ生成を追加し、画面・保存双方を接続する必要があります。外部のGLB等を読み込む機能はありません。

`model3D` の対象別設定がない場合、屋根・壁・生垣・金網フェンス・ロープは組み込みのタグ判定を使い、樹木は旧 `pointStyle.tree.shapeTags` / `shapeRules` を受け付けます。対象別設定がある場合は新設定が優先され、`rules: []` にすると旧ルールは復活しません。

確認：`node tests/model3d-rules.cjs`、`node tests/tree3d.cjs`、`node tests/roof-shapes.cjs`、`node tests/birdseye.cjs`。

`fence`は支柱・上下の横棒・菱形の金網からなる透過型モデルです。標準高さは1.5mで、有効な`height`を優先します。網目は1m以上を目安に、表示倍率と高さに応じて粗くし、枠・支柱を細くし、通常の線幅にかかるズーム拡大補正を金網では抑えて隙間を保ちます。小さく映る場合は、縦方向約12pxを目安に表示高さを強調します（元の高さの最大2.5倍）。元の高さタグは保持し、画面と保存で同じ処理を使います。支柱間隔は最大約2.5mを目安に生成し、長大な地物では描画量を制限します。2Dでは従来の線表示です。

`rope`は支柱の間にロープを1本渡し、中央を少したるませるモデルです。標準設定は[`barrier=rope`](https://wiki.openstreetmap.org/wiki/Tag:barrier%3Drope)に適用し、高さは`height`を優先、未指定時は1mです。2Dでは線で表示します。
