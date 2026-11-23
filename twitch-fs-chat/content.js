(() => {
  // ---- Settings ----
  const MESSAGE_LIFETIME = 12000; // ms before a message fades
  const MESSAGE_FADE_DURATION = 700;
  const TOGGLE_CODE = "KeyC";     // Alt/Option + C toggles overlay (physical key, Mac-safe)

  let enabled = true;
  let overlay, list, input, debugEl;
  let settingsPanel, settingsFrame;
  const messageTimers = new Map();
  const stats = { mutations: 0, linesSeen: 0, mirrored: 0, errors: 0, lastError: "", skippedNoName: 0 };
  const log = (...a) => console.log("[TFC]", ...a);

  // ---- User settings (set from the toolbar popup, saved in chrome.storage.sync) ----
  const DEFAULTS = { side: "left", background: true, bottom: 10, maxMessages: 8, underControls: true, keepMessages: false };
  let settings = { ...DEFAULTS };

  function clearMessageTimers(message) {
    const timers = messageTimers.get(message);
    if (!timers) return;
    if (timers.fade) clearTimeout(timers.fade);
    if (timers.remove) clearTimeout(timers.remove);
    messageTimers.delete(message);
  }

  function removeMessage(message) {
    clearMessageTimers(message);
    message.remove();
  }

  function scheduleMessageExpiry(message) {
    const timers = { fade: null, remove: null };
    timers.fade = setTimeout(() => {
      message.classList.add("tfc-fade");
      timers.remove = setTimeout(() => removeMessage(message), MESSAGE_FADE_DURATION);
    }, MESSAGE_LIFETIME);
    messageTimers.set(message, timers);
  }

  function updateMessageLifetimes() {
    if (!list) return;
    for (const message of [...list.children]) {
      clearMessageTimers(message);
      message.classList.remove("tfc-fade");
      if (!settings.keepMessages) scheduleMessageExpiry(message);
    }
  }

  function applySettings() {
    if (!overlay) return;
    overlay.classList.toggle("tfc-right", settings.side === "right");
    overlay.classList.toggle("tfc-nobg", !settings.background);
    overlay.style.setProperty("--tfc-bottom", settings.bottom + "px");
    while (list && list.children.length > settings.maxMessages) removeMessage(list.firstChild);
    placeOverlay();
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(DEFAULTS, (s) => {
        const keepMessagesChanged = settings.keepMessages !== s.keepMessages;
        settings = { ...DEFAULTS, ...s };
        if (keepMessagesChanged) updateMessageLifetimes();
        applySettings();
      });
      chrome.storage.onChanged.addListener((changes) => {
        const keepMessagesChanged = Object.prototype.hasOwnProperty.call(changes, "keepMessages");
        for (const k in changes) settings[k] = changes[k].newValue;
        if (keepMessagesChanged) updateMessageLifetimes();
        applySettings();
      });
    } catch (err) {
      log("storage unavailable, using defaults", err);
    }
  }

  function closeSettingsPanel() {
    settingsPanel?.remove();
    settingsPanel = null;
    settingsFrame = null;
  }

  function toggleSettingsPanel() {
    const fullscreen = document.fullscreenElement;
    if (!fullscreen || !enabled) return;
    if (settingsPanel) {
      closeSettingsPanel();
      return;
    }

    settingsPanel = document.createElement("div");
    settingsPanel.id = "tfc-settings-backdrop";
    settingsPanel.setAttribute("role", "presentation");
    settingsPanel.addEventListener("click", (event) => {
      if (event.target === settingsPanel) closeSettingsPanel();
    });

    const dialog = document.createElement("div");
    dialog.id = "tfc-settings-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Fullscreen chat settings");
    dialog.setAttribute("aria-modal", "true");

    settingsFrame = document.createElement("iframe");
    settingsFrame.id = "tfc-settings-frame";
    settingsFrame.title = "Fullscreen chat settings";
    settingsFrame.src = chrome.runtime.getURL("popup.html");

    const closeButton = document.createElement("button");
    closeButton.id = "tfc-settings-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close settings");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", closeSettingsPanel);

    dialog.append(settingsFrame, closeButton);
    settingsPanel.appendChild(dialog);
    fullscreen.appendChild(settingsPanel);
    settingsFrame.focus();
  }

  // ---- Build overlay ----
  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "tfc-overlay";

    list = document.createElement("div");
    list.id = "tfc-list";

    input = document.createElement("input");
    input.id = "tfc-input";
    input.type = "text";
    input.placeholder = "Send a message (Enter to send, Esc to close)";
    input.maxLength = 500;

    // Stop Twitch hotkeys (f, m, space...) from firing while typing
    ["keydown", "keyup", "keypress"].forEach((evt) =>
      input.addEventListener(evt, (e) => e.stopPropagation())
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) sendToChat(text);
        input.value = "";
        closeInput();
      } else if (e.key === "Escape") {
        closeInput();
      }
    });

    debugEl = document.createElement("pre");
    debugEl.id = "tfc-debug";
    debugEl.style.display = "none";

    overlay.append(debugEl, list, input);
    applySettings();
  }

  function updateDebug() {
    if (!debugEl || debugEl.style.display === "none") return;
    const q = (s) => document.querySelector(s);
    const container = q(".chat-scrollable-area__message-container, .video-chat__message-list-wrapper, [role='log']");
    const lineCount = container ? container.querySelectorAll(LINE_SEL).length : 0;
    const firstLine = container?.querySelector(LINE_SEL);
    debugEl.textContent = [
      "TFC DEBUG (Option+D to hide)",
      "page: " + (location.pathname.startsWith("/videos") ? "VOD" : "live/other"),
      "chat container: " + (container ? container.className.slice(0, 40) || container.tagName : "NOT FOUND"),
      "observing: " + (observedContainer && observedContainer.isConnected ? "yes" : "NO"),
      "lines in container: " + lineCount,
      "name found in 1st line: " + (firstLine ? !!firstLine.querySelector(NAME_SEL) : "n/a"),
      "layer: " + (overlay?.dataset.layer || "n/a") + "  z=" + (overlay?.style.zIndex || "css"),
      "max messages: " + settings.maxMessages,
      "7TV detected: " + !!q(".seventv-chat-message-body"),
      "chat input (live only): " + !!q("[data-a-target='chat-input']"),
      "mutations: " + stats.mutations + "  lines seen: " + stats.linesSeen,
      "mirrored: " + stats.mirrored + "  no-name skips: " + stats.skippedNoName,
      "errors: " + stats.errors + (stats.lastError ? " (" + stats.lastError + ")" : ""),
    ].join("\n");
  }

  function openInput() {
    input.classList.add("tfc-open");
    input.focus();
  }
  function closeInput() {
    input.classList.remove("tfc-open");
    input.blur();
  }

  // ---- Attach overlay to whatever element is fullscreen ----
  // With "under controls" on, the overlay is inserted just BEFORE Twitch's controls
  // layer in the DOM (same z-index), so the player controls paint on top of the chat.
  const CONTROLS_SEL = ".video-player__overlay, [data-a-target='player-overlay-click-handler']";

  function findControlsLayer(fs) {
    let el = fs.querySelector(CONTROLS_SEL);
    if (!el) return null;
    // climb to the layer that is a direct sibling of the video area
    while (el.parentElement && el.parentElement !== fs && !el.parentElement.querySelector("video")) {
      el = el.parentElement;
    }
    return el;
  }

  function placeOverlay() {
    if (!overlay) return;
    const fs = document.fullscreenElement;
    if (!fs || !enabled) { overlay.remove(); return; }

    const controls = settings.underControls ? findControlsLayer(fs) : null;
    if (controls && controls.parentElement) {
      if (overlay.nextSibling !== controls || overlay.parentElement !== controls.parentElement) {
        controls.parentElement.insertBefore(overlay, controls);
      }
      const z = getComputedStyle(controls).zIndex;
      overlay.style.zIndex = z === "auto" ? "auto" : z;
      overlay.dataset.layer = "under-controls";
    } else {
      if (overlay.parentElement !== fs) fs.appendChild(overlay);
      overlay.style.zIndex = "";
      overlay.dataset.layer = settings.underControls ? "on-top (controls layer not found)" : "on-top";
    }
  }

  function onFullscreenChange() {
    if (document.fullscreenElement && enabled) {
      placeOverlay();
      // Twitch builds the controls layer slightly after fullscreen starts: re-check
      [300, 1000, 2500].forEach((ms) => setTimeout(placeOverlay, ms));
    } else {
      closeInput();
      closeSettingsPanel();
      overlay.remove();
    }
  }

  // ---- Reading messages (works with native Twitch chat and 7TV) ----
  // Live chat + VOD replay chat (VOD uses .video-chat__message)
  const LINE_SEL = ".seventv-message, .chat-line__message, .video-chat__message";
  const NAME_SEL = [
    ".seventv-chat-user-username",
    ".chat-author__display-name",
    ".video-chat__message-author",
    "[data-a-target='chat-message-username']",
  ].join(", ");
  // Things that are part of a line but not part of the message text
  const SKIP_SEL = [
    NAME_SEL,
    ".chat-badge",
    ".seventv-chat-badge",
    ".seventv-chat-user-badge-list",
    ".video-chat__message-timestamp",
    "[data-a-target='chat-timestamp']",
    "[data-a-target='chat-message-separator']",
    "button",
  ].join(", ");
  const BODY_SEL = ".seventv-chat-message-body, [data-a-target='chat-line-message-body']";

  const BADGE_SEL = [
    "img.chat-badge",
    "[data-a-target='chat-badge'] img",
    ".seventv-chat-badge img",
    ".seventv-chat-user-badge-list img",
  ].join(", ");

  function bestSrc(img) {
    // Prefer the highest-res candidate from srcset, fall back to src
    const set = img.getAttribute("srcset");
    if (set) {
      const last = set.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
      if (last) return last;
    }
    return img.currentSrc || img.src;
  }

  // Walk the message body in order, copying text and emote images.
  function copyBody(body, out, fallback = false) {
    let lastEmote = null; // last emote element, for zero-width stacking

    const walk = (node, inZeroWidth) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let t = node.textContent;
        // VOD lines: drop the ":" that follows the username
        if (fallback && !out.hasChildNodes()) t = t.replace(/^\s*:\s*/, "");
        if (t && t.trim() !== "" || t === " ") {
          out.appendChild(document.createTextNode(t));
          lastEmote = null;
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const cls = typeof node.className === "string" ? node.className : "";
      if (/tooltip/i.test(cls) || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return;
      if (node !== body && node.matches(SKIP_SEL)) return;

      if (node.tagName === "IMG") {
        const src = bestSrc(node);
        if (!src) return;
        const img = document.createElement("img");
        img.src = src;
        img.alt = node.alt || "";
        img.className = "tfc-emote";

        if (inZeroWidth && lastEmote) {
          // layer on top of the previous emote
          let stack = lastEmote.parentElement;
          if (!stack.classList.contains("tfc-stack")) {
            stack = document.createElement("span");
            stack.className = "tfc-stack";
            lastEmote.replaceWith(stack);
            stack.appendChild(lastEmote);
          }
          img.className = "tfc-emote tfc-zw";
          stack.appendChild(img);
        } else {
          out.appendChild(img);
          lastEmote = img;
        }
        return;
      }

      const zw = inZeroWidth || /zero-?width/i.test(cls);
      node.childNodes.forEach((c) => walk(c, zw));
    };

    body.childNodes.forEach((c) => walk(c, false));
  }

  function extractMessage(node) {
    const line = node.matches?.(LINE_SEL) ? node : node.querySelector?.(LINE_SEL);
    if (!line) return null;

    const nameEl = line.querySelector(NAME_SEL);
    const bodyEl = line.querySelector(BODY_SEL);
    if (!nameEl) return null;

    const frag = document.createDocumentFragment();
    // No dedicated body element (VOD chat): walk the whole line, skipping name/badges/timestamp
    copyBody(bodyEl || line, frag, !bodyEl);
    if (!frag.hasChildNodes()) return null;

    // Badges (Twitch native + 7TV), in page order, skipping anything inside the message body
    const badges = [];
    const seen = new Set();
    line.querySelectorAll(BADGE_SEL).forEach((el) => {
      const img = el.tagName === "IMG" ? el : el.querySelector("img");
      if (!img || (bodyEl && bodyEl.contains(img))) return;
      const src = bestSrc(img);
      if (!src || seen.has(src)) return;
      seen.add(src);
      badges.push({ src, title: img.alt || img.title || "" });
    });

    const color = nameEl.style.color || getComputedStyle(nameEl).color || "#bf94ff";
    return { user: nameEl.textContent.trim(), color, frag, badges };
  }

  // 7TV swaps text for emotes a moment after Twitch inserts the line,
  // so wait briefly (and retry) before copying.
  const processed = new WeakSet();

  function processLine(line, attempt = 0) {
    if (processed.has(line) || !line.isConnected) return;
    const sevenTvActive = !!document.querySelector(".seventv-chat-message-body");
    if (sevenTvActive && !line.querySelector(".seventv-chat-message-body") && attempt < 6) {
      setTimeout(() => processLine(line, attempt + 1), 60);
      return;
    }
    try {
      const msg = extractMessage(line);
      if (msg) {
        processed.add(line);
        addMessage(msg);
      } else {
        stats.skippedNoName++;
        if (stats.skippedNoName <= 3) log("could not read line:", line.outerHTML.slice(0, 800));
      }
    } catch (err) {
      stats.errors++;
      stats.lastError = String(err).slice(0, 80);
      console.error("[TFC]", err);
    }
  }

  function addMessage({ user, color, frag, badges = [] }) {
    if (!document.fullscreenElement) return; // only bother in fullscreen
    const div = document.createElement("div");
    div.className = "tfc-msg";

    const u = document.createElement("span");
    u.className = "tfc-user";
    u.style.color = color;
    u.textContent = user + ":";

    const badgeWrap = document.createElement("span");
    badgeWrap.className = "tfc-badges";
    badges.forEach((b) => {
      const img = document.createElement("img");
      img.className = "tfc-badge";
      img.src = b.src;
      img.alt = b.title;
      badgeWrap.appendChild(img);
    });

    div.append(badgeWrap, u, frag);
    stats.mirrored++;
    list.appendChild(div);

    while (list.children.length > settings.maxMessages) removeMessage(list.firstChild);
    if (!settings.keepMessages) scheduleMessageExpiry(div);
  }

  let chatObserver = null;
  let observedContainer = null;

  function linesFrom(node) {
    const found = [];
    const closest = node.closest?.(LINE_SEL);
    if (closest) found.push(closest);
    node.querySelectorAll?.(LINE_SEL).forEach((l) => found.push(l));
    return found;
  }

  function attachChatObserver() {
    const container = document.querySelector(
      ".chat-scrollable-area__message-container, .video-chat__message-list-wrapper, [role='log']"
    );
    if (!container) return;
    if (container === observedContainer && container.isConnected) return;

    chatObserver?.disconnect();
    observedContainer = container;
    log("observing chat container", container);
    chatObserver = new MutationObserver((muts) => {
      stats.mutations++;
      if (!document.fullscreenElement) return;
      const pending = new Set();
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          linesFrom(n).forEach((l) => { if (!processed.has(l)) pending.add(l); });
        });
      }
      // After seeking in a VOD the whole list re-renders: only show the newest few
      let lines = [...pending];
      stats.linesSeen += lines.length;
      if (lines.length > 15) lines = lines.slice(-settings.maxMessages);
      lines.forEach((l) => setTimeout(() => processLine(l), 40));
    });
    // subtree: VOD chat nests lines deeper than live chat does
    chatObserver.observe(container, { childList: true, subtree: true });
  }

  // ---- Send via the real chat input ----
  function sendToChat(text) {
    const realInput = document.querySelector('[data-a-target="chat-input"]');
    if (!realInput) return;
    realInput.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    setTimeout(() => {
      document.querySelector('[data-a-target="chat-send-button"]')?.click();
    }, 50);
  }

  // ---- Hotkeys ----
  document.addEventListener("keydown", (e) => {
    if (e.target === input) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyV") {
      const target = e.target;
      if (target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsPanel();
      return;
    }
    if (e.altKey && e.code === TOGGLE_CODE) {
      e.preventDefault();
      enabled = !enabled;
      overlay.classList.toggle("tfc-hidden", !enabled);
      if (!enabled) closeSettingsPanel();
      placeOverlay();
      return;
    }
    if (e.altKey && e.code === "KeyR") {
      e.preventDefault();
      settings.side = settings.side === "right" ? "left" : "right";
      applySettings();
      try { chrome.storage.sync.set({ side: settings.side }); } catch (_) {}
      return;
    }
    if (e.altKey && e.code === "KeyD") {
      e.preventDefault();
      debugEl.style.display = debugEl.style.display === "none" ? "block" : "none";
      updateDebug();
      return;
    }
    // Enter opens the box in fullscreen (when not already typing somewhere)
    const typing = /input|textarea/i.test(e.target.tagName) || e.target.isContentEditable;
    const canSend = !!document.querySelector('[data-a-target="chat-input"]'); // VODs have no chat input
    if (e.key === "Enter" && document.fullscreenElement && enabled && !typing && canSend) {
      e.preventDefault();
      e.stopPropagation();
      openInput();
    }
  }, true);

  window.addEventListener("message", (event) => {
    if (settingsFrame && event.source === settingsFrame.contentWindow &&
        event.data?.type === "tfc-close-settings") {
      closeSettingsPanel();
    }
  });

  // ---- Init ----
  buildOverlay();
  loadSettings();
  document.addEventListener("fullscreenchange", onFullscreenChange);
  // Twitch is a SPA: re-find the chat container when navigating between channels
  setInterval(attachChatObserver, 2000);
  setInterval(updateDebug, 700);
  log("content script loaded on", location.href);
})();
