/**
 * app.js
 * ------
 * Main entry point for the portfolio site.
 * Orchestrates loading, scene creation, smooth scrolling (Lenis),
 * scroll animations (GSAP + ScrollTrigger), cursor tracking,
 * magnetic effects, audio, and the animation loop.
 *
 * Depends on:
 *   - Lenis (loaded globally via CDN <script> tag)
 *   - gsap + ScrollTrigger (loaded globally via CDN <script> tags)
 *   - Three.js (loaded via importmap)
 *   - Local ES modules: scene.js, scroll.js, fx.js, audio.js
 */

import { Scene } from './scene.js';
import { ScrollManager } from './scroll.js';
import { Cursor, TextScramble, initTiltCards, initRevealAnimations, initMagnetic } from './fx.js';
import { AudioManager } from './audio.js';

// ===================================
// 1. DOM REFERENCES
// ===================================
const canvas         = document.getElementById('bg');
const loader         = document.getElementById('loader');
const loaderCounter  = document.getElementById('loader-counter');
const loaderProgress = document.getElementById('loader-progress');
const audioToggle    = document.getElementById('audio-toggle');

// ===================================
// 2. EXPERIENCE BOOTSTRAP
// ===================================
// Called once the loading counter reaches 100 and the loader fades out.
// Creates and wires together every subsystem.

function startExperience() {

    // ---------------------------------------------------
    // a. Create Lenis smooth scroll instance
    //    Wrapped in a check so we degrade gracefully if
    //    the Lenis CDN script failed to load.
    // ---------------------------------------------------
    let lenis = null;
    try {
        if (typeof Lenis !== 'undefined') {
            lenis = new Lenis({
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                smoothWheel: true,
            });
        } else {
            console.warn('app.js: Lenis not found on window -- smooth scrolling disabled.');
        }
    } catch (err) {
        console.error('app.js: Failed to initialise Lenis.', err);
    }

    // ---------------------------------------------------
    // b. Create the Three.js scene (wrapped in try/catch
    //    in case Three.js failed to load from the CDN)
    // ---------------------------------------------------
    let scene;
    try {
        if (!canvas) {
            console.warn('app.js: #bg canvas element not found -- skipping 3D scene.');
        }
        scene = new Scene(canvas);
    } catch (err) {
        console.error('app.js: Failed to initialise 3D scene.', err);
        // Provide a harmless stub so the rest of the page still works
        scene = {
            setMouse() {},
            setVelocity() {},
            update() {},
            resize() {}
        };
    }

    // ---------------------------------------------------
    // c. Set initial reveal states (must happen before
    //    ScrollManager so GSAP "from" values are in place)
    // ---------------------------------------------------
    initRevealAnimations();

    // ---------------------------------------------------
    // d. Create ScrollManager (registers all ScrollTriggers,
    //    connects Lenis to GSAP, and sets up the hero
    //    character entrance animation)
    // ---------------------------------------------------
    const scroll = new ScrollManager(scene, lenis);

    // ---------------------------------------------------
    // e. Create the custom cursor
    // ---------------------------------------------------
    const cursor = new Cursor();

    // ---------------------------------------------------
    // f. Initialise tilt-on-hover cards
    // ---------------------------------------------------
    initTiltCards();

    // ---------------------------------------------------
    // g. Initialise magnetic hover effects on nav dots,
    //    audio toggle, and contact links
    // ---------------------------------------------------
    initMagnetic();

    // ---------------------------------------------------
    // h. Create the AudioManager (lazy -- no sound until
    //    the user clicks the toggle button)
    // ---------------------------------------------------
    const audio = new AudioManager(audioToggle);

    // ---------------------------------------------------
    // i. Text scramble on the hero subtitle
    //    (NOT the title -- the title uses split-text
    //    stagger via .char spans now)
    // ---------------------------------------------------
    const heroSubtitle = document.getElementById('hero-subtitle');
    if (heroSubtitle) {
        const scrambler = new TextScramble(heroSubtitle);
        // Small delay so it starts after the char animations begin
        setTimeout(() => scrambler.setText('AI / Embedded Systems / Backend Engineer'), 800);
    }

    // ---------------------------------------------------
    // j. Main animation loop
    // ---------------------------------------------------
    function animate() {
        requestAnimationFrame(animate);

        // Feed the lerped cursor position into the scene
        // so particles / camera react to the mouse
        cursor.update();
        scene.setMouse(cursor.x, cursor.y);
        scene.update();
    }
    animate();

    // ---------------------------------------------------
    // k. Handle window resize
    // ---------------------------------------------------
    window.addEventListener('resize', () => {
        scene.resize(window.innerWidth, window.innerHeight);
    });

    // ---------------------------------------------------
    // l. Pause audio when the tab loses focus
    // ---------------------------------------------------
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && audio.playing) {
            audio.stop();
        }
    });
}

// ===================================
// 3. LOADING SEQUENCE
// ===================================
// Animates a counter from 0 to 100 with an eased progression,
// updates the loader UI, then fades out the loader overlay
// and boots the experience.
//
// gsap is expected as a global (loaded via CDN script tag).

(function kickOffLoading() {
    // Guard: if gsap is missing fall back to an instant start
    if (typeof gsap === 'undefined') {
        console.warn('app.js: gsap not found on window -- skipping loader animation.');
        if (loader) loader.classList.add('loaded');
        startExperience();
        return;
    }

    // Guard: if loader DOM elements are missing, start immediately
    if (!loader || !loaderCounter || !loaderProgress) {
        console.warn('app.js: Loader DOM elements not found -- skipping loader animation.');
        startExperience();
        return;
    }

    // Proxy object for gsap to tween
    const loadProgress = { value: 0 };

    gsap.to(loadProgress, {
        value: 100,
        duration: 2.5,
        ease: 'power2.inOut',
        onUpdate() {
            const val = Math.round(loadProgress.value);
            loaderCounter.textContent = val;
            loaderProgress.style.width = val + '%';
        },
        onComplete() {
            // Brief pause so the "100" lingers on screen
            gsap.delayedCall(0.3, () => {
                // Adding the 'loaded' class triggers the CSS fade-out transition
                loader.classList.add('loaded');

                // Wait for the CSS transition to finish (~0.8s) then boot
                gsap.delayedCall(0.8, startExperience);
            });
        }
    });
})();
