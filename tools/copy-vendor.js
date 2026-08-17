"use strict";

/* eslint-env node */

// @plantuml/core の描画エンジンを pegmatite/vendor/ へコピーする。
// あわせて ZIP ルート向けに LICENSE、NOTICE、README.md と
// 本番依存パッケージの LICENSE、および third_party/ の
// Viz.js / Graphviz / Expat の LICENSE を pegmatite/ へ置く。
// vendor 配下とこれらの生成物はリポジトリに含めないため、
// lint・テスト・ZIP 作成の前に実行する。
// third_party の 3 ファイルは Viz.js 3.24.0 が同梱する
// Graphviz 14.1.1 と Expat 2.7.3 に対応する。
// @plantuml/core を上げて Viz.js の版が変わったときは、
// 上流 Dockerfile を確認して差し替える。

var fs = require("fs");
var path = require("path");

var ENGINE_FILES = ["plantuml.js", "viz-global.js"];
var ROOT_FILES = ["LICENSE", "NOTICE", "README.md"];
var THIRD_PARTY_LICENSES = [
	"LICENSE.viz-js",
	"LICENSE.graphviz",
	"LICENSE.expat"
];
var LICENSE_NAMES = ["LICENSE", "LICENCE", "license", "licence"];

var root = path.join(__dirname, "..");
var srcDir = path.join(root, "node_modules", "@plantuml", "core");
var destDir = path.join(root, "pegmatite", "vendor");
var extensionRoot = path.join(root, "pegmatite");
var packageJson = JSON.parse(
	fs.readFileSync(path.join(root, "package.json"), "utf8")
);

function copyFile(src, dest) {
	if (!fs.existsSync(src)) {
		console.error("コピー元がありません: " + src);
		process.exit(1);
	}
	fs.writeFileSync(dest, fs.readFileSync(src));
}

function licenseSlug(packageName) {
	return packageName.replace(/^@/, "").replace(/\//g, "-");
}

function findLicenseFile(packageDir) {
	var i;
	for (i = 0; i < LICENSE_NAMES.length; i++) {
		var candidate = path.join(packageDir, LICENSE_NAMES[i]);
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return null;
}

if (!fs.existsSync(srcDir)) {
	console.error("@plantuml/core が見つかりません。先に npm install を実行してください。");
	process.exit(1);
}

if (!fs.existsSync(destDir)) {
	fs.mkdirSync(destDir);
}

ENGINE_FILES.forEach(function (name) {
	var dest = path.join(destDir, name);
	copyFile(path.join(srcDir, name), dest);
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

ROOT_FILES.forEach(function (name) {
	copyFile(path.join(root, name), path.join(extensionRoot, name));
	console.log("copied " + name);
});

Object.keys(packageJson.dependencies || {}).forEach(function (name) {
	var packageDir = path.join.apply(path, [root, "node_modules"].concat(name.split("/")));
	var licenseSrc = findLicenseFile(packageDir);
	if (!licenseSrc) {
		console.error("LICENSE が見つかりません: " + name);
		process.exit(1);
	}
	var destName = "LICENSE." + licenseSlug(name);
	copyFile(licenseSrc, path.join(extensionRoot, destName));
	console.log("copied " + destName);
});

THIRD_PARTY_LICENSES.forEach(function (name) {
	copyFile(
		path.join(root, "third_party", name),
		path.join(extensionRoot, name)
	);
	console.log("copied " + name);
});
