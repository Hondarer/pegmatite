"use strict";

/* eslint-env node */

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var RENDERER_PATH = path.join(__dirname, "..", "pegmatite", "renderer.js");
var RENDERER_SOURCE = fs.readFileSync(RENDERER_PATH, "utf8");

function extractFunction(source, name) {
	var start = source.indexOf("function " + name + "(");
	assert.notStrictEqual(start, -1, name + " が renderer.js にあること");
	var brace = source.indexOf("{", start);
	assert.notStrictEqual(brace, -1, name + " の本体があること");
	var depth = 0;
	var i;
	for (i = brace; i < source.length; i++) {
		var ch = source.charAt(i);
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return source.slice(start, i + 1);
			}
		}
	}
	assert.fail(name + " の終端が見つからないこと");
}

function loadExpandSvgViewBox() {
	var fnSource = extractFunction(RENDERER_SOURCE, "expandSvgViewBox");
	var sandbox = {};
	vm.runInNewContext(fnSource + "\nthis.expandSvgViewBox = expandSvgViewBox;", sandbox);
	return sandbox.expandSvgViewBox;
}

function makeSvg(options) {
	var attrs = {};
	var box = null;
	if (options.viewBox) {
		box = {
			x: options.viewBox.x,
			y: options.viewBox.y,
			width: options.viewBox.width,
			height: options.viewBox.height
		};
		attrs.viewBox = [
			options.viewBox.x,
			options.viewBox.y,
			options.viewBox.width,
			options.viewBox.height
		].join(" ");
	}
	if (Object.prototype.hasOwnProperty.call(options, "width")) {
		attrs.width = String(options.width);
	}
	if (Object.prototype.hasOwnProperty.call(options, "height")) {
		attrs.height = String(options.height);
	}

	return {
		viewBox: box ? { baseVal: box } : undefined,
		getAttribute: function (name) {
			return Object.prototype.hasOwnProperty.call(attrs, name)
				? attrs[name]
				: null;
		},
		setAttribute: function (name, value) {
			attrs[name] = value;
			if (name === "viewBox" && box) {
				var parts = String(value).trim().split(/\s+/);
				box.x = Number(parts[0]);
				box.y = Number(parts[1]);
				box.width = Number(parts[2]);
				box.height = Number(parts[3]);
			}
		}
	};
}

function snapshot(svg) {
	var box = svg.viewBox && svg.viewBox.baseVal;
	return {
		viewBox: svg.getAttribute("viewBox"),
		width: svg.getAttribute("width"),
		height: svg.getAttribute("height"),
		box: box
			? { x: box.x, y: box.y, width: box.width, height: box.height }
			: null
	};
}

var expandSvgViewBox = loadExpandSvgViewBox();

function testTypicalMindmapBounds() {
	var svg = makeSvg({
		viewBox: { x: 0, y: 0, width: 200, height: 100 },
		width: "200",
		height: "100"
	});
	expandSvgViewBox(svg, 2);
	assert.strictEqual(svg.getAttribute("viewBox"), "-2 -2 204 104");
	assert.strictEqual(svg.getAttribute("width"), "204");
	assert.strictEqual(svg.getAttribute("height"), "104");
}

function testMissingViewBoxIsNoop() {
	var svg = makeSvg({ width: "200", height: "100" });
	var before = snapshot(svg);
	expandSvgViewBox(svg, 2);
	assert.deepStrictEqual(snapshot(svg), before);
}

function testZeroSizeViewBoxIsNoop() {
	var svg = makeSvg({
		viewBox: { x: 0, y: 0, width: 0, height: 100 },
		width: "0",
		height: "100"
	});
	var before = snapshot(svg);
	expandSvgViewBox(svg, 2);
	assert.deepStrictEqual(snapshot(svg), before);
}

function testNonNumericSizeLeavesAttributes() {
	var svg = makeSvg({
		viewBox: { x: 0, y: 0, width: 50, height: 40 },
		width: "auto",
		height: "auto"
	});
	expandSvgViewBox(svg, 2);
	assert.strictEqual(svg.getAttribute("viewBox"), "-2 -2 54 44");
	assert.strictEqual(svg.getAttribute("width"), "auto");
	assert.strictEqual(svg.getAttribute("height"), "auto");
}

function testMissingSizeUpdatesViewBoxOnly() {
	var svg = makeSvg({
		viewBox: { x: 0, y: 0, width: 50, height: 40 }
	});
	expandSvgViewBox(svg, 2);
	assert.strictEqual(svg.getAttribute("viewBox"), "-2 -2 54 44");
	assert.strictEqual(svg.getAttribute("width"), null);
	assert.strictEqual(svg.getAttribute("height"), null);
}

function testNonZeroOrigin() {
	var svg = makeSvg({
		viewBox: { x: 5, y: 10, width: 20, height: 30 },
		width: "20",
		height: "30"
	});
	expandSvgViewBox(svg, 2);
	assert.strictEqual(svg.getAttribute("viewBox"), "3 8 24 34");
	assert.strictEqual(svg.getAttribute("width"), "24");
	assert.strictEqual(svg.getAttribute("height"), "34");
}

function testSnapshotsBeforeMutatingBaseVal() {
	var svg = makeSvg({
		viewBox: { x: 0, y: 0, width: 10, height: 10 },
		width: "10",
		height: "10"
	});
	expandSvgViewBox(svg, 2);
	assert.strictEqual(svg.getAttribute("viewBox"), "-2 -2 14 14");
	assert.strictEqual(svg.viewBox.baseVal.x, -2);
	assert.strictEqual(svg.viewBox.baseVal.y, -2);
	assert.strictEqual(svg.viewBox.baseVal.width, 14);
	assert.strictEqual(svg.viewBox.baseVal.height, 14);
}

function testCalledOnceBeforeOuterHtml() {
	assert.notStrictEqual(
		RENDERER_SOURCE.indexOf("var VIEWBOX_PAD = 2;"),
		-1,
		"pad は 2 であること"
	);

	var observer = RENDERER_SOURCE.match(
		/observer = new MutationObserver\(function \(\) \{[\s\S]*?\n\t\}\);/
	);
	assert.notStrictEqual(observer, null, "MutationObserver の登録があること");
	var body = observer[0];
	var padCall = body.indexOf("expandSvgViewBox(svg, VIEWBOX_PAD)");
	var outer = body.indexOf("svg.outerHTML");
	assert.notStrictEqual(padCall, -1, "observer 内で expandSvgViewBox を呼ぶこと");
	assert.notStrictEqual(outer, -1, "observer 内で outerHTML を読むこと");
	assert.ok(padCall < outer, "outerHTML より前に補正すること");
	assert.strictEqual(
		(body.match(/expandSvgViewBox\(/g) || []).length,
		1,
		"補正は 1 回だけ呼ぶこと"
	);
}

testTypicalMindmapBounds();
testMissingViewBoxIsNoop();
testZeroSizeViewBoxIsNoop();
testNonNumericSizeLeavesAttributes();
testMissingSizeUpdatesViewBoxOnly();
testNonZeroOrigin();
testSnapshotsBeforeMutatingBaseVal();
testCalledOnceBeforeOuterHtml();
