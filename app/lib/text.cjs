// Приведение распознанного текста в читаемый вид.
// Движок распознавания отдаёт текст кусками: с переносами строк, лишними
// пробелами перед знаками, без заглавных после точки и иногда со служебными
// пометками вроде [BLANK_AUDIO]. Здесь текст приводится к нормальному виду,
// а затем расставляются знаки, которые движок пропустил (осторожными правилами).

// Служебные пометки движка, которые не являются речью
const NOISE = /\[(?:blank_audio|music|applause|silence|noise|inaudible|typing|laughter)\]|\((?:музыка|аплодисменты|смех|шум|тишина|неразборчиво|пауза|вдох|выдох)\)/gi;

// Знаки, после которых нужен пробел
const AFTER_SPACE = /([,;:])(?=[^\s])/g;
// Точка и подобные: пробел ставим только перед буквой, не перед цифрой
// (иначе «3.14» превращается в «3. 14», а даты разваливаются).
const SENTENCE_END = /([.!?…])(?=[^\s\d])/g;

// Общепринятые сокращения прячем на время обработки, чтобы не разорвать их пробелом
const ABBREVIATIONS = [
  ['т.е.', '\u0001'],
  ['т.д.', '\u0002'],
  ['т.п.', '\u0003'],
  ['т.к.', '\u0004'],
  ['и.о.', '\u0005'],
  ['др.', '\u0006'],
];

// Союзы и вводные слова, перед которыми запятая почти всегда уместна.
// «и», «а», «или», «либо» сюда не входят: с ними слишком много исключений.
const COMMA_BEFORE = [
  'чтобы', 'что', 'если', 'когда', 'который', 'которая', 'которое', 'которые',
  'которых', 'которым', 'которого', 'которой', 'которую', 'кто', 'где',
  'куда', 'откуда', 'пока', 'хотя', 'поскольку', 'зато', 'но', 'поэтому',
  'значит', 'например', 'конечно', 'наверное', 'кажется', 'пожалуй',
  'пожалуйста', 'вероятно',
];

// Если союз стоит сразу после другого союза, запятая перед ним не нужна:
// «и если», «и что», «но чтобы». Запятая в таких местах ставится раньше.
const PREV_SKIP = ['и', 'а', 'но', 'да', 'или', 'либо', 'же', 'ведь', 'что'];

const COMMA_PHRASES = [
  'потому что', 'так как', 'то есть', 'к сожалению', 'к счастью',
  'во-первых', 'во-вторых', 'в-третьих', 'по-моему', 'по-вашему',
];

// Слова, с которых начинается вопрос: если точка стоит, а слова такие — ставим «?»
const QUESTION_STARTS = [
  'что', 'кто', 'где', 'когда', 'как', 'почему', 'зачем', 'сколько',
  'какой', 'какая', 'какое', 'какие', 'каких', 'чей', 'чья', 'чьё',
  'разве', 'неужели',
];

function protectAbbreviations(text) {
  let out = text;
  for (const [from, to] of ABBREVIATIONS) {
    out = out.replace(new RegExp(from.replace(/\./g, '\\.'), 'gi'), to);
  }
  return out;
}

function restoreAbbreviations(text) {
  let out = text;
  for (const [from, to] of ABBREVIATIONS) {
    out = out.split(to).join(from);
  }
  return out;
}

function tidyText(input, lang = 'ru') {
  if (!input) return '';

  let text = String(input);

  // 1. Убираем служебные пометки и нормализуем переводы строк
  text = text.replace(NOISE, ' ');
  text = text.replace(/\r\n?/g, '\n');

  // 2. Схлопываем в один абзац: распознавание режет фразу на куски
  text = text.replace(/\n+/g, ' ');
  text = text.replace(/[ \t\u00a0]+/g, ' ');
  text = text.trim();
  if (!text) return '';

  // 3. Сокращения и числа не трогаем
  text = protectAbbreviations(text);

  // 4. Пробелы вокруг знаков: убираем лишние перед, ставим после
  text = text.replace(/\s+([,.;:!?…])/g, '$1');
  text = text.replace(AFTER_SPACE, '$1 ');
  text = text.replace(SENTENCE_END, '$1 ');

  // 5. Тире: длинное, с пробелами с двух сторон
  text = text.replace(/\s*[-–—]\s*/g, ' — ');

  // 6. Повторы знаков
  text = text.replace(/([,;:])\1+/g, '$1');
  text = text.replace(/([!?])\1{2,}/g, '$1$1');
  text = text.replace(/\.{4,}/g, '…');

  // 7. Заглавная буква в начале и после конца предложения
  text = text.replace(/(^|[.!?…]\s+)([а-яёa-z])/g, (_m, before, letter) => before + letter.toUpperCase());

  // 8. Сокращения возвращаем
  text = restoreAbbreviations(text);

  // 9. Одиночные кавычки-лапки приводим к «ёлочкам» (для русского)
  if (String(lang).startsWith('ru')) {
    let open = true;
    text = text.replace(/"/g, () => {
      const mark = open ? '«' : '»';
      open = !open;
      return mark;
    });
  }

  // 10. Точка в конце, если фраза её потеряла
  if (!/[.!?…:;]$/.test(text)) text += '.';

  // 11. Финальная уборка пробелов
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// Проверка: стоит ли уже знак перед позицией (тогда запятая не нужна)
function hasPunctuationBefore(text, index) {
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ' ') continue;
    return ch;
  }
  return '';
}

function startsSentence(text, index) {
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ' ') continue;
    return ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === ':' || ch === ';';
  }
  return true; // начало текста
}

/**
 * Достраивает знаки препинания, которые движок не поставил.
 * Работает осторожно: только там, где правило почти не даёт исключений.
 * Возвращает { text, added } — сколько знаков добавлено.
 */
function restorePunctuation(input, lang = 'ru', options = {}) {
  if (!input || !String(lang).startsWith('ru')) return { text: input || '', added: 0 };

  // Вопросительный знак по первому слову — небезопасная догадка
  // («Как я понял, всё готово» — не вопрос), поэтому по умолчанию выключено.
  const guessQuestion = options.questionMark === true;

  let text = String(input);
  let added = 0;

  // Вопросительная ли фраза — проверяем по первому слову заранее:
  // в вопросах запятая перед «что» чаще всего лишняя.
  const firstWord = (text.match(/^[«"(]?\s*([а-яё]+)/i) || [])[1];
  const startsQuestion = Boolean(firstWord) && QUESTION_STARTS.includes(firstWord.toLowerCase());

  // Запятые перед оборотами из двух слов
  for (const phrase of COMMA_PHRASES) {
    const re = new RegExp(`(\\s+)(${phrase})`, 'gi');
    text = text.replace(re, (match, spaces, found, offset, whole) => {
      const wordStart = offset + spaces.length;
      if (startsSentence(whole, offset)) return match;
      const before = hasPunctuationBefore(whole, offset);
      if (before === ',' || before === '—' || before === '(') return match;
      added++;
      return ', ' + found;
    });
  }

  // Запятые перед союзами и союзными словами
  const wordRe = new RegExp(`(\\s+)(${COMMA_BEFORE.join('|')})(?![а-яёa-z-])`, 'gi');
  text = text.replace(wordRe, (match, spaces, found, offset, whole) => {
    const wordStart = offset + spaces.length;
    if (startsSentence(whole, offset)) return match;
    const before = hasPunctuationBefore(whole, offset);
    if (before === ',' || before === '—' || before === '(') return match;

    // «что» после предлогов и «то» — не всегда союз: такие случаи пропускаем
    const prevWord = (whole.slice(0, offset).trim().split(/\s+/) || []).pop() || '';
    const prevLower = prevWord.toLowerCase().replace(/[^а-яёa-z-]/gi, '');
    if (/^что$/i.test(found) && ['то', 'при', 'в', 'на', 'о', 'из', 'за', 'с', 'об'].includes(prevLower)) {
      return match;
    }
    // После другого союза запятая ставится раньше, а не между ними
    if (PREV_SKIP.includes(prevLower)) return match;
    // В вопросе «что» — вопросительное слово, запятая перед ним не нужна
    if (startsQuestion && /^что$/i.test(found)) return match;

    added++;
    return ', ' + found;
  });

  // Вопрос: только если это разрешено настройкой и фраза начинается с вопросительного слова
  if (guessQuestion && startsQuestion && !/\?$/.test(text.trim())) {
    if (/\.$/.test(text.trim())) {
      text = text.replace(/\.\s*$/, '?');
      added++;
    }
  }

  // После вставки запятых мог появиться двойной пробел
  text = text.replace(/\s+/g, ' ').replace(/\s+([,;:.!?…])/g, '$1').trim();

  return { text, added };
}

module.exports = { tidyText, restorePunctuation };
