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
assert.strictEqual(manifest.version, "1.7.2");
assert.strictEqual(packageJson.version, manifest.version);
assert.notStrictEqual(manifest.permissions.indexOf("storage"), -1);
assert.notStrictEqual(manifest.permissions.indexOf("scripting"), -1);
assert.strictEqual(manifest.permissions.indexOf("tabs"), -1);

[
	manifest.background.service_worker,
	manifest.options_page,
	manifest.icons["128"]
].concat(manifest.content_scripts[0].js).forEach(function (relativePath) {
	assert.strictEqual(
		fs.existsSync(path.join(extensionRoot, relativePath)),
		true,
		relativePath + " must exist"
	);
});
