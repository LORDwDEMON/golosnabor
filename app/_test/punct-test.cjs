const { tidyText, restorePunctuation } = require('../lib/text.cjs');
const cases = [
  'нужно чтобы ты проверил отчет и если найдешь ошибки исправь их но сначала позвони мне',
  'позвони мне когда освободишься и скажи что решил по встрече',
  'цена 3.14 рубля дата 13.10.2026 все верно',
  'как дела что нового',
  'мы обсудили план и я понял что сроки сдвигаются поэтому нужно предупредить заказчика',
  'Проверка голоса. Раз, два, три.',
];
for (const c of cases) {
  const clean = tidyText(c, 'ru');
  const res = restorePunctuation(clean, 'ru');
  console.log('ВХОД : ' + c);
  console.log('ЧИСТКА: ' + clean);
  console.log('ЗНАКИ : ' + res.text + '   (+' + res.added + ')');
  console.log('');
}