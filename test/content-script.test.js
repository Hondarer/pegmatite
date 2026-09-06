"use strict";

/* eslint-env node */

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SCRIPT_PATH = path.join(__dirname, "..", "pegmatite", "content-script.js");
var SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function NoopMutationObserver() {
	this.observe = function () {};
	this.disconnect = function () {};
}

// replaceElement は要素の付け替えを行うため、最小限のスタブでは通せない。
// 必要な範囲だけの DOM の代用を用意する。
function makeElement(tagName) {
	var elem = {
		tagName: tagName,
		style: {},
		attributes: {},
		childNodes: [],
		listeners: {},
		parentNode: null,
		clicked: 0,
		className: "",
		// 生存判定 (rendererIsAlive、ensureStyle) が真になる状態を模す
		isConnected: true,
		contentWindow: { postMessage: function () {} },
		classList: {
			contains: function (name) {
				return elem.className.split(/\s+/).indexOf(name) !== -1;
			},
			add: function (name) {
				if (elem.className.split(/\s+/).indexOf(name) === -1) {
					elem.className = (elem.className + " " + name).trim();
				}
			}
		},
		get firstChild() {
			return elem.childNodes.length > 0 ? elem.childNodes[0] : null;
		},
		querySelector: function (selector) {
			function match(node, sel) {
				if (!node || !node.tagName) return false;
				if (sel.charAt(0) === ".") {
					return (node.className || "").split(/\s+/).indexOf(sel.slice(1)) !== -1;
				}
				return node.tagName.toLowerCase() === sel.toLowerCase();
			}
			function walk(node, sel) {
				var i;
				for (i = 0; i < (node.childNodes || []).length; i++) {
					var child = node.childNodes[i];
					if (match(child, sel)) return child;
					var found = walk(child, sel);
					if (found) return found;
				}
				return null;
			}
			return walk(elem, selector);
		},
		setAttribute: function (name, value) {
			elem.attributes[name] = value;
		},
		getAttribute: function (name) {
			return Object.prototype.hasOwnProperty.call(elem.attributes, name)
				? elem.attributes[name]
				: null;
		},
		appendChild: function (child) {
			elem.childNodes.push(child);
			child.parentNode = elem;
			return child;
		},
		removeChild: function (child) {
			elem.childNodes.splice(elem.childNodes.indexOf(child), 1);
			child.parentNode = null;
			return child;
		},
		replaceChild: function (next, prev) {
			elem.childNodes.splice(elem.childNodes.indexOf(prev), 1, next);
			prev.parentNode = null;
			next.parentNode = elem;
			return prev;
		},
		insertBefore: function (next, ref) {
			if (next.parentNode && next.parentNode.removeChild) {
				next.parentNode.removeChild(next);
			}
			var index = elem.childNodes.indexOf(ref);
			if (index < 0) elem.childNodes.push(next);
			else elem.childNodes.splice(index, 0, next);
			next.parentNode = elem;
			return next;
		},
		addEventListener: function (type, handler) {
			if (elem.listeners[type] === undefined) elem.listeners[type] = [];
			elem.listeners[type].push(handler);
		},
		// 利用者の操作を模す
		dispatch: function (type) {
			(elem.listeners[type] || []).forEach(function (handler) {
				handler({
					preventDefault: function () {},
					stopPropagation: function () {}
				});
			});
		},
		cloneNode: function () {
			return makeElement(tagName);
		},
		click: function () {
			elem.clicked++;
		}
	};
	return elem;
}

// new URL(...) の解決は本物に任せ、Blob の URL の発行だけを記録できるようにする。
function makeUrlStub(objectUrls) {
	var stub = function (input) {
		return new URL(input);
	};
	stub.createObjectURL = function (blob) {
		objectUrls.push(blob);
		return "blob:pegmatite/" + objectUrls.length;
	};
	stub.revokeObjectURL = function () {};
	return stub;
}

function setMatchMedia(context, dark) {
	context.window.matchMedia = function () {
		return {
			matches: dark,
			addEventListener: function () {},
			addListener: function () {}
		};
	};
}

function makeContext() {
	var created = [];
	var objectUrls = [];
	var context = {
		chrome: {
			runtime: {
				getURL: function (resource) {
					return "chrome-extension://pegmatite/" + resource;
				}
			}
		},
		document: {
			body: makeElement("body"),
			querySelector: function () {
				return null;
			},
			querySelectorAll: function () {
				return [];
			},
			documentElement: makeElement("html"),
			createElement: function (tagName) {
				var elem = makeElement(tagName);
				created.push(elem);
				return elem;
			},
			createElementNS: function (namespace, tagName) {
				var elem = makeElement(tagName);
				elem.namespace = namespace;
				return elem;
			}
		},
		URL: makeUrlStub(objectUrls),
		XMLSerializer: function () {
			this.serializeToString = function (node) {
				return "<" + node.tagName + "/>";
			};
		},
		Blob: function (parts, options) {
			this.parts = parts;
			this.type = options.type;
		},
		MutationObserver: NoopMutationObserver,
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};
	context.objectUrls = objectUrls;
	context.createdElements = created;
	context.window = context;
	context.window.location = {
		hostname: "gitlab.com",
		pathname: "/group/project"
	};
	context.window.addEventListener = function () {};
	setMatchMedia(context, false);
	return context;
}

function evaluate(context) {
	vm.runInNewContext(SCRIPT_SOURCE, context, { filename: SCRIPT_PATH });
	return context;
}

function loadContentScript() {
	return evaluate(makeContext());
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

// onLoadAction は selector/extract/replace を無条件に使う。どれかを欠いたプロファイルは
// そのサイトで例外になり、図が一切描画されなくなる。
function testAllProfilesAreComplete(context) {
	Object.keys(context.siteProfiles).forEach(function (key) {
		var profile = context.siteProfiles[key];
		assert.strictEqual(typeof profile.selector, "string", key + ": selector");
		assert.strictEqual(typeof profile.extract, "function", key + ": extract");
		assert.strictEqual(typeof profile.replace, "function", key + ": replace");
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
	var requested = [];

	context.document.querySelectorAll = function () {
		return [pre, code];
	};
	context.requestRender = function (plantuml, dark, callback) {
		requested.push({ source: plantuml, dark: dark, callback: callback });
	};

	context.onLoadAction(context.siteProfiles["gitlab.com"]);

	// pre と code の両方が候補になるが、normalize で同じ code に寄るため描画は 1 回
	assert.strictEqual(requested.length, 1);
	assert.strictEqual(requested[0].source, "@startuml\nAlice -> Bob\n@enduml");

	context.onLoadAction(context.siteProfiles["gitlab.com"]);
	assert.strictEqual(requested.length, 1);

	lines[1].textContent = "Alice --> Bob";
	context.onLoadAction(context.siteProfiles["gitlab.com"]);
	assert.strictEqual(requested.length, 2);
	assert.strictEqual(requested[1].source, "@startuml\nAlice --> Bob\n@enduml");
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

	context.run();
	assert.strictEqual(loopCalls, 1);
	assert.strictEqual(actionCalls, 0);

	context.document.querySelector = function () {
		return null;
	};
	context.run();
	assert.strictEqual(actionCalls, 1);
}

function testDynamicContentObserver(context) {
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
	context.setTimeout = function (callback) {
		callback();
		return 1;
	};
	context.clearTimeout = function () {};
	context.onLoadAction = function () {
		actionCalls++;
	};

	context.state.observing = false; // 読み込み時に一度登録済みのため戻す
	context.observeDocument(context.siteProfiles["gitlab.com"]);
	assert.strictEqual(observedTarget, context.document.body);
	assert.strictEqual(observedOptions.childList, true);
	assert.strictEqual(observedOptions.subtree, true);

	mutationCallback();
	assert.strictEqual(actionCalls, 1);

	// 二重登録しないこと
	observedTarget = null;
	context.observeDocument(context.siteProfiles["gitlab.com"]);
	assert.strictEqual(observedTarget, null);
}

// background.js は tabs.onUpdated でも content script を注入するため、同じページで
// 二重に評価される。描画エンジンを二重に読み込まず、走査だけをやり直せること。
function testReinjectionKeepsSingleRenderer() {
	var context = evaluate(makeContext());
	var firstState = context.state;

	context.ensureRenderer();
	var iframes = context.createdElements.filter(function (e) {
		return e.tagName === "iframe";
	});
	assert.strictEqual(iframes.length, 1, "iframe は 1 つだけ作られること");

	// 再インジェクトを模して同じスクリプトをもう一度評価する
	evaluate(context);

	assert.strictEqual(context.state, firstState, "状態が引き継がれること");
	assert.strictEqual(context.window.pegmatiteState, firstState);

	context.ensureRenderer();
	iframes = context.createdElements.filter(function (e) {
		return e.tagName === "iframe";
	});
	assert.strictEqual(iframes.length, 1, "再インジェクトで iframe が増えないこと");
}

// GitHub は body を整理する際に描画用 iframe を取り除く。取り除かれたら作り直し、
// 応答待ちだった要求を新しい iframe へ送り直すこと。
function testDetachedRendererIsRecreated() {
	var context = evaluate(makeContext());

	context.requestRender("@startuml\nA -> B\n@enduml", false, function () {});
	var first = context.state.frame;
	assert.strictEqual(context.state.inFlight["pegmatite-1"].message.source,
		"@startuml\nA -> B\n@enduml");

	// 取り除かれた状態を模す
	first.isConnected = false;
	assert.strictEqual(context.rendererIsAlive(), false);

	context.requestRender("@startuml\nC -> D\n@enduml", false, function () {});

	var iframes = context.createdElements.filter(function (e) {
		return e.tagName === "iframe";
	});
	assert.strictEqual(iframes.length, 2, "取り除かれたら作り直すこと");
	assert.notStrictEqual(context.state.frame, first);
	assert.strictEqual(context.state.ready, false, "新しい iframe の準備待ちに戻すこと");

	// vm コンテキスト側の配列は prototype が異なるため、ホスト側に組み直して比べる
	var queued = [];
	context.state.pending.forEach(function (m) { queued.push(m.source); });
	queued.sort();
	assert.deepStrictEqual(queued,
		["@startuml\nA -> B\n@enduml", "@startuml\nC -> D\n@enduml"].sort(),
		"未応答の要求を送り直すこと");
}

// 同じソースの描き直しではエンジンを呼ばず、保持した SVG を返すこと。
// 明暗で結果が変わるため、キャッシュはテーマまで含めて分けること。
function testSvgCache() {
	var context = evaluate(makeContext());
	var sent = 0;
	context.ensureRenderer = function () { sent++; };

	context.state.svgCache["dark:@startuml\nA -> B\n@enduml"] = "<svg/>";
	var got = null;
	context.requestRender("@startuml\nA -> B\n@enduml", true, function (error, svg) {
		got = { error: error, svg: svg };
	});

	assert.strictEqual(sent, 0, "キャッシュ命中時はエンジンを起動しないこと");
	assert.deepStrictEqual(got, { error: null, svg: "<svg/>" });

	context.requestRender("@startuml\nA -> B\n@enduml", false, function () {});
	assert.strictEqual(sent, 1, "テーマが違えば描き直すこと");
}

// 図とソースを入れ替えても操作のアイコンが残るよう、両者を 1 つの要素で包むこと
function placeDiagram(context, plantuml) {
	var parent = makeElement("div");
	var umlElem = makeElement("pre");
	var svgElem = makeElement("svg");
	parent.appendChild(umlElem);

	context.replaceElement(umlElem, svgElem,
		plantuml || "@startuml\nA -> B\n@enduml", true);

	var blockElem = parent.childNodes[0];
	return {
		parent: parent,
		umlElem: umlElem,
		svgElem: svgElem,
		blockElem: blockElem,
		toolbarElem: blockElem.childNodes[0],
		diagramElem: blockElem.childNodes[1]
	};
}

function testHoverToolbar() {
	var context = evaluate(makeContext());
	var placed = placeDiagram(context);

	assert.strictEqual(placed.blockElem.className, "pegmatite-block");
	assert.strictEqual(placed.toolbarElem.className, "pegmatite-toolbar");
	assert.strictEqual(placed.toolbarElem.childNodes.length, 2,
		"切り替えと保存のアイコンを置くこと");
	assert.strictEqual(placed.diagramElem.className, "pegmatite-diagram");
	assert.strictEqual(placed.diagramElem.childNodes[0], placed.svgElem);
	assert.strictEqual(placed.umlElem.parentNode, null,
		"図を表示している間はコードブロックを外すこと");

	// ホバーでの表示は CSS で行うため、スタイルが 1 度だけ入ること
	assert.notStrictEqual(context.state.styleElem, null);
	var styleElem = context.state.styleElem;
	placeDiagram(context);
	assert.strictEqual(context.state.styleElem, styleElem);
}

function testToolbarStaysInsideOverflow(context) {
	assert.strictEqual(context.STYLE_TEXT.indexOf("top: -5px"), -1,
		"負の top は overflow: auto で上端が欠けること");
	assert.notStrictEqual(context.STYLE_TEXT.indexOf("top: 8px"), -1,
		"ツールバーを枠の内側に置くこと");
	assert.notStrictEqual(context.STYLE_TEXT.indexOf("width: 100%"), -1,
		"ブロックをコード枠の幅いっぱいにすること");
	assert.notStrictEqual(context.STYLE_TEXT.indexOf("pegmatite-toolbar--github"), -1);
	assert.notStrictEqual(context.STYLE_TEXT.indexOf("margin-left: auto"), -1);
	assert.notStrictEqual(context.STYLE_TEXT.indexOf("padding: 8px"), -1,
		"図の余白は 8px であること");
}

function testGitHubAttachesToolbarToClipboard() {
	var context = evaluate(makeContext());
	var highlight = makeElement("DIV");
	highlight.className = "highlight highlight-source-wsd position-relative overflow-auto";
	var pre = makeElement("PRE");
	var clipboard = makeElement("DIV");
	clipboard.className = "zeroclipboard-container";
	var copy = makeElement("CLIPBOARD-COPY");
	clipboard.appendChild(copy);
	highlight.appendChild(pre);
	highlight.appendChild(clipboard);

	var svg = makeElement("svg");
	context.replaceElement(pre, svg, "@startuml\nA -> B\n@enduml", true, {}, false, {
		"attachToolbarToClipboard": true,
		"centerDiagram": true
	});

	var blockElem = highlight.childNodes[0];
	assert.strictEqual(blockElem.className, "pegmatite-block pegmatite-block--center");
	assert.strictEqual(highlight.className.indexOf("pegmatite-hover-root") !== -1, true,
		"ホバー判定をコピーと同じ枠へ付けること");
	assert.strictEqual(clipboard.childNodes[0].className, "pegmatite-toolbar pegmatite-toolbar--github");
	assert.strictEqual(clipboard.childNodes[1], copy, "コピーボタンの左へツールバーを置くこと");
	assert.strictEqual(clipboard.style.display, "flex");
	assert.strictEqual(clipboard.style.alignItems, "center");
	assert.strictEqual(clipboard.style.top, "0");
	assert.strictEqual(clipboard.style.bottom, "auto");
	assert.strictEqual(clipboard.style.height, "auto");
	assert.strictEqual(context.siteProfiles["gitlab.com"].attachToolbarToClipboard, undefined);
	assert.strictEqual(context.siteProfiles["gitlab.com"].toolbarStyle.right, "31px");
}

function testPreParentGetsFullWidth() {
	var context = evaluate(makeContext());
	var pre = makeElement("PRE");
	var code = makeElement("CODE");
	var svg = makeElement("svg");
	pre.appendChild(code);

	context.replaceElement(code, svg, "@startuml\nA -> B\n@enduml", true);

	assert.strictEqual(pre.style.width, "100%");
	assert.strictEqual(pre.style.maxWidth, "100%");
	assert.strictEqual(pre.childNodes[0].className, "pegmatite-block");
}

function testToggleButton() {
	var context = evaluate(makeContext());
	var placed = placeDiagram(context);
	var toggleButton = placed.toolbarElem.childNodes[0];

	assert.strictEqual(toggleButton.getAttribute("aria-label"), "ソースを表示");

	toggleButton.dispatch("click");
	assert.strictEqual(placed.blockElem.childNodes[1], placed.umlElem);
	assert.strictEqual(toggleButton.getAttribute("aria-label"), "図を表示");
	assert.strictEqual(toggleButton.childNodes.length, 1, "アイコンを入れ替えること");

	toggleButton.dispatch("click");
	assert.strictEqual(placed.blockElem.childNodes[1], placed.diagramElem);
	assert.strictEqual(toggleButton.getAttribute("aria-label"), "ソースを表示");
}

// 表示している内容に関わらず、図を SVG のファイルとして保存できること。
// 保存するファイルは、画面がダークテーマでも常にライトテーマで描き直すこと。
function testDownloadButton() {
	var context = evaluate(makeContext());
	context.window.matchMedia = function () {
		return { matches: true }; // ダークテーマで表示している状態
	};
	context.sanitizeSvg = function () {
		return makeElement("svg");
	};

	var source = "@startuml\nA -> B\n@enduml";
	context.state.svgCache["light:" + source] = "<svg/>";
	var placed = placeDiagram(context, source);
	var downloadButton = placed.toolbarElem.childNodes[1];

	assert.strictEqual(downloadButton.getAttribute("aria-label"), "SVG をダウンロード");

	downloadButton.dispatch("click");
	assert.strictEqual(context.objectUrls.length, 1,
		"ライトテーマの描画結果を保存すること");
	assert.strictEqual(context.objectUrls[0].type, "image/svg+xml");
	assert.strictEqual(context.state.seq, 0, "ダークテーマでは描き直さないこと");

	var links = context.createdElements.filter(function (e) {
		return e.tagName === "a";
	});
	assert.strictEqual(links.length, 1);
	assert.strictEqual(links[0].download, "plantuml-1.svg");
	assert.strictEqual(links[0].clicked, 1);
	assert.strictEqual(links[0].parentNode, null, "保存したら取り除くこと");

	// ソースを表示している状態でも同じように保存できること
	placed.toolbarElem.childNodes[0].dispatch("click");
	downloadButton.dispatch("click");
	assert.strictEqual(context.objectUrls.length, 2);
}

// ファイル名は caption、title、@start のパラメータの順に採り、どれもなければ連番を使うこと
function testDiagramFileName(context) {
	assert.strictEqual(
		context.getDiagramFileName(
			"@startuml 開始名\ncaption 認証の流れ\ntitle 表題\nA -> B\n@enduml", 3),
		"認証の流れ.svg",
		"caption を最優先すること");
	assert.strictEqual(
		context.getDiagramFileName("@startuml 開始名\ntitle 表題\nA -> B\n@enduml", 3),
		"表題.svg",
		"caption がなければ title を使うこと");
	assert.strictEqual(
		context.getDiagramFileName("@startmindmap 構成図\n* root\n@endmindmap", 3),
		"構成図.svg",
		"caption も title もなければ @start のパラメータを使うこと");
	assert.strictEqual(
		context.getDiagramFileName("@startuml diagram.png\nA -> B\n@enduml", 3),
		"diagram.svg",
		"@start のパラメータの拡張子を残さないこと");
	assert.strictEqual(
		context.getDiagramFileName("@startuml\n\tcaption  Login   flow \nA -> B\n@enduml", 3),
		"Login flow.svg");
	assert.strictEqual(
		context.getDiagramFileName("@startuml\ncaption a/b:c*d?\n@enduml", 3),
		"abcd.svg",
		"ファイル名に使えない文字を取り除くこと");
	assert.strictEqual(
		context.getDiagramFileName("@startuml\nA -> B\n@enduml", 3),
		"plantuml-3.svg",
		"どれもなければ連番を使うこと");
	assert.strictEqual(
		context.getDiagramFileName("@startuml\ncaption ///\n@enduml", 3),
		"plantuml-3.svg",
		"取り除いた結果が空になる場合も連番を使うこと");
}

function testIsDarkModeFollowsPageTheme(context) {
	setMatchMedia(context, true);
	assert.strictEqual(context.isDarkMode(), true, "マーカーがなければ OS に従うこと");

	context.document.documentElement.className = "gl-light";
	assert.strictEqual(context.isDarkMode(), false,
		"GitLab Light は OS がダークでもライトであること");

	context.document.documentElement.className = "gl-dark";
	setMatchMedia(context, false);
	assert.strictEqual(context.isDarkMode(), true,
		"GitLab Dark は OS がライトでもダークであること");

	context.document.documentElement.className = "gl-system";
	setMatchMedia(context, true);
	assert.strictEqual(context.isDarkMode(), true, "GitLab Auto は OS に従うこと");
	setMatchMedia(context, false);
	assert.strictEqual(context.isDarkMode(), false, "GitLab Auto は OS ライトならライトであること");

	context.document.documentElement.className = "gl-system gl-dark";
	setMatchMedia(context, false);
	assert.strictEqual(context.isDarkMode(), true,
		"GitLab Auto が gl-dark を付けた状態はダークであること");

	context.document.documentElement.className = "";
	context.document.body.className = "gl-dark";
	setMatchMedia(context, false);
	assert.strictEqual(context.isDarkMode(), true, "古い GitLab の body.gl-dark を拾うこと");
	context.document.body.className = "";

	context.document.documentElement.setAttribute("data-color-mode", "light");
	setMatchMedia(context, true);
	assert.strictEqual(context.isDarkMode(), false,
		"GitHub の light は OS がダークでもライトであること");

	context.document.documentElement.setAttribute("data-color-mode", "dark");
	setMatchMedia(context, false);
	assert.strictEqual(context.isDarkMode(), true,
		"GitHub の dark は OS がライトでもダークであること");

	context.document.documentElement.setAttribute("data-color-mode", "auto");
	setMatchMedia(context, true);
	assert.strictEqual(context.isDarkMode(), true, "GitHub Auto は OS に従うこと");

	context.document.documentElement.className = "";
	context.document.body.className = "";
	delete context.document.documentElement.attributes["data-color-mode"];
	setMatchMedia(context, false);
}

function testOnLoadActionFollowsGitLabLight() {
	var context = evaluate(makeContext());
	context.document.documentElement.className = "gl-light";
	setMatchMedia(context, true);

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
		querySelector: function () {
			return code;
		}
	};
	var requested = [];

	context.document.querySelectorAll = function () {
		return [pre];
	};
	context.requestRender = function (plantuml, dark, callback) {
		requested.push({ source: plantuml, dark: dark, callback: callback });
	};

	context.onLoadAction(context.siteProfiles["gitlab.com"]);
	assert.strictEqual(requested.length, 1);
	assert.strictEqual(requested[0].dark, false,
		"GitLab Light では OS がダークでもライトで描くこと");
}

function testApplyPageThemeRerenders() {
	var context = evaluate(makeContext());
	context.sanitizeSvg = function () {
		var svg = makeElement("svg");
		svg.marker = "next";
		return svg;
	};
	var requested = [];
	context.requestRender = function (plantuml, dark, callback) {
		requested.push({ plantuml: plantuml, dark: dark });
		callback(null, "<svg/>");
	};

	var source = "@startuml\nA -> B\n@enduml";
	var placed = placeDiagram(context, source);
	assert.strictEqual(context.state.renderedBlocks.length, 1);
	assert.strictEqual(context.state.renderedBlocks[0].dark, false);

	context.document.documentElement.className = "gl-dark";
	context.applyPageTheme();

	assert.strictEqual(requested.length, 1, "テーマが変わったときだけ描き直すこと");
	assert.strictEqual(requested[0].dark, true);
	assert.strictEqual(placed.diagramElem.childNodes[0].marker, "next");
	assert.strictEqual(context.state.renderedBlocks[0].svgElem.marker, "next");

	context.applyPageTheme();
	assert.strictEqual(requested.length, 1, "同じテーマでは描き直さないこと");
}

// sanitizeNode は DOM の一部の API しか使わないため、最小限のスタブで検証できる。
// sanitizeSvg 全体は DOMParser を要するのでブラウザでの動作確認に委ねる。
function node(name, attributes, children) {
	var self = {
		nodeName: name,
		children: children || [],
		attributes: [],
		removeChild: function (child) {
			self.children.splice(self.children.indexOf(child), 1);
		},
		removeAttributeNode: function (attr) {
			self.attributes.splice(self.attributes.indexOf(attr), 1);
		}
	};
	Object.keys(attributes || {}).forEach(function (key) {
		self.attributes.push({ name: key, value: attributes[key] });
	});
	return self;
}

function attributeNames(elem) {
	return elem.attributes.map(function (attr) {
		return attr.name;
	});
}

// 描画結果はページ側のソースに由来するため、無検査に取り込まない
function testSanitizeNode(context) {
	var scriptElem = node("script", {});
	var foreignElem = node("foreignObject", {});
	var badLink = node("a", { "xlink:href": "javascript:alert(1)" });
	var goodLink = node("a", { "xlink:href": "https://example.com/" });
	var anchorLink = node("a", { "href": "#page1" });
	var root = node("svg", { "onload": "alert(1)", "width": "100" },
		[scriptElem, foreignElem, badLink, goodLink, anchorLink]);

	context.sanitizeNode(root);

	assert.deepStrictEqual(root.children, [badLink, goodLink, anchorLink],
		"script と foreignObject を取り除くこと");
	assert.deepStrictEqual(attributeNames(root), ["width"],
		"on* 属性を取り除き、その他は残すこと");
	assert.deepStrictEqual(attributeNames(badLink), [],
		"javascript: のリンクを取り除くこと");
	assert.deepStrictEqual(attributeNames(goodLink), ["xlink:href"],
		"https のリンクを残すこと");
	assert.deepStrictEqual(attributeNames(anchorLink), ["href"],
		"ページ内リンクを残すこと");
}

var context = loadContentScript();
testAllProfilesAreComplete(context);
testGitLabSelectors(context);
testGitLabLineExtraction(context);
testGitLabFallbackExtraction(context);
testDuplicateCandidates(context);
testLoadingDefersConversion(context);
testDynamicContentObserver(context);
testSanitizeNode(context);
testHoverToolbar();
testToolbarStaysInsideOverflow(context);
testGitHubAttachesToolbarToClipboard();
testPreParentGetsFullWidth();
testToggleButton();
testDownloadButton();
testDiagramFileName(context);
testIsDarkModeFollowsPageTheme(context);
testOnLoadActionFollowsGitLabLight();
testApplyPageThemeRerenders();
testReinjectionKeepsSingleRenderer();
testDetachedRendererIsRecreated();
testSvgCache();
