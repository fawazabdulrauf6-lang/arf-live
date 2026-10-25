// Offline, deterministic intent parser.
//
// ARF is designed to keep working with no cloud dependency. Speech-to-text runs in
// the browser; this module turns the resulting text into a structured intent using
// per-language keyword tables. When a keyword is missing for a language, the
// English table is used as a fallback so new languages degrade gracefully.

export const INTENTS = {
  GREET: 'assistant.greet',
  IDENTITY: 'assistant.identity',
  HELP: 'assistant.help',
  STOP: 'assistant.stop',
  TIME: 'time.now',
  DATE: 'date.today',
  WEATHER: 'weather.get',
  TIMER: 'timer.set',
  MATH: 'math.calculate',
  NOTE: 'note.create',
  DEVICE_LIST: 'device.list',
  DEVICE_ON: 'device.on',
  DEVICE_OFF: 'device.off',
  DEVICE_TOGGLE: 'device.toggle',
  DEVICE_SET: 'device.set',
  DEVICE_LOCK: 'lock.lock',
  DEVICE_UNLOCK: 'lock.unlock',
  LANGUAGE: 'language.set',
  TRANSLATE: 'text.translate',
  REMEMBER: 'memory.remember',
  RECALL: 'memory.recall',
  UNKNOWN: 'intent.unknown',
};

// Keyword tables. Keys are intents; values are arrays of trigger phrases.
// Matching is word-boundary based and case/diacritic-insensitive.
const TABLES = {
  en: {
    [INTENTS.GREET]: ['hello', 'hi ', 'hey', 'good morning', 'good evening', 'good afternoon'],
    [INTENTS.IDENTITY]: ['who are you', 'what is your name', "what's your name", 'your name', 'who am i talking to'],
    [INTENTS.HELP]: ['help', 'what can you do', 'commands', 'show me what you can do'],
    [INTENTS.STOP]: ['stop', 'cancel', 'never mind', 'be quiet', 'shut up'],
    [INTENTS.TIME]: ['what time', 'the time', 'current time', 'tell me the time'],
    [INTENTS.DATE]: ['what date', "today's date", 'what day is it', 'the date'],
    [INTENTS.WEATHER]: ['weather', 'temperature outside', 'forecast', 'is it raining'],
    [INTENTS.TIMER]: ['set a timer', 'set timer', 'timer for', 'remind me in', 'countdown'],
    [INTENTS.MATH]: ['calculate', 'what is', 'plus', 'minus', 'times', 'divided by', 'multiply', 'add '],
    [INTENTS.NOTE]: ['take a note', 'make a note', 'note that', 'write this down', 'remember that'],
    [INTENTS.DEVICE_LIST]: ['list devices', 'what devices', 'my devices', 'what can you control'],
    [INTENTS.DEVICE_ON]: ['turn on', 'switch on', 'power on', 'enable'],
    [INTENTS.DEVICE_OFF]: ['turn off', 'switch off', 'power off', 'disable'],
    [INTENTS.DEVICE_TOGGLE]: ['toggle', 'flip'],
    [INTENTS.DEVICE_UNLOCK]: ['unlock'],
    [INTENTS.DEVICE_LOCK]: ['lock the', 'lock my', 'lock up'],
    [INTENTS.DEVICE_SET]: ['set ', 'dim ', 'brightness', 'to '],
    [INTENTS.LANGUAGE]: ['speak', 'switch language', 'change language', 'talk in', 'reply in', 'in spanish', 'in french', 'in german'],
    [INTENTS.TRANSLATE]: ['translate', 'how do you say', 'what does'],
    [INTENTS.REMEMBER]: ['remember that', 'keep in mind', 'store this'],
    [INTENTS.RECALL]: ['what did i say about', 'recall', 'do you remember'],
  },
  es: {
    [INTENTS.GREET]: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches'],
    [INTENTS.IDENTITY]: ['quien eres', 'como te llamas', 'tu nombre'],
    [INTENTS.HELP]: ['ayuda', 'que puedes hacer', 'comandos'],
    [INTENTS.STOP]: ['para', 'cancelar', 'detente', 'silencio'],
    [INTENTS.TIME]: ['que hora es', 'la hora'],
    [INTENTS.DATE]: ['que fecha', 'que dia es hoy'],
    [INTENTS.WEATHER]: ['clima', 'tiempo hace', 'pronostico', 'esta lloviendo'],
    [INTENTS.TIMER]: ['pon un temporizador', 'temporizador', 'recordatorio'],
    [INTENTS.DEVICE_ON]: ['enciende', 'prende', 'activa'],
    [INTENTS.DEVICE_OFF]: ['apaga', 'desactiva'],
    [INTENTS.DEVICE_LIST]: ['lista dispositivos', 'mis dispositivos'],
    [INTENTS.LANGUAGE]: ['habla', 'cambiar idioma', 'en ingles', 'en espanol'],
    [INTENTS.TRANSLATE]: ['traduce', 'como se dice'],
  },
  fr: {
    [INTENTS.GREET]: ['bonjour', 'salut', 'bonsoir'],
    [INTENTS.IDENTITY]: ['qui es tu', 'comment tu t appelles', 'ton nom'],
    [INTENTS.HELP]: ['aide', 'que peux tu faire'],
    [INTENTS.STOP]: ['arrete', 'annule', 'stop'],
    [INTENTS.TIME]: ['quelle heure', 'l heure'],
    [INTENTS.DATE]: ['quelle date', 'quel jour'],
    [INTENTS.WEATHER]: ['meteo', 'temps', 'pleut'],
    [INTENTS.DEVICE_ON]: ['allume', 'active'],
    [INTENTS.DEVICE_OFF]: ['eteins', 'desactive'],
    [INTENTS.LANGUAGE]: ['parle', 'changer de langue', 'en anglais', 'en francais'],
  },
  de: {
    [INTENTS.GREET]: ['hallo', 'guten morgen', 'guten abend'],
    [INTENTS.IDENTITY]: ['wer bist du', 'wie heisst du', 'dein name'],
    [INTENTS.HELP]: ['hilfe', 'was kannst du'],
    [INTENTS.STOP]: ['stopp', 'abbrechen', 'halt'],
    [INTENTS.TIME]: ['wie spet', 'wie viel uhr', 'die zeit'],
    [INTENTS.DATE]: ['welches datum', 'welcher tag'],
    [INTENTS.WEATHER]: ['wetter', 'temperatur', 'regnet'],
    [INTENTS.DEVICE_ON]: ['einschalten', 'anschalten', 'aktiviere'],
    [INTENTS.DEVICE_OFF]: ['ausschalten', 'deaktivieren'],
    [INTENTS.LANGUAGE]: ['sprich', 'sprache wechseln', 'auf deutsch'],
  },
  hi: {
    [INTENTS.GREET]: ['namaste', 'hello', 'namaskar'],
    [INTENTS.IDENTITY]: ['tum kaun ho', 'aapka naam', 'tumhara naam'],
    [INTENTS.HELP]: ['madad', 'sahayata', 'kya kar sakte ho'],
    [INTENTS.STOP]: ['ruko', 'band karo', 'chhodo'],
    [INTENTS.TIME]: ['kitna samay', 'samay kya hai', 'time kya hai'],
    [INTENTS.DATE]: ['aaj ki tarikh', 'kaun sa din'],
    [INTENTS.WEATHER]: ['mausam', 'garmi', 'barish'],
    [INTENTS.DEVICE_ON]: ['chalu karo', 'on karo', 'jalao'],
    [INTENTS.DEVICE_OFF]: ['band karo', 'off karo', 'bujhao'],
    [INTENTS.LANGUAGE]: ['bolo', 'bhasha badlo', 'hindi mein'],
  },
  ar: {
    [INTENTS.GREET]: ['marhaba', 'ahlan', 'sabah al khayr'],
    [INTENTS.IDENTITY]: ['man anta', 'ismuka', 'ma ismuk'],
    [INTENTS.HELP]: ['musaada', 'masaada', 'matha tastati'],
    [INTENTS.STOP]: ['tawaqaf', 'ilgha', 'uskut'],
    [INTENTS.TIME]: ['kam al saaa', 'al waqt'],
    [INTENTS.DATE]: ['ma al tarikh', 'ay yawm'],
    [INTENTS.WEATHER]: ['al taks', 'al jaw', 'matar'],
    [INTENTS.DEVICE_ON]: ['shaghil', 'fatah'],
    [INTENTS.DEVICE_OFF]: ['atfi', 'aghliq'],
    [INTENTS.LANGUAGE]: ['takallam', 'ghayyir al lugha', 'bil arabiyya'],
  },
  zh: {
    [INTENTS.GREET]: ['ni hao', 'nin hao', 'zao shang hao'],
    [INTENTS.IDENTITY]: ['ni shi shei', 'ni de mingzi'],
    [INTENTS.HELP]: ['bangzhu', 'ni neng zuo shenme'],
    [INTENTS.STOP]: ['ting', 'quxiao', 'ting zhi'],
    [INTENTS.TIME]: ['jidian', 'shijian'],
    [INTENTS.DATE]: ['jintian jihao', 'shenme riqi'],
    [INTENTS.WEATHER]: ['tianqi', 'wendu', 'xiayu'],
    [INTENTS.DEVICE_ON]: ['dakai', 'kaiqi'],
    [INTENTS.DEVICE_OFF]: ['guanbi', 'guanbi'],
    [INTENTS.LANGUAGE]: ['shuo', 'huan yuyan', 'zhongwen'],
  },
  ja: {
    [INTENTS.GREET]: ['konnichiwa', 'ohayo', 'konbanwa'],
    [INTENTS.IDENTITY]: ['anata wa dare', 'namae wa'],
    [INTENTS.HELP]: ['tasukete', 'nani ga dekimasu'],
    [INTENTS.STOP]: ['yamete', 'kyanseru', 'tomete'],
    [INTENTS.TIME]: ['nanji', 'jikan'],
    [INTENTS.DATE]: ['kyo wa nannichi', 'hizuke'],
    [INTENTS.WEATHER]: ['tenki', 'kion', 'ame'],
    [INTENTS.DEVICE_ON]: ['tsukete', 'on ni shite'],
    [INTENTS.DEVICE_OFF]: ['keshite', 'off ni shite'],
    [INTENTS.LANGUAGE]: ['hanashite', 'gengo wo kaete', 'nihongo de'],
  },
  pt: {
    [INTENTS.GREET]: ['ola', 'bom dia', 'boa tarde', 'boa noite'],
    [INTENTS.IDENTITY]: ['quem e voce', 'seu nome'],
    [INTENTS.HELP]: ['ajuda', 'o que voce pode fazer'],
    [INTENTS.STOP]: ['pare', 'cancele', 'silencio'],
    [INTENTS.TIME]: ['que horas', 'a hora'],
    [INTENTS.DATE]: ['que data', 'que dia e hoje'],
    [INTENTS.WEATHER]: ['clima', 'tempo', 'chovendo'],
    [INTENTS.DEVICE_ON]: ['ligue', 'ative', 'acenda'],
    [INTENTS.DEVICE_OFF]: ['desligue', 'desative', 'apague'],
    [INTENTS.LANGUAGE]: ['fale', 'mudar idioma', 'em portugues'],
  },
  ru: {
    [INTENTS.GREET]: ['privet', 'zdravstvuyte', 'dobroe utro'],
    [INTENTS.IDENTITY]: ['kto ty', 'kak tebya zovut', 'tvoe imya'],
    [INTENTS.HELP]: ['pomoshch', 'chto ty mozhesh'],
    [INTENTS.STOP]: ['stop', 'otmena', 'zamолчи'],
    [INTENTS.TIME]: ['kotoroy chas', 'vremya'],
    [INTENTS.DATE]: ['kakaya data', 'kakoy den'],
    [INTENTS.WEATHER]: ['pogoda', 'temperatura', 'dozhd'],
    [INTENTS.DEVICE_ON]: ['vklyuchi', 'zapusti'],
    [INTENTS.DEVICE_OFF]: ['vyklyuchi', 'otklyuchi'],
    [INTENTS.LANGUAGE]: ['govori', 'smeni yazyk', 'po russki'],
  },
};

export function tableFor(lang) {
  const base = String(lang || 'en').split('-')[0].toLowerCase();
  return { base: TABLES[base] ? base : 'en', table: TABLES[base] || TABLES.en };
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s'%+\-*/.=]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseHit(haystack, phrase) {
  const p = phrase.trim();
  if (!p) return false;
  // Multi-word phrases: substring match. Single words: word-boundary match.
  if (p.includes(' ')) return haystack.includes(p);
  const re = new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
  return re.test(haystack);
}

// Extract the device name / value tail from a control phrase, e.g.
// "turn on the kitchen light" -> "kitchen light"
const STRIP_PREFIXES = [
  'turn on the', 'turn on', 'switch on', 'power on', 'enable',
  'turn off the', 'turn off', 'switch off', 'power off', 'disable',
  'toggle the', 'toggle', 'flip',
  'unlock the', 'unlock', 'lock the', 'lock my', 'lock up', 'lock',
  'encende el', 'enciende el', 'enciende', 'apaga el', 'apaga',
  'allume le', 'allume la', 'allume', 'eteins le', 'eteins la', 'eteins',
  'einschalten', 'anschalten', 'ausschalten',
  'chalu karo', 'band karo', 'on karo', 'off karo',
  'dakai', 'guanbi', 'tsukete', 'keshite',
  'ligue', 'desligue', 'acenda', 'apague',
  'vklyuchi', 'vyklyuchi',
];

export function extractTarget(text) {
  let t = normalize(text);
  // Remove leading politeness.
  t = t.replace(/^(please|kindly|por favor|s il vous plait|bitte|kripya)\s+/u, '');
  let best = null;
  for (const p of STRIP_PREFIXES) {
    if (t.startsWith(p + ' ')) {
      if (!best || p.length > best.length) best = p;
    }
  }
  if (best) {
    t = t.slice(best.length).trim();
    return t.replace(/^(the|el|la|los|las|le|les|der|die|das)\s+/u, '').trim();
  }
  return t;
}

export function parseIntent(text, lang = 'en-US') {
  const raw = String(text || '');
  const t = normalize(raw);
  if (!t) return { intent: INTENTS.UNKNOWN, text: raw, confidence: 0, lang };

  const { base, table } = tableFor(lang);
  const englishTable = TABLES.en;

  // Ordered evaluation: specific intents before generic ones.
  const order = [
    INTENTS.IDENTITY, INTENTS.HELP, INTENTS.STOP,
    INTENTS.DEVICE_LIST, INTENTS.DEVICE_UNLOCK, INTENTS.DEVICE_LOCK,
    INTENTS.DEVICE_ON, INTENTS.DEVICE_OFF, INTENTS.DEVICE_TOGGLE,
    INTENTS.LANGUAGE, INTENTS.TRANSLATE, INTENTS.TIMER,
    INTENTS.NOTE, INTENTS.REMEMBER, INTENTS.RECALL,
    INTENTS.TIME, INTENTS.DATE, INTENTS.WEATHER, INTENTS.MATH, INTENTS.GREET,
  ];

  for (const intent of order) {
    const phrases = table[intent] || englishTable[intent] || [];
    for (const p of phrases) {
      if (phraseHit(t, p)) {
        return {
          intent,
          text: raw,
          normalized: t,
          lang,
          matchedPhrase: p,
          confidence: p.includes(' ') ? 0.9 : 0.7,
        };
      }
    }
  }
  return { intent: INTENTS.UNKNOWN, text: raw, normalized: t, lang, confidence: 0 };
}
