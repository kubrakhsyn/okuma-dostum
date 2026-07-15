"use strict";

/* ================================================================
   MODÜL 1 — TÜRKÇE HECELEYİCİ
   TDK uyumlu: ünlü-odaklı, VC-CV, V-CV, VCC-CV yapıları
   Türkçe karakter desteği: ı İ ş Ş ğ Ğ ç Ç ö Ö ü Ü
================================================================ */

const VOWELS      = new Set([...'aeıioöuüAEIİOÖUÜ']);
const TR_LETTER_RE = /[a-zA-ZçÇğĞıIiİöÖşŞüÜ]/;

function isVowel(ch)  { return VOWELS.has(ch); }

/**
 * Tek Türkçe kelimeyi TDK kurallarıyla heceler.
 * Kural özeti:
 *   0 ünsüz (V|V)  → ünlüler arasında kes
 *   1 ünsüz (V|CV) → ünsüz sonraki heceye geçer
 *   2 ünsüz (VC|CV)→ ikinci ünsüz sonraki heceye
 *   3+ ünsüz       → son ünsüz(ler) sonraki heceye
 */
function syllabifyWord(word) {
  if (word.length <= 1) return [word];

  const vi = [];   // ünlü indeksleri
  for (let i = 0; i < word.length; i++) {
    if (isVowel(word[i])) vi.push(i);
  }
  if (vi.length <= 1) return [word];

  const cuts = [];
  for (let v = 0; v < vi.length - 1; v++) {
    const curV = vi[v], nxtV = vi[v + 1];
    const cons = [];
    for (let i = curV + 1; i < nxtV; i++) cons.push(i);
    if      (cons.length === 0) cuts.push(nxtV);
    else if (cons.length === 1) cuts.push(cons[0]);
    else if (cons.length === 2) cuts.push(cons[1]);
    else                        cuts.push(cons[cons.length - 1]);
  }

  const syls = [];
  let prev = 0;
  for (const c of cuts) { syls.push(word.slice(prev, c)); prev = c; }
  syls.push(word.slice(prev));
  return syls.filter(s => s.length > 0);
}

/** Token (kelime + yapışık noktalama) → hece dizisi */
function tokenize(token) {
  const m = token.match(/^([^a-zA-ZçÇğĞıIiİöÖşŞüÜ]*)([a-zA-ZçÇğĞıIiİöÖşŞüÜ]+)([^a-zA-ZçÇğĞıIiİöÖşŞüÜ]*)$/);
  if (!m) return [token];
  const [, pre, word, post] = m;
  const r = [];
  if (pre)  r.push(pre);
  r.push(...syllabifyWord(word));
  if (post) r.push(post);
  return r;
}


/* ================================================================
   MODÜL 2 — METİN DÖNÜŞTÜRMESİ
   Her kelime .word-token span'ına sarılır (TTS vurgusu için).
   Heceleme açıksa her hece ayrıca .hece-N span'ına sarılır.
================================================================ */

const HECE_CLASSES = ['hece-1', 'hece-2', 'hece-3', 'hece-4', 'hece-5'];

function renderOutput(text, useSyllables) {
  const area = document.getElementById('outputArea');
  area.innerHTML = '';
  area.classList.remove('empty');

  let wordIndex = 0;
  const parts   = text.split(/(\s+)/);

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      area.appendChild(document.createTextNode(part));
      continue;
    }

    const wordSpan = document.createElement('span');
    wordSpan.className           = 'word-token';
    wordSpan.dataset.wordIndex   = wordIndex++;

    if (!useSyllables) {
      wordSpan.textContent = part;
    } else {
      const sylParts = tokenize(part);
      let hi = 0;
      for (const syl of sylParts) {
        if (!syl) continue;
        if (TR_LETTER_RE.test(syl)) {
          const s       = document.createElement('span');
          s.className   = 'hece ' + HECE_CLASSES[hi % HECE_CLASSES.length];
          s.textContent = syl;
          wordSpan.appendChild(s);
          hi++;
        } else {
          wordSpan.appendChild(document.createTextNode(syl));
        }
      }
    }
    area.appendChild(wordSpan);
  }
}

function convertText() {
  const text = document.getElementById('inputText').value.trim();
  if (!text) { alert('Lütfen önce bir metin girin.'); return; }

  stopTTS();

  const useSyl = document.getElementById('syllableToggle').value === 'on';
  renderOutput(text, useSyl);
  document.getElementById('legend').style.display = useSyl ? 'flex' : 'none';

  const wc = countWords(text);
  document.getElementById('wordBadge').textContent = wc + ' kelime';
  document.getElementById('ttsStatus').textContent = '';
}


/* ================================================================
   MODÜL 3 — KELIME & SÜRE ANALİZİ
================================================================ */

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(t => TR_LETTER_RE.test(t)).length;
}

function calcWPM(wc, ms) {
  return ms > 0 ? Math.round(wc / (ms / 60000)) : 0;
}

function loadPrevWPM()    { const r = localStorage.getItem('disleksi_prev_wpm'); return r ? parseFloat(r) : null; }
function savePrevWPM(wpm) { localStorage.setItem('disleksi_prev_wpm', wpm.toString()); }


/* ================================================================
   MODÜL 4 — KRONOMETER (10ms hassasiyet)
================================================================ */

let timerInterval  = null;
let startTimestamp = 0;
let accumulatedMs  = 0;
let running        = false;
const sessionHistory = [];

function p2(n) { return String(n).padStart(2, '0'); }

function updateDisplay(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  document.getElementById('timerDisplay').innerHTML =
    p2(m) + '<span class="unit">dk</span> ' +
    p2(s) + '<span class="unit">sn</span> ' +
    '<span style="font-size:0.55em;color:var(--text-muted)">' + p2(c) + '</span>' +
    '<span class="unit" style="font-size:0.3em">sal</span>';
}

function startTimer() {
  if (running) return;
  running        = true;
  startTimestamp = Date.now();
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled  = false;
  timerInterval = setInterval(() => {
    updateDisplay(accumulatedMs + (Date.now() - startTimestamp));
  }, 10);
}

function stopTimer() {
  if (!running) return;
  running = false;
  clearInterval(timerInterval);
  accumulatedMs += Date.now() - startTimestamp;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
  generateReport(accumulatedMs);
}

function resetTimer() {
  clearInterval(timerInterval);
  running = false; accumulatedMs = 0; startTimestamp = 0;
  updateDisplay(0);
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
}


/* ================================================================
   MODÜL 5 — RAPOR ÜRETİCİ
================================================================ */

function generateReport(totalMs) {
  const text      = document.getElementById('inputText').value.trim();
  const wc        = countWords(text);
  const charCount = text.length;
  if (!wc || !totalMs) return;

  const wpm     = calcWPM(wc, totalMs);
  const prevWPM = loadPrevWPM();
  savePrevWPM(wpm);

  const m    = Math.floor(totalMs / 60000);
  const s    = Math.floor((totalMs % 60000) / 1000);
  const c    = Math.floor((totalMs % 1000) / 10);
  const dur  = p2(m) + ':' + p2(s) + ':' + p2(c);
  const now  = new Date();

  sessionHistory.push({
    time: now.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }),
    wc, dur, wpm
  });

  document.getElementById('reportGrid').innerHTML = `
    <div class="report-card">
      <div class="report-card-label">Okuma Süresi</div>
      <div class="report-card-value">${dur}</div>
      <div class="report-card-unit">dk:sn:sal</div>
    </div>
    <div class="report-card">
      <div class="report-card-label">Kelime Sayısı</div>
      <div class="report-card-value">${wc}</div>
      <div class="report-card-unit">kelime</div>
    </div>
    <div class="report-card">
      <div class="report-card-label">Karakter</div>
      <div class="report-card-value">${charCount}</div>
      <div class="report-card-unit">karakter</div>
    </div>
    <div class="report-card">
      <div class="report-card-label">Okuma Hızı</div>
      <div class="report-card-value">${wpm}</div>
      <div class="report-card-unit">kelime/dakika</div>
    </div>`;

  let comment = `<strong>${dur}</strong> sürede <strong>${wc} kelime</strong> okudunuz.
    Dakikada ortalama <strong>${wpm} kelime</strong>.`;

  if (prevWPM !== null && prevWPM !== wpm) {
    const diff = wpm - prevWPM;
    const pct  = Math.abs(Math.round((diff / prevWPM) * 100));
    const dir  = diff > 0 ? 'hızlısınız' : 'yavaşsınız';
    const col  = diff > 0 ? '#2e8a3e' : '#b52020';
    comment   += ` <span style="color:${col};font-weight:700;">
      Önceki okumanıza göre %${pct} daha ${dir} (${diff > 0 ? '+' : ''}${diff} kelime/dk).
    </span>`;
    comment   += diff > 0 ? ' Harika ilerleme! 🎉' : ' Yavaş okumak bazen daha iyi anlamlandırma sağlar.';
  } else if (prevWPM === null) {
    comment += ' Kıyaslama için bir okuma daha tamamlayın.';
  } else {
    comment += ' Önceki okumanızla tam aynı hızdasınız!';
  }

  document.getElementById('reportComment').innerHTML = comment;
  document.getElementById('historyList').innerHTML = sessionHistory
    .slice().reverse()
    .map((h, i) => `<div class="history-row">
      <span>${sessionHistory.length - i}. Okuma (${h.time})</span>
      <span>${h.wc} kelime · ${h.dur} · ${h.wpm} kelime/dk</span>
    </div>`).join('');

  const sec = document.getElementById('reportSection');
  sec.classList.add('visible');
  setTimeout(() => sec.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}


/* ================================================================
   MODÜL 6 — DİNAMİK SATIR ODAKLAYICI (Focus Ruler)

   Temel mantık:
   - Üç positioned div (maskTop / band / maskBottom) fare Y'sine göre
     inline style ile her mousemove'da konumlandırılır.
   - Band yüksekliği sabit DEĞİL; fontSizeSelect değişince
     updateRulerHeight() çağrılır ve rulerHalf değişkeni güncellenir.
   - Formül: rulerHalf = currentFontSizePx × 1.8
       Küçük (14px) → 25px  → toplam band 50px
       Orta  (17px) → 30px  → toplam band 60px  ← varsayılan
       Büyük (22px) → 40px  → toplam band 80px
   - Bu yaklaşım bir satır yüksekliğini (line-height 1.85 ile)
     rahatça kapsayan, yazı boyutuna orantılı bir şerit sağlar.
================================================================ */

let rulerActive = false;
let rulerHalf   = 30;    // başlangıç: Orta (17px × 1.8 ≈ 30)

const FONT_SIZES = { 'fs-small': 14, 'fs-medium': 17, 'fs-large': 22 };
const RULER_MULT = 1.8;  // satır yüksekliği çarpanı

const rulerEl    = document.getElementById('focusRuler');
const maskTop    = document.getElementById('rulerMaskTop');
const rulerBand  = document.getElementById('rulerBand');
const maskBottom = document.getElementById('rulerMaskBottom');
const rulerBtn   = document.getElementById('rulerBtn');

/**
 * Seçili font-size sınıfına göre rulerHalf günceller
 * ve şerit yüksekliğini anında yansıtır.
 * @param {string} fsClass — 'fs-small' | 'fs-medium' | 'fs-large'
 */
function updateRulerHeight(fsClass) {
  const px = FONT_SIZES[fsClass] || 17;
  rulerHalf = Math.round(px * RULER_MULT);
  // Şerit yüksekliğini inline style olarak güncelle
  rulerBand.style.height = (rulerHalf * 2) + 'px';
}

/**
 * Fare konumuna göre üç katmanı konumlandırır.
 * passive:true → scroll performansını korur.
 */
function updateRuler(e) {
  if (!rulerActive) return;
  const y    = e.clientY;
  const top  = y - rulerHalf;
  const bot  = y + rulerHalf;
  const winH = window.innerHeight;

  maskTop.style.height    = Math.max(0, top) + 'px';
  rulerBand.style.top     = Math.max(0, top) + 'px';
  maskBottom.style.top    = Math.min(winH, bot) + 'px';
  maskBottom.style.height = Math.max(0, winH - bot) + 'px';
}

function toggleRuler() {
  rulerActive           = !rulerActive;
  rulerEl.style.display = rulerActive ? 'block' : 'none';
  rulerBtn.textContent  = '👁 Odaklayıcı: ' + (rulerActive ? 'Açık' : 'Kapalı');
  rulerBtn.className    = 'btn ' + (rulerActive ? 'btn-ruler-on' : 'btn-neutral btn-ruler-off');
}

document.addEventListener('mousemove', updateRuler, { passive: true });

// Başlangıçta şerit yüksekliğini ayarla (Orta)
updateRulerHeight('fs-medium');


/* ================================================================
   MODÜL 7 — SESLİ OKUMA + SENKRONİZE VURGU (Web Speech API tr-TR)

   Hız slider entegrasyonu:
   - #speedSlider değeri okunur → utterance.rate'e atanır
   - Okuma sırasında slider değiştirilirse bir sonraki okumaya yansır

   Senkronize vurgulama (iki katmanlı):
   1. Kelime düzeyi: .word-token.tts-active  → sarı arka plan + outline
   2. Hece düzeyi : .word-token.tts-active .hece → daha açık sarı parlaklık
      (CSS'te .word-token.tts-active .hece { background: var(--tts-hece-bg) }
       kuralıyla, ekstra JS olmadan sadece CSS cascade ile çalışır.)

   charIndexToWordIndex():
   - onboundary e.charIndex (okunmakta olan kelimenin metnin başından
     itibaren karakter ofseti) → hangi .word-token'ın aralığında olduğunu
     kümülatif uzunluk hesabıyla bulur.
================================================================ */

let ttsActive    = false;
let ttsUtterance = null;

const ttsBtn    = document.getElementById('ttsBtn');
const ttsStatus = document.getElementById('ttsStatus');
const speedSlider = document.getElementById('speedSlider');
const speedValue  = document.getElementById('speedValue');

/* Slider görsel güncellemesi
   Renk geçişi: dolgu kısmı var(--accent), boş kısım var(--border) */
function updateSliderUI(val) {
  const pct = ((val - 0.5) / (1.5 - 0.5)) * 100;
  speedSlider.style.background =
    `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
  speedValue.textContent = parseFloat(val).toFixed(2) + '×';
}

speedSlider.addEventListener('input', function () {
  updateSliderUI(this.value);
  // Eğer TTS çalışıyorsa, mevcut okumayı yeniden başlatmak
  // gerekir (Web Speech API rate'i anında değiştirmeyi desteklemez).
  // Kullanıcıya bilgi ver, otomatik yeniden başlatma YOK
  // (metni kesip devam etmek daha kötü UX verir).
  if (ttsActive) {
    ttsStatus.textContent = '⚠ Hız değişikliği bir sonraki okumada geçerli olacak.';
  }
});

// Başlangıç slider görünümü
updateSliderUI(speedSlider.value);

/** #outputArea'nın saf metin içeriği */
function getOutputText() {
  const a = document.getElementById('outputArea');
  return a.classList.contains('empty') ? '' : (a.textContent || '');
}

function clearTTSHighlight() {
  document.querySelectorAll('.word-token.tts-active')
    .forEach(el => el.classList.remove('tts-active'));
}

/**
 * e.charIndex → ilgili .word-token indeksi
 * Her token'ın textContent.length + 1 (boşluk) kümülatif olarak eklenir;
 * charIndex bu aralığa düşen token döndürülür.
 */
function charIndexToWordIndex(tokens, charIndex) {
  let offset = 0;
  for (let i = 0; i < tokens.length; i++) {
    offset += tokens[i].textContent.length + 1;
    if (charIndex < offset) return i;
  }
  return tokens.length - 1;
}

function stopTTS() {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  ttsActive    = false;
  ttsUtterance = null;
  clearTTSHighlight();
  ttsBtn.textContent    = '🔊 Sesli Oku';
  ttsBtn.className      = 'btn btn-info';
  ttsStatus.textContent = '';
}

function toggleTTS() {
  if (!('speechSynthesis' in window)) {
    alert('Tarayıcınız sesli okumayı desteklemiyor.\nLütfen güncel Chrome veya Edge kullanın.');
    return;
  }
  if (ttsActive) { stopTTS(); return; }

  const text = getOutputText().trim();
  if (!text) { alert('Önce metni dönüştürün.'); return; }

  ttsActive             = true;
  ttsBtn.textContent    = '⏹ Durdur';
  ttsBtn.className      = 'btn btn-tts-playing';
  ttsStatus.textContent = '🔊 Okunuyor...';

  const tokens   = document.querySelectorAll('#outputArea .word-token');
  const wordList = Array.from(tokens).map(t => t.textContent);

  ttsUtterance        = new SpeechSynthesisUtterance(text);
  ttsUtterance.lang   = 'tr-TR';
  ttsUtterance.rate   = parseFloat(speedSlider.value);  // ← slider değeri
  ttsUtterance.pitch  = 1.0;
  ttsUtterance.volume = 1.0;

  /* onboundary: Chrome/Edge'de her kelime sınırında tetiklenir.
     Kelime ve hece vurgusunu sadece .tts-active CSS sınıfıyla yönetiyoruz;
     hece highlight'ı ayrıca .word-token.tts-active .hece CSS kuralı üstlenir. */
  ttsUtterance.onboundary = function (e) {
    if (e.name !== 'word') return;
    clearTTSHighlight();
    const wIdx = charIndexToWordIndex(tokens, e.charIndex);
    if (tokens[wIdx]) {
      tokens[wIdx].classList.add('tts-active');
      tokens[wIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      ttsStatus.textContent = `📖 "${wordList[wIdx]}" · ${wIdx + 1} / ${tokens.length}`;
    }
  };

  ttsUtterance.onend = function () {
    clearTTSHighlight();
    ttsActive             = false;
    ttsBtn.textContent    = '🔊 Sesli Oku';
    ttsBtn.className      = 'btn btn-info';
    ttsStatus.textContent = '✅ Okuma tamamlandı.';
    setTimeout(() => { ttsStatus.textContent = ''; }, 3000);
  };

  ttsUtterance.onerror = function (e) {
    if (e.error === 'interrupted') return;
    ttsStatus.textContent = '⚠ Sesli okuma hatası: ' + e.error;
    stopTTS();
  };

  speechSynthesis.speak(ttsUtterance);
}


/* ================================================================
   MODÜL 8 — ARAYÜZ OLAYLARI
================================================================ */

// Yazı boyutu değişince:
//  1. body sınıfını güncelle
//  2. rulerHalf değerini yeni font-size'a göre hesapla (Dinamik Ruler)
document.getElementById('fontSizeSelect').addEventListener('change', function () {
  document.body.classList.remove('fs-small', 'fs-medium', 'fs-large');
  document.body.classList.add(this.value);
  updateRulerHeight(this.value);   // ← Dinamik Ruler bağlantısı
});

// Karakter / kelime sayacı
document.getElementById('inputText').addEventListener('input', function () {
  const len = this.value.length;
  const wc  = countWords(this.value);
  const el  = document.getElementById('charCount');
  el.textContent = `${len} / 2000 karakter · ${wc} kelime`;
  el.className   = 'char-count' + (len > 1800 ? ' warn' : '');
  document.getElementById('wordBadge').textContent = wc + ' kelime';
});

// Başlangıç: kronometreyi sıfır göster
updateDisplay(0);