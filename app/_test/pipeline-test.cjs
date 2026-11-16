const { transcribe } = require('../lib/pipeline.cjs');
const settings = {
  ffmpegPath: 'F:\\GolosNabor\\engine\\bin\\ffmpeg.exe',
  whisperUrl: 'http://127.0.0.1:8001',
  whisperCli: 'F:\\GolosNabor\\engine\\bin\\whisper-cli.exe',
  whisperModel: 'C:\\Users\\DIMAS\\AppData\\Local\\GolosNabor\\models\\ggml-small-q5_1.bin',
  language: 'ru',
  punctuation: 'auto',
};
transcribe('D:\\AETHER_V4\\DSH-Voice\\audio\\test-phrase2.wav', settings)
  .then(r => {
    console.log('сырой  :', JSON.stringify(r.raw));
    console.log('итоговый:', JSON.stringify(r.text), '| добавлено знаков:', r.punctuationAdded);
  })
  .catch(e => console.error('ОШИБКА:', e.message));