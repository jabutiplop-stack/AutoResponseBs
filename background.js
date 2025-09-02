// background.js - wykonuje żądania do webhooka (omija CORS z content scriptu)
const FIXED_WEBHOOK_URL = "https://e6dd35b8037f.ngrok-free.app/webhook/mail/addon";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "postWebhook") {
    (async () => {
      try {
        const url = FIXED_WEBHOOK_URL;
        const { payload, headers } = msg;
        if (!url) throw new Error("Brak URL webhooka.");
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(headers || {}),
          },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch(e) { data = { replyText: text }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) ? e.message : String(e) });
      }
    })();
    return true; // async response
  }
});