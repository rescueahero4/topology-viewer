# トポロジーチャート: AI クライアント向けガイダンス

<!-- id: when-to-render -->
## いつ描画するか

答えが「複数の対象とそれらの間の関係」であるときに、`render_topology` を呼び出してください。例は、リネージ、オーナーシップ、アクセス、構造、依存関係です。

事実が 1 つだけのとき、または関係のないリストのときは、呼び出さないでください。カタログに一致するものがないときも、呼び出さないでください。その場合は返信でそのことを伝えてください。

1 回の呼び出しで 1 つのチャートを描画します。2 回目の呼び出しは、チャートを置き換えます。

<!-- id: shape-data -->
## データの整形方法

`nodes` と `edges` を送信してください。

- ノードには一意の `id` が必要です。`type`、`label`、`attrs` も付けられます。
- エッジには `subject`、`predicate`、`object` が必要です。`subject` と `object` はノードの `id` の値です。`attrs` も付けられます。

```json
{
  "nodes": [
    { "id": "tbl-orders", "type": "table", "label": "ORDERS" },
    { "id": "usr-jane", "type": "user", "label": "Jane Doe" }
  ],
  "edges": [{ "subject": "tbl-orders", "predicate": "ownedBy", "object": "usr-jane" }]
}
```

コンパクト形式はより短くなります。ノードは `[id, type, label, attrs]`、エッジは `[subject, predicate, object, attrs]` と書きます。大きな結果にはこの形式を使ってください。

まだグラフになっていないデータには、次のレシピを使ってください。

1. 対象ごとに一意の `id` を付けます。対象ごとに 1 つのノードを作ります。
2. 2 つの対象の間の関係ごとに 1 つのエッジを作ります。
3. 対象のその他のフィールドは `attrs` に入れます。
4. 合う QDIC の述語があれば使います。例: `contains`、`ownedBy`、`taggedWith`、`classifiedAs`。

アプリは 2 つの生の形式を自分で整形できます。データのキー名を示す `shape` ヒントを追加してください。

- フラットな行のリスト (CSV ファイルや SQL の結果): `shape` は `{ "kind": "rows", "subject": "<key>", "object": "<key>" }` です。`predicate` と `type` は省略可能で、キー名または固定値を指定します。
- 入れ子のオブジェクト (JSON のツリー): `shape` は `{ "kind": "tree", "children": "<key>", "label": "<key>" }` です。`id` は省略可能です。ツリーは最大 64 階層です。

`shape` ヒントがないとき、アプリは次の列の組を試します。`source` と `target`、`from` と `to`、`parent` と `child`、`subject` と `object`、`*_id` の組、`children` または `items` です。確信がないときは `shape` ヒントを送信してください。アプリは自分で作ったものを推論として記録し、`shaped-from` を報告します。

<!-- id: quollio-passthrough -->
## `quollio-mcpserver` の結果

`quollio-mcpserver` の結果は、変更せずにそのまま送信してください。

- `get_neighborhood`、`get_related_nodes`、`get_nodes` の結果は、`nodes` と `edges` として送信します。
- `get_node_types` と `get_predicates` の結果は、`vocabulary` として送信します。

キー名を変えないでください。フィールドを削除しないでください。結果を整形し直さないでください。アプリは QDIC の名前を読み取ります。例: `globalId`、`nodeType`、`physicalName`、`subjectNodeId`、`objectNodeId`。前のセクションのレシピは、ほかのソースにだけ使ってください。

<!-- id: how-much -->
## 送信するデータ量

1 回の呼び出しで送信できるのは、最大 2,000 ノード、4,000 エッジ、256 KB の JSON です。これを超えると何も描画されず、`too-large` が返ります。

まず、質問に答える部分にデータを絞り込んでください。次に、その部分を送信してください。それでも大きいときは、最も関連性の高い部分を先に送信してください。

<!-- id: first-view -->
## 最初に描画するもの

最初のビューは `view` で設定します。キーは次のものだけです。

- `view.root`: 質問の対象であるノードの `id`。
- `view.reveal`: 最初に描画するノードの `id` のリスト。`nodes` にある `id` だけを使ってください。
- `view.budget`: 最初のビューの大きさ。値は 10、20、50、`"all"` のいずれかです。
- `view.layout`: `force`、`atomic`、`bubbles`、`tree-h`、`tree-v` のいずれかです。

<!-- id: approach -->
## どのアプローチを使うか

`view.approach` は `active` または `passive` です。

- ルートがあるときは `active` を送信してください。チャートはルートを選択した状態で開き、その隣接ノードが強調されます。
- 手がかりのない曖昧な依頼のときは `passive` を送信してください。チャートは何も選択されていない状態で開きます。
- `view.root` が `nodes` にないときは、チャートは最も接続数の多いノードで `active` として開きます。結果には警告 `root-not-found` が付きます。

`view.approach` を送信しないときは、ルートがあれば `active`、なければ `passive` になります。

<!-- id: node-design -->
## ノードの設計

QDIC のノードタイプには専用のアイコンがあります。宣言しないでください。

それ以外のノードタイプは、タイプごとに 1 つのエントリを `types` で宣言してください。`NODE_DESIGN_GUIDE` に従ってください。エントリには `label`、`rank`、`shape`、`color`、`abbr`、`glyph`、`level`、`role` を指定できます。

<!-- id: inferences-and-fields -->
## 推論とフィールドラベル

値を推論または要約したときは、ノードの `_inferred` にそのフィールド名を入れてください。フィールドごとに短い理由を付けます。チャートはその値を推論として記録し、理由を表示します。

```json
{ "id": "tbl-orders", "_inferred": { "description": "summarised from the DDL comment" } }
```

データのキーにアプリが知る名前がないときは、`fields` でラベルを付けてください。エントリには `label`、`slot`、`why` があります。`slot` でキーをカタログのスロットに対応付けます。`why` で理由を伝えます。チャートは各対応付けを AI によるものとして記録します。

<!-- id: notice-vocabulary -->
## 通知の語彙

結果のサマリーには、警告のコードが書かれています。コードが現れたら、下のテキストを読み、次の呼び出しでデータを修正してください。

警告。チャートは描画され、コードが問題を示します。

```text
`no-id`: すべてのノードに一意の `id` を付けてください。また、エッジの `source` または `target` が指すすべてのノードを含めてください。
`duplicate-id`: すべてのノードに一意の `id` を付けてください。また、エッジの `source` または `target` が指すすべてのノードを含めてください。
`dangling-edge`: すべてのノードに一意の `id` を付けてください。また、エッジの `source` または `target` が指すすべてのノードを含めてください。
`unknown-type`: QDIC のノードタイプ名を使うか、使用する各タイプを `label` と `rank` (0〜6) とともに `types` で宣言してください。
`constraint-violation`: `subject` と `object` のノードタイプの間でエッジ制約が許可する述語を使うか、両端が正しいことを確認してください。
`glyph-rejected`: `types[t].glyph` は 24×24 の枠に収まる SVG パスデータで、使用できるのはパス文字 M、L、H、V、C、S、Q、T、A、Z (大文字または小文字)、数字、スペース、カンマ、ドット、マイナス記号、`e` だけです。最大 512 文字です。`types[t].abbr` は最大 2 文字です。
`color-rejected`: `types[t].color` は CSS の色 (例: `#2f6f8f`) で、最大 64 文字です。
`rank-rejected`: `types[t].rank` は 0〜6 の整数です。ランクがサイズと形を決めます。`types[t].shape` は省略可能で、`circle`、`triangle`、`square`、`diamond`、`pentagon`、`hexagon`、`heptagon`、`octagon` のいずれかです。
`layout-rejected`: `view.layout` は `force`、`atomic`、`bubbles`、`tree-h`、`tree-v` のいずれかです。`types[t].role` は `structure`、`attribute`、`curation` のいずれかです。`types[t].level` は 0–n の整数です。トップレベルの `shape` ヒント (`types[t].shape` ではありません) は次の形です。フラットな行のリストには `{ kind: "rows", subject, object, predicate?, type? }`、ネストしたオブジェクトには `{ kind: "tree", children, label, id? }` を使います。各値はデータ内のキーの名前です。
`budget-rejected`: `view.budget` は 10、20、50、`"all"` のいずれかです。
`schema-version-unknown`: `schemaVersion: "1"` を送信するか、`schemaVersion` を省略してください。
`inferred-rejected`: `_inferred` は、フィールド名を短い理由に対応付けるオブジェクトです (例: `{ "description": "summarised from the DDL comment" }`)。
`unknown-key`: 文書化されたキーだけを使ってください。トップレベル: `schemaVersion`、`nodes`、`edges`、`links`、`neighborhood`、`defaults`、`types`、`predicates`、`fields`、`vocabulary`、`view`、`shape`。`view`: `approach`、`root`、`reveal`、`layout`、`budget`。`types[t]`: `label`、`rank`、`shape`、`color`、`abbr`、`glyph`、`level`、`role`。`predicates[p]`: `label`、`category`、`inverse`、`role`。`fields[k]`: `label`、`slot`、`why`。これらのエントリー内または `shape` ヒント内の不明なキーは削除され、このコードで報告されます。`title` キーはありません。タイトルやその他のテキストは返信に書いてください。ノード内の不明なキーは、そのノードの属性として残ります。
`root-not-found`: `view.root` には `nodes` にあるノードの `id` を設定してください。
`reveal-not-found`: `view.reveal` には `nodes` にあるノードの `id` 値だけを入れてください。
`shaped-from`: チャートは `shape` ヒントまたは組み込みのルールでデータを整形しました。結果を制御するには、`nodes` と `edges`、または `shape` ヒントを送信してください。フラットな行のリストには `{ kind: "rows", subject, object, predicate?, type? }`、ネストしたオブジェクトには `{ kind: "tree", children, label, id? }` を使います。各値はデータ内のキーの名前です。
`field-rejected`: 値が拒否され、フォールバックが使われました。問題の `path` がフィールドを示します。ノード (`type`、`label`、`attrs` と QDIC の名前)、エッジ (`predicate`、`isActive`、`valid_from`、`valid_to`、`attrs`)、`types`、`predicates`、`fields`、`vocabulary`、`defaults`、`view.approach` の各値を正しい型で送信してください。テキストは文字列、`attrs`・`attributes`・`defaults` と各エントリーはオブジェクト、`vocabulary` のリストは配列、`isActive` と `isWritable` は `true` または `false`、`view.approach` は `"active"` または `"passive"` です。
```

致命的なコード。何も描画されません。

```text
`not-object`: { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] } を送信してください。
`nodes-not-array`: `nodes` を配列として送信してください: { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }。
`edges-not-array`: `edges` を配列として送信してください (空の配列でもかまいません): { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }。
`no-valid-nodes`: すべてのノードに一意の `id` を付け、その id を各エッジの `source` と `target` に使ってください。
`too-large`: 1 回の呼び出しで送信できるのは、最大 2,000 ノード、4,000 エッジ、256 KB の JSON です。より小さい結果を送信してください。質問に答える部分に絞り込むか、最も関連性の高い部分を先に送信してください。
`not-a-graph`: `nodes` と `edges` を送信してください: { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }。または、元のデータのまま `shape` ヒントを追加してください。フラットな行のリストには `{ kind: "rows", subject, object, predicate?, type? }`、ネストしたオブジェクトには `{ kind: "tree", children, label, id? }` を使います。各値はデータ内のキーの名前です。ツリーは最大 64 階層です。
```

チャートの通知。ユーザーはチャートの中で見ます。

```text
`no-data`: `nodes` に少なくとも 1 つのノードを送信してください。カタログに一致するものがない場合は、返信でそのことを伝え、チャートを添付しないでください。
`edges-only`: エッジの `source` と `target` が参照するすべてのノードを `nodes` に含めてください。
`types-off`: (AI クライアントへの指示はありません)
`empty-fallback`: (AI クライアントへの指示はありません)
`error-fallback`: 結果を再送信してください。結果が大きい場合は、最も関連性の高い部分を先に送信してください (例: 最大 500 ノード)。
```

<!-- id: reply -->
## 返信で伝えること

質問、ストーリー、説明はすべて返信に書いてください。チャートにはテキストを入れないでください。チャートにはテキスト用のキーがありません。

サマリーがアプリのスキップしたレコードを示しているときは、ユーザーに伝えてください。
