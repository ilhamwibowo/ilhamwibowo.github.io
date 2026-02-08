/**
 * audio.js
 * --------
 * Procedural Ambient Space Audio
 *
 * Creates a layered ambient soundscape using the Web Audio API.
 * Five layers combine to produce a deep, atmospheric space hum:
 *   1. Deep bass drone (55 Hz sine)
 *   2. Mid harmonic (110 Hz sine)
 *   3. High ethereal tone (220 Hz sine, slightly detuned)
 *   4. Filtered white noise (cosmic hiss)
 *   5. Very slow LFO modulating the bass frequency
 *
 * No external dependencies -- pure Web Audio API.
 */

export class AudioManager {
    /**
     * @param {HTMLElement} toggleButton - The #audio-toggle DOM element.
     */
    constructor(toggleButton) {
        this.toggleButton = toggleButton;
        this.playing = false;
        this.sources = [];
        this.ctx = null;
        this.masterGain = null;

        // Bind the click handler so it can be removed later if needed
        this._handleClick = () => this.toggle();
        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', this._handleClick);
        }
    }

    // -------------------------------------------------------
    // init -- Build the entire audio graph (called on first play)
    // -------------------------------------------------------
    init() {
        // Create AudioContext, handling the webkit prefix for older Safari
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            console.warn('AudioManager: Web Audio API is not supported in this browser.');
            return;
        }
        this.ctx = new AudioCtx();

        // Master gain -- starts at 0 so we can fade in smoothly
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // ---------------------------
        // LAYER 1: Deep bass drone
        // ---------------------------
        const bassOsc = this.ctx.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

        const bassGain = this.ctx.createGain();
        bassGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

        bassOsc.connect(bassGain);
        bassGain.connect(this.masterGain);

        // ---------------------------
        // LAYER 2: Mid harmonic
        // ---------------------------
        const midOsc = this.ctx.createOscillator();
        midOsc.type = 'sine';
        midOsc.frequency.setValueAtTime(110, this.ctx.currentTime);

        const midGain = this.ctx.createGain();
        midGain.gain.setValueAtTime(0.025, this.ctx.currentTime);

        midOsc.connect(midGain);
        midGain.connect(this.masterGain);

        // ---------------------------
        // LAYER 3: High ethereal tone
        // ---------------------------
        const highOsc = this.ctx.createOscillator();
        highOsc.type = 'sine';
        highOsc.frequency.setValueAtTime(220, this.ctx.currentTime);
        highOsc.detune.setValueAtTime(3, this.ctx.currentTime); // slight detune for shimmer

        const highGain = this.ctx.createGain();
        highGain.gain.setValueAtTime(0.008, this.ctx.currentTime);

        highOsc.connect(highGain);
        highGain.connect(this.masterGain);

        // ---------------------------
        // LAYER 4: Filtered noise (cosmic hiss)
        // ---------------------------
        // Generate 2 seconds of white noise into an AudioBuffer
        const sampleRate = this.ctx.sampleRate;
        const bufferLength = sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferLength, sampleRate);
        const channelData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferLength; i++) {
            channelData[i] = Math.random() * 2 - 1;
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        // Low-pass filter to tame the noise into a soft hiss
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(150, this.ctx.currentTime);
        noiseFilter.Q.setValueAtTime(1, this.ctx.currentTime);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.012, this.ctx.currentTime);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        // ---------------------------
        // LAYER 5: Very slow LFO modulating bass frequency
        // ---------------------------
        // The LFO subtly shifts the bass drone's pitch, adding organic movement
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.05, this.ctx.currentTime); // one cycle every 20 seconds

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(2, this.ctx.currentTime); // modulation depth in Hz

        lfo.connect(lfoGain);
        lfoGain.connect(bassOsc.frequency); // modulate the bass oscillator frequency

        // ---------------------------
        // Start all audio sources
        // ---------------------------
        const now = this.ctx.currentTime;
        bassOsc.start(now);
        midOsc.start(now);
        highOsc.start(now);
        noiseSource.start(now);
        lfo.start(now);

        // Keep references for cleanup
        this.sources = [bassOsc, midOsc, highOsc, noiseSource, lfo];
    }

    // -------------------------------------------------------
    // start -- Fade in the ambient audio
    // -------------------------------------------------------
    start() {
        if (this.playing) return;

        // Lazily initialise on first interaction (respects browser autoplay policy)
        if (!this.ctx) this.init();

        // If init failed (unsupported browser), bail out
        if (!this.ctx) return;

        // Resume a suspended context (required after user gesture in many browsers)
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // Smooth fade-in from 0 to 1 over 2 seconds
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(1, now + 2);

        this.playing = true;
        if (this.toggleButton) this.toggleButton.classList.add('active');
    }

    // -------------------------------------------------------
    // stop -- Fade out and silence the audio
    // -------------------------------------------------------
    stop() {
        if (!this.playing || !this.ctx) return;

        // Smooth fade-out from current level to 0 over 1.5 seconds
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + 1.5);

        // After the fade completes, stop all sources and tear down the graph
        // so the next start() rebuilds everything fresh
        this._fadeTimeout = setTimeout(() => {
            this._stopAllSources();
            if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
            this.masterGain = null;
        }, 1600); // slightly longer than the 1.5s fade to avoid clipping

        this.playing = false;
        if (this.toggleButton) this.toggleButton.classList.remove('active');
    }

    // -------------------------------------------------------
    // toggle -- Convenience method bound to the button
    // -------------------------------------------------------
    toggle() {
        if (this.playing) this.stop(); else this.start();
    }

    // -------------------------------------------------------
    // destroy -- Full teardown (page unload, SPA navigation, etc.)
    // -------------------------------------------------------
    destroy() {
        if (this._fadeTimeout) clearTimeout(this._fadeTimeout);
        this._stopAllSources();
        if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
        this.masterGain = null;
        this.playing = false;
        if (this.toggleButton) {
            this.toggleButton.removeEventListener('click', this._handleClick);
            this.toggleButton.classList.remove('active');
        }
    }

    // -------------------------------------------------------
    // _stopAllSources -- Internal helper
    // -------------------------------------------------------
    _stopAllSources() {
        this.sources.forEach((src) => { try { src.stop(); } catch (_) {} });
        this.sources = [];
    }
}
