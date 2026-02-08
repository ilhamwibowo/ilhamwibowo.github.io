/**
 * fx.js
 * -----
 * Visual effects layer for the portfolio site.
 *
 * Exports:
 *   - Cursor              -- smooth, lerp-based custom cursor with interactive scaling
 *   - TextScramble        -- cyberpunk cipher-decode text animation
 *   - initTiltCards()     -- subtle 3D tilt on hover for [data-tilt] cards
 *   - initRevealAnimations() -- sets initial hidden state for scroll-reveal elements
 *   - initMagnetic()      -- magnetic hover effect with elastic snap-back
 *
 * GSAP is available as a global (loaded via <script> tag). Do NOT import it.
 */

// ======================================================================
//  1. CUSTOM CURSOR
// ======================================================================

export class Cursor {

    constructor() {
        // Grab the two cursor elements from the DOM
        this.cursorEl  = document.getElementById('cursor');
        this.dotEl     = document.getElementById('cursor-dot');

        // If either element is missing (e.g. hidden on mobile), bail gracefully
        this.enabled = !!(this.cursorEl && this.dotEl);

        // Normalised mouse position (-1 to 1) -- exposed for external consumers
        // such as the background shader
        this.x = 0;
        this.y = 0;

        // Raw pixel mouse position
        this.px = 0;
        this.py = 0;

        // Internal lerped positions for the outer ring and inner dot
        this._cursorX = 0;
        this._cursorY = 0;
        this._dotX    = 0;
        this._dotY    = 0;

        // Lerp factors -- lower = more lag (silkier), higher = snappier
        this._lerpCursor = 0.15;
        this._lerpDot    = 0.5;

        // Bound handlers so we can remove them later
        this._onMouseMove  = this._handleMouseMove.bind(this);
        this._onMouseEnter = this._handleInteractiveEnter.bind(this);
        this._onMouseLeave = this._handleInteractiveLeave.bind(this);

        if (this.enabled) {
            this._addListeners();
        }
    }

    // ------------------------------------------------------------------
    //  Event wiring
    // ------------------------------------------------------------------

    /**
     * Registers global mousemove and interactive-element hover listeners.
     */
    _addListeners() {
        document.addEventListener('mousemove', this._onMouseMove);

        // Scale up cursor when hovering interactive elements
        const interactiveSelectors = 'a, button, [data-tilt], .tag, .contact-link, .side-nav-dot';
        this._interactives = document.querySelectorAll(interactiveSelectors);

        this._interactives.forEach((el) => {
            el.addEventListener('mouseenter', this._onMouseEnter);
            el.addEventListener('mouseleave', this._onMouseLeave);
        });
    }

    /**
     * Handles raw mousemove events. Updates pixel and normalised positions.
     * @param {MouseEvent} e
     */
    _handleMouseMove(e) {
        this.px = e.clientX;
        this.py = e.clientY;

        // Normalise to -1 ... +1 range (useful for shaders / 3D scene)
        this.x = (e.clientX / window.innerWidth)  * 2 - 1;
        this.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    /**
     * Expands the cursor ring when entering an interactive element.
     */
    _handleInteractiveEnter() {
        if (!this.cursorEl) return;
        this.cursorEl.classList.add('cursor--active');
    }

    /**
     * Resets the cursor ring when leaving an interactive element.
     */
    _handleInteractiveLeave() {
        if (!this.cursorEl) return;
        this.cursorEl.classList.remove('cursor--active');
    }

    // ------------------------------------------------------------------
    //  Frame update
    // ------------------------------------------------------------------

    /**
     * Called every frame (via requestAnimationFrame in the main loop).
     * Lerps the cursor elements toward the true mouse position for that
     * signature buttery-smooth trailing feel.
     */
    update() {
        if (!this.enabled) return;

        // Linear interpolation helper
        const lerp = (a, b, t) => a + (b - a) * t;

        // Lerp the outer ring (slower, more dramatic lag)
        this._cursorX = lerp(this._cursorX, this.px, this._lerpCursor);
        this._cursorY = lerp(this._cursorY, this.py, this._lerpCursor);

        // Lerp the inner dot (faster, snappier)
        this._dotX = lerp(this._dotX, this.px, this._lerpDot);
        this._dotY = lerp(this._dotY, this.py, this._lerpDot);

        // Apply transforms (translate -50% so they centre on the mouse)
        this.cursorEl.style.transform =
            `translate(${this._cursorX}px, ${this._cursorY}px) translate(-50%, -50%)`;

        this.dotEl.style.transform =
            `translate(${this._dotX}px, ${this._dotY}px) translate(-50%, -50%)`;
    }

    // ------------------------------------------------------------------
    //  Cleanup
    // ------------------------------------------------------------------

    /**
     * Removes all event listeners so the instance can be garbage-collected.
     */
    destroy() {
        document.removeEventListener('mousemove', this._onMouseMove);

        if (this._interactives) {
            this._interactives.forEach((el) => {
                el.removeEventListener('mouseenter', this._onMouseEnter);
                el.removeEventListener('mouseleave', this._onMouseLeave);
            });
        }
    }
}


// ======================================================================
//  2. TEXT SCRAMBLE EFFECT
// ======================================================================

export class TextScramble {

    /**
     * @param {HTMLElement} el - The DOM element whose text content will be scrambled.
     */
    constructor(el) {
        this.el = el;

        // Characters used for the scramble / cipher noise
        this.chars = '!<>-_\\/[]{}=+*^?#________';

        // We will track animation frames so we can cancel if needed
        this._frameId = null;
    }

    /**
     * Animates the element text from its current value to `newText`, cycling
     * through random cipher characters along the way.
     *
     * @param {string} newText - Target text to resolve to.
     * @returns {Promise<void>} Resolves when the animation completes.
     */
    setText(newText) {
        const oldText = this.el.innerText;
        const length  = Math.max(oldText.length, newText.length);

        // Build a queue entry for every character position
        const queue = [];
        for (let i = 0; i < length; i++) {
            const from  = oldText[i] || '';
            const to    = newText[i] || '';
            const start = Math.floor(Math.random() * 30);
            const end   = start + Math.floor(Math.random() * 30) + 10;
            queue.push({ from, to, start, end, char: undefined });
        }

        // Cancel any existing animation
        if (this._frameId) {
            cancelAnimationFrame(this._frameId);
        }

        let frame = 0;

        return new Promise((resolve) => {
            const step = () => {
                let output   = '';
                let complete = 0;

                for (let i = 0; i < queue.length; i++) {
                    const { from, to, start, end } = queue[i];

                    if (frame >= end) {
                        // Character has resolved to its final value
                        complete++;
                        output += to;
                    } else if (frame >= start) {
                        // Character is actively scrambling -- pick a random cipher char
                        if (!queue[i].char || Math.random() < 0.28) {
                            queue[i].char = this._randomChar();
                        }
                        output += `<span class="scramble-char">${queue[i].char}</span>`;
                    } else {
                        // Character has not started transitioning yet
                        output += from;
                    }
                }

                this.el.innerHTML = output;
                frame++;

                if (complete === queue.length) {
                    // All characters have resolved -- we are done
                    resolve();
                } else {
                    this._frameId = requestAnimationFrame(step);
                }
            };

            this._frameId = requestAnimationFrame(step);
        });
    }

    /**
     * Returns a random character from the scramble character set.
     * @returns {string}
     */
    _randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
}


// ======================================================================
//  3. TILT CARD EFFECT
// ======================================================================

/**
 * Initialises a subtle 3D tilt-on-hover effect for all elements carrying
 * the [data-tilt] attribute.
 *
 * On mousemove the card tilts up to 5 degrees around each axis and exposes
 * --mouse-x / --mouse-y CSS custom properties so the stylesheet can render
 * a radial gradient glow at the pointer position.
 */
export function initTiltCards() {
    const cards = document.querySelectorAll('[data-tilt]');

    if (!cards.length) return;

    const MAX_TILT = 5; // degrees

    cards.forEach((card) => {
        // --- Mousemove: compute tilt and custom properties ---
        card.addEventListener('mousemove', (e) => {
            const rect   = card.getBoundingClientRect();
            const width  = rect.width;
            const height = rect.height;

            // Mouse position relative to card centre, normalised -1 to +1
            const relX = ((e.clientX - rect.left) / width  - 0.5) * 2;
            const relY = ((e.clientY - rect.top)  / height - 0.5) * 2;

            // Tilt values (invert Y so tilting toward mouse feels natural)
            const tiltX =  relX * MAX_TILT;
            const tiltY = -relY * MAX_TILT;

            gsap.to(card, {
                rotateX: tiltY,
                rotateY: tiltX,
                transformPerspective: 1000,
                duration: 0.4,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            // Expose normalised 0-1 mouse position for CSS radial gradient glow
            const mouseXNorm = (e.clientX - rect.left) / width;
            const mouseYNorm = (e.clientY - rect.top)  / height;
            card.style.setProperty('--mouse-x', mouseXNorm.toFixed(3));
            card.style.setProperty('--mouse-y', mouseYNorm.toFixed(3));
        });

        // --- Mouseleave: smoothly reset ---
        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                rotateX: 0,
                rotateY: 0,
                duration: 0.6,
                ease: 'power3.out',
                overwrite: 'auto'
            });
        });
    });
}


// ======================================================================
//  4. REVEAL ANIMATION INIT (initial hidden states)
// ======================================================================

/**
 * Sets the initial CSS state for every element that will later be revealed
 * by ScrollManager. This must run before ScrollManager creates its
 * ScrollTrigger instances so that the "from" state is already in place.
 *
 * We use gsap.set (instant, no transition) to avoid a flash of styled
 * content before the scroll animations kick in.
 *
 * The .char elements get y:60, opacity:0, rotateX:90 as their initial
 * hidden state. The ScrollManager hero entrance will animate them TO visible.
 */
export function initRevealAnimations() {

    // --- Hero character spans (split-text style entrance) ---
    gsap.set('.char', { opacity: 0, y: 60, rotateX: 90, transformOrigin: 'bottom' });

    // --- Hero subtitle ---
    gsap.set('#hero-subtitle', { opacity: 0, y: 20 });

    // --- Scroll CTA ---
    gsap.set('.scroll-cta', { opacity: 0 });

    // --- Content reveal elements (clip-path mask for cinematic reveal) ---
    gsap.set('.reveal-text', { opacity: 0, y: 40, clipPath: 'inset(100% 0 0 0)' });
    gsap.set('.reveal-up',   { opacity: 0, y: 50, scale: 0.97 });

    // --- Section labels (slide in from left) ---
    gsap.set('.section-label', { opacity: 0, x: -30, clipPath: 'inset(0 100% 0 0)' });
}


// ======================================================================
//  5. MAGNETIC HOVER EFFECT
// ======================================================================

/**
 * Applies a magnetic hover effect to interactive UI elements.
 * On mousemove within an element, the element shifts slightly toward the
 * cursor (30% of the offset from center). On mouseleave, an elastic ease
 * snaps the element back to its original position for a satisfying feel.
 *
 * Targets: .side-nav-dot, .audio-toggle, .contact-link
 */
export function initMagnetic() {
    const targets = document.querySelectorAll('.side-nav-dot, .audio-toggle, .contact-link');

    if (!targets.length) return;

    targets.forEach((el) => {
        // --- Mousemove: pull element toward cursor ---
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            // Offset from center of the element
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            gsap.to(el, {
                x: x * 0.3,
                y: y * 0.3,
                duration: 0.4,
                ease: 'power2.out'
            });
        });

        // --- Mouseleave: elastic snap back to origin ---
        el.addEventListener('mouseleave', () => {
            gsap.to(el, {
                x: 0,
                y: 0,
                duration: 0.6,
                ease: 'elastic.out(1, 0.3)'
            });
        });
    });
}
