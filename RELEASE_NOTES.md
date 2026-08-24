# 2.0.3

PlantUML In-Place Preview 2.0.3 improves the placement and visibility of the
diagram toolbar without changing rendering behavior.

## Changes

* Move the toolbar above the diagram and enlarge its buttons for easier use.
* Move the GitLab toolbar to the left so it does not overlap GitLab's copy button.
* Keep the generated SVG icons as outline icons by explicitly disabling path fills.

## Upgrading

Update from the Chrome Web Store (or reload the unpacked extension).
No configuration change is required.

**Full Changelog**: [2.0.2...2.0.3](https://github.com/Hondarer/pegmatite/compare/2.0.2...2.0.3)

## 日本語

以下は上記英文と同一内容の日本語記述です。

PlantUML In-Place Preview 2.0.3 は、描画動作を変更せずに、図の操作ツールバーの
配置と見やすさを改善するリリースです。

### 変更点

ツールバーを図の上側へ移動し、操作しやすいようボタンを大きくしました。

GitLab のコピーボタンと重ならないよう、GitLab のツールバーを左へ移動しました。

生成する SVG アイコンは、パスの塗りつぶしを明示的に無効化してアウトライン表示を
維持します。

### 移行にあたって

Chrome ウェブストアから更新する (またはパッケージ化していない拡張機能を再読み込みする) だけで十分です。
設定の変更は不要です。

# 2.0.2

PlantUML In-Place Preview 2.0.2 ships license texts and the README in the
release ZIP root. There is no change to rendering behavior.

## Changes

* Copy this product's LICENSE, NOTICE, and README.md into the ZIP root when
  `npm run vendor` runs.
* Copy each production dependency's LICENSE into the ZIP root as
  `LICENSE.<package>`. The current file is `LICENSE.plantuml-core` from
  `@plantuml/core`.
* Copy the license texts for Viz.js 3.24.0, Graphviz 14.1.1, and Expat
  2.7.3 into the ZIP root as `LICENSE.viz-js`, `LICENSE.graphviz`, and
  `LICENSE.expat`. NOTICE records the tagged upstream license URLs.

## Upgrading

Update from the Chrome Web Store (or reload the unpacked extension).
No configuration change is required.

**Full Changelog**: [2.0.1...2.0.2](https://github.com/Hondarer/pegmatite/compare/2.0.1...2.0.2)

## 日本語

以下は上記英文と同一内容の日本語記述です。

PlantUML In-Place Preview 2.0.2 は、リリース ZIP のルートへライセンス全文と
README を収録するリリースです。
描画の動作には変更ありません。

### 変更点

`npm run vendor` の実行時に、本製品の LICENSE、NOTICE、README.md を ZIP
ルートへコピーするようにしました。

本番依存パッケージの LICENSE も、ZIP ルートへ `LICENSE.<package>` として
コピーします。現在のファイルは `@plantuml/core` 由来の
`LICENSE.plantuml-core` です。

Viz.js 3.24.0、Graphviz 14.1.1、Expat 2.7.3 のライセンス全文も、
`LICENSE.viz-js`、`LICENSE.graphviz`、`LICENSE.expat` として ZIP
ルートへコピーします。NOTICE には上流のタグ付き LICENSE URL を
記録しています。

### 移行にあたって

Chrome ウェブストアから更新する (またはパッケージ化していない拡張機能を再読み込みする) だけで十分です。
設定の変更は不要です。

# 2.0.1

PlantUML In-Place Preview 2.0.1 renames the extension display name.
There is no change to rendering behavior.

## Changes

* Change the Chrome Web Store and `manifest.json` display name from Pegmatite-gitbucket to **PlantUML In-Place Preview**.
* Keep the extension ID (`gkdjfofhecooaojkhbohidojebbpcene`). Existing installs receive the new name on update.
* Keep the repository name and the on-disk package directory as `pegmatite`, for continuity with the upstream Pegmatite fork.
* Align documentation, privacy policy, and NOTICE with the new product name.

## Upgrading

Update from the Chrome Web Store (or reload the unpacked extension).
No configuration change is required.

**Full Changelog**: [2.0.0...2.0.1](https://github.com/Hondarer/pegmatite/compare/2.0.0...2.0.1)

## 日本語

以下は上記英文と同一内容の日本語記述です。

PlantUML In-Place Preview 2.0.1 は、拡張機能の表示名を変更するリリースです。
描画の動作には変更ありません。

### 変更点

Chrome ウェブストアおよび `manifest.json` の表示名を、Pegmatite-gitbucket から **PlantUML In-Place Preview** に変更しました。

拡張機能 ID (`gkdjfofhecooaojkhbohidojebbpcene`) は変わりません。
既存のインストールは、更新時に新しい表示名になります。

リポジトリ名と配布物のディレクトリ名は、フォーク元 Pegmatite との一貫性のため `pegmatite` のままです。

ドキュメント、プライバシーポリシー、NOTICE の表記を新しい製品名に揃えました。

### 移行にあたって

Chrome ウェブストアから更新する (またはパッケージ化していない拡張機能を再読み込みする) だけで十分です。
設定の変更は不要です。

# 2.0.0

Version 2.0.0 was published under the Store display name Pegmatite-gitbucket.
It renders PlantUML diagrams entirely in the browser.
No PlantUML server is contacted, so diagram source never leaves the machine.

This is a major version because the rendering server, and the *Base URL* setting that configured it, have been removed.

## Changes

* Render diagrams with the bundled PlantUML JavaScript engine (`@plantuml/core`, MIT).
  This is the official PlantUML compiled to JavaScript with TeaVM, with Graphviz layout from the bundled Viz.js.
* Remove the PlantUML server integration.
  This covers the *Base URL* option, the options page, and the deflate and encode routines.
  It also covers the service worker image fetch used to avoid mixed-content errors on HTTP sites.
* Drop the `storage` permission. The extension no longer stores user data.
* Load the rendering engine only on pages that actually contain a diagram.
* Sanitize rendered SVG before inserting it into the page.
* Report rendering failures next to the code block instead of leaving it unchanged.
* Show two icons at the top right of a diagram on hover, for switching to the source and for
  downloading the diagram as an SVG file. Double-clicking no longer switches the view.
  The downloaded file is always rendered in the light theme.
  It is named after `caption`, then `title`, then the `@start` parameter, then a sequence number.

## Upgrading

Any *Base URL* previously configured is ignored and can be discarded.
Self-hosted PlantUML servers are no longer used, and no longer need to be reachable from the browser.

Diagrams that relied on server-side behavior need attention:

* `!include` of remote files is not available.
* Clickable links written as `[[url]]` are not emitted by the JavaScript engine.
* Sudoku diagrams are absent, because `@plantuml/core` is built from the MIT-licensed flavor.

## Packaging

The rendering engine is fetched from npm rather than committed.
Run `npm install` and `npm run vendor` before loading the extension unpacked or creating the release ZIP.
The packaged extension is about 8.2 MB unpacked and 1.9 MB zipped.

**Full Changelog**: [1.7.2...2.0.0](https://github.com/Hondarer/pegmatite/compare/1.7.2...2.0.0)

## 日本語

以下は上記英文と同一内容の日本語記述です。

バージョン 2.0.0 は、ストア表示名 Pegmatite-gitbucket として公開されました。
PlantUML の図をすべてブラウザ内で描画します。
PlantUML サーバへは接続しないため、図のソースが手元の環境から出ることはありません。

描画サーバの利用と、それを設定していた Base URL の項目を削除したため、メジャーバージョンを上げました。

### 変更点

同梱した PlantUML の JavaScript 版エンジン (`@plantuml/core`、MIT) で図を描画するようにしました。
これは PlantUML 本家を TeaVM で JavaScript にコンパイルしたものです。
クラス図などが必要とする Graphviz のレイアウトは、同梱の Viz.js (WebAssembly 版) が担います。

PlantUML サーバとの連携を削除しました。
対象は Base URL の設定項目、設定ページ、deflate とエンコードの処理、および HTTP のサイトで混在コンテンツを避けるために service worker が画像を取得していた処理です。

`storage` 権限を外しました。利用者のデータを保存しなくなったためです。

描画エンジンは、実際に図を含むページでのみ読み込みます。

描画された SVG は、ページへ挿入する前にサニタイズします。

描画に失敗した場合は、コードブロックをそのまま残すのではなく、その直後に理由を表示します。

図の右上に、ホバーしたときだけアイコンを 2 つ表示するようにしました。
1 つ目はソースへの切り替え、2 つ目は図の SVG ファイルとしてのダウンロードです。
ダウンロードするファイルは常にライトテーマで描画します。
ファイル名は `caption`、`title`、`@start` のパラメータ、連番の順に採ります。
ダブルクリックによる切り替えは廃止しました。

### 移行にあたって

これまでに設定していた Base URL は無視されるため、破棄して構いません。
自ホストの PlantUML サーバは使わなくなり、ブラウザから到達できる必要もなくなりました。

サーバ側の動作に依存していた図には注意が必要です。
リモートファイルの `!include` は使えません。
`[[url]]` と書くクリック可能なリンクは、JavaScript 版エンジンでは出力されません。
`@plantuml/core` が MIT ライセンス版のビルドであるため、Sudoku 図はありません。

### パッケージ

描画エンジンはリポジトリにコミットせず npm から取得します。
拡張機能をパッケージ化せずに読み込む前、またはリリース用の ZIP を作成する前に、`npm install` と `npm run vendor` を実行してください。
パッケージは展開後で約 8.2MB、ZIP で約 1.9MB です。
