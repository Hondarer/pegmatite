# 2.0.0

Pegmatite 2.0.0 renders PlantUML diagrams entirely in the browser.
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

Pegmatite 2.0.0 は、PlantUML の図をすべてブラウザ内で描画します。
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
