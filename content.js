function insertTextAndTriggerInput(el, text) {
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);
  if (el.innerText !== text) el.innerText = text;
  ['input', 'change'].forEach(type =>
    el.dispatchEvent(new Event(type, { bubbles: true }))
  );
}

const shimmerStyle = document.createElement('style');
shimmerStyle.textContent = `
/* === Вставляется в DOM один раз === */
.gpt-loading {
  position: relative;
  color: transparent !important;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
  border-radius: 4px;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;
document.head.appendChild(shimmerStyle);

const HTTP_REFERER = 'chrome://extensions/?id=fldiehcdfjlgpgjppapcpgiopmkdpggd';

function isVisible(el) {
  return el && el.offsetWidth > 0 && el.offsetHeight > 0;
}

function injectButtonIntoInput(input) {
  if (input.dataset.gptAdded) return;
  if (!isVisible(input)) return;
  input.dataset.gptAdded = 'true';

  const btn = document.createElement('img');
  btn.src = chrome.runtime.getURL('rephrase-icon.png');
  btn.title = chrome.i18n.getMessage('rephraseButtonTitle');
  btn.className = 'gpt-rephrase-btn';
  Object.assign(btn.style, {
    width: '20px', height: '20px', position: 'absolute', top: '6px', right: '6px',
    cursor: 'pointer', zIndex: '9999', border: 'none', borderRadius: '4px', background: '#fff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)', objectFit: 'contain', transition: 'transform 0.2s ease'
  });
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.2)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

  const parent = input.parentElement;
  if (parent) {
    if (!['relative', 'absolute', 'fixed'].includes(parent.style.position)) {
      parent.style.position = 'relative';
    }
    parent.appendChild(btn);
  }

  btn.addEventListener('click', () => {
    let userText = '', selection = '', fullText = '', range = null;

    if (input.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        range = sel.getRangeAt(0).cloneRange();
        selection = sel.toString();
        userText = selection.trim();
      } else {
        userText = input.innerText.trim();
      }
      fullText = input.innerText;
    } else {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      fullText = input.value;
      if (start !== end) {
        selection = input.value.substring(start, end);
        userText = selection.trim();
      } else {
        userText = input.value.trim();
      }
    }

    if (!userText) return;

    chrome.storage.local.get(['apiKey', 'rephraseStyle', 'customStyle', 'userLocale'], (result) => {
      const apiKey = result.apiKey;
      if (!apiKey) {
        alert('API key not found. Please configure it.');
        return;
      }

      const rephraseStyle = result.rephraseStyle || 'original';
      const locale = result.userLocale || 'en';

      const prompts = {
        en: (styleLocalized, text) => [
          {
            role: "system",
            content: `You are an assistant that rephrases text in the "${styleLocalized}" style in English, without changing its language or meaning. Return exactly one rephrased version of the input. Do not provide alternatives, suggestions, lists, or multiple options. Do not explain anything or use formatting like markdown.`
          },
          {
            role: "user",
            content: text
          }
        ],
        ru: (styleLocalized, text) => [
          {
            role: "system",
            content: `Ты — помощник, который перефразирует текст в стиле "${styleLocalized}" на русском языке. Нельзя менять язык или смысл текста. Верни строго одну перефразированную версию. Не предлагай альтернатив, синонимов, списков или нескольких вариантов. Не давай пояснений и не используй форматирование (например, markdown).`
          },
          {
            role: "user",
            content: text
          }
        ],
        es: (styleLocalized, text) => [
          {
            role: "system",
            content: `Eres un asistente que reformula texto con el estilo "${styleLocalized}" en español, sin cambiar el idioma ni el significado. Devuelve exactamente una sola versión reformulada. No ofrezcas alternativas, sinónimos, listas ni múltiples opciones. No expliques nada ni uses formato como markdown.`
          },
          {
            role: "user",
            content: text
          }
        ]
      };

      function detectLanguage(text) {
        if (/[Ѐ-ӿ]/.test(text)) return 'ru';
        if (/\b(el|la|los|las|de|y|que|un|una|para)\b/i.test(text)) return 'es';
        if (/^[a-zA-Z\s.,!?'"-]+$/.test(text)) return 'en';
        return null;
      }

      const detectedLang = detectLanguage(userText);
      const promptLocale = detectedLang || locale;

      const styleTranslations = {
        original: { en: "original", ru: "оригинальный", es: "original" },
        formal: { en: "formal", ru: "формальный", es: "formal" },
        friendly: { en: "friendly", ru: "дружелюбный", es: "amistoso" },
        concise: { en: "concise", ru: "краткий", es: "conciso" },
        polite: { en: "polite", ru: "вежливый", es: "educado" },
        custom: { en: "custom", ru: "пользовательский", es: "personalizado" }
      };

      const styleLocalized = rephraseStyle === 'custom'
        ? result.customStyle
        : styleTranslations[rephraseStyle]?.[promptLocale] || rephraseStyle;

      const messages = (prompts[promptLocale] || prompts['en'])(styleLocalized, userText);

      // Show shimmer
      input.classList.add('gpt-loading');
      if (!input.isContentEditable) input.setAttribute('readonly', true);

      const modelByLocale = {
        en: 'mistralai/mistral-7b-instruct:free',
        ru: 'deepseek/deepseek-chat-v3-0324:free',
        es: 'deepseek/deepseek-chat-v3-0324:free'
      };

      const selectedModel = modelByLocale[promptLocale] || 'deepseek/deepseek-chat-v3-0324:free';

      function callOpenRouter(apiKey, model, messages, timeoutMs = 15000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        return fetch('https://openai-proxy.wolf1601.workers.dev', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Key': apiKey
          },
          body: JSON.stringify({ model, messages }),
          signal: controller.signal
        })
        .then(res => res.json().then(data => ({ status: res.status, body: data })))
        .finally(() => clearTimeout(timeout));
      }

      callOpenRouter(apiKey, selectedModel, messages)
        .then(({ status, body }) => {
          if (!body || !body.choices?.[0]?.message?.content) throw new Error('No valid response');
          return body.choices[0].message.content.trimStart();
        })
        .then(newText => {
          input.classList.remove('gpt-loading');
          if (!input.isContentEditable) input.removeAttribute('readonly');
          if (!newText) return;

          if (input.isContentEditable) {
            input.focus();
            if (range) {
              range.deleteContents();
              range.insertNode(document.createTextNode(newText));
            } else {
              insertTextAndTriggerInput(input, newText);
            }
          } else {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            if (start !== end) {
              input.value = fullText.slice(0, start) + newText + fullText.slice(end);
            } else {
              input.value = newText;
            }
          }
        })
        .catch(err => {
          input.classList.remove('gpt-loading');
          if (!input.isContentEditable) input.removeAttribute('readonly');
          console.error('Fetch error:', err);
          alert('Failed to contact AI service.');
        });
    });
  });
}

function scanAndInject() {
  const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
  inputs.forEach(input => {
    if (!input.dataset.gptAdded && isVisible(input)) {
      injectButtonIntoInput(input);
    }
  });
}

scanAndInject();

let scheduled = false;
const observer = new MutationObserver(() => {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(() => {
      scanAndInject();
      scheduled = false;
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('focusin', scanAndInject);
