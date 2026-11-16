const { tidyText, restorePunctuation } = require('../lib/text.cjs');
const cases = [
  'как дела что нового',
  'Как я понял все готово',
  'нужно чтобы ты проверил отчет и если найдешь ошибки исправь их но сначала позвони мне',
];
for (const c of cases) {
  const clean = tidyText(c, 'ru');
  const off = restorePunctuation(clean, 'ru');
  const on = restorePunctuation(clean, 'ru', { questionMark: true });
  console.log('ВХОД :', c);
  console.log('  без догадок:', off.text);
  console.log('  с догадкой :', on.text);
}