let currentLocale = 'en';

const translations = {
  en: {
    styleTitle: 'Style RePhrase AI',
    saveStyleButton: 'Apply Style',
    applyStyleSaved: 'Style applied ✅',
    styleOriginal: 'Original',
    stylePolite: 'Polite',
    styleConcise: 'Concise',
    styleFormal: 'Formal',
    styleFriendly: 'Friendly',
    styleCustom: 'Custom'
  },
  ru: {
    styleTitle: 'Стиль RePhrase AI',
    saveStyleButton: 'Применить стиль',
    applyStyleSaved: 'Стиль применён ✅',
    styleOriginal: 'Оригинальный',
    stylePolite: 'Вежливый',
    styleConcise: 'Краткий',
    styleFormal: 'Формальный',
    styleFriendly: 'Дружелюбный',
    styleCustom: 'Свой стиль'
  },
  es: {
    styleTitle: 'Estilo RePhrase AI',
    saveStyleButton: 'Aplicar estilo',
    applyStyleSaved: 'Estilo aplicado ✅',
    styleOriginal: 'Original',
    stylePolite: 'Cortés',
    styleConcise: 'Conciso',
    styleFormal: 'Formal',
    styleFriendly: 'Amigable',
    styleCustom: 'Estilo propio'
  }
};

function translateUI() {
  const t = translations[currentLocale];
  document.getElementById('styleTitle').innerText = t.styleTitle;
  document.getElementById('saveStyleBtn').innerText = t.saveStyleButton;

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

function toggleCustomStyleInput(style) {
  const input = document.getElementById('customStyleInputSection');
  if (!input) return;
  input.classList.toggle('hidden', style !== 'custom');
}

document.addEventListener('DOMContentLoaded', async () => {
  const storage = await chrome.storage.local.get(['rephraseStyle', 'customStyle', 'userLocale']);

  const browserLang = chrome.i18n.getUILanguage().slice(0, 2);
  currentLocale = ['en', 'ru', 'es'].includes(browserLang) ? browserLang : 'en';

  translateUI();

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
    const customStyleText = document.getElementById('customStyle').value.trim();
    const dataToSave = { rephraseStyle: style };
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
