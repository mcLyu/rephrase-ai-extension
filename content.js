// ============================================================================
// PERFORMANCE OPTIMIZATIONS & CORNER CASE FIXES
// ============================================================================

// WeakMap to track input elements and their metadata
const inputMetadata = new WeakMap();
// WeakMap to track button references for cleanup
const buttonReferences = new WeakMap();
// Map to track active API requests per input (for deduplication)
const activeRequests = new WeakMap();

// Extension state
let isExtensionEnabled = true;

// Constants
const DEBOUNCE_DELAY = 150; // ms
const API_TIMEOUT = 15000; // ms
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000; // ms

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function insertTextAndTriggerInput(el, text) {
  el.focus();

  // Use modern approaches first, fallback to execCommand
  if (el.isContentEditable) {
    // For contenteditable, use textContent to avoid innerHTML issues
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    } else {
      el.textContent = text;
    }
  } else {
    // For textarea/input
    el.value = text;
  }

  // Trigger events for framework compatibility (React, Vue, etc.)
  ['input', 'change', 'blur'].forEach(type =>
    el.dispatchEvent(new Event(type, { bubbles: true }))
  );
}

const shimmerStyle = document.createElement('style');
shimmerStyle.textContent = `
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
.gpt-button-wrapper {
  position: absolute;
  pointer-events: none;
  z-index: 999999;
}
.gpt-button-wrapper > img {
  pointer-events: auto;
}
`;
document.head.appendChild(shimmerStyle);

const HTTP_REFERER = 'chrome://extensions/?id=fldiehcdfjlgpgjppapcpgiopmkdpggd';

// Enhanced visibility check
function isVisible(el) {
  if (!el || !el.offsetParent) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         el.offsetWidth > 0 &&
         el.offsetHeight > 0;
}

// Check if input should be processed (exclude password, hidden, etc.)
function isValidInput(input) {
  if (!input) return false;

  // Skip password inputs
  if (input.type === 'password') return false;

  // Skip hidden inputs
  if (input.type === 'hidden') return false;

  // Skip if already marked as processed
  if (inputMetadata.has(input)) return false;

  // Check minimum size (too small inputs are likely not for text editing)
  const rect = input.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 20) return false;

  return true;
}

// Update button position (for dynamic layouts)
function updateButtonPosition(input, wrapper) {
  if (!input || !wrapper || !document.body.contains(input)) {
    return;
  }

  const rect = input.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  wrapper.style.top = `${rect.top + scrollTop + 6}px`;
  wrapper.style.left = `${rect.left + scrollLeft + rect.width - 26}px`;
}

// Cleanup button and metadata when input is removed
function cleanupInput(input) {
  const wrapper = buttonReferences.get(input);
  if (wrapper && wrapper.parentNode) {
    wrapper.parentNode.removeChild(wrapper);
  }

  // Abort any active request
  const controller = activeRequests.get(input);
  if (controller) {
    controller.abort();
    activeRequests.delete(input);
  }

  buttonReferences.delete(input);
  inputMetadata.delete(input);

  // Remove marker
  delete input.dataset.gptAdded;
}

function injectButtonIntoInput(input) {
  // Skip if already processed
  if (input.dataset.gptAdded) return;
  if (!isVisible(input)) return;
  if (!isValidInput(input)) return;

  input.dataset.gptAdded = 'true';

  // Create button wrapper (doesn't modify parent position)
  const wrapper = document.createElement('div');
  wrapper.className = 'gpt-button-wrapper';

  const btn = document.createElement('img');
  btn.src = chrome.runtime.getURL('rephrase-icon.png');
  btn.title = chrome.i18n.getMessage('rephraseButtonTitle');
  btn.className = 'gpt-rephrase-btn';
  Object.assign(btn.style, {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '4px',
    background: '#fff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    objectFit: 'contain',
    transition: 'transform 0.2s ease',
    display: 'block'
  });

  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.2)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

  wrapper.appendChild(btn);
  document.body.appendChild(wrapper);

  // Store references
  buttonReferences.set(input, wrapper);
  inputMetadata.set(input, {
    element: input,
    wrapper: wrapper,
    button: btn
  });

  // Position the button
  updateButtonPosition(input, wrapper);

  // Update position on scroll/resize
  const updatePosition = debounce(() => updateButtonPosition(input, wrapper), 100);
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);

  // Store cleanup handlers
  inputMetadata.get(input).cleanup = () => {
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
  };

  btn.addEventListener('click', () => handleRephraseClick(input));
}

// Main rephrase handler with deduplication and retry logic
function handleRephraseClick(input) {
  // Prevent concurrent requests for the same input
  if (activeRequests.has(input)) {
    console.log('Request already in progress for this input');
    return;
  }

  // Check if input still exists in DOM
  if (!document.body.contains(input)) {
    cleanupInput(input);
    return;
  }

  let userText = '', selection = '', fullText = '', range = null;
  let selectionStart = 0, selectionEnd = 0;
  let hasSelection = false; // Track if user selected specific text

  // Extract text based on input type
  if (input.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
      try {
        range = sel.getRangeAt(0).cloneRange();
        selection = sel.toString();
        userText = selection.trim();
        hasSelection = true;
      } catch (e) {
        console.error('Error cloning range:', e);
        userText = input.innerText.trim();
        hasSelection = false;
      }
    } else {
      userText = input.innerText.trim();
      hasSelection = false;
    }
    fullText = input.innerText;
  } else {
    selectionStart = input.selectionStart || 0;
    selectionEnd = input.selectionEnd || 0;
    fullText = input.value;
    if (selectionStart !== selectionEnd) {
      selection = input.value.substring(selectionStart, selectionEnd);
      userText = selection.trim();
      hasSelection = true;
    } else {
      userText = input.value.trim();
      hasSelection = false;
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

    // Store original readonly state
    const wasReadonly = input.hasAttribute('readonly') || input.readOnly;

    // Show loading state
    input.classList.add('gpt-loading');
    if (!input.isContentEditable && !wasReadonly) {
      input.setAttribute('readonly', true);
    }

    // Using google/gemini-2.0-flash-001 - most popular for translation/rephrasing on OpenRouter
    const selectedModel = 'google/gemini-2.0-flash-001';

    // API call with retry logic
    function callOpenRouterWithRetry(apiKey, model, messages, attempt = 0) {
      const controller = new AbortController();
      activeRequests.set(input, controller);

      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

      return fetch('https://openai-proxy.wolf1601.workers.dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Key': apiKey
        },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal
      })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json().then(data => ({ status: res.status, body: data }));
      })
      .finally(() => {
        clearTimeout(timeout);
        activeRequests.delete(input);
      })
      .catch(err => {
        // Retry logic
        if (attempt < RETRY_ATTEMPTS && err.name !== 'AbortError') {
          console.log(`Retrying... attempt ${attempt + 1}`);
          return new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)))
            .then(() => callOpenRouterWithRetry(apiKey, model, messages, attempt + 1));
        }
        throw err;
      });
    }

    callOpenRouterWithRetry(apiKey, selectedModel, messages)
      .then(({ status, body }) => {
        if (!body || !body.choices?.[0]?.message?.content) {
          throw new Error('No valid response from API');
        }
        return body.choices[0].message.content.trim();
      })
      .then(newText => {
        // Check if input still exists
        if (!document.body.contains(input)) {
          return;
        }

        // Remove loading state
        input.classList.remove('gpt-loading');
        if (!input.isContentEditable && !wasReadonly) {
          input.removeAttribute('readonly');
        }

        if (!newText) return;

        // Insert rephrased text
        if (input.isContentEditable) {
          input.focus();
          if (hasSelection && range && document.body.contains(range.startContainer)) {
            // User selected specific text, replace only that selection
            try {
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              range.deleteContents();
              range.insertNode(document.createTextNode(newText));
            } catch (e) {
              console.error('Error inserting text with range:', e);
              input.textContent = newText;
            }
          } else {
            // No selection, replace entire content
            // Use document.execCommand for better compatibility with LinkedIn/complex editors
            input.focus();

            // Select all content
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            sel.removeAllRanges();
            sel.addRange(range);

            // Try modern approach first
            if (document.execCommand) {
              document.execCommand('insertText', false, newText);
            } else {
              // Fallback for browsers without execCommand
              range.deleteContents();
              range.insertNode(document.createTextNode(newText));
            }

            // Trigger events for framework compatibility (LinkedIn needs these)
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.blur();
            input.focus();
          }
        } else {
          if (hasSelection) {
            // User selected specific text, replace only that selection
            input.value = fullText.slice(0, selectionStart) + newText + fullText.slice(selectionEnd);
            // Set cursor at end of inserted text
            input.selectionStart = input.selectionEnd = selectionStart + newText.length;
          } else {
            // No selection, replace entire content
            input.value = newText;
          }
          // Trigger input event for frameworks
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })
      .catch(err => {
        // Check if input still exists
        if (!document.body.contains(input)) {
          return;
        }

        // Remove loading state
        input.classList.remove('gpt-loading');
        if (!input.isContentEditable && !wasReadonly) {
          input.removeAttribute('readonly');
        }

        console.error('Rephrase error:', err);

        // Better error messages
        let errorMsg = 'Failed to rephrase text.';
        if (err.name === 'AbortError') {
          errorMsg = 'Request timed out. Please try again.';
        } else if (err.message.includes('HTTP')) {
          errorMsg = 'Server error. Please try again later.';
        }
        alert(errorMsg);
      });
  });
}

// Scan and inject buttons into valid inputs
function scanAndInject() {
  // Don't inject if extension is disabled
  if (!isExtensionEnabled) return;

  const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
  inputs.forEach(input => {
    if (!input.dataset.gptAdded && isVisible(input)) {
      injectButtonIntoInput(input);
    }
  });
}

// IntersectionObserver to detect when inputs are removed from viewport or DOM
const intersectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const input = entry.target;
    const metadata = inputMetadata.get(input);

    if (!entry.isIntersecting && metadata) {
      // Hide button when input is not visible
      const wrapper = metadata.wrapper;
      if (wrapper) {
        wrapper.style.display = 'none';
      }
    } else if (entry.isIntersecting && metadata) {
      // Show button when input becomes visible
      const wrapper = metadata.wrapper;
      if (wrapper) {
        wrapper.style.display = 'block';
        updateButtonPosition(input, wrapper);
      }
    }
  });
}, {
  root: null,
  rootMargin: '50px',
  threshold: 0
});

// Observe inputs for visibility changes
function observeInput(input) {
  if (input && !input.dataset.gptObserved) {
    intersectionObserver.observe(input);
    input.dataset.gptObserved = 'true';
  }
}

// Periodic cleanup of removed inputs
function cleanupRemovedInputs() {
  const allInputs = Array.from(buttonReferences.keys());
  allInputs.forEach(input => {
    if (!document.body.contains(input)) {
      // Input was removed from DOM, cleanup
      const metadata = inputMetadata.get(input);
      if (metadata && metadata.cleanup) {
        metadata.cleanup();
      }
      cleanupInput(input);
      intersectionObserver.unobserve(input);
    }
  });
}

// Run cleanup periodically (every 5 seconds)
setInterval(cleanupRemovedInputs, 5000);

// ============================================================================
// ENABLE/DISABLE FUNCTIONALITY
// ============================================================================

// Hide all buttons (when extension is disabled)
function hideAllButtons() {
  buttonReferences.forEach((wrapper, input) => {
    if (wrapper && wrapper.parentNode) {
      wrapper.style.display = 'none';
    }
  });
}

// Show all buttons (when extension is enabled)
function showAllButtons() {
  buttonReferences.forEach((wrapper, input) => {
    if (wrapper && wrapper.parentNode && document.body.contains(input)) {
      wrapper.style.display = 'block';
      updateButtonPosition(input, wrapper);
    }
  });
}

// Remove all buttons (complete cleanup)
function removeAllButtons() {
  const allInputs = Array.from(buttonReferences.keys());
  allInputs.forEach(input => {
    const metadata = inputMetadata.get(input);
    if (metadata && metadata.cleanup) {
      metadata.cleanup();
    }
    cleanupInput(input);
    intersectionObserver.unobserve(input);
  });
}

// Enable extension
function enableExtension() {
  isExtensionEnabled = true;
  console.log('RePhrase AI: Extension enabled');
  scanAndInject(); // Inject buttons on all visible inputs
}

// Disable extension
function disableExtension() {
  isExtensionEnabled = false;
  console.log('RePhrase AI: Extension disabled');
  hideAllButtons(); // Just hide buttons, don't remove them
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_EXTENSION') {
    if (message.enabled) {
      enableExtension();
    } else {
      disableExtension();
    }
    sendResponse({ success: true });
  }
  return true; // Keep message channel open
});

// Check initial enabled state on load
chrome.storage.local.get(['extensionEnabled'], (result) => {
  // Default to enabled if not set
  isExtensionEnabled = result.extensionEnabled !== false;

  if (!isExtensionEnabled) {
    console.log('RePhrase AI: Starting disabled (per user settings)');
    // Don't inject buttons if disabled
  } else {
    // Initial scan
    scanAndInject();
  }
});

// Debounced scan for performance
const debouncedScanAndInject = debounce(scanAndInject, DEBOUNCE_DELAY);

// MutationObserver with optimized throttling
let scheduled = false;
const observer = new MutationObserver((mutations) => {
  // Quick check: only scan if relevant mutations occurred
  let shouldScan = false;

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // Check if added nodes contain textarea or contenteditable
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) { // Element node
          if (node.matches && node.matches('textarea, [contenteditable="true"]')) {
            shouldScan = true;
            break;
          }
          if (node.querySelector && node.querySelector('textarea, [contenteditable="true"]')) {
            shouldScan = true;
            break;
          }
        }
      }

      // Check if removed nodes had buttons attached
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && node.dataset && node.dataset.gptAdded) {
          cleanupInput(node);
        }
      }
    }

    if (shouldScan) break;
  }

  if (shouldScan && !scheduled) {
    scheduled = true;
    requestAnimationFrame(() => {
      scanAndInject();
      scheduled = false;
    });
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Debounced focusin to avoid excessive scans
document.addEventListener('focusin', debouncedScanAndInject);

// Handle visibility changes (tab switching)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Tab became visible, update button positions
    buttonReferences.forEach((wrapper, input) => {
      if (document.body.contains(input)) {
        updateButtonPosition(input, wrapper);
      }
    });
  }
});
