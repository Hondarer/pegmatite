import { render } from "./vendor/plantuml.js";

// 描画専用の拡張ページ。不可視 iframe として content-script.js から読み込まれ、
// postMessage で PlantUML ソースを受け取り SVG 文字列を返す。
//
// plantuml.js の render() は非同期で、かつエンジンが内部状態を共有する。
// 同一コンテキストで並行に呼ぶと結果が上書きされるため、要求は 1 件ずつ直列に処理する。
// 完了の検知は、描画先に svg 要素が現れたことを MutationObserver で捉えて行う。

var RENDER_TIMEOUT_MS = 30000;
var VIEWBOX_PAD = 2;

var target = document.getElementById("plantuml-output");
var queue = [];
var rendering = false;

// @plantuml/core は viewBox を図形の幾何から決め、線幅を含めない。
// 線はパスの中心に描かれるため、x=0 の図は左端が欠ける。余白を足して収める。
function expandSvgViewBox(svg, pad) {
	var box = svg.viewBox && svg.viewBox.baseVal;
	if (!box || box.width <= 0 || box.height <= 0) return;
	var x = box.x;
	var y = box.y;
	var width = box.width;
	var height = box.height;
	svg.setAttribute("viewBox", (x - pad) + " " + (y - pad) + " " + (width + pad * 2) + " " + (height + pad * 2));
	var attrWidth = parseFloat(svg.getAttribute("width"));
	var attrHeight = parseFloat(svg.getAttribute("height"));
	if (attrWidth > 0) svg.setAttribute("width", String(attrWidth + pad * 2));
	if (attrHeight > 0) svg.setAttribute("height", String(attrHeight + pad * 2));
}

function reply(job, message) {
	message.requestId = job.requestId;
	job.win.postMessage(message, job.origin);
}

function processQueue() {
	if (rendering || queue.length === 0) return;
	rendering = true;

	var job = queue.shift();
	var settled = false;
	var observer;
	var timer;

	function finish(message) {
		if (settled) return;
		settled = true;
		observer.disconnect();
		clearTimeout(timer);
		rendering = false;
		reply(job, message);
		processQueue();
	}

	target.innerHTML = "";

	observer = new MutationObserver(function () {
		var svg = target.querySelector("svg");
		if (svg) {
			expandSvgViewBox(svg, VIEWBOX_PAD);
			finish({ type: "PLANTUML_RESULT", svg: svg.outerHTML });
		}
	});
	observer.observe(target, { childList: true, subtree: true });

	timer = setTimeout(function () {
		finish({ type: "PLANTUML_ERROR", error: "描画がタイムアウトしました。" });
	}, RENDER_TIMEOUT_MS);

	try {
		render(job.text.split(/\r\n|\r|\n/), "plantuml-output", {
			dark: job.dark
		});
	} catch (e) {
		finish({ type: "PLANTUML_ERROR", error: String(e && e.message || e) });
	}
}

window.addEventListener("message", function (event) {
	var data = event.data;
	if (!data || data.type !== "PLANTUML_RENDER") return;
	if (typeof data.source !== "string" || typeof data.requestId !== "string") return;

	queue.push({
		requestId: data.requestId,
		text: data.source,
		dark: !!(data.options && data.options.dark),
		win: event.source,
		origin: event.origin
	});
	processQueue();
});

if (window.parent !== window) {
	window.parent.postMessage({ type: "PLANTUML_READY" }, "*");
}
