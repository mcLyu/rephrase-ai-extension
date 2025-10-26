let currentLocale = 'en';

const translations = {
  en: {
    languageTitle: 'Language',
    styleTitle: 'Style RePhrase AI',
    saveStyleButton: 'Apply Settings',
    applyStyleSaved: 'Settings applied ✅',
    styleOriginal: 'Original',
    stylePolite: 'Polite',
    styleConcise: 'Concise',
    styleFormal: 'Formal',
    styleFriendly: 'Friendly',
    styleCustom: 'Custom',
    toggleLabel: 'Extension Status',
    statusEnabled: 'Enabled',
    statusDisabled: 'Disabled'
  },
  ru: {
    languageTitle: 'Язык',
    styleTitle: 'Стиль RePhrase AI',
    saveStyleButton: 'Применить настройки',
    applyStyleSaved: 'Настройки применены ✅',
    styleOriginal: 'Оригинальный',
    stylePolite: 'Вежливый',
    styleConcise: 'Краткий',
    styleFormal: 'Формальный',
    styleFriendly: 'Дружелюбный',
    styleCustom: 'Свой стиль',
    toggleLabel: 'Статус расширения',
    statusEnabled: 'Включено',
    statusDisabled: 'Выключено'
  },
  es: {
    languageTitle: 'Idioma',
    styleTitle: 'Estilo RePhrase AI',
    saveStyleButton: 'Aplicar configuración',
    applyStyleSaved: 'Configuración aplicada ✅',
    styleOriginal: 'Original',
    stylePolite: 'Cortés',
    styleConcise: 'Conciso',
    styleFormal: 'Formal',
    styleFriendly: 'Amigable',
    styleCustom: 'Estilo propio',
    toggleLabel: 'Estado de la extensión',
    statusEnabled: 'Habilitado',
    statusDisabled: 'Deshabilitado'
  }
};

function translateUI() {
  const t = translations[currentLocale];
  document.getElementById('languageTitle').innerText = t.languageTitle;
  document.getElementById('styleTitle').innerText = t.styleTitle;
  document.getElementById('saveStyleBtn').innerText = t.saveStyleButton;
  document.getElementById('toggleLabel').innerText = t.toggleLabel;

  const styleOptions = [
    { value: 'original', key: 'styleOriginal' },
    { value: 'polite', key: 'stylePolite' },
    { value: 'concise', key: 'styleConcise' },
    { value: 'formal', key: 'styleFormal' },
    { value: 'friendly', key: 'styleFriendly' },
    { value: 'custom', key: 'styleCustom' }
  ];

  const styleSelect = document.getElementById('rephraseStyle');
  styleSelect.innerHTML = '';
  styleOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.text = t[opt.key];
    styleSelect.appendChild(option);
  });

  const customInput = document.getElementById('customStyle');
  if (customInput) {
    customInput.placeholder = t.styleCustom;
  }
}

function updateStatusIndicator(isEnabled) {
  const t = translations[currentLocale];
  const statusIndicator = document.getElementById('statusIndicator');
  if (isEnabled) {
    statusIndicator.innerText = t.statusEnabled;
    statusIndicator.className = 'status-indicator enabled';
  } else {
    statusIndicator.innerText = t.statusDisabled;
    statusIndicator.className = 'status-indicator disabled';
  }
}

function toggleCustomStyleInput(style) {
  const input = document.getElementById('customStyleInputSection');
  if (!input) return;
  input.classList.toggle('hidden', style !== 'custom');
}

document.addEventListener('DOMContentLoaded', async () => {
  const storage = await chrome.storage.local.get([
    'rephraseStyle',
    'customStyle',
    'userLocale',
    'selectedLanguage',
    'extensionEnabled'
  ]);

  const browserLang = chrome.i18n.getUILanguage().slice(0, 2);
  currentLocale = ['en', 'ru', 'es'].includes(browserLang) ? browserLang : 'en';

  translateUI();

  // Load and set extension enabled state (default: true)
  const isEnabled = storage.extensionEnabled !== false; // Default to enabled
  const toggleCheckbox = document.getElementById('extensionToggle');
  toggleCheckbox.checked = isEnabled;
  updateStatusIndicator(isEnabled);

  // Toggle handler - enable/disable extension
  toggleCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ extensionEnabled: enabled }, () => {
      updateStatusIndicator(enabled);

      // Send message to all tabs to enable/disable the extension
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_EXTENSION',
            enabled: enabled
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        });
      });
    });
  });

  // Load language selection (default: auto)
  const languageSelect = document.getElementById('languageSelect');
  if (storage.selectedLanguage) {
    languageSelect.value = storage.selectedLanguage;
  }

  if (storage.rephraseStyle) {
    document.getElementById('rephraseStyle').value = storage.rephraseStyle;
    toggleCustomStyleInput(storage.rephraseStyle);
  }

  if (storage.customStyle) {
    document.getElementById('customStyle').value = storage.customStyle;
  }

  document.getElementById('rephraseStyle').addEventListener('change', (e) => {
    toggleCustomStyleInput(e.target.value);
  });

  document.getElementById('saveStyleBtn').addEventListener('click', () => {
    const style = document.getElementById('rephraseStyle').value;
    const language = languageSelect.value;
    const customStyleText = document.getElementById('customStyle').value.trim();

    const dataToSave = {
      rephraseStyle: style,
      selectedLanguage: language
    };

    if (style === 'custom' && customStyleText) {
      dataToSave.customStyle = customStyleText;
    }

    chrome.storage.local.set(dataToSave, () => {
      const savedMessage = document.getElementById('savedMessage');
      savedMessage.innerText = translations[currentLocale].applyStyleSaved;
      savedMessage.classList.add('show');
      setTimeout(() => savedMessage.classList.remove('show'), 2000);
    });
  });
});
