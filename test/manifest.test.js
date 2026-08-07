"use strict";

/* eslint-env node */

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var extensionRoot = path.join(root, "pegmatite");
var manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
var packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.version, "2.0.0");
assert.strictEqual(packageJson.version, manifest.version);
assert.notStrictEqual(manifest.permissions.indexOf("scripting"), -1);
assert.strictEqual(manifest.permissions.indexOf("tabs"), -1);
// ローカル描画へ移行したため storage は使わない
assert.strictEqual(manifest.permissions.indexOf("storage"), -1);

// サーバ描画の名残が残っていないこと
assert.strictEqual(manifest.content_scripts[0].js.indexOf("rawdeflate.js"), -1);
assert.strictEqual(manifest.options_page, undefined);

// WebAssembly (Graphviz) のコンパイルを拡張ページに限って許可する
assert.strictEqual(
	manifest.content_security_policy.extension_pages,
	"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
);

var webAccessible = manifest.web_accessible_resources[0];
[
	"renderer.html",
	"renderer.js",
	"vendor/plantuml.js",
	"vendor/viz-global.js"
].forEach(function (resource) {
	assert.notStrictEqual(
		webAccessible.resources.indexOf(resource),
		-1,
		resource + " must be web accessible"
	);
});

[
	manifest.background.service_worker,
	manifest.icons["128"]
].concat(manifest.content_scripts[0].js)
	.concat(webAccessible.resources)
	.forEach(function (relativePath) {
		assert.strictEqual(
			fs.existsSync(path.join(extensionRoot, relativePath)),
			true,
			relativePath + " must exist"
		);
	});
