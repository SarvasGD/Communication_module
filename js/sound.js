// js/sound.js
// Озвучка плитки: файл -> content/audio/<id>.mp3 -> речь браузера (speechSynthesis).

function clampVolume(value) {
  const n = Number(value);
  if (!isFinite(n)) return 1; // громкость не задана — по умолчанию максимум
  return Math.min(1, Math.max(0, n));
}

export class Sound {
  constructor(settings) {
    this.settings = settings || {};
    this.volume = clampVolume(this.settings['громкость']);

    this.currentAudio = null;
    this.voice = null;

    this.synth =
      typeof globalThis !== 'undefined' && 'speechSynthesis' in globalThis
        ? globalThis.speechSynthesis
        : null;

    if (this.synth) {
      const load = () => {
        let list = [];
        try {
          list = this.synth.getVoices() || [];
        } catch (e) {
          list = [];
        }
        this.voices = list;
        this.pickVoice();
      };
      load(); // голоса могут быть готовы сразу
      this.synth.addEventListener('voiceschanged', load); // …или прийти позже
    }
  }

  // По возможности мужской русский голос, иначе первый русский.
  pickVoice() {
    const ru = (this.voices || []).filter((v) =>
      String(v.lang || '').toLowerCase().startsWith('ru'),
    );
    if (!ru.length) {
      this.voice = null;
      return;
    }
    const male = ru.find((v) =>
      /pavel|dmitry|павел|дмитрий/i.test(String(v.name || '')),
    );
    this.voice = male || ru[0];
  }

  // Прервать предыдущий звук.
  stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {
        /* ignore */
      }
      this.currentAudio = null;
    }
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {
        /* ignore */
      }
    }
  }

  play(tile) {
    // Новый клик прерывает предыдущий звук.
    this.stop();
    if (!tile || tile.speak === false) return; // «озвучить: нет» — молчим

    let src = null;
    if (tile.sound) src = 'content/' + tile.sound;
    else if (tile.id) src = 'content/audio/' + tile.id + '.mp3';

    if (src) this.tryAudio(src, tile);
    else this.speakText(tile);
  }

  tryAudio(src, tile) {
    let audio;
    try {
      audio = new Audio(src);
    } catch (e) {
      this.speakText(tile);
      return;
    }
    audio.volume = this.volume;
    this.currentAudio = audio;

    let failed = false;
    const fallback = () => {
      if (failed) return;
      failed = true;
      if (this.currentAudio === audio) this.currentAudio = null;
      this.speakText(tile);
    };

    audio.addEventListener('error', fallback);
    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') promise.catch(fallback);
  }

  speakText(tile) {
    if (!this.synth) return;
    const text = tile.spokenText || tile.label || '';
    if (!text) return;

    let utter;
    try {
      utter = new SpeechSynthesisUtterance(text);
    } catch (e) {
      return;
    }
    utter.lang = 'ru-RU';
    utter.volume = this.volume;
    if (this.voice) utter.voice = this.voice;
    this.synth.speak(utter);
  }
}
