# Privacy Policy

Last updated: August 7, 2026

Pegmatite-gitbucket renders PlantUML source code found in supported web pages as diagram images.

## Data processed

The extension processes PlantUML source text contained in supported code blocks.
Nothing else is read, stored, or derived.

## Rendering requests

Pegmatite renders diagrams entirely inside the browser.
The bundled PlantUML JavaScript engine is [`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core).
Rendering makes no network requests.
The diagram source is never sent to `plantuml.com`, to any other rendering server, or to the extension developer.

Versions up to and including 1.7.2 sent the compressed diagram source to a PlantUML rendering server.
That behavior, and the *Base URL* setting that configured it, have been removed.

## Collection, retention, and use

The extension developer does not collect, retain, sell, or use PlantUML source or browsing history.
This applies to advertising, analytics, credit decisions, and any purpose unrelated to diagram rendering.
Pegmatite stores no user data; it no longer uses the Chrome storage API.

## Limited use

Data access is limited to providing the extension's single purpose: rendering PlantUML diagrams on supported pages.
No data is transferred to any party.

## Contact

For privacy questions, contact <t-honda@hondarer-soft.com>.

## 日本語

以下は上記英文と同一内容の日本語記述です。

最終更新日: 2026 年 8 月 7 日

Pegmatite-gitbucket は、対応する Web ページ内にある PlantUML のソースコードを図として描画します。

### 扱うデータ

この拡張機能が扱うのは、対応するコードブロックに含まれる PlantUML のソーステキストだけです。
それ以外のものを読み取ったり、保存したり、そこから何かを導き出したりすることはありません。

### 描画時の通信

Pegmatite は、すべてブラウザ内で描画します。
同梱した PlantUML の JavaScript 版エンジンは [`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core) です。
描画にあたって通信は一切発生しません。
図のソースが `plantuml.com` や他の描画サーバ、あるいは拡張機能の開発者へ送られることはありません。

バージョン 1.7.2 までは、圧縮した図のソースを PlantUML の描画サーバへ送信していました。
この動作と、それを設定していた Base URL の項目は削除しました。

### 収集、保持、利用

拡張機能の開発者は、PlantUML のソースや閲覧履歴を収集、保持、販売、利用することはありません。
これは広告、分析、与信判断、および図の描画に関係しないあらゆる目的にあてはまります。
Pegmatite は利用者のデータを一切保存せず、Chrome の storage API も使用しません。

### 用途の限定

データへのアクセスは、対応するページ上で PlantUML の図を描画するという単一の目的の提供に限られます。
いかなる相手にもデータを送信しません。

### 連絡先

プライバシーに関するお問い合わせは <t-honda@hondarer-soft.com> までご連絡ください。
