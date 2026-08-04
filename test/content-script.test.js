"use strict";

/* eslint-env node */

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function loadContentScript() {
	var context = {
		chrome: {
			runtime: {
				sendMessage: function () {}
			},
			storage: {
				local: {
					get: function () {}
				}
			}
		},
		document: {
			querySelector: function () {
				return null;
			},
			querySelectorAll: function () {
				return [];
			}
		},
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};
	context.window = context;
	context.window.location = {
		hostname: "gitlab.com",
		pathname: "/group/project"
	};

	var scriptPath = path.join(__dirname, "..", "pegmatite", "content-script.js");
	vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, {
		filename: scriptPath
	});
	return context;
}

function testGitLabSelectors(context) {
	var selector = context.siteProfiles["gitlab.com"].selector;
	[
		"pre[data-canonical-lang='plantuml'] code",
		"pre[lang='plantuml'] code",
		"pre[data-lang='plantuml'] code",
		"code.language-uml",
		"code.language-puml",
		"code.language-plantuml"
	].forEach(function (expected) {
		assert.notStrictEqual(selector.indexOf(expected), -1, expected);
	});
}

function testGitLabLineExtraction(context) {
	var lines = [
		{ textContent: "@startuml" },
		{ textContent: "    Alice -> Bob" },
		{ textContent: "" },
		{ textContent: "@enduml" }
	];
	var code = {
		tagName: "CODE",
		querySelectorAll: function (selector) {
			assert.strictEqual(selector, "span.line");
			return lines;
		}
	};

	assert.strictEqual(
		context.siteProfiles["gitlab.com"].extract(code),
		"@startuml\n    Alice -> Bob\n\n@enduml"
	);
}

function testGitLabFallbackExtraction(context) {
	var code = {
		tagName: "CODE",
		textContent: "\n@startuml\nAlice -> Bob\n@enduml\n",
		querySelectorAll: function () {
			return [];
		}
	};

	assert.strictEqual(
		context.siteProfiles["gitlab.com"].extract(code),
		"@startuml\nAlice -> Bob\n@enduml"
	);
}

function testDuplicateCandidates(context) {
	var lines = [
		{ textContent: "@startuml" },
		{ textContent: "Alice -> Bob" },
		{ textContent: "@enduml" }
	];
	var code = {
		tagName: "CODE",
		querySelectorAll: function () {
			return lines;
		}
	};
	var pre = {
		tagName: "PRE",
		querySelector: function (selector) {
			assert.strictEqual(selector, "code");
			return code;
		}
	};
	var compressed = [];
	var replaced = [];

	context.document.querySelectorAll = function () {
		return [pre, code];
	};
	context.compress = function (plantuml) {
		compressed.push(plantuml);
		return "encoded";
	};
	context.replaceElement = function (element, url) {
		replaced.push({ element: element, url: url });
	};

	context.onLoadAction(
		context.siteProfiles["gitlab.com"],
		"https://www.plantuml.com/plantuml/img/"
	);

	assert.strictEqual(compressed.length, 1);
	assert.strictEqual(replaced.length, 1);
	assert.strictEqual(replaced[0].element, code);
	assert.strictEqual(
		replaced[0].url,
		"https://www.plantuml.com/plantuml/img/encoded"
	);

	context.onLoadAction(
		context.siteProfiles["gitlab.com"],
		"https://www.plantuml.com/plantuml/img/"
	);
	assert.strictEqual(replaced.length, 1);

	lines[1].textContent = "Alice --> Bob";
	context.onLoadAction(
		context.siteProfiles["gitlab.com"],
		"https://www.plantuml.com/plantuml/img/"
	);
	assert.strictEqual(replaced.length, 2);
}

function testLoadingDefersConversion(context) {
	var loopCalls = 0;
	var actionCalls = 0;

	context.document.querySelector = function () {
		return {};
	};
	context.loop = function () {
		loopCalls++;
	};
	context.onLoadAction = function () {
		actionCalls++;
	};

	context.run({});
	assert.strictEqual(loopCalls, 1);
	assert.strictEqual(actionCalls, 0);

	context.document.querySelector = function () {
		return null;
	};
	context.run({});
	assert.strictEqual(actionCalls, 1);
}

function testGitLabDynamicContentObserver(context) {
	var mutationCallback;
	var observedTarget;
	var observedOptions;
	var actionCalls = 0;

	context.MutationObserver = function (callback) {
		mutationCallback = callback;
		this.observe = function (target, options) {
			observedTarget = target;
			observedOptions = options;
		};
	};
	context.document.body = {};
	context.setTimeout = function (callback) {
		callback();
		return 1;
	};
	context.clearTimeout = function () {};
	context.onLoadAction = function () {
		actionCalls++;
	};

	context.observeGitLab({});
	assert.strictEqual(observedTarget, context.document.body);
	assert.strictEqual(observedOptions.childList, true);
	assert.strictEqual(observedOptions.subtree, true);

	mutationCallback();
	assert.strictEqual(actionCalls, 1);
}

var context = loadContentScript();
testGitLabSelectors(context);
testGitLabLineExtraction(context);
testGitLabFallbackExtraction(context);
testDuplicateCandidates(context);
testLoadingDefersConversion(context);
testGitLabDynamicContentObserver(context);
