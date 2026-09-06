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
assert.strictEqual(manifest.name, "PlantUML In-Place Preview");
assert.strictEqual(manifest.version, "2.0.5");
assert.strictEqual(packageJson.version, manifest.version);
assert.notStrictEqual(manifest.permissions.indexOf("scripting"), -1);
assert.strictEqual(manifest.permissions.indexOf("tabs"), -1);
// ローカル描画へ移行したため storage は使わない
assert.strictEqual(manifest.permissions.indexOf("storage"), -1);

// background.js は content script と同じ対象へ再インジェクトする。両者がずれると
// executeScript が一部のサイトだけ静かに失敗するため、一致させておく。
assert.deepStrictEqual(
	manifest.host_permissions,
	manifest.content_scripts[0].matches,
	"host_permissions must match the content script patterns"
);

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

function licenseSlug(packageName) {
	return packageName.replace(/^@/, "").replace(/\//g, "-");
}

function findLicenseFile(packageDir) {
	var names = ["LICENSE", "LICENCE", "license", "licence"];
	var i;
	for (i = 0; i < names.length; i++) {
		var candidate = path.join(packageDir, names[i]);
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return null;
}

[
	"LICENSE",
	"NOTICE",
	"README.md"
].forEach(function (name) {
	var dest = path.join(extensionRoot, name);
	assert.strictEqual(fs.existsSync(dest), true, name + " must exist");
	assert.strictEqual(
		fs.readFileSync(dest, "utf8"),
		fs.readFileSync(path.join(root, name), "utf8"),
		name + " must match the repository copy"
	);
	assert.strictEqual(
		webAccessible.resources.indexOf(name),
		-1,
		name + " must not be web accessible"
	);
});

Object.keys(packageJson.dependencies).forEach(function (name) {
	var destName = "LICENSE." + licenseSlug(name);
	var dest = path.join(extensionRoot, destName);
	var packageDir = path.join.apply(path, [root, "node_modules"].concat(name.split("/")));
	var licenseSrc = findLicenseFile(packageDir);
	assert.notStrictEqual(licenseSrc, null, name + " must have a LICENSE in node_modules");
	assert.strictEqual(fs.existsSync(dest), true, destName + " must exist");
	assert.strictEqual(
		fs.readFileSync(dest, "utf8"),
		fs.readFileSync(licenseSrc, "utf8"),
		destName + " must match the dependency LICENSE"
	);
	assert.strictEqual(
		webAccessible.resources.indexOf(destName),
		-1,
		destName + " must not be web accessible"
	);
});

[
	"LICENSE.viz-js",
	"LICENSE.graphviz",
	"LICENSE.expat"
].forEach(function (name) {
	var dest = path.join(extensionRoot, name);
	assert.strictEqual(fs.existsSync(dest), true, name + " must exist");
	assert.strictEqual(
		fs.readFileSync(dest, "utf8"),
		fs.readFileSync(path.join(root, "third_party", name), "utf8"),
		name + " must match third_party"
	);
	assert.strictEqual(
		webAccessible.resources.indexOf(name),
		-1,
		name + " must not be web accessible"
	);
});
