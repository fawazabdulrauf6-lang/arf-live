// Language registry for ARF. BCP-47 tags map to display names and speech hints.
// `keywords` power the offline intent parser; browser STT/TTS handle the heavy lifting.

export const LANGUAGES = {
  'en-US': { name: 'English (US)', native: 'English', rtl: false, voiceHint: 'en-US' },
  'en-GB': { name: 'English (UK)', native: 'English', rtl: false, voiceHint: 'en-GB' },
  'es-ES': { name: 'Spanish', native: 'Espanol', rtl: false, voiceHint: 'es-ES' },
  'fr-FR': { name: 'French', native: 'Francais', rtl: false, voiceHint: 'fr-FR' },
  'de-DE': { name: 'German', native: 'Deutsch', rtl: false, voiceHint: 'de-DE' },
  'it-IT': { name: 'Italian', native: 'Italiano', rtl: false, voiceHint: 'it-IT' },
  'pt-BR': { name: 'Portuguese (Brazil)', native: 'Portugues', rtl: false, voiceHint: 'pt-BR' },
  'nl-NL': { name: 'Dutch', native: 'Nederlands', rtl: false, voiceHint: 'nl-NL' },
  'pl-PL': { name: 'Polish', native: 'Polski', rtl: false, voiceHint: 'pl-PL' },
  'ru-RU': { name: 'Russian', native: 'Russkiy', rtl: false, voiceHint: 'ru-RU' },
  'tr-TR': { name: 'Turkish', native: 'Turkce', rtl: false, voiceHint: 'tr-TR' },
  'ar-SA': { name: 'Arabic', native: 'Al-Arabiyya', rtl: true, voiceHint: 'ar-SA' },
  'he-IL': { name: 'Hebrew', native: 'Ivrit', rtl: true, voiceHint: 'he-IL' },
  'hi-IN': { name: 'Hindi', native: 'Hindi', rtl: false, voiceHint: 'hi-IN' },
  'bn-IN': { name: 'Bengali', native: 'Bangla', rtl: false, voiceHint: 'bn-IN' },
  'ur-PK': { name: 'Urdu', native: 'Urdu', rtl: true, voiceHint: 'ur-PK' },
  'ta-IN': { name: 'Tamil', native: 'Tamil', rtl: false, voiceHint: 'ta-IN' },
  'te-IN': { name: 'Telugu', native: 'Telugu', rtl: false, voiceHint: 'te-IN' },
  'mr-IN': { name: 'Marathi', native: 'Marathi', rtl: false, voiceHint: 'mr-IN' },
  'gu-IN': { name: 'Gujarati', native: 'Gujarati', rtl: false, voiceHint: 'gu-IN' },
  'id-ID': { name: 'Indonesian', native: 'Bahasa Indonesia', rtl: false, voiceHint: 'id-ID' },
  'ms-MY': { name: 'Malay', native: 'Bahasa Melayu', rtl: false, voiceHint: 'ms-MY' },
  'th-TH': { name: 'Thai', native: 'Thai', rtl: false, voiceHint: 'th-TH' },
  'vi-VN': { name: 'Vietnamese', native: 'Tieng Viet', rtl: false, voiceHint: 'vi-VN' },
  'ja-JP': { name: 'Japanese', native: 'Nihongo', rtl: false, voiceHint: 'ja-JP' },
  'ko-KR': { name: 'Korean', native: 'Hangugeo', rtl: false, voiceHint: 'ko-KR' },
  'zh-CN': { name: 'Chinese (Simplified)', native: 'Zhongwen', rtl: false, voiceHint: 'zh-CN' },
  'zh-TW': { name: 'Chinese (Traditional)', native: 'Zhongwen', rtl: false, voiceHint: 'zh-TW' },
  'sv-SE': { name: 'Swedish', native: 'Svenska', rtl: false, voiceHint: 'sv-SE' },
  'da-DK': { name: 'Danish', native: 'Dansk', rtl: false, voiceHint: 'da-DK' },
  'nb-NO': { name: 'Norwegian', native: 'Norsk', rtl: false, voiceHint: 'nb-NO' },
  'fi-FI': { name: 'Finnish', native: 'Suomi', rtl: false, voiceHint: 'fi-FI' },
  'cs-CZ': { name: 'Czech', native: 'Cestina', rtl: false, voiceHint: 'cs-CZ' },
  'el-GR': { name: 'Greek', native: 'Ellinika', rtl: false, voiceHint: 'el-GR' },
  'uk-UA': { name: 'Ukrainian', native: 'Ukrainska', rtl: false, voiceHint: 'uk-UA' },
  'ro-RO': { name: 'Romanian', native: 'Romana', rtl: false, voiceHint: 'ro-RO' },
  'hu-HU': { name: 'Hungarian', native: 'Magyar', rtl: false, voiceHint: 'hu-HU' },
  'sw-KE': { name: 'Swahili', native: 'Kiswahili', rtl: false, voiceHint: 'sw-KE' },
  'fil-PH': { name: 'Filipino', native: 'Filipino', rtl: false, voiceHint: 'fil-PH' },
};

export const DEFAULT_LANGUAGE = 'en-US';

export function isSupported(tag) {
  if (!tag) return false;
  if (LANGUAGES[tag]) return true;
  // Fall back to base-language match, e.g. "en-AU" -> "en-US".
  const base = String(tag).split('-')[0].toLowerCase();
  return Object.keys(LANGUAGES).some((k) => k.split('-')[0].toLowerCase() === base);
}

export function resolveLanguage(tag) {
  if (!tag) return DEFAULT_LANGUAGE;
  if (LANGUAGES[tag]) return tag;
  const base = String(tag).split('-')[0].toLowerCase();
  return Object.keys(LANGUAGES).find((k) => k.split('-')[0].toLowerCase() === base) || DEFAULT_LANGUAGE;
}

export function listLanguages() {
  return Object.entries(LANGUAGES).map(([code, meta]) => ({ code, ...meta }));
}
