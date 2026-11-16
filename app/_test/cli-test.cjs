const { transcribe } = require('../lib/pipeline.cjs');
const settings = {
  ffmpegPath: 'D:\\AETHER_V4\\DSH-Voice\\bin\\ffmpeg.exe',
  whisperUrl: '',
  whisperCli: 'D:\\AETHER_V4\\DSH-Voice\\bin\\whisper-cli.exe',
  whisperModel: 'D:\\AETHER_V4\\DSH-Voice\\models\\ggml-large-v3-turbo-q5_0.bin',
  language: 'ru',
};
transcribe('D:\\AETHER_V4\\DSH-Voice\\audio\\_check_piper.wav', settings)
  .then(r => console.log('движок:', r.engine, '| мс:', r.ms, '| текст:', JSON.stringify(r.text)))
  .catch(e => { console.error('ОШИБКА:', e.message, e.stderr ? String(e.stderr).slice(0, 300) : ''); process.exit(1); });