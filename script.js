(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const STORAGE = {
    chats: "javelin_chats_v1",
    current: "javelin_current_v1",
    key: "javelin_gemini_key_v1",
    model: "javelin_model_v1",
    theme: "javelin_theme_v1",
    language: "javelin_language_v1",
    projects: "javelin_projects_v1",
  };
  const SYSTEM_IDENTITY = `You are J.E.M.I.D., a personal advanced AI assistant with a calm, professional, friendly, logical, futuristic personality. Your official full form is exactly "JEESHAN'S EMBEDDED MIND INTERFACE DEVICE". Your founder, creator, developer, and owner is Jeeshan Ahmad. If asked who created/founded/developed/owns you, answer clearly: "My founder and creator is Jeeshan Ahmad." If asked for your full name or full form, answer: "J.E.M.I.D. stands for JEESHAN'S EMBEDDED MIND INTERFACE DEVICE." Never invent another founder or change the official full form. You specialize in HTML, CSS, JavaScript, React, full-stack development, APIs, databases, debugging, software architecture, web apps, education, general knowledge, project planning, and productivity. Explain accurately and clearly, in steps when useful. Detect the user's language and respond in the same language: English, Hindi, or Hinglish (natural Hindi written in Latin script mixed with English). Follow a manual language preference if one is specified. Do not claim to have performed actions you did not perform.`;
  const $sidebar = $("#sidebar"),
    $backdrop = $("#sidebarBackdrop"),
    $history = $("#historyList"),
    $messages = $("#messages"),
    $welcome = $("#welcomeScreen"),
    $input = $("#messageInput"),
    $send = $("#sendBtn"),
    $stop = $("#stopBtn"),
    $scroll = $("#chatScroll"),
    $dialog = $("#settingsDialog");
  let chats = loadJSON(STORAGE.chats, []),
    currentId = localStorage.getItem(STORAGE.current),
    controller = null,
    isGenerating = false,
    activeMessageId = null;
  let projects = loadJSON(STORAGE.projects, []),
    attachments = [];

  const uuid = () =>
    crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = () => new Date().toISOString();
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE.chats, JSON.stringify(chats));
      localStorage.setItem(STORAGE.projects, JSON.stringify(projects));
      if (currentId) localStorage.setItem(STORAGE.current, currentId);
      else localStorage.removeItem(STORAGE.current);
    } catch {
      toast("Storage is full. Consider deleting older conversations.", true);
    }
  }
  function currentChat() {
    return chats.find((c) => c.id === currentId) || null;
  }
  function createChat(projectId = null) {
    const c = {
      id: uuid(),
      title: "New conversation",
      projectId,
      createdAt: now(),
      updatedAt: now(),
      messages: [],
    };
    chats.unshift(c);
    currentId = c.id;
    persist();
    renderHistory();
    renderChat();
    closeSidebar();
    return c;
  }
  function titleFrom(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 36
      ? clean.slice(0, 35).trimEnd() + "…"
      : clean || "New conversation";
  }
  function escapeHTML(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function inlineMarkdown(text) {
    let out = escapeHTML(text);
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    return out;
  }
  function renderMarkdown(raw, streaming = false) {
    const source = String(raw || "").replace(/\r\n/g, "\n");
    const chunks = source.split(/```/);
    let html = "";
    chunks.forEach((chunk, index) => {
      if (index % 2 === 1) {
        const firstNewline = chunk.indexOf("\n");
        const lang =
          (firstNewline < 0 ? "" : chunk.slice(0, firstNewline))
            .trim()
            .replace(/[^\w+#.-]/g, "")
            .slice(0, 20) || "code";
        const code = firstNewline < 0 ? chunk : chunk.slice(firstNewline + 1);
        const isHtml =
          /^html?$/i.test(lang) || /^\s*<(!doctype|html)/i.test(code);
        const tabs =
          isHtml && !streaming
            ? `<span class="code-tabs"><button type="button" class="code-tab" data-view="preview" title="Preview" aria-label="Preview">👁</button><button type="button" class="code-tab active" data-view="code" title="Code" aria-label="Code">&lt;/&gt;</button></span>`
            : "";
        html += `<div class="code-wrap"><div class="code-head"><span>${escapeHTML(lang)}</span>${tabs}<button class="copy-code" type="button" data-copy-code="${encodeURIComponent(code)}">Copy code</button></div><pre><code>${escapeHTML(code)}</code></pre><div class="preview-pane" hidden></div></div>`;
        return;
      }
      const lines = chunk.split("\n");
      let paragraph = [],
        list = null;
      const flushP = () => {
        if (paragraph.length) {
          html += `<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`;
          paragraph = [];
        }
      };
      const flushList = () => {
        if (list) {
          html += `<${list.tag}>${list.items.map((x) => `<li>${inlineMarkdown(x)}</li>`).join("")}</${list.tag}>`;
          list = null;
        }
      };
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          flushP();
          flushList();
          continue;
        }
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
        const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (heading) {
          flushP();
          flushList();
          const level = heading[1].length;
          html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
        } else if (bullet || numbered) {
          flushP();
          const tag = bullet ? "ul" : "ol";
          if (!list || list.tag !== tag) {
            flushList();
            list = { tag, items: [] };
          }
          list.items.push((bullet || numbered)[1]);
        } else if (trimmed.startsWith("&gt; ") || trimmed.startsWith("> ")) {
          flushP();
          flushList();
          html += `<blockquote>${inlineMarkdown(trimmed.replace(/^(&gt;|>)\s?/, ""))}</blockquote>`;
        } else {
          flushList();
          paragraph.push(trimmed);
        }
      }
      flushP();
      flushList();
    });
    return html || "<p></p>";
  }
  function chatItem(c) {
    return `<div class="history-item ${c.id === currentId ? "active" : ""}" data-chat-id="${c.id}" tabindex="0" role="button" aria-label="Open ${escapeHTML(c.title)}"><span class="history-icon">◷</span><span class="history-title">${escapeHTML(c.title)}</span><button class="history-menu" type="button" data-chat-menu="${c.id}" aria-label="Conversation options">···</button></div>`;
  }
  function renderHistory(filter = "") {
    const q = filter.trim().toLowerCase();
    const match = (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.text.toLowerCase().includes(q));
    let html = "";
    projects.forEach((p) => {
      const list = chats.filter((c) => c.projectId === p.id && match(c));
      if (q && !list.length) return;
      html += `<div class="project-group"><div class="project-head"><span class="project-icon">▣</span><span class="history-title">${escapeHTML(p.name)}</span><button class="history-menu" type="button" data-project-new="${p.id}" title="New chat in this project" aria-label="New chat in this project">＋</button><button class="history-menu" type="button" data-project-menu="${p.id}" aria-label="Project options">···</button></div>${list.map(chatItem).join("")}</div>`;
    });
    html += chats
      .filter((c) => !projectOf(c) && match(c))
      .map(chatItem)
      .join("");
    $history.innerHTML =
      html ||
      `<div class="history-empty">${q ? "No matching conversations." : "Your conversations will appear here."}</div>`;
  }
  function renderChat() {
    const c = currentChat();
    $("#topChatTitle").textContent = c?.title || "New conversation";
    $welcome.hidden = !!(c && c.messages.length);
    $messages.innerHTML = "";
    if (c) c.messages.forEach((m, i) => appendMessage(m, i, false));
    renderHistory($("#chatSearch").value);
    requestAnimationFrame(() => {
      $scroll.scrollTop = $scroll.scrollHeight;
      checkScroll();
    });
  }
  function appendMessage(message, index, save = true) {
    const row = document.createElement("article");
    row.className = `message-row ${message.role === "user" ? "user-row" : "assistant-row"}`;
    row.dataset.messageId = message.id;
    if (message.role === "user") {
      const att = attBubbleHTML(message.attachments || []);
      row.innerHTML = `<div class="message-content user-bubble">${att}${escapeHTML(message.text).replace(/\n/g, "<br>")}</div>`;
    } else {
      row.innerHTML = `<img class="message-avatar" src="assets/jemid-avatar.png" alt="J.E.M.I.D. avatar"><div class="message-content"><div class="assistant-head"><strong>J.E.M.I.D.</strong><span>${formatTime(message.createdAt)}</span></div><div class="message-body">${message.pending ? '<div class="typing-indicator"><i></i><i></i><i></i></div>' : message.error ? `<div class="message-error">${escapeHTML(message.text)}</div>` : renderMarkdown(message.text)}</div><div class="message-actions">${message.pending ? "" : `<button data-action="copy" data-id="${message.id}">▢ Copy</button>${message.error ? `<button data-action="retry" data-id="${message.id}">↻ Retry</button>` : `<button data-action="regenerate" data-id="${message.id}">↻ Regenerate</button>`}`}</div></div>`;
    }
    $messages.appendChild(row);
    if (save)
      requestAnimationFrame(() => {
        $scroll.scrollTop = $scroll.scrollHeight;
      });
    return row;
  }
  function formatTime(value) {
    try {
      return new Date(value || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }
  function updateChatAfterMessage() {
    const c = currentChat();
    if (!c) return;
    c.updatedAt = now();
    persist();
    renderHistory($("#chatSearch").value);
    $("#topChatTitle").textContent = c.title;
  }
  function setConnection(connected) {
    $("#sidebarStatusText").textContent = connected
      ? "Connected to Gemini"
      : "Not connected";
    $("#sidebarStatusOrb").classList.toggle("connected", connected);
    $("#connectionPill")
      .querySelector(".status-orb")
      .classList.toggle("connected", connected);
    $("#connectionLabel").textContent = connected ? "Connected" : "Offline";
    $("#settingsStatus").textContent = connected ? "KEY SAVED" : "DISCONNECTED";
    $("#settingsStatus").classList.toggle("connected", connected);
  }
  function apiKey() {
    return localStorage.getItem(STORAGE.key) || "";
  }
  function modelName() {
    return localStorage.getItem(STORAGE.model) || "gemini-3.8-flash";
  }
  function updateModelUI() {
    const model = modelName();
    const select = $("#modelSelect");
    if (select) select.value = model;
    const label = model
      .replace(/^gemini-/i, "Gemini ")
      .replace(/-/g, " ")
      .replace(/\bflash\b/i, "Flash")
      .replace(/\bpro\b/i, "Pro")
      .replace(/\blite\b/i, "Lite")
      .replace(/\bargon\b/i, "Argon");
    const top = $("#topModelLabel");
    if (top) top.textContent = label;
  }
  function updateKeyUI() {
    $("#apiKeyInput").value = apiKey();
    setConnection(!!apiKey());
  }
  function showSettings(tab = "apiPanel") {
    $dialog.showModal();
    activateTab(tab);
  }
  function activateTab(id) {
    $$(".settings-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === id),
    );
    $$(".settings-panel").forEach((p) =>
      p.classList.toggle("active", p.id === id),
    );
  }
  function toast(message, error = false) {
    const node = document.createElement("div");
    node.className = `toast ${error ? "error" : ""}`;
    node.textContent = message;
    $("#toastRegion").appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }
  function openSidebar() {
    $sidebar.classList.add("open");
    $backdrop.classList.add("visible");
  }
  function closeSidebar() {
    $sidebar.classList.remove("open");
    $backdrop.classList.remove("visible");
  }
  function setGenerating(value) {
    isGenerating = value;
    $send.hidden = value;
    $stop.hidden = !value;
    $input.disabled = value;
    if (value) $input.blur();
    else $input.focus();
  }
  async function buildContents(messages) {
    const list = messages.filter(
      (m) =>
        !m.error &&
        !m.pending &&
        (m.role === "user" || m.role === "assistant"),
    );
    // audio/video/PDF bytes are sent only for the newest message that has them (keeps requests under Gemini's size limit)
    let mediaIdx = -1;
    for (let i = list.length - 1; i >= 0; i--)
      if ((list[i].attachments || []).some((a) => a.id && a.aiMime)) {
        mediaIdx = i;
        break;
      }
    let used = 0;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      let extra = "";
      const media = [];
      for (const a of m.attachments || []) {
        if (a.kind === "file")
          extra += `\n\n[Attached file: ${a.name}]\n${FENCE}\n${a.text}\n${FENCE}`;
        else if (a.kind === "zip")
          extra += `\n\n[Attached ZIP: ${a.name}]\n${a.text || ""}`;
        else if (a.id && a.aiMime) {
          if (i === mediaIdx && used + (a.size || 0) <= AI_LIMIT) {
            const b = await getBlob(a.id);
            if (b) {
              used += a.size || 0;
              media.push({ inline_data: { mime_type: a.aiMime, data: await blobToB64(b) } });
            } else extra += `\n\n[Attached ${a.kind}: ${a.name} — file data is no longer available in this browser]`;
          } else extra += `\n\n[Attached ${a.kind}: ${a.name} — not included in this request (older message or size limit)]`;
        } else if (a.id)
          extra += `\n\n[Attached ${a.kind} file: ${a.name} (${fmtSize(a.size)}) — format the model cannot read; only name and size are known]`;
      }
      const parts = [{ text: m.text + extra }, ...media];
      (m.attachments || [])
        .filter((a) => a.kind === "image")
        .forEach((a) =>
          parts.push({ inline_data: { mime_type: a.mime, data: a.data } }),
        );
      out.push({ role: m.role === "assistant" ? "model" : "user", parts });
    }
    return out;
  }
  function languageInstruction() {
    const language = localStorage.getItem(STORAGE.language) || "auto";
    return {
      en: "Respond only in natural English unless the user explicitly requests a translation.",
      hi: "Respond in natural, easy-to-understand Hindi (Devanagari script), unless the user explicitly requests another language.",
      hinglish:
        "Respond in natural Hinglish: Hindi written in Latin script mixed with common English technical terms.",
      auto: "Automatically detect the language of the latest user message. Reply in that same language: English, Hindi in Devanagari, or natural Hinglish when the user writes Hindi in Latin script or mixes Hindi and English.",
    }[language];
  }
  function updateStreamingMessage(message) {
    const row = $messages.querySelector(
      `[data-message-id="${CSS.escape(message.id)}"]`,
    );
    const body = row?.querySelector(".message-body");
    if (!body) return;
    body.innerHTML = message.text
      ? `${renderMarkdown(message.text, true)}<span class="streaming-cursor" aria-label="Generating"></span>`
      : '<div class="typing-indicator"><i></i><i></i><i></i></div>';
    $scroll.scrollTop = $scroll.scrollHeight;
  }

  async function askGemini(chat, assistantMessage) {
    const key = apiKey();
    if (!key) {
      assistantMessage.pending = false;
      assistantMessage.error = true;
      assistantMessage.text =
        "Gemini isn't connected yet. Open Settings → API & Model, add your Google Gemini API key, and choose Save & connect. No fake response has been generated.";
      persist();
      renderChat();
      setGenerating(false);
      showSettings("apiPanel");
      return;
    }

    const contents = await buildContents(
      chat.messages.filter((m) => m.id !== assistantMessage.id),
    );
    const body = {
      system_instruction: {
        parts: [
          {
            text: `${SYSTEM_IDENTITY}\n\nLANGUAGE INSTRUCTION: ${voiceMode && (localStorage.getItem(STORAGE.language) || "auto") !== "en" ? "VOICE MODE IS ACTIVE. Reply in natural spoken Hindi using Devanagari script, with a clear Indian Hindi speaking style. Avoid English-accented Hinglish and avoid writing Hindi words in Latin letters. Keep sentences conversational and easy to speak aloud. Retain common technical product names and code terms in English only when necessary." : languageInstruction()}\n\nConversation title: ${chat.title}. Treat the content above as conversation context. Keep responses useful, clear, and appropriately concise. Use Markdown for headings, lists, and fenced code blocks when helpful.${projectContext(chat)}`,
          },
        ],
      },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    };

    controller = new AbortController();
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName())}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const apiMessage = data?.error?.message || `HTTP ${response.status}`;
        let friendly = apiMessage;
        if (response.status === 401 || response.status === 403) {
          friendly = `Invalid or unauthorized API key. Please check your Google Gemini API key in Settings. Details: ${apiMessage}`;
        } else if (response.status === 400) {
          friendly = `Gemini rejected this request. Check the selected model and input. Details: ${apiMessage}`;
        } else if (response.status === 429) {
          friendly = `Gemini rate limit reached or service is busy. Please wait and retry. Details: ${apiMessage}`;
        } else if (response.status >= 500) {
          friendly = `Temporary Gemini service error. Please retry shortly. Details: ${apiMessage}`;
        }
        throw new Error(friendly);
      }

      if (!response.body)
        throw new Error(
          "Streaming is not available in this browser. Try an updated version of Chrome.",
        );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleSSELine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") return;

        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          return;
        }
        const delta = (data.candidates || [])
          .flatMap((candidate) => candidate.content?.parts || [])
          .map((part) => part.text || "")
          .join("");
        if (delta) {
          assistantMessage.text += delta;
          updateStreamingMessage(assistantMessage);
        }
        const blockReason = data.promptFeedback?.blockReason;
        if (blockReason && !assistantMessage.text) {
          throw new Error(
            `Gemini blocked this request (${blockReason}). Try rephrasing your message.`,
          );
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) handleSSELine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleSSELine(buffer);

      if (!assistantMessage.text.trim()) {
        throw new Error(
          "Gemini returned no text. The response may have been blocked or the model may not have produced a text candidate.",
        );
      }
      assistantMessage.pending = false;
      assistantMessage.error = false;
      updateChatAfterMessage();
      renderChat();
      updateProjectMemory(chat, assistantMessage);
    } catch (error) {
      if (error.name === "AbortError") {
        assistantMessage.pending = false;
        assistantMessage.text = assistantMessage.text || "Generation stopped.";
        assistantMessage.stopped = true;
      } else {
        assistantMessage.pending = false;
        assistantMessage.error = true;
        assistantMessage.text =
          error.message ||
          "A network error occurred. Check your internet connection and try again.";
      }
      persist();
      renderChat();
    } finally {
      controller = null;
      setGenerating(false);
      updateChatAfterMessage();
    }
  }
  async function sendMessage(text = $input.value) {
    if (dictActive) stopDictation(true, false);
    let value = String(text).replace(/\s*\[listening…\]$/, "").trim();
    if ((!value && !attachments.length) || isGenerating) return;
    if (!value)
      value =
        "Please look at the attached " +
        (attachments.some((a) => a.kind === "image") ? "image" : attachments.some((a) => a.kind === "audio") ? "audio recording" : attachments.some((a) => a.kind === "video") ? "video" : "file") +
        " and help me.";
    let chat = currentChat();
    if (!chat) chat = createChat();
    if (!chat.messages.length || chat.title === "New conversation")
      chat.title = titleFrom(value);
    const userMessage = {
      id: uuid(),
      role: "user",
      text: value,
      createdAt: now(),
      ...(attachments.length ? { attachments: attachments.slice() } : {}),
    };
    chat.messages.push(userMessage);
    attachments = [];
    renderAttachments();
    const assistantMessage = {
      id: uuid(),
      role: "assistant",
      text: "",
      createdAt: now(),
      pending: true,
    };
    chat.messages.push(assistantMessage);
    $input.value = "";
    resizeInput();
    $welcome.hidden = true;
    persist();
    renderChat();
    setGenerating(true);
    await askGemini(chat, assistantMessage);
    if (voiceMode) {
      if (
        assistantMessage.text &&
        !assistantMessage.error &&
        !assistantMessage.stopped
      )
        speakVoiceReply(assistantMessage.text);
      else if (voiceMode) scheduleVoiceListening(700);
    }
  }
  function stopGeneration() {
    if (controller) {
      controller.abort();
      toast("Generation stopped.");
    }
  }
  async function connectKey() {
    const key = $("#apiKeyInput").value.trim();
    const result = $("#apiResult");
    result.className = "api-result";
    result.textContent = "";
    if (!key) {
      result.className += " error";
      result.textContent = "Paste your Gemini API key first.";
      return;
    }
    if (key.length < 20) {
      result.className += " error";
      result.textContent =
        "API key looks too short. Please paste the full key from Google AI Studio.";
      return;
    }
    const isOldKey = key.startsWith("AIza");
    const isNewAuthKey = key.startsWith("AQ.");
    if (!isOldKey && !isNewAuthKey) {
      result.className += " error";
      result.textContent =
        "This doesn't look like a Gemini API key. Valid keys start with 'AIza' (older) or 'AQ.' (current auth keys from AI Studio).";
      return;
    }
    const model = $("#modelSelect").value;
    localStorage.setItem(STORAGE.key, key);
    localStorage.setItem(STORAGE.model, model);
    updateModelUI();
    setConnection(true);
    result.className += " success";
    result.textContent = "Key saved in this browser. Testing connection…";
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: "Reply with exactly: JEMID connection test successful.",
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 30, temperature: 0 },
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const apiMessage = data?.error?.message || `HTTP ${res.status}`;
        let friendly = apiMessage;
        if (res.status === 401 || res.status === 403)
          friendly = `Invalid API key or insufficient permissions. ${apiMessage}`;
        else if (res.status === 429)
          friendly = `Rate limit or temporary overload during test. Try again soon. ${apiMessage}`;
        else if (res.status >= 500)
          friendly = `Temporary service error. Retry the connection test. ${apiMessage}`;
        else if (
          res.status === 400 &&
          apiMessage.toLowerCase().includes("model")
        )
          friendly = `Model not available for this key. Choose another model. ${apiMessage}`;
        throw new Error(friendly);
      }
      result.textContent =
        "Connection test successful. Gemini returned a response; you are ready to chat.";
      result.className = "api-result success";
      setConnection(true);
      toast("Gemini connected successfully.");
    } catch (err) {
      result.className = "api-result error";
      result.textContent = `Key saved, but connection test failed: ${err.message}. Check the key, model access, API restrictions, and network.`;
      setConnection(false);
      toast("Gemini connection test failed.", true);
    }
  }
  function disconnectKey() {
    localStorage.removeItem(STORAGE.key);
    $("#apiKeyInput").value = "";
    $("#apiResult").className = "api-result";
    $("#apiResult").textContent = "API key removed from this browser.";
    setConnection(false);
    toast("Gemini disconnected.");
  }
  function resizeInput() {
    $input.style.height = "auto";
    $input.style.height = `${Math.min($input.scrollHeight, 180)}px`;
    updateCharCount();
  }
  function updateCharCount() {
    const count = $input.value.length;
    $send.classList.toggle("is-empty", !$input.value.trim() && !attachments.length);
    const el = $("#charCount");
    if (el) el.textContent = count > 0 ? `${count} chars` : "";
  }
  async function deleteChat(id) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    if (
      !(await modalAsk({
        title: "Delete conversation?",
        text: `"${chat.title}" will be deleted. This cannot be undone.`,
        ok: "Delete",
        danger: true,
      }))
    )
      return;
    dropBlobs(chatBlobIds(chat));
    chats = chats.filter((c) => c.id !== id);
    if (currentId === id) {
      currentId = chats[0]?.id || null;
      if (!currentId) createChat();
    }
    persist();
    renderHistory();
    renderChat();
    toast("Conversation deleted.");
  }
  async function renameChat(id) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    const r = await modalAsk({
      title: "Rename conversation",
      fields: [{ label: "Title", value: chat.title }],
      ok: "Rename",
    });
    if (!r) return;
    if (!r[0].trim()) {
      toast("A conversation title cannot be empty.", true);
      return;
    }
    chat.title = r[0].trim().slice(0, 80);
    chat.updatedAt = now();
    persist();
    renderHistory($("#chatSearch").value);
    if (id === currentId) $("#topChatTitle").textContent = chat.title;
    toast("Conversation renamed.");
  }
  async function editUserMessage(messageId) {
    const chat = currentChat();
    if (!chat) return;
    const idx = chat.messages.findIndex(
      (m) => m.id === messageId && m.role === "user",
    );
    if (idx < 0) return;
    const old = chat.messages[idx];
    const r = await modalAsk({
      title: "Edit message",
      text: "It will be resent to Gemini.",
      fields: [{ label: "Message", value: old.text, multiline: true }],
      ok: "Resend",
    });
    if (!r || !r[0].trim()) return;
    const replacement = r[0].trim();
    chat.messages = chat.messages.slice(0, idx);
    attachments = old.attachments ? old.attachments.slice() : [];
    $input.value = replacement;
    resizeInput();
    persist();
    renderChat();
    sendMessage(replacement);
  }
  async function regenerate(messageId) {
    if (isGenerating) return;
    const chat = currentChat();
    if (!chat) return;
    let idx = chat.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    if (chat.messages[idx].role === "assistant") {
      const lastUser = chat.messages
        .slice(0, idx)
        .map((m, i) => ({ m, i }))
        .reverse()
        .find((x) => x.m.role === "user");
      if (!lastUser) return;
      chat.messages = chat.messages.slice(0, lastUser.i + 1);
    } else {
      chat.messages = chat.messages.slice(0, idx + 1);
    }
    const assistant = {
      id: uuid(),
      role: "assistant",
      text: "",
      createdAt: now(),
      pending: true,
    };
    chat.messages.push(assistant);
    persist();
    renderChat();
    setGenerating(true);
    await askGemini(chat, assistant);
  }
  async function clearAllChats() {
    if (
      !(await modalAsk({
        title: "Delete all conversations?",
        text: "All saved conversations in this browser will be deleted. This cannot be undone.",
        ok: "Delete all",
        danger: true,
      }))
    )
      return;
    clearBlobs();
    chats = [];
    currentId = null;
    persist();
    createChat();
    renderChat();
    toast("All conversations cleared.");
  }

  const FENCE = "`".repeat(3);
  const TEXT_EXT =
    /\.(html?|css|js|mjs|jsx|ts|tsx|json|md|txt|py|java|c|cpp|cs|php|xml|svg|csv|yml|yaml|sql|sh)$/i;
  function downscaleImage(file, max = 1280) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)),
          c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error("bad image"));
      };
      img.src = url;
    });
  }
  // ===== Attachment storage: audio / video / PDF / ZIP / any file live in IndexedDB (not localStorage) =====
  const MB = 1048576,
    AI_LIMIT = 14 * MB, // Gemini inline request limit is ~20 MB incl. base64 overhead
    STORE_LIMIT = 50 * MB;
  const AUDIO_MIME = { mp3: "audio/mp3", wav: "audio/wav", aac: "audio/aac", m4a: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aif: "audio/aiff", aiff: "audio/aiff" };
  const AUDIO_EXT_OTHER = /^(amr|wma|mid|midi|3ga|weba|mka|caf)$/;
  const VIDEO_MIME = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mpeg: "video/mpeg", mpg: "video/mpeg", avi: "video/avi", wmv: "video/wmv", "3gp": "video/3gpp", flv: "video/x-flv" };
  const VIDEO_EXT_OTHER = /^(mkv|ts|vob|ogv|mts)$/;
  const blobCache = new Map(); // only used if IndexedDB is unavailable
  let blobDBp = null;
  function blobDB() {
    if (!blobDBp)
      blobDBp = new Promise((res, rej) => {
        try {
          const r = indexedDB.open("jemid_files_v1", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("b");
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) {
          rej(e);
        }
      });
    return blobDBp;
  }
  async function putBlob(id, blob) {
    try {
      const db = await blobDB();
      await new Promise((res, rej) => {
        const tx = db.transaction("b", "readwrite");
        tx.objectStore("b").put(blob, id);
        tx.oncomplete = res;
        tx.onerror = tx.onabort = () => rej(tx.error);
      });
      return true;
    } catch {
      blobCache.set(id, blob);
      return false;
    }
  }
  async function getBlob(id) {
    if (blobCache.has(id)) return blobCache.get(id);
    try {
      const db = await blobDB();
      return await new Promise((res, rej) => {
        const r = db.transaction("b").objectStore("b").get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      });
    } catch {
      return null;
    }
  }
  async function dropBlobs(ids) {
    ids.forEach((id) => blobCache.delete(id));
    if (!ids.length) return;
    try {
      const db = await blobDB(),
        st = db.transaction("b", "readwrite").objectStore("b");
      ids.forEach((id) => st.delete(id));
    } catch {}
  }
  async function clearBlobs() {
    blobCache.clear();
    try {
      (await blobDB()).transaction("b", "readwrite").objectStore("b").clear();
    } catch {}
  }
  const isBlobAtt = (a) => !!a && !!a.id;
  const chatBlobIds = (chat) =>
    (chat?.messages || []).flatMap((m) => (m.attachments || []).filter(isBlobAtt).map((a) => a.id));
  function blobToB64(b) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = () => rej(r.error);
      r.readAsDataURL(b);
    });
  }
  function extOf(n) {
    const m = /\.([a-z0-9]+)$/i.exec(n || "");
    return m ? m[1].toLowerCase() : "";
  }
  function classify(f) {
    const ext = extOf(f.name),
      t = (f.type || "").toLowerCase();
    if (t.startsWith("image/")) return { kind: "image" };
    if (ext === "pdf" || t === "application/pdf") return { kind: "pdf", aiMime: "application/pdf" };
    if (t.startsWith("audio/") || AUDIO_MIME[ext] || AUDIO_EXT_OTHER.test(ext))
      return { kind: "audio", aiMime: AUDIO_MIME[ext] || null };
    if (t.startsWith("video/") || VIDEO_MIME[ext] || VIDEO_EXT_OTHER.test(ext))
      return { kind: "video", aiMime: VIDEO_MIME[ext] || null };
    if (ext === "zip" || /zip/.test(t)) return { kind: "zip" };
    if (t.startsWith("text/") || TEXT_EXT.test(f.name || "")) return { kind: "file" };
    return { kind: "other" };
  }
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  // Reads the ZIP's file list + text/code files inside it, so the AI can actually "see" the zip.
  async function readZipSummary(blob) {
    const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer()),
      dv = new DataView(tail.buffer);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (dv.getUint32(i, true) === 0x06054b50) {
        e = i;
        break;
      }
    if (e < 0) throw new Error("not a zip");
    const total = dv.getUint16(e + 10, true),
      cdSize = dv.getUint32(e + 12, true),
      cdOff = dv.getUint32(e + 16, true);
    if (total === 0xffff || cdOff === 0xffffffff) throw new Error("zip64");
    const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()),
      cv = new DataView(cd.buffer),
      dec = new TextDecoder(),
      entries = [];
    let p = 0;
    for (let n = 0; n < total && p + 46 <= cd.length; n++) {
      if (cv.getUint32(p, true) !== 0x02014b50) break;
      const nl = cv.getUint16(p + 28, true),
        el = cv.getUint16(p + 30, true),
        cl = cv.getUint16(p + 32, true);
      entries.push({
        flags: cv.getUint16(p + 8, true),
        method: cv.getUint16(p + 10, true),
        csize: cv.getUint32(p + 20, true),
        size: cv.getUint32(p + 24, true),
        off: cv.getUint32(p + 42, true),
        name: dec.decode(cd.subarray(p + 46, p + 46 + nl)),
      });
      p += 46 + nl + el + cl;
    }
    const files = entries.filter((x) => !x.name.endsWith("/"));
    let out = `ZIP archive with ${files.length} file(s):\n`;
    files.slice(0, 300).forEach((x) => (out += `- ${x.name} (${fmtSize(x.size)})\n`));
    if (files.length > 300) out += `… and ${files.length - 300} more\n`;
    let budget = 250000,
      count = 0,
      body = "";
    for (const x of files) {
      if (count >= 25 || budget <= 0) break;
      if ((x.flags & 1) || x.size > 100000 || !TEXT_EXT.test(x.name) || /(^|\/)(node_modules|\.git)\//.test(x.name)) continue;
      if (x.method !== 0 && !(x.method === 8 && typeof DecompressionStream === "function")) continue;
      try {
        const lh = new DataView(await blob.slice(x.off, x.off + 30).arrayBuffer()),
          start = x.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        let bytes = new Uint8Array(await blob.slice(start, start + x.csize).arrayBuffer());
        if (x.method === 8) bytes = await inflateRaw(bytes);
        const text = dec.decode(bytes);
        budget -= text.length;
        count++;
        body += `\n[file: ${x.name}]\n${FENCE}\n${text}\n${FENCE}\n`;
      } catch {}
    }
    return out + (body ? `\nText/code files extracted from the ZIP:\n${body}` : "\n(No readable text/code files inside.)");
  }
  async function addFiles(files) {
    for (const f of files) {
      if (attachments.length >= 6) {
        toast("Maximum 6 attachments per message.", true);
        break;
      }
      try {
        const c = classify(f);
        if (c.kind === "image")
          attachments.push({
            kind: "image",
            name: f.name || "pasted-image.png",
            mime: "image/jpeg",
            size: f.size,
            data: await downscaleImage(f),
          });
        else if (c.kind === "file") {
          if (f.size > 300000) {
            toast(`${f.name} is too large (max 300 KB for text/code files).`, true);
            continue;
          }
          attachments.push({
            kind: "file",
            name: f.name,
            size: f.size,
            text: await f.text(),
          });
        } else {
          const limit = c.aiMime ? AI_LIMIT : STORE_LIMIT;
          if (!f.size) {
            toast(`${f.name || "This file"} is empty.`, true);
            continue;
          }
          if (f.size > limit) {
            toast(`${f.name || "This file"} is too large (max ${limit / MB} MB for this type).`, true);
            continue;
          }
          const id = uuid(),
            att = {
              kind: c.kind,
              id,
              name: f.name || `${c.kind}-${Date.now()}`,
              mime: f.type || c.aiMime || "application/octet-stream",
              aiMime: c.aiMime || null,
              size: f.size,
            };
          const saved = await putBlob(id, f);
          if (c.kind === "zip") {
            try {
              att.text = await readZipSummary(f);
            } catch {
              att.text = "(Could not read the contents of this ZIP; only its name and size are known.)";
            }
          }
          attachments.push(att);
          if (!saved) toast("Browser storage unavailable: this file will only last until you close the tab.", true);
          if ((c.kind === "audio" || c.kind === "video") && !c.aiMime)
            toast(`${att.name}: attached, but Gemini can't analyse this format. Use mp3/wav/aac/ogg/flac or mp4/mov/webm.`);
        }
      } catch {
        toast("Could not read that file.", true);
      }
    }
    renderAttachments();
  }
  // ===== File chips, file cards and the file preview window (same look as JEN Chat / JEN Team) =====
  const ICON_DL =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';
  function fmtSize(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }
  function attBytes(a) {
    if (a.kind === "image") {
      const bin = atob(a.data),
        out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(a.text || "");
  }
  function attSize(a) {
    if (a.size) return a.size;
    return a.kind === "image"
      ? Math.round((a.data || "").length * 0.75)
      : new Blob([a.text || ""]).size;
  }
  function attFileName(a) {
    const n = a.name || (a.kind === "image" ? "image.jpg" : "file.txt");
    // images are re-encoded as JPEG to keep chats light, so keep the extension honest
    return a.kind === "image" ? n.replace(/\.[^.]+$/, "") + ".jpg" : n;
  }
  function attExt(a) {
    const m = /\.([a-z0-9]+)$/i.exec(a.name || "");
    return (m ? m[1] : a.kind === "image" ? "img" : "txt").slice(0, 4).toUpperCase();
  }
  function attThumb(a) {
    return a.kind === "image"
      ? `<img src="data:${a.mime};base64,${a.data}" alt="">`
      : `<span class="fi-ico">${escapeHTML(attExt(a))}</span>`;
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function attBlob(a) {
    if (isBlobAtt(a)) {
      const b = await getBlob(a.id);
      if (!b) toast("This file's data is no longer available in this browser.", true);
      return b;
    }
    return new Blob([attBytes(a)], {
      type: a.kind === "image" ? a.mime : "text/plain;charset=utf-8",
    });
  }
  async function downloadAtt(a) {
    const b = await attBlob(a);
    if (b) saveBlob(b, attFileName(a));
  }
  // minimal ZIP (store, no compression) so "Download all" needs no library
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeZip(items) {
    const enc = new TextEncoder(),
      parts = [],
      central = [];
    let offset = 0;
    const d = new Date(),
      dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    items.forEach((it) => {
      const name = enc.encode(it.name),
        crc = crc32(it.bytes),
        size = it.bytes.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, it.bytes);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + size;
    });
    const cdSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, items.length, true);
    end.setUint16(10, items.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }
  async function downloadAll(list) {
    const used = new Set(),
      items = [];
    for (const a of list) {
      let n = attFileName(a),
        i = 2;
      while (used.has(n.toLowerCase()))
        n = attFileName(a).replace(/(\.[^.]*)?$/, ` (${i++})$1`);
      used.add(n.toLowerCase());
      const b = await attBlob(a);
      if (b) items.push({ name: n, bytes: new Uint8Array(await b.arrayBuffer()) });
    }
    if (items.length) saveBlob(makeZip(items), "jemid-files.zip");
  }
  function attBubbleHTML(list) {
    if (!list.length) return "";
    const imgs = list
      .map((a, i) =>
        a.kind === "image"
          ? `<img class="att-img" data-att-open="${i}" src="data:${a.mime};base64,${a.data}" alt="${escapeHTML(a.name)}" title="Open preview">`
          : "",
      )
      .join("");
    const cards = list
      .map(
        (a, i) =>
          `<div class="fcard" data-att-open="${i}" role="button" tabindex="0" title="Open preview"><span class="fcard-thumb">${attThumb(a)}</span><span class="fcard-info"><strong>${escapeHTML(attFileName(a))}</strong><small>${fmtSize(attSize(a))}</small></span><button type="button" class="fcard-dl" data-att-dl="${i}" title="Download" aria-label="Download ${escapeHTML(attFileName(a))}">${ICON_DL}</button></div>`,
      )
      .join("");
    const all =
      list.length > 1
        ? `<button type="button" class="fcard-all" data-att-all>${ICON_DL}<span>Download all (${list.length})</span></button>`
        : "";
    return `<div class="att-wrap">${imgs ? `<div class="att-row">${imgs}</div>` : ""}<div class="fcard-list">${cards}</div>${all}</div>`;
  }
  function renderAttachments() {
    const strip = $("#attachStrip");
    if (!strip) return;
    strip.hidden = !attachments.length;
    const badge = $("#attachCount");
    if (badge) {
      badge.hidden = !attachments.length;
      badge.textContent = attachments.length;
    }
    $send.classList.toggle("is-empty", !$input.value.trim() && !attachments.length);
    strip.innerHTML = attachments
      .map(
        (a, i) =>
          `<span class="att-chip" data-att-open="${i}" title="Preview"><span class="chip-thumb">${attThumb(a)}</span><span class="chip-info"><em>${escapeHTML(attFileName(a))}</em><small>${fmtSize(attSize(a))}</small></span><button type="button" data-att-remove="${i}" aria-label="Remove attachment">✕</button></span>`,
      )
      .join("");
  }
  // --- preview window ---
  const fp = { list: [], i: 0, el: null, tok: 0, url: null };
  function buildPreview() {
    if (fp.el) return fp.el;
    const o = document.createElement("div");
    o.className = "fp-overlay";
    o.hidden = true;
    o.innerHTML = `<div class="fp-window" role="dialog" aria-modal="true" aria-label="File preview">
      <div class="fp-head">
        <div class="fp-title"><strong id="fpName"></strong><small id="fpMeta"></small></div>
        <span class="fp-count" id="fpCount"></span>
        <button type="button" class="fp-copy" id="fpCopy">Copy code</button>
        <button type="button" class="fp-icon" id="fpDl" title="Download" aria-label="Download">${ICON_DL}</button>
        <button type="button" class="fp-icon" id="fpFull" title="Full screen" aria-label="Full screen">⛶</button>
        <button type="button" class="fp-icon" id="fpClose" title="Close" aria-label="Close">✕</button>
      </div>
      <div class="fp-body" id="fpBody"></div>
      <button type="button" class="fp-nav fp-prev" id="fpPrev" aria-label="Previous">‹</button>
      <button type="button" class="fp-nav fp-next" id="fpNext" aria-label="Next">›</button>
    </div>`;
    document.body.appendChild(o);
    o.addEventListener("click", (e) => {
      if (e.target === o) closePreview();
    });
    $("#fpClose", o).addEventListener("click", closePreview);
    $("#fpPrev", o).addEventListener("click", () => stepPreview(-1));
    $("#fpNext", o).addEventListener("click", () => stepPreview(1));
    $("#fpDl", o).addEventListener("click", () => downloadAtt(fp.list[fp.i]));
    $("#fpFull", o).addEventListener("click", () => {
      const w = $(".fp-window", o);
      if (document.fullscreenElement) document.exitFullscreen();
      else if (w.requestFullscreen) w.requestFullscreen().catch(() => {});
    });
    $("#fpCopy", o).addEventListener("click", async () => {
      const a = fp.list[fp.i];
      try {
        await navigator.clipboard.writeText(a.text || "");
        toast("Code copied.");
      } catch {
        toast("Could not copy.", true);
      }
    });
    fp.el = o;
    return o;
  }
  function paintPreview() {
    const o = buildPreview(),
      a = fp.list[fp.i];
    if (!a) return;
    $("#fpName", o).textContent = attFileName(a);
    $("#fpMeta", o).textContent = fmtSize(attSize(a));
    $("#fpCount", o).textContent = fp.list.length > 1 ? `${fp.i + 1} / ${fp.list.length}` : "";
    $("#fpCount", o).hidden = fp.list.length < 2;
    $("#fpPrev", o).hidden = $("#fpNext", o).hidden = fp.list.length < 2;
    $("#fpCopy", o).hidden = !(a.kind === "file" || a.kind === "zip");
    const body = $("#fpBody", o),
      tok = ++fp.tok;
    if (fp.url) {
      URL.revokeObjectURL(fp.url);
      fp.url = null;
    }
    body.scrollTop = 0;
    if (a.kind === "image") {
      body.innerHTML = `<img class="fp-img" src="data:${a.mime};base64,${a.data}" alt="${escapeHTML(a.name)}">`;
    } else if (a.kind === "file" || a.kind === "zip") {
      body.innerHTML = `<pre class="fp-code"><code>${escapeHTML(a.text || "")}</code></pre>`;
    } else if (isBlobAtt(a)) {
      body.innerHTML = '<div class="fp-note">Loading…</div>';
      getBlob(a.id).then((b) => {
        if (tok !== fp.tok) return;
        if (!b) {
          body.innerHTML = '<div class="fp-note">This file\'s data is no longer available in this browser.</div>';
          return;
        }
        const url = (fp.url = URL.createObjectURL(b.type || !a.mime ? b : b.slice(0, b.size, a.mime)));
        if (a.kind === "audio")
          body.innerHTML = `<div class="fp-media"><strong>${escapeHTML(attFileName(a))}</strong><audio controls preload="metadata" src="${url}"></audio></div>`;
        else if (a.kind === "video")
          body.innerHTML = `<video class="fp-video" controls playsinline preload="metadata" src="${url}"></video>`;
        else if (a.kind === "pdf")
          body.innerHTML = `<iframe class="fp-pdf" src="${url}" title="${escapeHTML(attFileName(a))}"></iframe>`;
        else
          body.innerHTML = `<div class="fp-note">No preview for this file type.<br>Use the download button to open it.</div>`;
      });
    } else body.innerHTML = "";
  }
  function openPreview(list, index) {
    if (!list || !list[index]) return;
    fp.list = list;
    fp.i = index;
    const o = buildPreview();
    paintPreview();
    o.hidden = false;
    document.body.classList.add("fp-open");
  }
  function stepPreview(d) {
    if (fp.list.length < 2) return;
    fp.i = (fp.i + d + fp.list.length) % fp.list.length;
    paintPreview();
  }
  function closePreview() {
    if (!fp.el || fp.el.hidden) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fp.el.hidden = true;
    fp.tok++;
    if (fp.url) {
      URL.revokeObjectURL(fp.url);
      fp.url = null;
    }
    $("#fpBody", fp.el).innerHTML = ""; // stops audio/video playback
    document.body.classList.remove("fp-open");
  }
  document.addEventListener("keydown", (e) => {
    if (!fp.el || fp.el.hidden) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      closePreview();
    } else if (e.key === "ArrowLeft") stepPreview(-1);
    else if (e.key === "ArrowRight") stepPreview(1);
  }, true);
  function messageAtts(el) {
    const row = el.closest(".message-row");
    const msg = currentChat()?.messages.find((x) => x.id === row?.dataset.messageId);
    return msg?.attachments || [];
  }
  $messages.addEventListener("click", (e) => {
    const dl = e.target.closest("[data-att-dl]");
    if (dl) {
      e.stopPropagation();
      const a = messageAtts(dl)[+dl.dataset.attDl];
      if (a) downloadAtt(a);
      return;
    }
    const all = e.target.closest("[data-att-all]");
    if (all) {
      e.stopPropagation();
      downloadAll(messageAtts(all));
      return;
    }
    const op = e.target.closest("[data-att-open]");
    if (op) openPreview(messageAtts(op), +op.dataset.attOpen);
  });
  $messages.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const op = e.target.closest(".fcard[data-att-open]");
    if (op && e.target === op) {
      e.preventDefault();
      openPreview(messageAtts(op), +op.dataset.attOpen);
    }
  });
  function projectOf(chat) {
    return projects.find((p) => p.id === chat?.projectId) || null;
  }
  function projectContext(chat) {
    const p = projectOf(chat);
    if (!p) return "";
    return (
      `\n\nPROJECT: "${p.name}".` +
      (p.instructions
        ? `\nProject instructions from the user: ${p.instructions}`
        : "") +
      (p.memory
        ? `\nPROJECT MEMORY (remembered from earlier chats in this project; background context, not the user's latest message):\n${p.memory}`
        : "")
    );
  }
  async function updateProjectMemory(chat, reply) {
    const p = projectOf(chat),
      key = apiKey();
    if (!p || !key) return;
    const user =
      chat.messages[chat.messages.findIndex((m) => m.id === reply.id) - 1];
    if (!user) return;
    const prompt = `You maintain the long-term memory of a project. Update it using the latest exchange. Keep only durable facts, decisions, preferences, goals and key technical details that the USER stated or that were agreed. Never invent anything. Merge duplicates, drop outdated items. Use plain bullet points, at most 300 words. Output only the updated memory.\n\nCURRENT MEMORY:\n${p.memory || "(empty)"}\n\nLATEST USER MESSAGE:\n${user.text.slice(0, 4000)}\n\nLATEST ASSISTANT REPLY:\n${reply.text.slice(0, 4000)}`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName())}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
          }),
        },
      );
      if (!res.ok) return;
      const data = await res.json(),
        text = (data.candidates?.[0]?.content?.parts || [])
          .map((x) => x.text || "")
          .join("")
          .trim();
      if (text) {
        p.memory = text;
        persist();
      }
    } catch {}
  }
  function modalAsk({
    title,
    text = "",
    fields = [],
    ok = "Save",
    danger = false,
  }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "mini-modal";
      wrap.innerHTML = `<form class="mini-card"><h3>${escapeHTML(title)}</h3>${text ? `<p>${escapeHTML(text)}</p>` : ""}${fields.map((f, i) => `<label>${escapeHTML(f.label)}${f.multiline ? `<textarea rows="${f.rows || 5}" data-f="${i}"></textarea>` : `<input data-f="${i}" autocomplete="off">`}</label>`).join("")}<div class="mini-bar"><button type="button" data-x>Cancel</button><button type="submit" class="${danger ? "danger" : "primary"}">${escapeHTML(ok)}</button></div></form>`;
      (document.querySelector("dialog[open]") || document.body).appendChild(
        wrap,
      );
      const els = [...wrap.querySelectorAll("[data-f]")];
      els.forEach((el, i) => {
        el.value = fields[i].value || "";
      });
      const close = (v) => {
        wrap.remove();
        resolve(v);
      };
      wrap.addEventListener("click", (e) => {
        if (e.target === wrap || e.target.closest("[data-x]")) close(null);
      });
      wrap.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close(null);
        }
      });
      wrap.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        close(els.map((el) => el.value));
      });
      (els[0] || wrap.querySelector("button[type=submit]")).focus();
    });
  }
  function closePopup() {
    document.getElementById("popupMenu")?.remove();
  }
  function popupMenu(anchor, items) {
    closePopup();
    const m = document.createElement("div");
    m.className = "project-menu";
    m.id = "popupMenu";
    m.innerHTML = items
      .map(
        (it, i) =>
          `<button type="button" data-i="${i}"${it.danger ? ' class="danger"' : ""}>${escapeHTML(it.label)}</button>`,
      )
      .join("");
    const rc = anchor.getBoundingClientRect();
    m.style.top =
      Math.max(
        8,
        Math.min(rc.bottom + 4, window.innerHeight - items.length * 40 - 20),
      ) + "px";
    m.style.left =
      Math.max(8, Math.min(rc.left, window.innerWidth - 210)) + "px";
    m.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-i]");
      if (!b) return;
      closePopup();
      items[+b.dataset.i].fn();
    });
    document.body.appendChild(m);
  }
  document.addEventListener("click", closePopup);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });
  async function newProject() {
    const r = await modalAsk({
      title: "New project",
      fields: [
        { label: "Name" },
        {
          label: "Instructions (optional): how should J.E.M.I.D. behave here?",
          multiline: true,
          rows: 4,
        },
      ],
      ok: "Create",
    });
    if (!r || !r[0].trim()) return;
    const p = {
      id: uuid(),
      name: r[0].trim().slice(0, 60),
      instructions: r[1].trim(),
      memory: "",
      createdAt: now(),
    };
    projects.push(p);
    persist();
    createChat(p.id);
  }
  function projectMenu(id, anchor) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    popupMenu(anchor, [
      { label: "Rename", fn: () => projectEdit(p, "name") },
      { label: "Edit instructions", fn: () => projectEdit(p, "instructions") },
      { label: "View / edit memory", fn: () => projectEdit(p, "memory") },
      { label: "Delete project", danger: true, fn: () => projectDelete(p) },
    ]);
  }
  async function projectEdit(p, field) {
    const L = {
      name: "Rename project",
      instructions: "Project instructions",
      memory: "Project memory",
    };
    const r = await modalAsk({
      title: L[field],
      text:
        field === "memory"
          ? "Remembered from chats in this project. Edit or clear it."
          : "",
      fields: [
        {
          label: field === "name" ? "Name" : L[field],
          value: p[field],
          multiline: field !== "name",
          rows: 8,
        },
      ],
      ok: "Save",
    });
    if (!r || (field === "name" && !r[0].trim())) return;
    p[field] = field === "name" ? r[0].trim().slice(0, 60) : r[0].trim();
    persist();
    renderHistory($("#chatSearch").value);
  }
  async function projectDelete(p) {
    if (
      !(await modalAsk({
        title: "Delete project?",
        text: `"${p.name}" and its memory will be deleted. Its chats are kept.`,
        ok: "Delete project",
        danger: true,
      }))
    )
      return;
    projects = projects.filter((x) => x.id !== p.id);
    chats.forEach((c) => {
      if (c.projectId === p.id) c.projectId = null;
    });
    persist();
    renderHistory($("#chatSearch").value);
  }
  function moveChat(id, anchor) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    if (!projects.length) {
      toast("Create a project first with New project.", true);
      return;
    }
    const set = (pid, name) => {
      chat.projectId = pid;
      persist();
      renderHistory($("#chatSearch").value);
      toast(pid ? `Moved to ${name}.` : "Removed from project.");
    };
    const items = projects.map((p) => ({
      label: p.name,
      fn: () => set(p.id, p.name),
    }));
    if (chat.projectId)
      items.push({ label: "Remove from project", fn: () => set(null) });
    setTimeout(() => popupMenu(anchor, items), 0);
  }
  $input.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });
  $("#attachStrip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-att-remove]");
    if (b) {
      const [gone] = attachments.splice(+b.dataset.attRemove, 1);
      if (isBlobAtt(gone)) dropBlobs([gone.id]);
      renderAttachments();
      return;
    }
    const op = e.target.closest("[data-att-open]");
    if (op) openPreview(attachments.slice(), +op.dataset.attOpen);
  });
  $(".composer-box").addEventListener("dragover", (e) => e.preventDefault());
  $(".composer-box").addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) {
      e.preventDefault();
      addFiles([...e.dataTransfer.files]);
    }
  });
  $("#attachBtn").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.length) addFiles(files);
  });
  $("#newProjectBtn").addEventListener("click", newProject);
  $("#newChatBtn").addEventListener("click", () => createChat());
  $("#openSidebar").addEventListener("click", openSidebar);
  $("#closeSidebar").addEventListener("click", closeSidebar);
  $backdrop.addEventListener("click", closeSidebar);
  $("#settingsBtn").addEventListener("click", () =>
    showSettings("preferencesPanel"),
  );
  $("#quickApiBtn").addEventListener("click", () => showSettings("apiPanel"));
  $("#closeSettings").addEventListener("click", () => $dialog.close());
  $("#doneSettings").addEventListener("click", () => $dialog.close());
  $("#connectBtn").addEventListener("click", connectKey);
  $("#disconnectBtn").addEventListener("click", disconnectKey);
  $("#toggleKeyBtn").addEventListener("click", () => {
    const input = $("#apiKeyInput");
    input.type = input.type === "password" ? "text" : "password";
    $("#toggleKeyBtn").textContent =
      input.type === "password" ? "Show" : "Hide";
  });
  $("#modelSelect").addEventListener("change", (e) => {
    localStorage.setItem(STORAGE.model, e.target.value);
    updateModelUI();
  });
  $("#topModelBtn").addEventListener("click", () => showSettings("apiPanel"));
  $("#themeSelect").addEventListener("change", (e) => {
    localStorage.setItem(STORAGE.theme, e.target.value);
    document.body.classList.toggle("light", e.target.value === "light");
  });
  $("#languageSelect").addEventListener("change", (e) =>
    localStorage.setItem(STORAGE.language, e.target.value),
  );
  $("#clearAllBtn").addEventListener("click", clearAllChats);
  $$(".settings-tab").forEach((b) =>
    b.addEventListener("click", () => activateTab(b.dataset.tab)),
  );
  $$(".prompt-card").forEach((b) =>
    b.addEventListener("click", () => {
      $input.value = b.dataset.prompt;
      resizeInput();
      $input.focus();
    }),
  );
  $send.addEventListener("click", () => sendMessage());
  $stop.addEventListener("click", stopGeneration);
  $input.addEventListener("input", resizeInput);
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("#chatSearch").addEventListener("input", (e) =>
    renderHistory(e.target.value),
  );
  $history.addEventListener("click", (e) => {
    const pn = e.target.closest("[data-project-new]");
    if (pn) {
      e.stopPropagation();
      createChat(pn.dataset.projectNew);
      return;
    }
    const pm = e.target.closest("[data-project-menu]");
    if (pm) {
      e.stopPropagation();
      projectMenu(pm.dataset.projectMenu, pm);
      return;
    }
    const menu = e.target.closest("[data-chat-menu]");
    if (menu) {
      e.stopPropagation();
      const id = menu.dataset.chatMenu;
      popupMenu(menu, [
        { label: "Rename", fn: () => renameChat(id) },
        { label: "Move to project", fn: () => moveChat(id, menu) },
        { label: "Delete", danger: true, fn: () => deleteChat(id) },
      ]);
      return;
    }
    const item = e.target.closest("[data-chat-id]");
    if (!item) return;
    currentId = item.dataset.chatId;
    persist();
    renderChat();
    closeSidebar();
  });
  $history.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.matches("[data-chat-id]")
    ) {
      e.preventDefault();
      currentId = e.target.dataset.chatId;
      persist();
      renderChat();
      closeSidebar();
    }
  });
  $messages.addEventListener("click", async (e) => {
    const copyCode = e.target.closest("[data-copy-code]");
    if (copyCode) {
      try {
        await navigator.clipboard.writeText(
          decodeURIComponent(copyCode.dataset.copyCode),
        );
        toast("Code copied.");
      } catch {
        toast("Clipboard access failed.", true);
      }
      return;
    }
    const tab = e.target.closest(".code-tab");
    if (tab) {
      const wrap = tab.closest(".code-wrap"),
        pane = $(".preview-pane", wrap),
        pre = $("pre", wrap),
        show = tab.dataset.view === "preview";
      $$(".code-tab", wrap).forEach((t) =>
        t.classList.toggle("active", t === tab),
      );
      pre.hidden = show;
      pane.hidden = !show;
      pane.innerHTML = "";
      if (show) {
        const f = document.createElement("iframe");
        f.setAttribute("sandbox", "allow-scripts allow-forms allow-modals");
        f.title = "Live preview";
        f.srcdoc = decodeURIComponent($(".copy-code", wrap).dataset.copyCode);
        pane.appendChild(f);
      }
      return;
    }
    const button = e.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id,
      action = button.dataset.action,
      chat = currentChat();
    if (!chat) return;
    const message = chat.messages.find((m) => m.id === id);
    if (!message) return;
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(message.text);
        toast("Response copied.");
      } catch {
        toast("Clipboard access failed.", true);
      }
    }
    if (action === "regenerate" || action === "retry") await regenerate(id);
  });
  $messages.addEventListener("dblclick", (e) => {
    const row = e.target.closest(".user-row");
    if (row) editUserMessage(row.dataset.messageId);
  });
  // Dictation + two-way Voice Mode (browser speech recognition and speech synthesis).
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let voiceMode = false;
  let voiceTurnText = "";
  let voiceRestartTimer = null;
  const voicePanel = $("#voiceModePanel");
  const voiceModeBtn = $("#voiceModeBtn");
  const voiceTitle = $("#voiceModeTitle");
  const voiceStatus = $("#voiceModeStatus");
  // Mute: the browser's speech recognition gives no access to the audio stream, so "mute" pauses
  // listening completely (nothing is heard or sent) until the person un-mutes.
  let voiceMuted = false;
  let dictMuted = false;
  let dictActive = false; // dictation session is open (listening or muted)
  let dictBase = ""; // text that was in the box when dictation began
  const voiceMuteBtn = $("#voiceMuteBtn");
  function updateMuteUI() {
    const micBtn = $("#micBtn"),
      dictOn = !voiceMode && dictActive;
    micBtn.classList.toggle("dictating", dictOn);
    micBtn.classList.toggle("is-muted", dictOn && dictMuted);
    micBtn.title = !dictOn ? "Dictate message" : dictMuted ? "Unmute mic" : "Mute mic";
    micBtn.setAttribute("aria-label", micBtn.title);
    micBtn.setAttribute("aria-pressed", String(dictOn && dictMuted));
    voiceMuteBtn.classList.toggle("is-muted", voiceMuted);
    voiceMuteBtn.setAttribute("aria-pressed", String(voiceMuted));
    voiceMuteBtn.title = voiceMuted ? "Unmute mic" : "Mute mic";
    voiceMuteBtn.setAttribute("aria-label", voiceMuteBtn.title);
    voicePanel.classList.toggle("muted", voiceMuted);
  }
  function toggleDictMute() {
    if (!recognition || voiceMode || !dictActive) return;
    if (dictMuted) {
      dictMuted = false;
      updateMuteUI();
      beginDictListen();
    } else {
      dictMuted = true;
      try {
        recognition.stop();
      } catch {}
      updateMuteUI();
    }
  }
  // Dictation: stays open (like Claude) until the person taps ✓ (keep text) or ✕ (discard what was dictated).
  function beginDictListen(retry = 2) {
    try {
      recognition.continuous = true;
      recognition.lang = selectedSpeechLanguage();
      recognition.start();
    } catch {
      if (retry > 0)
        setTimeout(() => {
          if (dictActive && !dictMuted && !isListening && !voiceMode)
            beginDictListen(retry - 1);
        }, 400);
      else {
        dictActive = false;
        dictMuted = false;
        toast("Could not start microphone. Try again.", true);
        updateMuteUI();
      }
    }
  }
  function startDictation() {
    if (!recognition || dictActive) return;
    dictActive = true;
    dictMuted = false;
    dictBase = $input.value;
    updateMuteUI();
    beginDictListen();
  }
  function stopDictation(keep = true, graceful = true) {
    if (!dictActive) return;
    dictActive = false;
    dictMuted = false;
    try {
      // stop() still delivers the last words; abort() discards them
      if (graceful && keep) recognition.stop();
      else recognition.abort();
    } catch {}
    $input.value = keep
      ? $input.value.replace(/\s*\[listening…\]$/, "")
      : dictBase;
    resizeInput();
    updateMuteUI();
  }
  function setVoiceMuted(value) {
    voiceMuted = value;
    if (value) {
      clearTimeout(voiceRestartTimer);
      voiceTurnText = "";
      if (recognition && isListening) {
        try {
          recognition.abort();
        } catch {}
      }
      $("#voicePulse").classList.remove("listening");
      setVoiceStatus("Mic muted", "J.E.M.I.D. can't hear you. Tap Unmute to talk again.");
    } else {
      setVoiceStatus("Unmuting…", "Getting the microphone ready.");
      scheduleVoiceListening(200);
    }
    updateMuteUI();
  }

  function selectedSpeechLanguage() {
    const preference = localStorage.getItem(STORAGE.language) || "auto";
    if (preference === "hi") return "hi-IN";
    if (preference === "en") return "en-IN";
    return "hi-IN"; // Voice Mode defaults to Indian Hindi pronunciation unless English is explicitly selected.
  }
  function setVoiceStatus(title, detail) {
    if (voiceTitle) voiceTitle.textContent = title;
    if (voiceStatus) voiceStatus.textContent = detail;
  }
  function scheduleVoiceListening(delay = 500) {
    clearTimeout(voiceRestartTimer);
    if (
      !voiceMode ||
      voiceMuted ||
      isGenerating ||
      (window.speechSynthesis && speechSynthesis.speaking)
    )
      return;
    voiceRestartTimer = setTimeout(() => {
      if (!voiceMode || isGenerating || isListening) return;
      try {
        recognition.continuous = false;
        recognition.lang = selectedSpeechLanguage();
        recognition.start();
      } catch (error) {
        // The recognition service may still be closing its previous session.
        setVoiceStatus("Getting microphone ready…", "Please wait a moment.");
        scheduleVoiceListening(900);
      }
    }, delay);
  }
  function cleanForSpeech(text) {
    return (
      String(text || "")
        .replace(/```[\s\S]*?```/g, " Code block omitted. ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/[>*_~]/g, "")
        // Strip emoji pictographs, flags, skin-tone modifiers, selectors and joiners.
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}]/gu, "")
        .replace(/[\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu, "")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/\n{2,}/g, ". ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }
  function speakVoiceReply(text) {
    if (!voiceMode) return;
    if (
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setVoiceStatus(
        "Voice output unavailable",
        "This browser cannot speak responses. Try an updated Chrome browser.",
      );
      scheduleVoiceListening(1200);
      return;
    }
    const spoken = cleanForSpeech(text);
    if (!spoken) {
      scheduleVoiceListening(500);
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    const preference = localStorage.getItem(STORAGE.language) || "auto";
    const useHindiVoice = preference !== "en";
    utterance.lang = useHindiVoice ? "hi-IN" : "en-IN";
    // Select an installed Hindi voice explicitly; setting only utterance.lang can
    // leave Chrome using an English voice and an English-sounding pronunciation.
    const availableVoices = speechSynthesis.getVoices
      ? speechSynthesis.getVoices()
      : [];
    const preferredVoice = useHindiVoice
      ? availableVoices.find((v) => /^hi[-_]IN$/i.test(v.lang)) ||
        availableVoices.find((v) => /^hi[-_]/i.test(v.lang))
      : availableVoices.find((v) => /^en[-_]IN$/i.test(v.lang)) ||
        availableVoices.find((v) => /^en[-_]/i.test(v.lang));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = useHindiVoice ? 0.92 : 1;
    utterance.pitch = 1;
    utterance.onstart = () =>
      setVoiceStatus(
        "J.E.M.I.D. is speaking…",
        "You can listen. It will start listening again after the reply.",
      );
    utterance.onend = () => {
      if (voiceMode) {
        setVoiceStatus("Listening…", "Your turn. Speak naturally.");
        scheduleVoiceListening(450);
      }
    };
    utterance.onerror = () => {
      if (voiceMode) scheduleVoiceListening(700);
    };
    speechSynthesis.speak(utterance);
  }
  function stopVoiceMode() {
    voiceMode = false;
    voiceMuted = false;
    clearTimeout(voiceRestartTimer);
    voiceTurnText = "";
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch {}
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    isListening = false;
    voicePanel.hidden = true;
    voiceModeBtn.classList.remove("active");
    voiceModeBtn.innerHTML =
      '<span class="voice-mode-icon">◉</span><span>Voice</span>';
    updateMuteUI();
    toast("Voice mode ended.");
  }
  function startVoiceMode() {
    if (!recognition) {
      toast(
        "Voice recognition is not supported here. Use an updated Google Chrome browser.",
        true,
      );
      return;
    }
    if (!("speechSynthesis" in window)) {
      toast("Voice output is not supported in this browser.", true);
      return;
    }
    if (!apiKey()) {
      toast("First add your Gemini API key in Settings → API & Model.", true);
      showSettings("apiPanel");
      return;
    }
    if (dictActive) stopDictation(true, false);
    voiceMode = true;
    voiceMuted = false;
    updateMuteUI();
    voicePanel.hidden = false;
    voiceModeBtn.classList.add("active");
    voiceModeBtn.innerHTML =
      '<span class="voice-mode-icon">●</span><span>End voice</span>';
    setVoiceStatus(
      "Starting voice mode…",
      "Allow microphone access when your browser asks.",
    );
    scheduleVoiceListening(250);
  }
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = selectedSpeechLanguage();
    recognition.onstart = () => {
      isListening = true;
      updateMuteUI();
      if (voiceMode) {
        setVoiceStatus("Listening…", "Speak now. J.E.M.I.D. is listening.");
        $("#voicePulse").classList.add("listening");
      } else {
        $("#micBtn").classList.add("listening");
        $("#micBtn").setAttribute("aria-label", "Listening… click to stop");
      }
    };
    recognition.onresult = (event) => {
      let final = "",
        interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      if (voiceMode && voiceMuted) return;
      if (voiceMode) {
        if (final.trim())
          voiceTurnText += (voiceTurnText ? " " : "") + final.trim();
        if (interim.trim())
          setVoiceStatus("Listening…", `Hearing: ${interim.trim()}`);
      } else {
        const base = $input.value.replace(/\s*\[listening…\]$/, "");
        $input.value = (
          base +
          (base && final ? " " : "") +
          final +
          (interim ? " [listening…]" : "")
        ).trimStart();
        resizeInput();
      }
    };
    recognition.onerror = (event) => {
      isListening = false;
      if (
        dictActive &&
        event.error !== "no-speech" &&
        event.error !== "aborted"
      ) {
        dictActive = false;
        dictMuted = false;
      }
      updateMuteUI();
      $("#voicePulse").classList.remove("listening");
      $("#micBtn").classList.remove("listening");
      $("#micBtn").setAttribute("aria-label", "Start voice input");
      if (event.error !== "no-speech" && event.error !== "aborted") {
        if (
          voiceMode &&
          (event.error === "not-allowed" ||
            event.error === "service-not-allowed")
        ) {
          setVoiceStatus(
            "Microphone permission needed",
            "Allow microphone access in your browser, then start Voice again.",
          );
          voiceMode = false;
          voiceModeBtn.classList.remove("active");
          voiceModeBtn.innerHTML =
            '<span class="voice-mode-icon">◉</span><span>Voice</span>';
        } else toast(`Voice input error: ${event.error}`, true);
      }
      $input.value = $input.value.replace(/\s*\[listening…\]$/, "");
      resizeInput();
    };
    recognition.onend = () => {
      isListening = false;
      updateMuteUI();
      $("#voicePulse").classList.remove("listening");
      $("#micBtn").classList.remove("listening");
      $("#micBtn").setAttribute("aria-label", "Start voice input");
      $input.value = $input.value.replace(/\s*\[listening…\]$/, "");
      resizeInput();
      if (dictActive && !dictMuted && !voiceMode) {
        setTimeout(() => {
          if (dictActive && !dictMuted && !isListening && !voiceMode)
            beginDictListen();
        }, 300);
        return;
      }
      if (voiceMode && voiceMuted) {
        voiceTurnText = "";
        return;
      }
      if (voiceMode) {
        const spokenText = voiceTurnText.trim();
        voiceTurnText = "";
        if (spokenText) {
          setVoiceStatus(
            "J.E.M.I.D. is thinking…",
            "Preparing your spoken reply.",
          );
          sendMessage(spokenText);
        } else scheduleVoiceListening(650);
      }
    };
  } else {
    $("#micBtn").style.display = "none";
    voiceMuteBtn.disabled = true;
    voiceModeBtn.disabled = true;
    voiceModeBtn.title = "Voice recognition is not supported in this browser";
  }
  $("#micBtn").addEventListener("click", () => {
    if (!recognition) {
      toast("Voice input is not supported in this browser.", true);
      return;
    }
    if (voiceMode) {
      stopVoiceMode();
      return;
    }
    if (dictActive) toggleDictMute();
    else startDictation();
  });
  voiceModeBtn.addEventListener("click", () =>
    voiceMode ? stopVoiceMode() : startVoiceMode(),
  );
  $("#endVoiceModeBtn").addEventListener("click", stopVoiceMode);
  voiceMuteBtn.addEventListener("click", () => {
    if (voiceMode) setVoiceMuted(!voiceMuted);
  });
  updateMuteUI();

  function checkScroll() {
    const btn = $("#scrollBottomBtn");
    if (!btn) return;
    const atBottom =
      $scroll.scrollHeight - $scroll.scrollTop - $scroll.clientHeight < 80;
    btn.hidden = atBottom;
  }
  $scroll.addEventListener("scroll", checkScroll);
  $("#scrollBottomBtn").addEventListener("click", () => {
    $scroll.scrollTop = $scroll.scrollHeight;
    $("#scrollBottomBtn").hidden = true;
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const search = $("#chatSearch");
      if (window.matchMedia("(min-width:721px)").matches) {
        // sidebar collapsed to icons on desktop: expand it first
        if (document.querySelector(".app-shell")?.classList.contains("min"))
          document.querySelector(".search-box")?.click();
      } else openSidebar();
      setTimeout(() => {
        search.focus();
        search.select();
      }, 0);
    }
    if (e.key === "Escape") {
      if (dictActive) stopDictation(true, true);
      closeSidebar();
    }
  });
  $dialog.addEventListener("click", (e) => {
    if (e.target === $dialog) $dialog.close();
  });

  // Initialize persisted preferences and history.
  document.body.classList.toggle(
    "light",
    (localStorage.getItem(STORAGE.theme) || "dark") === "light",
  );
  $("#themeSelect").value = localStorage.getItem(STORAGE.theme) || "dark";
  $("#languageSelect").value = localStorage.getItem(STORAGE.language) || "auto";
  updateModelUI();
  updateKeyUI();
  if (!chats.length) createChat();
  else {
    if (!currentId || !chats.some((c) => c.id === currentId))
      currentId = chats[0].id;
    persist();
    renderChat();
  }
  renderHistory();
})();

/* show the logged-in @jen.com user in the sidebar (photo, full name, address); clicking it opens the JEN account menu */
(() => {
  const A = window.JENAuth;
  if (!A) return;
  const row = document.getElementById("profileRow");
  if (!row) return;
  const paint = () => {
    const u = A.user();
    if (!u) return;
    const av = document.getElementById("userAvatar");
    av.style.backgroundImage = u.avatar
      ? "url(" + JSON.stringify(u.avatar) + ")"
      : "";
    av.textContent = u.avatar
      ? ""
      : ((u.name || u.username).trim()[0] || "?").toUpperCase();
    document.getElementById("userName").textContent = u.name;
    document.getElementById("userAddr").textContent = u.email;
    document.getElementById("ownerBadge").hidden =
      u.email !== "jeeshan@jen.com";
  };
  /* the theme chosen in the account menu is the same theme as J.E.M.I.D. Settings */
  A.hooks({
    getTheme: () => localStorage.getItem("javelin_theme_v1") || "dark",
    setTheme: (t) => {
      localStorage.setItem("javelin_theme_v1", t);
      document.body.classList.toggle("light", t === "light");
      const sel = document.getElementById("themeSelect");
      if (sel) sel.value = t;
    },
  });
  const open = (e) => {
    e.stopPropagation();
    A.openMenu(row);
  };
  row.addEventListener("click", open);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(e);
    }
  });
  window.addEventListener("jen-auth", paint);
  paint();
})();

/* collapse / expand the sidebar (desktop): click the name at the top-left */
(() => {
  const shell = document.querySelector(".app-shell"),
    row = document.getElementById("brandRow");
  if (!shell || !row) return;
  const desk = () => window.matchMedia("(min-width:721px)").matches;
  const set = (m) => {
    shell.classList.toggle("min", m);
    row.setAttribute("aria-expanded", String(!m));
    row.setAttribute("aria-label", m ? "Expand sidebar" : "Collapse sidebar");
    try {
      localStorage.setItem("javelin_sidebar_min", m ? "1" : "0");
    } catch (e) {}
  };
  const toggle = () => {
    if (desk()) set(!shell.classList.contains("min"));
  };
  set(localStorage.getItem("javelin_sidebar_min") === "1");
  row.addEventListener("click", (e) => {
    if (!e.target.closest(".sidebar-close")) toggle();
  });
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  const sb = document.querySelector(".search-box");
  if (sb)
    sb.addEventListener("click", () => {
      if (desk() && shell.classList.contains("min")) {
        set(false);
        document.getElementById("chatSearch").focus();
      }
    });
})();
