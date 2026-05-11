/* global chrome */
/* global Uint8Array */

async function fetchImageDataUri(uri) {
	const response = await fetch(uri);
	const contentType = response.headers.get("Content-Type");
	const buffer = await response.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binaryString = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binaryString += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binaryString);
	return "data:" + contentType + ";base64," + base64;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message.action == "plantuml") {
		fetchImageDataUri(message.url).then(sendResponse);
		return true;
	}
});

var matches = new RegExp(
	"^" + chrome.runtime.getManifest()
		.content_scripts[0]["matches"]
		.join("|^")
		.replace(/\//g, "\\/")
		.replace(/\./g, "\\.")
		.replace(/\*/g, ".+"));

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
	if (changeInfo.status === "complete") {
		if (tab.url && tab.url.match(matches)) {
			chrome.scripting.executeScript({
				target: { tabId: tab.id },
				files: ["rawdeflate.js", "content-script.js"]
			}).catch(function () { /* インジェクト不可 URL は黙殺 */ });
		}
	}
});
