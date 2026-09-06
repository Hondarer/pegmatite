/* global chrome */

// 描画は拡張内の renderer.html (不可視 iframe) が行う。
// WebAssembly のコンパイルには wasm-unsafe-eval を許す CSP が要るが、これは拡張ページに
// しか適用できないため、content script から描画エンジンを直接呼ぶことはできない。

var RENDERER_PATH = "renderer.html";
var RENDERER_LOAD_TIMEOUT_MS = 30000;

// content script は manifest の宣言と background.js の再インジェクトの両方から入るため、
// 二重に評価されうる。そのたびに var が初期化されると描画エンジンを何枚も読み込んでしまうので、
// 状態は分離ワールドの window に置いて引き継ぐ。走査自体は何度でも行えるようにしておく。
// GitHub は本文を React が後から描画するため、初回の走査だけでは対象を拾えない。
var state = window.pegmatiteState = window.pegmatiteState || {
	"frame": null,
	"origin": null,
	"ready": false,
	"pending": [],
	"inFlight": {},
	"seq": 0,
	"loadTimer": null,
	"processedElements": [],
	"processedPlantUml": [],
	"svgCache": {},
	"observing": false,
	"bitbucketObserving": false,
	"listening": false,
	"codePre": null,
	"styleElem": null,
	"blockSeq": 0,
	"renderedBlocks": [],
	"themeWatching": false,
	"lastDark": null
};

function getRendererOrigin() {
	if (state.origin === null) {
		state.origin = new URL(chrome.runtime.getURL(RENDERER_PATH)).origin;
	}
	return state.origin;
}

function prefersDarkScheme() {
	return !!(window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function elementHasClass(elem, name) {
	return elem != null && elem.classList != null && elem.classList.contains(name);
}

function colorModeOf(elem) {
	if (elem == null || typeof elem.getAttribute !== "function") return "";
	return elem.getAttribute("data-color-mode") || "";
}

// サイトが明示したテーマを先に見る。OS の prefers-color-scheme は、
// GitLab の Light/Dark や GitHub の Appearance とは独立している。
function isDarkMode() {
	var root = document.documentElement;
	var body = document.body;

	if (elementHasClass(root, "gl-light") || elementHasClass(body, "gl-light")) {
		return false;
	}
	if (elementHasClass(root, "gl-dark") || elementHasClass(body, "gl-dark")) {
		return true;
	}
	if (elementHasClass(root, "gl-system") || elementHasClass(body, "gl-system")) {
		return prefersDarkScheme();
	}

	var colorMode = colorModeOf(root) || colorModeOf(body);
	if (colorMode === "light") return false;
	if (colorMode === "dark") return true;

	return prefersDarkScheme();
}

function handleRendererMessage(event) {
	if (event.origin !== getRendererOrigin()) return;
	var data = event.data;
	if (!data) return;

	if (data.type === "PLANTUML_READY") {
		state.ready = true;
		clearTimeout(state.loadTimer);
		flushRequests();
		return;
	}

	var entry = state.inFlight[data.requestId];
	if (!entry) return;
	delete state.inFlight[data.requestId];

	if (data.type === "PLANTUML_RESULT") {
		state.svgCache[entry.cacheKey] = data.svg;
		entry.callback(null, data.svg);
	} else if (data.type === "PLANTUML_ERROR") {
		entry.callback(data.error || "描画に失敗しました。", null);
	}
}

function rendererIsAlive() {
	return state.frame !== null &&
		state.frame.isConnected === true &&
		state.frame.contentWindow !== null;
}

// 描画対象が実際に見つかったときだけ iframe を作る。
// エンジンは 8MB を超えるため、図のないページでは読み込まない。
//
// iframe は document.body ではなく documentElement に付ける。GitHub は body の
// 子要素を整理する際に、身に覚えのない要素として取り除いてしまう。
// それでも取り除かれた場合は作り直し、応答待ちだった要求を送り直す。
function ensureRenderer() {
	if (rendererIsAlive()) return;

	if (!state.listening) {
		state.listening = true;
		window.addEventListener("message", handleRendererMessage);
	}

	clearTimeout(state.loadTimer);
	state.ready = false;
	state.frame = document.createElement("iframe");
	state.frame.src = chrome.runtime.getURL(RENDERER_PATH);
	state.frame.setAttribute("aria-hidden", "true");
	state.frame.style.cssText =
		"position:absolute;left:-9999px;top:0;width:0;height:0;border:0;visibility:hidden;";
	document.documentElement.appendChild(state.frame);

	// 送信済みで未応答の要求は失われるため、新しい iframe へ送り直す。
	state.pending = Object.keys(state.inFlight).map(function (requestId) {
		return state.inFlight[requestId].message;
	});

	// iframe が読み込めないと応答が永久に来ないため、待ち続けずに理由を出す。
	state.loadTimer = setTimeout(function () {
		if (state.ready) return;
		failAllRequests("描画エンジンを読み込めませんでした。");
	}, RENDERER_LOAD_TIMEOUT_MS);
}

function failAllRequests(message) {
	state.pending.length = 0;
	Object.keys(state.inFlight).forEach(function (requestId) {
		var entry = state.inFlight[requestId];
		delete state.inFlight[requestId];
		entry.callback(message, null);
	});
}

function flushRequests() {
	if (!state.ready || !rendererIsAlive()) return;
	while (state.pending.length > 0) {
		state.frame.contentWindow.postMessage(
			state.pending.shift(), getRendererOrigin());
	}
}

// 同じソースでも明暗で結果が変わるため、キャッシュはテーマまで含めて分ける。
function cacheKeyOf(plantuml, dark) {
	return (dark ? "dark:" : "light:") + plantuml;
}

function requestRender(plantuml, dark, callback) {
	// 同じソースを描き直す場合はエンジンを呼ばない。ページ側が要素を差し替えても
	// 描画コストが積み上がらないようにする。
	var cacheKey = cacheKeyOf(plantuml, dark);
	if (Object.prototype.hasOwnProperty.call(state.svgCache, cacheKey)) {
		callback(null, state.svgCache[cacheKey]);
		return;
	}

	state.seq++;
	var requestId = "pegmatite-" + state.seq;
	var message = {
		"type": "PLANTUML_RENDER",
		"requestId": requestId,
		"source": plantuml,
		"options": { "dark": dark }
	};
	state.inFlight[requestId] = {
		"cacheKey": cacheKey,
		"callback": callback,
		"message": message
	};
	state.pending.push(message);

	// ensureRenderer は取り除かれた iframe を作り直す際に pending を組み直すため、
	// 今回の要求を inFlight に入れてから呼ぶ。
	ensureRenderer();
	flushRequests();
}

var SVG_ALLOWED_LINK = /^(https?:|mailto:|#)/i;

// 描画結果はページ側のソースに由来する内容を含むため、無検査に取り込まない。
// 解析に失敗したときは null を返す。
function sanitizeSvg(svgText) {
	var doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return null;

	var root = doc.documentElement;
	if (root === null || root.nodeName.toLowerCase() !== "svg") return null;

	sanitizeNode(root);
	return document.importNode(root, true);
}

function sanitizeNode(node) {
	[].slice.call(node.children).forEach(function (child) {
		var name = child.nodeName.toLowerCase();
		if (name === "script" || name === "foreignobject") {
			node.removeChild(child);
			return;
		}
		sanitizeNode(child);
	});

	[].slice.call(node.attributes).forEach(function (attr) {
		var name = attr.name.toLowerCase();
		if (name.indexOf("on") === 0) {
			node.removeAttributeNode(attr);
			return;
		}
		if (name === "href" || name === "xlink:href") {
			if (!SVG_ALLOWED_LINK.test(attr.value.trim())) {
				node.removeAttributeNode(attr);
			}
		}
	});
}

function getBackgroundColor(element, pseudoElt) {
	if (element !== null) {
		if (pseudoElt === undefined) pseudoElt = null;
		return window
			.getComputedStyle(element, pseudoElt)
			.getPropertyValue("background-color");
	}
	return "";
}

function CodePre(nodeList) {
	this.exist = false;
	this.list = nodeList;
	this.parentColor = "";
	this.selfColor = "";
	if (this.list.length > 0) {
		this.selfColor = getBackgroundColor(this.list.item(0));
		this.parentColor = getBackgroundColor(this.list.item(0).parentElement);
		this.exist = true;
	}
}

// GitHub では content script が走る時点で本文がまだ描画されておらず、読み込み時に数えると
// 常に 0 件になる。対象が見つかった時点で初めて調べる。
function getCodePre() {
	if (state.codePre === null) {
		state.codePre = new CodePre(document.querySelectorAll(".markdown-body pre")); // github style
	}
	return state.codePre;
}

function changeBackgroundColor(element, color, exist) {
	if (exist) {
		element.style.backgroundColor = color;
	}
}

// アイコンの表示と非表示は :hover と :focus-within で切り替えるため、インラインスタイルでは
// 足りない。クラス名はすべて pegmatite- で始めて、ページ側の CSS と衝突しないようにする。
// GitHub の pre / .highlight は overflow: auto のため、負の top だとボタンの上端が欠ける。
// ブロックをコード枠の幅いっぱいにし、ツールバーは枠の内側へ置く。
var STYLE_TEXT = [
	".pegmatite-block { position: relative; display: block; width: 100%; box-sizing: border-box; }",
	".pegmatite-toolbar {",
	"	position: absolute; top: 8px; right: 8px; z-index: 2;",
	"	display: flex; gap: 4px;",
	"	opacity: 0; transition: opacity 0.12s;",
	"}",
	".pegmatite-block:hover .pegmatite-toolbar,",
	".pegmatite-block:focus-within .pegmatite-toolbar,",
	".pegmatite-hover-root:hover .pegmatite-toolbar,",
	".pegmatite-hover-root:focus-within .pegmatite-toolbar { opacity: 1; }",
	".pegmatite-toolbar--github { position: static; top: auto; right: auto; }",
	".pegmatite-block--center { box-sizing: border-box; padding: 8px; }",
	".pegmatite-block--center .pegmatite-diagram > svg {",
	"	display: block; margin-left: auto; margin-right: auto;",
	"}",
	".pegmatite-button {",
	"	box-sizing: border-box; appearance: none; -webkit-appearance: none;",
	"	display: inline-flex; align-items: center; justify-content: center;",
	"	width: 32px; height: 32px; padding: 0; margin: 0; line-height: 0;",
	"	border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 8px;",
	"	background-color: rgba(255, 255, 255, 0.85); color: #24292f;",
	"	cursor: pointer;",
	"}",
	".pegmatite-button:hover { background-color: rgb(255, 255, 255); }",
	"html.gl-dark .pegmatite-button,",
	"body.gl-dark .pegmatite-button,",
	"html[data-color-mode='dark'] .pegmatite-button {",
	"	background-color: rgba(32, 36, 42, 0.85); color: #e6edf3;",
	"}",
	"html.gl-dark .pegmatite-button:hover,",
	"body.gl-dark .pegmatite-button:hover,",
	"html[data-color-mode='dark'] .pegmatite-button:hover {",
	"	background-color: rgb(32, 36, 42);",
	"}",
	"@media (prefers-color-scheme: dark) {",
	"	html.gl-system .pegmatite-button,",
	"	body.gl-system .pegmatite-button,",
	"	html[data-color-mode='auto'] .pegmatite-button,",
	"	html:not(.gl-light):not(.gl-dark):not(.gl-system):not([data-color-mode]) .pegmatite-button {",
	"		background-color: rgba(32, 36, 42, 0.85); color: #e6edf3;",
	"	}",
	"	html.gl-system .pegmatite-button:hover,",
	"	body.gl-system .pegmatite-button:hover,",
	"	html[data-color-mode='auto'] .pegmatite-button:hover,",
	"	html:not(.gl-light):not(.gl-dark):not(.gl-system):not([data-color-mode]) .pegmatite-button:hover {",
	"		background-color: rgb(32, 36, 42);",
	"	}",
	"}"
].join("\n");

// ページ側に取り除かれることがあるため、描画エンジンの iframe と同じく生存を見て作り直す。
function ensureStyle() {
	if (state.styleElem != null && state.styleElem.isConnected === true) return;
	var styleElem = document.createElement("style");
	styleElem.textContent = STYLE_TEXT;
	(document.head || document.documentElement).appendChild(styleElem);
	state.styleElem = styleElem;
}

var SVG_NS = "http://www.w3.org/2000/svg";
var ICON_SOURCE = ["M9.5 7 L5 12 L9.5 17", "M14.5 7 L19 12 L14.5 17"];
var ICON_DIAGRAM = ["M4 4 h6 v5 H4 z", "M14 15 h6 v5 h-6 z", "M7 9 v6 h10"];
var ICON_DOWNLOAD = ["M12 4 v10", "M8 11 l4 4 l4 -4", "M5 19 h14"];
var LABEL_SHOW_SOURCE = "ソースを表示";
var LABEL_SHOW_DIAGRAM = "図を表示";
var LABEL_DOWNLOAD = "SVG をダウンロード";

// アイコンは外部ファイルを持たず、その場で組み立てる。
function makeIcon(pathData) {
	var iconElem = document.createElementNS(SVG_NS, "svg");
	iconElem.setAttribute("viewBox", "0 0 24 24");
	iconElem.setAttribute("width", "16");
	iconElem.setAttribute("height", "16");
	iconElem.setAttribute("fill", "none");
	iconElem.setAttribute("stroke", "currentColor");
	iconElem.setAttribute("stroke-width", "2");
	iconElem.setAttribute("stroke-linecap", "round");
	iconElem.setAttribute("stroke-linejoin", "round");
	iconElem.setAttribute("aria-hidden", "true");
	pathData.forEach(function (d) {
		var pathElem = document.createElementNS(SVG_NS, "path");
		pathElem.setAttribute("d", d);
		pathElem.setAttribute("fill", "none");
		iconElem.appendChild(pathElem);
	});
	return iconElem;
}

function setButtonFace(buttonElem, label, pathData) {
	buttonElem.setAttribute("aria-label", label);
	buttonElem.setAttribute("title", label);
	while (buttonElem.firstChild != null) {
		buttonElem.removeChild(buttonElem.firstChild);
	}
	buttonElem.appendChild(makeIcon(pathData));
}

function makeButton(label, pathData, onActivate) {
	var buttonElem = document.createElement("button");
	buttonElem.type = "button";
	buttonElem.className = "pegmatite-button";
	setButtonFace(buttonElem, label, pathData);
	// ページ側にもクリックの処理があるため、ここで止める。
	buttonElem.addEventListener("click", function (event) {
		event.preventDefault();
		event.stopPropagation();
		onActivate();
	});
	return buttonElem;
}

// 図の名前として使えるものを、確からしい順に探す。@start のパラメータは
// PlantUML では出力ファイル名の指定にあたるため、最後の手掛かりとして使う。
var NAME_PATTERNS = [
	/^[ \t]*caption[ \t]+(.+)$/im,
	/^[ \t]*title[ \t]+(.+)$/im,
	/^[ \t]*@start\w+[ \t]+(.+)$/im
];
var UNSAFE_FILENAME_PATTERN = /[\\/:*?"<>|]/g;
var IMAGE_EXTENSION_PATTERN = /\.(svg|png|txt|eps|pdf|vdx|html|latex)$/i;

// ファイル名は caption、title、@start のパラメータの順に採る。
// どれもない場合と、使えない文字を取り除いて空になった場合はページ内の連番を使う。
function getDiagramFileName(plantuml, index) {
	for (var i = 0; i < NAME_PATTERNS.length; i++) {
		var matched = NAME_PATTERNS[i].exec(plantuml);
		if (matched === null) continue;

		var name = matched[1]
			.replace(UNSAFE_FILENAME_PATTERN, "")
			.replace(/\s+/g, " ")
			.trim()
			// @start のパラメータは拡張子付きで書かれることがある
			.replace(IMAGE_EXTENSION_PATTERN, "")
			// Windows は末尾の点と空白を扱えない
			.replace(/[. ]+$/, "");
		if (name.length > 0) return name.substr(0, 100) + ".svg";
	}
	return "plantuml-" + index + ".svg";
}

// 保存するファイルは、画面の表示がダークテーマでも常にライトテーマで描く。
// 描き直しに失敗した場合だけ、表示中の図をそのまま保存する。
function downloadSvg(plantuml, shownElem, index) {
	requestRender(plantuml, false, function (error, svgText) {
		var svgElem = error === null ? sanitizeSvg(svgText) : null;
		saveSvg(svgElem !== null ? svgElem : shownElem.cloneNode(true),
			getDiagramFileName(plantuml, index));
	});
}

// 保存するのは sanitizeSvg を通したあとの内容で、表示のために付けた寸法の指定は残さない。
// 拡張機能の権限は増やさず、Blob の URL を開くだけで保存する。
function saveSvg(svgElem, fileName) {
	svgElem.style.maxWidth = "";
	svgElem.style.height = "";

	var text = new XMLSerializer().serializeToString(svgElem);
	var url = URL.createObjectURL(new Blob([text], { "type": "image/svg+xml" }));
	var linkElem = document.createElement("a");
	linkElem.href = url;
	linkElem.download = fileName;
	linkElem.style.display = "none";
	document.documentElement.appendChild(linkElem);
	linkElem.click();
	document.documentElement.removeChild(linkElem);

	// 保存が始まる前に取り消すと失敗するため、少し置いてから解放する。
	setTimeout(function () {
		URL.revokeObjectURL(url);
	}, 1000);
}

// GitHub の blob プレビューは pre とコピーボタンが兄弟で、コピーは
// .highlight / .snippet-clipboard-content 上の .zeroclipboard-container にある。
// ツールバーをその容器へ移すと、オフセットの見積りをせずに並ぶ。
function findClipboardHost(startElem) {
	var node = startElem;
	var depth;
	for (depth = 0; depth < 6 && node != null && node.parentNode != null; depth++) {
		var parent = node.parentNode;
		if (typeof parent.querySelector === "function") {
			var host = parent.querySelector(".zeroclipboard-container");
			if (host != null) return host;
		}
		node = parent;
	}
	return null;
}

function attachToolbarToClipboard(toolbarElem, clipboardHost) {
	toolbarElem.className = "pegmatite-toolbar pegmatite-toolbar--github";
	var hoverRoot = clipboardHost.parentNode;
	if (hoverRoot != null && hoverRoot.classList != null) {
		hoverRoot.classList.add("pegmatite-hover-root");
	}
	if (toolbarElem.parentNode != null) {
		toolbarElem.parentNode.removeChild(toolbarElem);
	}
	if (clipboardHost.firstChild != null) {
		clipboardHost.insertBefore(toolbarElem, clipboardHost.firstChild);
	} else {
		clipboardHost.appendChild(toolbarElem);
	}
	// GitHub の容器は top/bottom で縦いっぱいに伸びることがある。
	// 中寄せせず、コピーと同じ右上へ固定する。
	clipboardHost.style.display = "flex";
	clipboardHost.style.flexDirection = "row";
	clipboardHost.style.alignItems = "center";
	clipboardHost.style.position = "absolute";
	clipboardHost.style.top = "0";
	clipboardHost.style.right = "0";
	clipboardHost.style.bottom = "auto";
	clipboardHost.style.height = "auto";
}

// 図とソースを入れ替えても操作のアイコンが残るよう、両者を包む要素を 1 つ挟む。
function replaceElement(umlElem, svgElem, plantuml, disableChangeBackgroundColor = false, toolbarStyle = {}, renderedDark, placeOptions) {
	var parent = umlElem.parentNode;
	if (parent === null) return; // for asciidoc (div div pre)

	if (renderedDark === undefined) renderedDark = isDarkMode();
	placeOptions = placeOptions || {};

	ensureStyle();
	var codePre = getCodePre();
	svgElem.style.maxWidth = "100%";
	svgElem.style.height = "auto";

	// GitHub は pre > code を inline にしている。置き換えたブロックが図の幅に縮むと、
	// ツールバーが図の右上に重なり、overflow: auto で見切れる。
	if (parent.tagName === "PRE") {
		parent.style.width = "100%";
		parent.style.maxWidth = "100%";
		parent.style.boxSizing = "border-box";
	}

	var diagramElem = document.createElement("div");
	diagramElem.className = "pegmatite-diagram";
	diagramElem.style.overflowX = "auto";
	diagramElem.appendChild(svgElem);

	var blockElem = document.createElement("div");
	blockElem.className = placeOptions.centerDiagram
		? "pegmatite-block pegmatite-block--center"
		: "pegmatite-block";

	var toolbarElem = document.createElement("div");
	toolbarElem.className = "pegmatite-toolbar";
	if (!placeOptions.attachToolbarToClipboard) {
		Object.keys(toolbarStyle).forEach(function (key) {
			toolbarElem.style[key] = toolbarStyle[key];
		});
	}
	blockElem.appendChild(toolbarElem);

	state.blockSeq++;
	var index = state.blockSeq;
	var showingDiagram = true;
	var item = {
		"blockElem": blockElem,
		"diagramElem": diagramElem,
		"plantuml": plantuml,
		"dark": renderedDark,
		"svgElem": svgElem
	};

	var toggleButton = makeButton(LABEL_SHOW_SOURCE, ICON_SOURCE, function () {
		showingDiagram = !showingDiagram;
		if (showingDiagram) {
			blockElem.replaceChild(diagramElem, umlElem);
			setButtonFace(toggleButton, LABEL_SHOW_SOURCE, ICON_SOURCE);
		} else {
			blockElem.replaceChild(umlElem, diagramElem);
			setButtonFace(toggleButton, LABEL_SHOW_DIAGRAM, ICON_DIAGRAM);
		}
		if (!disableChangeBackgroundColor) {
			changeBackgroundColor(parent,
				showingDiagram ? codePre.parentColor : codePre.selfColor,
				codePre.exist);
		}
	});
	toolbarElem.appendChild(toggleButton);

	// 表示している内容に関わらず、図を SVG として保存できるようにする。
	toolbarElem.appendChild(makeButton(LABEL_DOWNLOAD, ICON_DOWNLOAD, function () {
		downloadSvg(plantuml, item.svgElem, index);
	}));

	parent.replaceChild(blockElem, umlElem);
	blockElem.appendChild(diagramElem);
	if (placeOptions.attachToolbarToClipboard) {
		var clipboardHost = findClipboardHost(blockElem);
		if (clipboardHost != null) {
			attachToolbarToClipboard(toolbarElem, clipboardHost);
		} else {
			Object.keys(toolbarStyle).forEach(function (key) {
				toolbarElem.style[key] = toolbarStyle[key];
			});
		}
	}
	if (!disableChangeBackgroundColor) {
		changeBackgroundColor(parent, codePre.parentColor, codePre.exist);
	}

	state.renderedBlocks.push(item);
	if (isDarkMode() !== renderedDark) applyPageTheme();
}

// 描画済みの図はコードブロックが DOM から外れるため、走査だけではテーマ変更を拾えない。
function applyPageTheme() {
	var dark = isDarkMode();
	state.lastDark = dark;
	state.renderedBlocks = state.renderedBlocks.filter(function (item) {
		return item.blockElem.isConnected === true;
	});
	state.renderedBlocks.forEach(function (item) {
		if (item.dark === dark) return;
		item.dark = dark;
		var expectedDark = dark;
		requestRender(item.plantuml, dark, function (error, svgText) {
			if (item.dark !== expectedDark) return;
			if (error !== null) return;
			var nextSvg = sanitizeSvg(svgText);
			if (nextSvg === null) return;
			nextSvg.style.maxWidth = "100%";
			nextSvg.style.height = "auto";
			while (item.diagramElem.firstChild != null) {
				item.diagramElem.removeChild(item.diagramElem.firstChild);
			}
			item.diagramElem.appendChild(nextSvg);
			item.svgElem = nextSvg;
		});
	});
}

function watchTheme() {
	if (state.themeWatching) return;
	state.themeWatching = true;
	state.lastDark = isDarkMode();

	var timer;
	function onMaybeChanged() {
		clearTimeout(timer);
		timer = setTimeout(function () {
			if (state.lastDark === isDarkMode()) return;
			applyPageTheme();
		}, 100);
	}

	var observer = new MutationObserver(onMaybeChanged);
	observer.observe(document.documentElement, {
		"attributes": true,
		"attributeFilter": ["class", "data-color-mode"]
	});
	if (document.body != null) {
		observer.observe(document.body, {
			"attributes": true,
			"attributeFilter": ["class", "data-color-mode"]
		});
	}

	if (!window.matchMedia) return;
	var media = window.matchMedia("(prefers-color-scheme: dark)");
	if (typeof media.addEventListener === "function") {
		media.addEventListener("change", onMaybeChanged);
	} else if (typeof media.addListener === "function") {
		media.addListener(onMaybeChanged);
	}
}

// 描画に失敗したときはコードブロックを残し、その直後に理由を添える。
// 再描画は行わない。要素が DOM に残る以上、再試行すると MutationObserver との間で
// 際限なく往復するため。
function showError(umlElem, message) {
	var parent = umlElem.parentNode;
	if (parent === null) return;

	var next = umlElem.nextSibling;
	if (next !== null && next.nodeType === 1 &&
		next.className === "pegmatite-error") {
		next.textContent = "PlantUML: " + message;
		return;
	}

	var errorElem = document.createElement("div");
	errorElem.className = "pegmatite-error";
	errorElem.style.cssText =
		"color:#b00020;font-family:monospace;white-space:pre-wrap;";
	errorElem.textContent = "PlantUML: " + message;
	parent.insertBefore(errorElem, next);
}

var siteProfiles = {
	"default": {
		"selector": "pre[lang='uml'], pre[lang='puml'], pre[lang='plantuml']",
		"extract": function (elem) {
			return elem.querySelector("code").textContent.trim();
		},
		"replace": function (elem) {
			return elem;
		}
	},
	"gitpitch.com": {
		"selector": "pre code.lang-uml",
		"extract": function (elem) {
			return elem.innerText.trim();
		},
		"replace": function (elem) {
			return elem;
		}
	},
	"gitlab.com": {
		// DOM structure: <pre data-canonical-lang="plantuml"><code><span class="line">...</span></code></pre>
		// Select the code element (not individual span.line) to avoid duplicate extraction per line.
		// GitLab 12-15 (self-hosted): may use pre[lang=...] or pre[data-lang=...] instead
		// asciidoc: div div pre
		"selector": [
			"pre[data-canonical-lang='uml'] code",
			"pre[data-canonical-lang='puml'] code",
			"pre[data-canonical-lang='plantuml'] code",
			"pre[lang='uml'] code",
			"pre[lang='puml'] code",
			"pre[lang='plantuml'] code",
			"pre[data-lang='uml'] code",
			"pre[data-lang='puml'] code",
			"pre[data-lang='plantuml'] code",
			"code.language-uml",
			"code.language-puml",
			"code.language-plantuml",
			"div div pre"
		].join(", "),
		"normalize": function (elem) {
			if (elem.tagName == "CODE") return elem;
			var child = elem.querySelector("code");
			if (child != null) return child;
			return elem;
		},
		"extract": function (elem) {
			var plantuml = "";
			if (elem.tagName == "CODE") {
				var lines = elem.querySelectorAll("span.line");
				if (lines.length > 0) { // GitLab 16+: span.line children
					lines.forEach(function(span){
						plantuml = plantuml + span.textContent + "\n";
					});
					plantuml = plantuml.trim();
				} else {
					plantuml = elem.textContent.trim();
				}
			} else { // asciidoc: pre element
				plantuml = elem.textContent.trim();
			}
			return plantuml;
		},
		"replace": function (elem) {
			return elem;
		},
		// GitLab のクリップボードコピーボタンと重ならないよう左へオフセット。
		"toolbarStyle": { "right": "31px" }
	},
	"bitbucket.org": {
		"selector": "div.codehilite.language-plantuml > pre",
		"extract": function (elem) {
			return elem.innerText.trim();
		},
		replace: function(elem) {
			return elem;
		}
	},
	"backlog.jp": {
		"selector": "pre.lang-uml, pre.lang-puml, pre.lang-plantuml",
		"extract": function (elem) {
			return elem.innerText.trim();
		},
		"replace": function (elem) {
			return elem;
		}
	},
	"github.com": { // markdown + asciidoc
		"selector": "pre[lang='uml'], pre[lang='puml'], pre[lang='plantuml'], div div pre", // markdown, asciidoc
		"extract": function (elem) {
			var child = elem.querySelector("code");
			if (child != null) return child.textContent.trim(); // markdown
			return elem.textContent.trim(); // asciidoc
		},
		"replace": function (elem) {
			var child = elem.querySelector("code");
			if (child != null) return child; // markdown
			return elem; // asciidoc
		},
		// blob プレビューは .highlight > pre + .zeroclipboard-container。
		// ツールバーをコピーと同じ容器へ移し、図は左右中央へ置く。
		"attachToolbarToClipboard": true,
		"centerDiagram": true
	},
	"gitbucket": {
		"selector": "pre.prettyprint.lang-puml, pre.prettyprint.lang-plantuml",
		"extract": function (elem) {
			return elem.innerText.trim();
		},
		"replace": function (elem) {
			return elem;
		},
		"autoCompleteStartEnd": true,
		"disableChangeBackgroundColor": true
	}
};


function loop(counter, retry, siteProfile){
	counter++;
	if (document.querySelector("i[aria-label='Loading content…']")==null) counter+=retry;
	var id = setTimeout(loop,100,counter,retry, siteProfile);
	if(counter>=retry){
		clearTimeout(id);
		onLoadAction(siteProfile);
	}
}

function onLoadAction(siteProfile){
	[].forEach.call(document.querySelectorAll(siteProfile.selector), function (umlElem) {
		if (siteProfile.normalize != null) {
			umlElem = siteProfile.normalize(umlElem);
		}

		var plantuml = siteProfile.extract(umlElem);
		if (plantuml.substr(0, "@start".length) !== "@start") {
			if ((siteProfile.autoCompleteStartEnd || false) == true) {
				plantuml = "@startuml\n" + plantuml + "\n@enduml";
			} else {
				return;
			}
		}
		var processedIndex = state.processedElements.indexOf(umlElem);
		if (processedIndex >= 0 && state.processedPlantUml[processedIndex] == plantuml) return;
		if (processedIndex >= 0) {
			state.processedPlantUml[processedIndex] = plantuml;
		} else {
			state.processedElements.push(umlElem);
			state.processedPlantUml.push(plantuml);
		}
		var replaceElem = siteProfile.replace(umlElem);
		var disableChangeBackgroundColor = siteProfile.disableChangeBackgroundColor || false;
		var toolbarStyle = siteProfile.toolbarStyle || {};
		var placeOptions = {
			"attachToolbarToClipboard": !!siteProfile.attachToolbarToClipboard,
			"centerDiagram": !!siteProfile.centerDiagram
		};
		var dark = isDarkMode();
		requestRender(plantuml, dark, function (error, svgText) {
			if (error !== null) {
				showError(replaceElem, error);
				return;
			}
			var svgElem = sanitizeSvg(svgText);
			if (svgElem === null) {
				showError(replaceElem, "描画結果を解析できませんでした。");
				return;
			}
			replaceElement(replaceElem, svgElem, plantuml, disableChangeBackgroundColor, toolbarStyle, dark, placeOptions);
		});
	});
}

// GitLab も GitHub も本文を後から差し込むため、読み込み時の走査だけでは足りない。
// 重複防止は onLoadAction 側で行うので、発火しすぎても描画は増えない。
function observeDocument(siteProfile) {
	if (state.observing) return;
	state.observing = true;

	var timer;
	var observer = new MutationObserver(function() {
		clearTimeout(timer);
		timer = setTimeout(function() {
			onLoadAction(siteProfile);
		}, 100);
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
}

function getSiteProfileKey() {
	if (window.location.pathname.substr(0, "/gitbucket".length) == "/gitbucket") {
		return "gitbucket";
	}
	if (window.location.pathname.substr(0, "/gitlab".length) == "/gitlab") {
		return "gitlab.com";
	}
	return window.location.hostname.split(".").slice(-2).join(".");
}

function run() {
	var siteProfile = siteProfiles[getSiteProfileKey()] || siteProfiles["default"];
	if (document.querySelector("i[aria-label='Loading content…']")!=null){ // for wait loading @ gitlab.com
		loop(1, 10, siteProfile);
		return; // wait for loop to finish before processing
	}
	onLoadAction(siteProfile);
}

function bootstrap() {
	watchTheme();

	var profileKey = getSiteProfileKey();
	var siteProfile = siteProfiles[profileKey] || siteProfiles["default"];

	if (window.location.hostname === "bitbucket.org") {
		if (!state.bitbucketObserving) {
			state.bitbucketObserving = true;
			var bitbucketObserver = new MutationObserver(function() {
				if (document.getElementsByClassName("language-plantuml").length > 0) {
					run();
					bitbucketObserver.disconnect();
				}
			});

			bitbucketObserver.observe(document.body, {
				attributes: true,
				characterData: true,
				childList: true,
				subtree: true
			});
		}
	} else if (profileKey === "gitlab.com" || profileKey === "github.com") {
		observeDocument(siteProfile);
	}

	run();
}

bootstrap();
