// AI Workspace Chat — app.js (vanilla JS, ES modules)

const chatMessages = document.getElementById('chat-messages');
const emptyState = document.getElementById('empty-state');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.querySelector('.stop-btn');
const timerEl = document.querySelector('.timer');
const modelSheet = document.getElementById('model-sheet');
const modelSheetBackdrop = document.getElementById('model-sheet-backdrop');
const modelSelectorBtn = document.getElementById('model-selector-btn');

// ── State ──────────────────────────────────────────────────────────────────────
let messages = [];
let selectedModel = 'auto';
let selectedProvider = 'local';
let currentController = null;
let timerInterval = null;
let timerStart = 0;
let autoScroll = true;

// ── Initialization ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await fetchStatus();
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    console.log('[status]', data);
  } catch (err) {
    console.warn('Failed to fetch status:', err);
  }
}

// ── Event bindings ─────────────────────────────────────────────────────────────
function bindEvents() {
  // Send
  sendBtn.addEventListener('click', handleSend);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea & enable/disable send button
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    sendBtn.disabled = !messageInput.value.trim();
  });

  // Stop button
  stopBtn.addEventListener('click', handleStop);

  // Model selector
  modelSelectorBtn.addEventListener('click', toggleModelSheet);
  modelSheetBackdrop.addEventListener('click', closeModelSheet);

  document.querySelectorAll('.model-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const value = opt.dataset.value;
      selectedModel = value;
      selectedProvider = value === 'mimo' ? 'mimo' : 'local';
      
      // Update button text
      const labelEl = document.getElementById('current-model-label');
      if (labelEl) {
        const nameEl = opt.querySelector('.model-option-name');
        labelEl.textContent = nameEl ? nameEl.textContent.trim() : opt.textContent.trim();
      }
      
      // Mark selected
      document.querySelectorAll('.model-option').forEach((o) => {
        o.classList.remove('selected');
        o.setAttribute('aria-selected', 'false');
      });
      opt.classList.add('selected');
      opt.setAttribute('aria-selected', 'true');
      
      closeModelSheet();
    });
  });

  // Suggestion chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      messageInput.value = chip.dataset.prompt || chip.textContent.trim();
      messageInput.focus();
      messageInput.dispatchEvent(new Event('input'));
    });
  });

  // Auto-scroll detection
  chatMessages.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = chatMessages;
    autoScroll = scrollHeight - scrollTop - clientHeight < 100;
  });
}

// ── Model sheet ────────────────────────────────────────────────────────────────
function toggleModelSheet() {
  const active = modelSheet.classList.toggle('active');
  modelSheetBackdrop.classList.toggle('active', active);
}

function closeModelSheet() {
  modelSheet.classList.remove('active');
  modelSheetBackdrop.classList.remove('active');
}

// ── Send message ───────────────────────────────────────────────────────────────
async function handleSend() {
  const text = messageInput.value.trim();
  if (!text) return;

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';
  document.body.classList.add('has-messages');

  // Clear input & disable button
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Add user message
  const userMsg = { role: 'user', content: text, model: null, provider: null, timestamp: Date.now() };
  messages.push(userMsg);
  appendMessageBubble(userMsg);

  // Show typing indicator
  const typingEl = createTypingIndicator();
  chatMessages.appendChild(typingEl);
  scrollToBottom();

  // Start timer
  startTimer();

  // Add generating class to body
  document.body.classList.add('generating');

  // Prepare history (last 10 messages)
  const history = messages.slice(-10).map(({ role, content }) => ({ role, content }));

  // Abort controller
  currentController = new AbortController();

  let modelBubble = null;
  let modelContent = '';
  let finalModel = selectedModel;
  let finalProvider = selectedProvider;

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: text,
        provider: selectedProvider,
        model: selectedModel,
        history,
      }),
      signal: currentController.signal,
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        let chunk;
        try {
          chunk = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (chunk.error) {
          if (modelBubble) {
            modelBubble.querySelector('.message-content').textContent = `Error: ${chunk.error}`;
          } else {
            const errBubble = createMessageEl('model', `Error: ${chunk.error}`);
            chatMessages.appendChild(errBubble);
          }
          finalize(typingEl);
          return;
        }

        if (chunk.model) finalModel = chunk.model;
        if (chunk.provider) finalProvider = chunk.provider;

        if (chunk.token) {
          if (!modelBubble) {
            modelBubble = createMessageEl('model', '');
            chatMessages.appendChild(modelBubble);
          }
          modelContent += chunk.token;
          modelBubble.querySelector('.message-content').textContent = modelContent;
          scrollToBottom();
        }

        if (chunk.done) {
          // Render markdown in final message
          if (modelBubble) {
            modelBubble.querySelector('.message-content').innerHTML = renderMarkdown(modelContent);
            
            // Add/update model tag
            const tagEl = modelBubble.querySelector('.message-tag');
            const labelEl = modelBubble.querySelector('.model-label');
            const dotEl = modelBubble.querySelector('.model-dot');
            if (tagEl && labelEl) {
              tagEl.style.display = 'inline-flex';
              let text = `${finalModel} · ${finalProvider}`;
              if (chunk.eval_rate) {
                text += ` · ${chunk.eval_rate.toFixed(1)} tok/s`;
              }
              labelEl.textContent = text;
              if (dotEl) {
                dotEl.style.background = finalProvider === 'local' ? '#22c55e' : 'var(--color-accent-start)';
              }
            }
            bindCopyButtons(modelBubble);
          }

          // Save to history
          messages.push({
            role: 'assistant',
            content: modelContent,
            model: finalModel,
            provider: finalProvider,
            timestamp: Date.now(),
          });

          finalize(typingEl);
          return;
        }
      }
    }

    // Stream ended without done flag — finalize anyway
    if (modelBubble && modelContent) {
      modelBubble.querySelector('.message-content').innerHTML = renderMarkdown(modelContent);
      messages.push({
        role: 'assistant',
        content: modelContent,
        model: finalModel,
        provider: finalProvider,
        timestamp: Date.now(),
      });
    }
    finalize(typingEl);
  } catch (err) {
    if (err.name === 'AbortError') {
      // User stopped generation
      if (modelBubble && modelContent) {
        modelBubble.querySelector('.message-content').innerHTML = renderMarkdown(modelContent);
        const tagEl = modelBubble.querySelector('.message-tag');
        const labelEl = modelBubble.querySelector('.model-label');
        if (tagEl && labelEl) {
          tagEl.style.display = 'inline-flex';
          labelEl.textContent = `${finalModel} · parado`;
        }
        bindCopyButtons(modelBubble);
        messages.push({
          role: 'assistant',
          content: modelContent,
          model: finalModel,
          provider: finalProvider,
          timestamp: Date.now(),
        });
      }
    } else {
      console.error('Send error:', err);
      const errBubble = createMessageEl('model', `Error: ${err.message}`);
      const tagEl = errBubble.querySelector('.message-tag');
      if (tagEl) tagEl.style.display = 'none';
      chatMessages.appendChild(errBubble);
    }
    finalize(typingEl);
  }
}

// ── Stop ───────────────────────────────────────────────────────────────────────
async function handleStop() {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  try {
    await fetch('/api/stop', { method: 'POST' });
  } catch {
    // ignore
  }
}

// ── Finalize ───────────────────────────────────────────────────────────────────
function finalize(typingEl) {
  if (typingEl && typingEl.parentNode) typingEl.remove();
  stopTimer();
  document.body.classList.remove('generating');
  currentController = null;
  scrollToBottom();
}

// ── Timer ──────────────────────────────────────────────────────────────────────
function startTimer() {
  timerStart = Date.now();
  timerEl.textContent = '0s';
  timerEl.style.display = 'inline';
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    if (elapsed < 60) {
      timerEl.textContent = `${elapsed}s`;
    } else {
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      timerEl.textContent = `${m}m ${s}s`;
    }
  }, 100);
}

// ── Stop Timer ─────────────────────────────────────────────────────────────────
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ── DOM helpers ────────────────────────────────────────────────────────────────
function appendMessageBubble(msg) {
  const el = createMessageEl(msg.role === 'user' ? 'user' : 'model', msg.content);
  chatMessages.appendChild(el);
  scrollToBottom();
}

function createMessageEl(type, content) {
  const template = document.getElementById('message-template');
  const clone = template.content.cloneNode(true);
  
  const article = clone.querySelector('.message');
  article.classList.add(type);
  
  const contentEl = clone.querySelector('.message-content');
  contentEl.textContent = content;
  
  const tagEl = clone.querySelector('.message-tag');
  if (type === 'user' && tagEl) {
    tagEl.style.display = 'none';
  } else if (type === 'model' && tagEl) {
    tagEl.style.display = 'none'; // oculto até carregar o primeiro token
  }
  
  return article;
}

function createTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.innerHTML = `
    <div class="typing-indicator-inner">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  return el;
}

function scrollToBottom() {
  if (!autoScroll) return;
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ── Markdown rendering ─────────────────────────────────────────────────────────
function renderMarkdown(text) {
  // Step 1 — extract code blocks and replace with placeholders
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang, code: code.replace(/\n$/, '') });
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Step 2 — inline transforms (line by line outside code blocks)
  let html = text
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\"/g, '<strong>$1</strong>') // corrigido para fechar com asteriscos
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic (not inside words)
    .replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Step 3 — restore code blocks
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, idx) => {
    const { lang, code } = codeBlocks[Number(idx)];
    const escaped = escapeHtml(code);
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return (
      `<div class="code-block">` +
      `<div class="code-block-header">${langLabel}<button class="code-copy-btn" title="Copiar" type="button">` +
      `<svg class="copy-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/><path d="M9.5 4.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v5A1.5 1.5 0 003 9.5h1.5"/></svg>` +
      `</button></div>` +
      `<pre><code>${escaped}</code></pre>` +
      `</div>`
    );
  });

  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Copy button logic ──────────────────────────────────────────────────────────
function bindCopyButtons(container) {
  container.querySelectorAll('.code-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const codeEl = btn.closest('.code-block').querySelector('code');
      const code = codeEl.textContent;
      navigator.clipboard.writeText(code).then(() => {
        const origHTML = btn.innerHTML;
        btn.innerHTML = `<svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = origHTML;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}
