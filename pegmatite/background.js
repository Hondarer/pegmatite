/* global chrome */

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
				files: ["content-script.js"]
			}).catch(function () { /* インジェクト不可 URL は黙殺 */ });
		}
	}
});
