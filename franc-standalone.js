// Standalone franc-min for browser use
// Simplified language detection for our 11 supported languages

// Language codes mapping (ISO 639-3 to our codes)
const LANG_MAP = {
  'eng': 'en',
  'rus': 'ru',
  'spa': 'es',
  'cmn': 'zh',
  'fra': 'fr',
  'deu': 'de',
  'por': 'pt',
  'jpn': 'ja',
  'arb': 'ar',
  'hin': 'hi',
  'ita': 'it'
};

// Simplified trigram-based detection
function detectLanguageSimple(text) {
  if (!text || text.length < 3) {
    return 'en'; // Default for very short text
  }

  // Script-based detection first (most reliable)
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
  if (/[\u0600-\u06ff]/.test(text)) return 'ar'; // Arabic
  if (/[\u0900-\u097f]/.test(text)) return 'hi'; // Hindi

  // For Latin-script languages, use character frequency analysis
  const scores = {
    en: 0,
    es: 0,
    fr: 0,
    de: 0,
    pt: 0,
    it: 0
  };

  const lowerText = text.toLowerCase();

  // English indicators
  scores.en += (lowerText.match(/\b(the|is|are|was|were|been|have|has|had|will|would|can|could|should|this|that|these|those|what|when|where|who|which|how|why|very|just|only|really|actually)\b/g) || []).length * 3;
  scores.en += (lowerText.match(/ing\b/g) || []).length * 2;
  scores.en += (lowerText.match(/\bth/g) || []).length;

  // Spanish indicators
  scores.es += (lowerText.match(/\b(el|la|los|las|un|una|de|del|al|que|en|y|es|por|para|con|su|no|más|pero|todo|estar|muy|ya|este|hacer|poder|ser|ir)\b/g) || []).length * 3;
  scores.es += (lowerText.match(/[ñ]/g) || []).length * 5;
  scores.es += (lowerText.match(/[¿¡]/g) || []).length * 10;
  scores.es += (lowerText.match(/ción\b/g) || []).length * 3;

  // French indicators
  scores.fr += (lowerText.match(/\b(le|la|les|un|une|des|de|du|au|aux|et|est|dans|pour|avec|ce|qui|ne|pas|être|avoir|que|vous|nous|sur)\b/g) || []).length * 3;
  scores.fr += (lowerText.match(/[àâæçéèêëïîôùûü]/g) || []).length * 4;
  scores.fr += (lowerText.match(/\bqu'/g) || []).length * 5;

  // German indicators
  scores.de += (lowerText.match(/\b(der|die|das|den|dem|des|ein|eine|eines|und|ist|nicht|auch|von|mit|auf|für|werden|sein|haben|zu|können|müssen)\b/g) || []).length * 3;
  scores.de += (lowerText.match(/[äöüß]/g) || []).length * 5;
  scores.de += (lowerText.match(/\bich\b/g) || []).length * 3;

  // Portuguese indicators
  scores.pt += (lowerText.match(/\b(o|a|os|as|um|uma|de|do|da|em|para|com|por|não|que|é|são|mais|como|muito|ou|também|quando|onde)\b/g) || []).length * 3;
  scores.pt += (lowerText.match(/[ãõçáéíóú]/g) || []).length * 5;
  scores.pt += (lowerText.match(/ção\b/g) || []).length * 2;

  // Italian indicators
  scores.it += (lowerText.match(/\b(il|lo|la|i|gli|le|un|una|di|da|in|con|su|per|tra|fra|a|è|sono|ho|ha|hanno|che|non|ma|anche|molto|dove|quando)\b/g) || []).length * 3;
  scores.it += (lowerText.match(/[àèéìíîòóù]/g) || []).length * 4;
  scores.it += (lowerText.match(/zione\b/g) || []).length * 3;

  // Find language with highest score
  let maxLang = 'en';
  let maxScore = scores.en;

  for (const lang in scores) {
    if (scores[lang] > maxScore) {
      maxScore = scores[lang];
      maxLang = lang;
    }
  }

  // If no clear winner, default to English
  return maxScore > 0 ? maxLang : 'en';
}

// Export for use in content.js
window.francDetect = detectLanguageSimple;
