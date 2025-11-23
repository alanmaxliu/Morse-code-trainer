const MORSE_CODE = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.'
};

const CHARS_EN = Object.keys(MORSE_CODE).filter(c => /^[A-Z]$/.test(c));
const CHARS_ZH = Object.keys(MORSE_CODE).filter(c => /^[0-9]$/.test(c));

const translations = {
    en: {
        title: 'Morse Code Trainer',
        subtitle: 'Master the art of CW',
        placeholder: 'Press Generate to Start',
        show_answer: 'Show Answer',
        speed: 'Speed (WPM)',
        groups: 'Groups',
        tone: 'Tone (Hz)',
        volume: 'Volume',
        noise_level: 'Noise Level',
        enable_noise: 'Enable Noise',
        generate: 'Generate New',
        play: 'Play',
        stop: 'Stop',
        mode: 'Training Mode',
        mode_en: 'Letters (EN)',
        mode_zh: 'Numbers (ZH Code)'
    },
    'zh-TW': {
        title: '摩斯密碼訓練器',
        subtitle: '精通 CW 的藝術',
        placeholder: '按「產生」開始',
        show_answer: '顯示答案',
        speed: '速度 (WPM)',
        groups: '組數',
        tone: '音調 (Hz)',
        volume: '音量',
        noise_level: '雜訊等級',
        enable_noise: '啟用雜訊',
        generate: '產生新組',
        play: '播放',
        stop: '停止',
        mode: '訓練模式',
        mode_en: '英文字母',
        mode_zh: '數字 (中文電碼)'
    }
};

// DOM Elements
const els = {
    display: document.getElementById('morse-display'),
    showAnswerToggle: document.getElementById('show-answer-toggle'),
    wpmSlider: document.getElementById('wpm-slider'),
    wpmValue: document.getElementById('wpm-value'),
    groupsSlider: document.getElementById('groups-slider'),
    groupsValue: document.getElementById('groups-value'),
    freqSlider: document.getElementById('freq-slider'),
    freqValue: document.getElementById('freq-value'),
    volumeSlider: document.getElementById('volume-slider'),
    volumeValue: document.getElementById('volume-value'),
    noiseSlider: document.getElementById('noise-slider'),
    noiseValue: document.getElementById('noise-value'),
    noiseToggle: document.getElementById('noise-toggle'),
    btnGenerate: document.getElementById('btn-generate'),
    btnPlay: document.getElementById('btn-play'),
    btnStop: document.getElementById('btn-stop'),
    btnStop: document.getElementById('btn-stop'),
    langEn: document.getElementById('lang-en'),
    langZh: document.getElementById('lang-zh'),
    modeEn: document.getElementById('mode-en'),
    modeZh: document.getElementById('mode-zh')
};

// State
let state = {
    text: '',
    lang: 'en',
    mode: 'en', // 'en' (letters) or 'zh' (numbers)
    wpm: 20,
    groups: 1,
    frequency: 600,
    volume: 80,
    noiseVolume: 0,
    noiseEnabled: false,
    isPlaying: false,
    audioCtx: null,
    timeouts: []
};

// Audio Context Singleton
function getAudioContext() {
    if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return state.audioCtx;
}

// Utility: Generate Random Text
function generateText(groupCount = 1) {
    let fullText = [];
    const chars = state.mode === 'en' ? CHARS_EN : CHARS_ZH;

    for (let g = 0; g < groupCount; g++) {
        let str = '';
        for (let i = 0; i < 5; i++) {
            str += chars[Math.floor(Math.random() * chars.length)];
        }
        fullText.push(str);
    }

    // Format: 5 groups per line
    let formattedText = '';
    for (let i = 0; i < fullText.length; i++) {
        formattedText += fullText[i];
        if ((i + 1) % 5 === 0 && i < fullText.length - 1) {
            formattedText += '\n';
        } else if (i < fullText.length - 1) {
            formattedText += ' ';
        }
    }
    return formattedText;
}

// Utility: Update Display
function updateDisplay(text) {
    els.display.innerHTML = '';
    if (!text) {
        els.display.innerHTML = `<span class="placeholder" data-i18n="placeholder">${translations[state.lang].placeholder}</span>`;
        els.display.classList.remove('blurred');
        return;
    }

    // Create spans for each character to allow highlighting
    // We need to preserve newlines. 
    // Split by newline first to handle rows
    const rows = text.split('\n');
    rows.forEach((row, rowIndex) => {
        [...row].forEach(char => {
            const span = document.createElement('span');
            span.textContent = char;
            els.display.appendChild(span);
        });
        // Add a line break after each row except the last
        if (rowIndex < rows.length - 1) {
            const br = document.createElement('br');
            els.display.appendChild(br);
            // We also need to add a "space" span or similar if we want the audio logic to pause?
            // Actually audio logic iterates over the *text* string, not the DOM.
            // So visual representation just needs to match.
        }
    });

    if (els.showAnswerToggle.checked) {
        els.display.classList.remove('blurred');
    } else {
        // Only blur if there is text (not placeholder)
        if (text) els.display.classList.add('blurred');
    }
}

// Audio: Noise Generator
function createNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; // White noise
    }
    return buffer;
}

let noiseNode = null;
let noiseGain = null;

function startNoise() {
    if (!state.noiseEnabled || !state.audioCtx) return;
    stopNoise(); // Ensure no duplicate noise

    const ctx = state.audioCtx;
    const buffer = createNoiseBuffer(ctx);

    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    noiseGain = ctx.createGain();
    // Map 0-100 slider to 0-0.2 gain (noise shouldn't be too loud)
    noiseGain.gain.value = (state.noiseVolume / 100) * 0.15;

    noiseNode.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseNode.start();
}

function stopNoise() {
    if (noiseNode) {
        try { noiseNode.stop(); } catch (e) { }
        noiseNode.disconnect();
        noiseNode = null;
    }
    if (noiseGain) {
        noiseGain.disconnect();
        noiseGain = null;
    }
}

function updateNoiseVolume() {
    if (noiseGain) {
        noiseGain.gain.value = (state.noiseVolume / 100) * 0.15;
    }
}

// Audio: Play Morse
async function playMorse(text) {
    if (state.isPlaying) stopPlayback();

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    state.isPlaying = true;
    updateUIState();
    startNoise();

    // Timing calculations (Standard Morse)
    // Dot = 1 unit
    // Dash = 3 units
    // Intra-char space = 1 unit
    // Inter-char space = 3 units
    // Word space = 7 units (not used here as we generate random chars)

    // Paris standard: 50 units per word. WPM = 1.2 / T_dot (seconds)
    // T_dot (ms) = 1200 / WPM
    const dotDuration = 1200 / state.wpm;

    let startTime = ctx.currentTime + 0.1; // Start slightly in future

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = state.frequency;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.value = 0;
    oscillator.start(startTime);

    let currentTime = startTime;
    const charSpans = els.display.querySelectorAll('span');

    // Schedule audio and visual events
    [...text].forEach((char, index) => {
        const code = MORSE_CODE[char];
        if (!code) return;

        // Play dots/dashes
        if (char === ' ') {
            // Word space = 7 units. 
            // We already added 3 units (inter-char) after the previous char.
            // So we need to add 4 more units to make it 7.
            // However, our loop logic adds 3 units AFTER every char.
            // So if we treat space as a char that takes 4 units and has no sound?
            // Simpler: Just add 4 units of silence here.
            // Wait, standard is:
            // Inter-element: 1 unit (handled in loop)
            // Inter-char: 3 units (handled at end of loop)
            // Inter-word: 7 units.

            // If we encounter a space, it means we finished a word.
            // The previous char loop added 3 units of silence.
            // We need 4 more units to reach 7.
            currentTime += (4 * dotDuration / 1000);
        } else {
            const code = MORSE_CODE[char];
            if (!code) return;

            // Visual Highlight Event
            const highlightTime = (currentTime - ctx.currentTime) * 1000;
            const highlightTimeout = setTimeout(() => {
                charSpans.forEach(s => s.classList.remove('char-highlight'));
                if (charSpans[index]) {
                    const span = charSpans[index];
                    span.classList.add('char-highlight');

                    // Auto-scroll logic
                    const container = els.display;
                    const spanTop = span.offsetTop;
                    const spanBottom = spanTop + span.offsetHeight;
                    const containerTop = container.scrollTop;
                    const containerBottom = containerTop + container.offsetHeight;

                    if (spanBottom > containerBottom || spanTop < containerTop) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, highlightTime);
            state.timeouts.push(highlightTimeout);

            [...code].forEach(symbol => {
                const duration = symbol === '.' ? dotDuration : dotDuration * 3;

                // Ramp up/down to avoid clicking
                // Volume control: map 0-100 to 0-1.0
                const vol = state.volume / 100;
                gainNode.gain.setTargetAtTime(vol, currentTime, 0.001);
                gainNode.gain.setTargetAtTime(0, currentTime + (duration / 1000), 0.001);

                currentTime += (duration / 1000);
                currentTime += (dotDuration / 1000); // Intra-char space
            });

            // Inter-char space (3 units total, we already added 1 unit after last symbol, so add 2 more)
            currentTime += (2 * dotDuration / 1000);
        }
    });

    // Cleanup event
    const totalDuration = (currentTime - ctx.currentTime) * 1000;
    const endTimeout = setTimeout(() => {
        stopPlayback();
    }, totalDuration);
    state.timeouts.push(endTimeout);

    // Stop oscillator eventually
    oscillator.stop(currentTime + 1);
    state.oscillator = oscillator; // Keep ref to stop manually
}

function stopPlayback() {
    state.isPlaying = false;
    updateUIState();
    stopNoise();

    // Clear timeouts
    state.timeouts.forEach(id => clearTimeout(id));
    state.timeouts = [];

    // Stop audio
    if (state.oscillator) {
        try { state.oscillator.stop(); } catch (e) { }
        state.oscillator = null;
    }

    // Clear highlights
    const charSpans = els.display.querySelectorAll('span');
    charSpans.forEach(s => s.classList.remove('char-highlight'));
}

function updateUIState() {
    els.btnPlay.disabled = state.isPlaying;
    els.btnStop.disabled = !state.isPlaying;
    els.btnGenerate.disabled = state.isPlaying;
}

// Event Listeners
els.wpmSlider.addEventListener('input', (e) => {
    state.wpm = parseInt(e.target.value);
    els.wpmValue.textContent = state.wpm;
});

els.groupsSlider.addEventListener('input', (e) => {
    state.groups = parseInt(e.target.value);
    els.groupsValue.textContent = state.groups;
});

els.freqSlider.addEventListener('input', (e) => {
    state.frequency = parseInt(e.target.value);
    els.freqValue.textContent = state.frequency;
});

els.volumeSlider.addEventListener('input', (e) => {
    state.volume = parseInt(e.target.value);
    els.volumeValue.textContent = state.volume;
});

els.noiseSlider.addEventListener('input', (e) => {
    state.noiseVolume = parseInt(e.target.value);
    els.noiseValue.textContent = state.noiseVolume;
    updateNoiseVolume();
});

els.noiseToggle.addEventListener('change', (e) => {
    state.noiseEnabled = e.target.checked;
    if (state.isPlaying) {
        if (state.noiseEnabled) startNoise();
        else stopNoise();
    }
});

els.showAnswerToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        els.display.classList.remove('blurred');
    } else {
        if (state.text) els.display.classList.add('blurred');
    }
});

els.btnGenerate.addEventListener('click', () => {
    state.text = generateText(state.groups);
    updateDisplay(state.text);
});

els.btnPlay.addEventListener('click', () => {
    if (!state.text) {
        state.text = generateText(state.groups);
        updateDisplay(state.text);
    }
    playMorse(state.text);
});

els.btnStop.addEventListener('click', stopPlayback);

function setLanguage(lang) {
    state.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    if (lang === 'en') {
        els.langEn.classList.add('active');
        els.langZh.classList.remove('active');
    } else {
        els.langEn.classList.remove('active');
        els.langZh.classList.add('active');
    }

    // If placeholder is showing, update it (it's handled by updateDisplay('') but we can just re-render if empty)
    if (!state.text) {
        updateDisplay('');
    }
}

els.langEn.addEventListener('click', () => setLanguage('en'));
els.langZh.addEventListener('click', () => setLanguage('zh-TW'));

function setMode(mode) {
    state.mode = mode;
    if (mode === 'en') {
        els.modeEn.classList.add('active');
        els.modeZh.classList.remove('active');
    } else {
        els.modeEn.classList.remove('active');
        els.modeZh.classList.add('active');
    }
    // Regenerate text if needed, or just let user click generate
    // User expectation: switching mode might not immediately change text unless generated
    // But to be helpful, let's clear or regenerate? 
    // Let's just clear to avoid confusion, or regenerate. 
    // Better to regenerate so they see the change immediately.
    state.text = generateText(state.groups);
    updateDisplay(state.text);
    stopPlayback();
}

els.modeEn.addEventListener('click', () => setMode('en'));
els.modeZh.addEventListener('click', () => setMode('zh'));

// Init
updateDisplay('');

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
