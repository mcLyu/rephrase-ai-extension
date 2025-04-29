// === content.js для OpenRouter.ai с улучшенным промптом ===

const DEFAULT_API_KEY = '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';
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
    let userText, selection = '', fullText;

    if (input.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        selection = sel.toString();
        fullText = input.innerText;
        userText = selection.trim();
      } else {
        userText = input.innerText.trim();
      }
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
      const apiKey = result.apiKey || DEFAULT_API_KEY;
      const rephraseStyle = result.rephraseStyle || 'original';
      const customStyle = result.customStyle;
      const locale = result.userLocale || 'en';

      const getText = key => chrome.i18n.getMessage(`${key}_${locale}`) || chrome.i18n.getMessage(key);

      let styleLocalized;
      switch (rephraseStyle) {
        case 'polite': styleLocalized = getText('stylePolite'); break;
        case 'concise': styleLocalized = getText('styleConcise'); break;
        case 'formal': styleLocalized = getText('styleFormal'); break;
        case 'friendly': styleLocalized = getText('styleFriendly'); break;
        case 'custom': styleLocalized = customStyle || getText('styleCustom'); break;
        case 'original':
        default:
          styleLocalized = getText('styleOriginal'); break;
      }

		const prompts = {
		  en: (style, text) => `Rephrase the following text in "${style}" style. Do not translate the language or change its meaning. Do not add any comments, explanations, or alternatives. Only return the rephrased text:\n\n${text}`,
		  ru: (style, text) => `Перефразируй следующий текст, изменяя только стиль на "${style}". Запрещено изменять язык текста или его смысл. Также запрещено добавлять вступления, пояснения, варианты или комментарии. Ответ должен содержать только изменённый текст на том же языке:\n\n${text}`,
		  es: (style, text) => `Reformula el siguiente texto usando el estilo "${style}". No traduzcas el idioma ni cambies el significado. No agregues comentarios, explicaciones ni alternativas. Devuelve solo el texto reformulado:\n\n${text}`
		};

      const prompt = (prompts[locale] || prompts['en'])(styleLocalized, userText);

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': HTTP_REFERER
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat-v3-0324:free',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      };

      fetch('https://openrouter.ai/api/v1/chat/completions', requestOptions)
        .then(res => res.json())
        .then(data => {
          const newText = data.choices?.[0]?.message?.content;
          if (!newText) return;

          if (input.isContentEditable) {
            input.focus();
            if (selection) {
              document.execCommand('insertText', false, newText);
            } else {
              document.execCommand('selectAll', false, null);
              document.execCommand('delete', false, null);
              document.execCommand('insertText', false, newText);
            }
          } else {
            if (selection) {
              const start = input.selectionStart;
              const end = input.selectionEnd;
              input.value = fullText.slice(0, start) + newText + fullText.slice(end);
            } else {
              input.value = newText;
            }
          }
        })
        .catch(err => {
          console.error('Ошибка обращения к OpenRouter API:', err);
          alert('Ошибка обращения к AI-сервису. Возможно, исчерпан лимит или неверный ключ.');
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
