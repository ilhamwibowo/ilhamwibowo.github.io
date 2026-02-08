/**
 * scroll.js
 * ---------
 * Manages all scroll-driven animations and section tracking for the portfolio.
 * Uses GSAP and ScrollTrigger (loaded as global scripts, NOT imported).
 * Uses Lenis for smooth scrolling (received as constructor parameter).
 *
 * Responsible for:
 *   - Lenis <-> ScrollTrigger integration
 *   - Scroll velocity tracking (fed to the 3D scene for shader distortion)
 *   - Tracking overall scroll progress and feeding it to the 3D scene
 *   - Hero character entrance with staggered rotation + parallax (using fromTo fix)
 *   - Section reveal animations (.reveal-text, .reveal-up, .section-label)
 *   - Timeline line draw-on-scroll effect
 *   - Horizontal scroll pinning for the projects section
 *   - Side navigation dot activation and click-to-scroll
 *   - Section watermark parallax
 */

export class ScrollManager {

    /**
     * @param {Object} sceneInstance - A Scene object with setScroll, setVelocity methods.
     * @param {Object} lenisInstance - A Lenis smooth scroll instance.
     */
    constructor(sceneInstance, lenisInstance) {
        // Register the ScrollTrigger plugin with GSAP
        gsap.registerPlugin(ScrollTrigger);

        // Keep references to the 3D scene and Lenis instance
        this.scene = sceneInstance;
        this.lenis = lenisInstance;

        // Tracks the current overall scroll progress (0 to 1)
        this.scrollProgress = 0;

        // Tracks the current scroll velocity
        this.velocity = 0;

        // Connect Lenis to GSAP/ScrollTrigger
        this._setupLenisIntegration();

        // Set up each category of scroll-driven behaviour
        this._setupScrollProgress();
        this._setupRevealAnimations();
        this._setupHeroAnimations();
        this._setupHorizontalScroll();
        this._setupWatermarkParallax();
        this._setupSideNav();
    }

    // ------------------------------------------------------------------
    //  Lenis <-> GSAP integration
    // ------------------------------------------------------------------

    /**
     * Connects the Lenis smooth scroll instance to GSAP's ScrollTrigger
     * so that all scroll-driven GSAP animations work with the smooth scroll.
     * Also sets up velocity tracking to feed the 3D scene.
     */
    _setupLenisIntegration() {
        if (!this.lenis) return;

        // Pipe Lenis scroll events into ScrollTrigger
        this.lenis.on('scroll', ScrollTrigger.update);

        // Drive Lenis's RAF from GSAP's ticker for frame-perfect sync
        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });

        // Disable GSAP's lag smoothing so Lenis controls the timing
        gsap.ticker.lagSmoothing(0);

        // Track velocity from Lenis and feed it to the 3D scene shader
        this.lenis.on('scroll', (e) => {
            this.velocity = e.velocity;
            this.scene.setVelocity(Math.abs(e.velocity) * 0.01);
        });
    }

    // ------------------------------------------------------------------
    //  Overall scroll progress
    // ------------------------------------------------------------------

    /**
     * Creates a single ScrollTrigger that spans the entire page and
     * reports normalised progress (0-1) back to the 3D background scene.
     */
    _setupScrollProgress() {
        const progressBar = document.getElementById('scroll-progress');

        ScrollTrigger.create({
            trigger: '#main',
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self) => {
                this.scrollProgress = self.progress;
                this.scene.setScroll(self.progress);

                // Update scroll progress bar
                if (progressBar) {
                    progressBar.style.width = (self.progress * 100) + '%';
                }
            }
        });

        // Add .in-view class to sections for divider line animation
        const sections = document.querySelectorAll('.section');
        sections.forEach((section) => {
            ScrollTrigger.create({
                trigger: section,
                start: 'top 80%',
                onEnter: () => section.classList.add('in-view'),
            });
        });
    }

    // ------------------------------------------------------------------
    //  Hero animations
    // ------------------------------------------------------------------

    /**
     * Two layers of animation for the hero section:
     *   1. Entrance animations that play once on page load (gsap.to from preset hidden state)
     *      - Each .char span staggers in with opacity, y, and rotateX
     *      - Subtitle and scroll CTA fade in after
     *   2. Scroll-driven parallax using gsap.fromTo() with EXPLICIT start values
     *      to prevent the GSAP scrub bug where it captures opacity:0 as the start
     *      value if the entrance animation hasn't completed yet.
     */
    _setupHeroAnimations() {
        const heroSection  = document.querySelector('[data-section="hero"]');
        const heroTitle    = document.querySelector('#hero-title');
        const heroSubtitle = document.querySelector('#hero-subtitle');
        const scrollCta    = document.querySelector('.scroll-cta');
        const chars        = document.querySelectorAll('#hero-title > .char');

        // --- Entrance animations (play on load, not scroll-driven) ---

        // Stagger each character in with opacity, y, and rotateX
        if (chars.length) {
            gsap.to(chars, {
                opacity: 1,
                y: 0,
                rotateX: 0,
                duration: 0.8,
                delay: 0.3,
                stagger: 0.08,
                ease: 'power3.out'
            });
        }

        // Subtitle entrance
        if (heroSubtitle) {
            gsap.to(heroSubtitle, {
                opacity: 1,
                y: 0,
                duration: 1,
                delay: 0.8,
                ease: 'power3.out'
            });
        }

        // Scroll CTA entrance (appears after everything else)
        if (scrollCta) {
            gsap.to(scrollCta, {
                opacity: 1,
                duration: 0.8,
                delay: 1.5,
                ease: 'power2.out'
            });
        }

        // --- Scroll-driven parallax (scrub) ---
        // CRITICAL FIX: Using gsap.fromTo() with explicit start values
        // so that GSAP does not capture the mid-entrance opacity:0 state.
        if (!heroSection) return;

        // Each char gets a cascading parallax departure with slight stagger
        if (chars.length) {
            chars.forEach((char, i) => {
                gsap.fromTo(char,
                    { yPercent: 0, opacity: 1 },
                    {
                        yPercent: -150,
                        opacity: 0,
                        ease: 'none',
                        scrollTrigger: {
                            trigger: heroSection,
                            start: 'top top',
                            end: '50% top',
                            scrub: true
                        },
                        // Slight delay per character for cascading departure
                        delay: i * 0.02
                    }
                );
            });
        }

        // Subtitle parallax
        if (heroSubtitle) {
            gsap.fromTo(heroSubtitle,
                { yPercent: 0, opacity: 1 },
                {
                    yPercent: -120,
                    opacity: 0,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: heroSection,
                        start: 'top top',
                        end: '50% top',
                        scrub: true
                    }
                }
            );
        }

        // Scroll CTA fades out quickly as the user begins scrolling
        if (scrollCta) {
            gsap.fromTo(scrollCta,
                { opacity: 1 },
                {
                    opacity: 0,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: heroSection,
                        start: 'top top',
                        end: '25% top',
                        scrub: true
                    }
                }
            );
        }
    }

    // ------------------------------------------------------------------
    //  Reveal animations
    // ------------------------------------------------------------------

    /**
     * Creates scroll-triggered reveal animations for content throughout the page.
     * Elements must already be in their "hidden" state (set by initRevealAnimations in fx.js).
     */
    _setupRevealAnimations() {

        // --- .reveal-text elements ---
        // Cinematic clip-path reveal: text slides up while mask opens
        const revealTexts = document.querySelectorAll('.reveal-text');
        revealTexts.forEach((el) => {
            gsap.to(el, {
                opacity: 1,
                y: 0,
                clipPath: 'inset(0% 0 0 0)',
                duration: 1.2,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                }
            });
        });

        // Stagger sibling groups so cascading reveals look intentional
        this._staggerSiblings('.reveal-text', 0.2);

        // --- .reveal-up elements ---
        // Scale + fade with a snappy ease
        const revealUps = document.querySelectorAll('.reveal-up');
        revealUps.forEach((el) => {
            gsap.to(el, {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 1,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                }
            });
        });

        this._staggerSiblings('.reveal-up', 0.12);

        // --- .section-label elements ---
        // Clip-path slide from left with cyan accent
        const labels = document.querySelectorAll('.section-label');
        labels.forEach((el) => {
            gsap.to(el, {
                opacity: 0.7,
                x: 0,
                clipPath: 'inset(0 0 0 0%)',
                duration: 0.8,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                }
            });
        });

        // --- .timeline-line ---
        // The vertical line in the experience section draws itself as the user scrolls.
        const timelineLine = document.querySelector('.timeline-line');
        if (timelineLine) {
            // Ensure the line scales from the top
            gsap.set(timelineLine, { scaleY: 0, transformOrigin: 'top' });

            gsap.to(timelineLine, {
                scaleY: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: timelineLine.closest('.timeline') || timelineLine.parentElement,
                    start: 'top 80%',
                    end: 'bottom 60%',
                    scrub: true
                }
            });
        }
    }

    /**
     * Helper: for a given selector, group elements by parent and apply a
     * stagger delay to each group so sibling items cascade rather than
     * appearing all at once.
     *
     * @param {string} selector  - CSS selector for the elements
     * @param {number} stagger   - delay between siblings in seconds
     */
    _staggerSiblings(selector, stagger) {
        const grouped = new Map();

        document.querySelectorAll(selector).forEach((el) => {
            const parent = el.parentElement;
            if (!parent) return;
            if (!grouped.has(parent)) grouped.set(parent, []);
            grouped.get(parent).push(el);
        });

        grouped.forEach((children) => {
            if (children.length < 2) return;

            children.forEach((child, i) => {
                // Add a stagger-based delay on top of its default timing
                gsap.to(child, { delay: i * stagger });
            });
        });
    }

    // ------------------------------------------------------------------
    //  Horizontal scroll for projects
    // ------------------------------------------------------------------

    /**
     * Pins the projects section and scrolls the .project-track horizontally.
     * The total horizontal scroll distance equals the track's overflow width.
     */
    _setupHorizontalScroll() {
        const projectSection = document.querySelector('.projects-horizontal');
        const projectTrack = document.querySelector('.project-track');

        if (!projectSection || !projectTrack) return;

        gsap.to(projectTrack, {
            x: () => -(projectTrack.scrollWidth - window.innerWidth + 100),
            ease: 'none',
            scrollTrigger: {
                trigger: projectSection,
                pin: true,
                scrub: 1,
                end: () => '+=' + (projectTrack.scrollWidth - window.innerWidth + 100),
                invalidateOnRefresh: true,
            }
        });
    }

    // ------------------------------------------------------------------
    //  Section watermark parallax
    // ------------------------------------------------------------------

    /**
     * Applies a subtle vertical parallax shift to each .section-watermark
     * as its parent section scrolls through the viewport.
     */
    _setupWatermarkParallax() {
        const watermarks = document.querySelectorAll('.section-watermark');

        watermarks.forEach((wm) => {
            // Find the parent section to use as the scroll trigger
            const parentSection = wm.closest('.section') || wm.parentElement;
            if (!parentSection) return;

            gsap.fromTo(wm,
                { yPercent: -20 },
                {
                    yPercent: 20,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: parentSection,
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: true
                    }
                }
            );
        });
    }

    // ------------------------------------------------------------------
    //  Side navigation
    // ------------------------------------------------------------------

    /**
     * Tracks which section the user is currently viewing and highlights the
     * corresponding side-nav dot. Also wires up click-to-scroll on dots.
     * Uses Lenis for smooth scrolling when available.
     */
    _setupSideNav() {
        const dots     = document.querySelectorAll('.side-nav-dot');
        const sections = document.querySelectorAll('[data-section]');

        if (!dots.length || !sections.length) return;

        // For each section, create a ScrollTrigger that toggles the matching dot
        sections.forEach((section) => {
            const sectionName = section.getAttribute('data-section');
            const matchingDot = document.querySelector(
                `.side-nav-dot[data-section="${sectionName}"]`
            );

            if (!matchingDot) return;

            ScrollTrigger.create({
                trigger: section,
                start: 'top center',
                end: 'bottom center',
                onEnter:     () => this._setActiveDot(matchingDot, dots),
                onEnterBack: () => this._setActiveDot(matchingDot, dots)
            });
        });

        // Click handlers -- smooth-scroll to the corresponding section
        dots.forEach((dot) => {
            dot.addEventListener('click', (e) => {
                e.preventDefault();

                const targetName = dot.getAttribute('data-section');
                const targetSection = document.querySelector(
                    `[data-section="${targetName}"]`
                );

                if (!targetSection) return;

                // Use Lenis scrollTo if available for consistency with smooth scroll,
                // otherwise fall back to native scrollIntoView
                if (this.lenis) {
                    this.lenis.scrollTo(targetSection, { offset: 0 });
                } else {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    /**
     * Activates a single dot and deactivates all others.
     *
     * @param {Element}  activeDot  - the dot to make active
     * @param {NodeList} allDots    - every dot element
     */
    _setActiveDot(activeDot, allDots) {
        allDots.forEach((d) => d.classList.remove('active'));
        activeDot.classList.add('active');
    }

    // ------------------------------------------------------------------
    //  Public API
    // ------------------------------------------------------------------

    /**
     * Returns the current normalised scroll progress (0-1).
     * @returns {number}
     */
    getProgress() {
        return this.scrollProgress || 0;
    }

    /**
     * Returns the current scroll velocity from Lenis.
     * @returns {number}
     */
    getVelocity() {
        return this.velocity || 0;
    }
}
