"use strict";

/* eslint-env node */

// @plantuml/core の描画エンジンを pegmatite/vendor/ へコピーする。
// vendor 配下はリポジトリに含めないため、lint・テスト・ZIP 作成の前に実行する。

var fs = require("fs");
var path = require("path");

var FILES = ["plantuml.js", "viz-global.js"];

var root = path.join(__dirname, "..");
var srcDir = path.join(root, "node_modules", "@plantuml", "core");
var destDir = path.join(root, "pegmatite", "vendor");

if (!fs.existsSync(srcDir)) {
	console.error("@plantuml/core が見つかりません。先に npm install を実行してください。");
	process.exit(1);
}

if (!fs.existsSync(destDir)) {
	fs.mkdirSync(destDir);
}

FILES.forEach(function (name) {
	var src = path.join(srcDir, name);
	var dest = path.join(destDir, name);
	if (!fs.existsSync(src)) {
		console.error("コピー元がありません: " + src);
		process.exit(1);
	}
	fs.writeFileSync(dest, fs.readFileSync(src));
	var kb = Math.round(fs.statSync(dest).size / 1024);
	console.log("copied " + name + " (" + kb + " KB)");
});

var version = JSON.parse(
	fs.readFileSync(path.join(srcDir, "package.json"), "utf8")
).version;
fs.writeFileSync(
	path.join(destDir, "VERSION"),
	"@plantuml/core " + version + "\n"
);
console.log("@plantuml/core " + version);
