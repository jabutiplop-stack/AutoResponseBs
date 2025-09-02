// content.js - panel boczny w Gmailu + ALLOWLIST
(function () {
  const PANEL_ID = "grb-webhook-sidebar";

  // 🔒 Dozwolone konta (małymi literami)
  const ALLOWED_ACCOUNTS = [
    "pierwszy@firma.pl",
    "drugi@firma.pl",
    "michalgkr@gmail.com",
  ];

  let lastThreadKey = null;
  let processing = false;

  // ========== Utils ==========
  function debounce(fn, delay) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }
  function getUrlThreadKey() { return location.pathname + location.hash; }
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function setText(el, t){ if(el) el.textContent = t ?? ""; }
  function emailNorm(x){ return (x || "").trim().toLowerCase(); }
  function isEmailAllowed(e){ return !!e && ALLOWED_ACCOUNTS.includes(emailNorm(e)); }

  // Spróbuj pobrać e-mail zalogowanego konta z topbar Gmaila
  function getCurrentAccountEmail(){
    const selectors = [
      'a[aria-label*="Google Account"][aria-label*="@"]',
      'a[aria-label*="Konto Google"][aria-label*="@"]',
      'a[aria-label*="@"]',
      'div[aria-label*="@"][role="button"]',
      'img[alt*="@"]'
    ];
    for (const sel of selectors){
      const el = document.querySelector(sel);
      if (!el) continue;
      const label = el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent || "";
      const m = label && label.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (m) return emailNorm(m[0]);
    }
    return "";
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.className = "grb-panel grb-hidden";
    panel.innerHTML = `
      <div class="grb-panel__header">
        <div class="grb-panel__title">Proponowana odpowiedź</div>
        <button class="grb-close" aria-label="Zamknij" title="Zamknij">×</button>
      </div>
      <div class="grb-panel__body">
        <div class="grb-info" id="grb-status">Ładowanie...</div>
        <textarea id="grb-reply" class="grb-textarea" rows="12" placeholder="Tu pojawi się propozycja odpowiedzi" disabled></textarea>
      </div>
      <div class="grb-panel__footer">
        <button id="grb-edit" class="grb-btn">Edytuj</button>
        <span class="grb-spacer"></span>
        <button id="grb-reject" class="grb-btn grb-btn--ghost">Odrzuć</button>
        <button id="grb-send" class="grb-btn grb-btn--primary" disabled>Wyślij</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".grb-close").addEventListener("click", () => hidePanel());
    panel.querySelector("#grb-reject").addEventListener("click", () => hidePanel());
    panel.querySelector("#grb-edit").addEventListener("click", () => {
      const ta = $("#grb-reply");
      if (!ta) return;
      ta.disabled = !ta.disabled;
      $("#grb-edit").textContent = ta.disabled ? "Edytuj" : "Zablokuj edycję";
      if (!ta.disabled) ta.focus();
    });
    panel.querySelector("#grb-send").addEventListener("click", async () => {
      const ta = $("#grb-reply");
      const text = ta ? ta.value : "";
      disableFooter(true);
      setStatus("Wysyłanie odpowiedzi...");
      try {
        await insertReplyAndSend(text);
        setStatus("Wysłano.");
        setTimeout(() => hidePanel(), 800);
      } catch (e) {
        setStatus("Błąd wysyłania: " + (e && e.message ? e.message : e));
        disableFooter(false);
      }
    });

    return panel;
  }

  function showPanel(){ ensurePanel().classList.remove("grb-hidden"); }
  function hidePanel(){ const p = document.getElementById(PANEL_ID); if (p) p.classList.add("grb-hidden"); }
  function removePanel(){ const p = document.getElementById(PANEL_ID); if (p) p.remove(); }
  function setStatus(t){ setText(document.getElementById("grb-status"), t); }
  function setReplyText(t){ const ta = document.getElementById("grb-reply"); if (ta) ta.value = t ?? ""; }
  function disableFooter(dis){ ["#grb-edit","#grb-reject","#grb-send"].forEach(s=>{ const el=$(s); if(el) el.disabled=!!dis; }); }
  function enableSend(en){ const b=$("#grb-send"); if(b) b.disabled=!en; }

  function getOpenedEmailData() {
    const subjectEl = document.querySelector("h2.hP");
    const subject = subjectEl ? subjectEl.textContent.trim() : "";

    const msgs = $all("div.adn.ads");
    const visibleMsgs = msgs.filter(m => m.offsetParent !== null && m.querySelector(".a3s"));
    const container = visibleMsgs[visibleMsgs.length - 1] || msgs[msgs.length - 1] || document;

    const fromEl = container.querySelector("span.gD");
    const fromName = fromEl ? (fromEl.getAttribute("name") || fromEl.textContent || "").trim() : "";
    const fromEmail = fromEl ? (fromEl.getAttribute("email") || "").trim() : "";

    const toEl = container.querySelector("span.g2");
    const toEmail = toEl ? (toEl.getAttribute("email") || "").trim() : "";

    const bodyEl = container.querySelector("div.a3s");
    const bodyText = (bodyEl && bodyEl.innerText ? bodyEl.innerText.trim() : "");

    const msgId = (container.getAttribute("data-message-id") || (bodyEl && bodyEl.getAttribute("data-message-id")) || "");
    return { subject, fromName, fromEmail: emailNorm(fromEmail), toEmail: emailNorm(toEmail), bodyText, msgId };
  }

  function waitForSelector(selector, root, timeout = 8000) {
    root = root || document;
    return new Promise((resolve, reject) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error("Timeout waiting for selector: " + selector)); }, timeout);
    });
  }

  async function insertReplyAndSend(text) {
    if (!text || !text.trim()) throw new Error("Treść odpowiedzi jest pusta.");

    const container = document.querySelector("div.adn.ads") || document.body;
    const selectors = [
      'div[aria-label^="Reply"]',
      'div[aria-label^="Odpowiedz"]',
      'span[role="link"][data-tooltip^="Reply"]',
      'span[role="link"][data-tooltip^="Odpowiedz"]',
      'div[role="button"][data-tooltip^="Reply"]',
      'div[role="button"][data-tooltip^="Odpowiedz"]'
    ];
    let replyBtn = null;
    for (const sel of selectors) {
      replyBtn = container.querySelector(sel) || document.querySelector(sel);
      if (replyBtn) break;
    }
    if (!replyBtn) throw new Error("Nie znaleziono przycisku Odpowiedz w Gmailu.");
    replyBtn.click();

    const bodySelCandidates = [
      'div[aria-label="Message Body"]',
      'div[aria-label="Treść wiadomości"]',
      'div[aria-label^="Body"]',
      'div[aria-label^="Wiadomość"]',
      'div.editable.LW-avf.tS-tW'
    ];
    let bodyEl = null;
    for (const sel of bodySelCandidates) {
      try {
        bodyEl = await waitForSelector(sel, document, 8000);
        if (bodyEl) break;
      } catch (e) {}
    }
    if (!bodyEl) throw new Error("Nie udało się znaleźć pola edycji odpowiedzi.");

    bodyEl.focus();
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch (e) { bodyEl.textContent = text; }

    const compose = bodyEl.closest('div[role="dialog"]') || bodyEl.closest(".btC") || document;
    const sendSelectors = [
      'div[role="button"][data-tooltip^="Send"]',
      'div[role="button"][data-tooltip^="Wyślij"]',
      'div[aria-label^="Send"]',
      'div[aria-label^="Wyślij"]',
      'span[role="button"][data-tooltip^="Send"]',
      'span[role="button"][data-tooltip^="Wyślij"]'
    ];
    let sendBtn = null;
    for (const sel of sendSelectors) {
      sendBtn = compose.querySelector(sel) || document.querySelector(sel);
      if (sendBtn) break;
    }
    if (!sendBtn) throw new Error("Nie udało się znaleźć przycisku Wyślij w Gmailu.");
    sendBtn.click();
  }

  // Sprawdzenie uprawnień (konto/alias z widoku wiadomości)
  function isAllowed(forEmailFromMessage){
    const account = getCurrentAccountEmail();
    if (isEmailAllowed(account)) return true;
    if (isEmailAllowed(forEmailFromMessage)) return true;
    return false;
  }

  async function runOnOpenedEmail() {
    if (processing) return;

    // Zbierz dane e-maila wcześnie, żeby mieć toEmail do fallbacku w allowliście
    const email = getOpenedEmailData();
    if (!isAllowed(email.toEmail)) {
      // całkowita blokada UI i działania
      removePanel();
      return;
    }

    processing = true;
    try {
      ensurePanel();
      setStatus("Ładowanie...");
      setReplyText("");
      enableSend(false);
      showPanel();

      // payload do webhooka
      const payload = {
        source: "gmail",
        timestamp: new Date().toISOString(),
        subject: email.subject,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        toEmail: email.toEmail,
        bodyText: email.bodyText,
        messageId: email.msgId,
        threadKey: getUrlThreadKey()
      };

      // ⛔ Jeżeli w międzyczasie utracono uprawnienia — przerwij
      if (!isAllowed(email.toEmail)) {
        removePanel();
        return;
      }

      // Wyślij do tła (URL w background.js)
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "postWebhook", payload, headers: {} },
          resolve
        );
      });

      if (!res || !res.ok) {
        setStatus("Błąd webhooka " + (res && res.status ? "(" + res.status + ")" : "") + ": " + (res && res.error ? res.error : "brak odpowiedzi"));
        enableSend(false);
        return;
      }

      const data = res.data || {};
      const reply = data.replyText || data.reply || data.text || data.message || "";
      if (!reply) {
        setStatus("Nie wykryto treści wiadomości.");
        setReplyText("");
        enableSend(false);
      } else {
        setStatus("");
        setReplyText(String(reply));
        enableSend(true);
      }
    } catch (e) {
      setStatus("Błąd: " + (e && e.message ? e.message : e));
      enableSend(false);
    } finally {
      processing = false;
    }
  }

  const triggerIfNeeded = debounce(() => {
    const key = getUrlThreadKey();
    const hasSubject = !!document.querySelector("h2.hP");
    if (!hasSubject) return;

    // Szybka blokada już na etapie zmiany wątku (bez tworzenia panelu)
    const email = getOpenedEmailData();
    if (!isAllowed(email.toEmail)) {
      removePanel();
      lastThreadKey = key; // nie zapętlaj
      return;
    }

    if (key !== lastThreadKey) {
      lastThreadKey = key;
      runOnOpenedEmail();
    }
  }, 300);

  const obs = new MutationObserver(triggerIfNeeded);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", triggerIfNeeded);
  window.addEventListener("load", triggerIfNeeded);
})();
