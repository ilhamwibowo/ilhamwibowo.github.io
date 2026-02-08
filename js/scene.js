/**
 * scene.js
 * --------
 * Manages the Three.js 3D background for the portfolio site.
 * Creates a layered scene with:
 *   - Full-viewport shader background (living gradient with velocity distortion)
 *   - 5 subtle wireframe floating geometries for depth
 *   - 1000-particle star field
 *   - Cursor particle trail (cyan-tinted)
 *   - Bloom post-processing (UnrealBloomPass)
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BackgroundShader } from './shaders.js';

export class Scene {
    /**
     * @param {HTMLCanvasElement} canvas - The <canvas id="bg"> element
     */
    constructor(canvas) {
        if (!canvas) {
            console.warn('Scene: No canvas element provided. Aborting initialization.');
            this.enabled = false;
            return;
        }

        this.enabled = true;
        this.canvas = canvas;
        this.scrollProgress = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.geometries = [];
        this.clock = new THREE.Clock();

        // Trail configuration
        this.trailLength = 100;

        this._initRenderer();
        this._initCamera();
        this._initScene();
        this._initBackground();
        this._initWireframes();
        this._initParticles();
        this._initCursorTrail();
        this._initPostProcessing();
    }

    // ----------------------------------------------------------------
    // Initialization
    // ----------------------------------------------------------------

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });

        const dpr = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    _initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 30);
    }

    _initScene() {
        this.scene = new THREE.Scene();
    }

    /**
     * Create a large plane behind everything that renders the living gradient shader.
     * Now includes the velocity uniform for scroll-based distortion.
     */
    _initBackground() {
        // Instance-specific uniforms (not shared with the exported template)
        this.bgUniforms = {
            time: { value: 0.0 },
            scroll: { value: 0.0 },
            mouse: { value: new THREE.Vector2(0.0, 0.0) },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            velocity: { value: 0.0 }
        };

        const bgMaterial = new THREE.ShaderMaterial({
            uniforms: this.bgUniforms,
            vertexShader: BackgroundShader.vertexShader,
            fragmentShader: BackgroundShader.fragmentShader,
            depthWrite: false
        });

        // Size the plane to fill the camera frustum at z = -50
        const dist = 30 + 50; // camera z + plane z offset
        const vFov = THREE.MathUtils.degToRad(45);
        const planeHeight = 2 * Math.tan(vFov / 2) * dist;
        const planeWidth = planeHeight * (window.innerWidth / window.innerHeight);

        // Add a generous margin so the plane always covers the viewport
        const bgGeometry = new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2);
        this.bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        this.bgMesh.position.z = -50;
        this.scene.add(this.bgMesh);
    }

    /**
     * Create 5 slowly-rotating wireframe geometries scattered in the scene.
     * Slightly brighter and more opaque than before. Includes a TorusKnot for variety.
     */
    _initWireframes() {
        const defs = [
            {
                geo: new THREE.IcosahedronGeometry(3.5, 1),
                pos: new THREE.Vector3(-10, 6, -15),
                speed: 1.0
            },
            {
                geo: new THREE.OctahedronGeometry(2.5, 0),
                pos: new THREE.Vector3(12, -4, -20),
                speed: 0.7
            },
            {
                geo: new THREE.TorusGeometry(2.8, 0.6, 8, 24),
                pos: new THREE.Vector3(-6, -8, -12),
                speed: 0.5
            },
            {
                geo: new THREE.DodecahedronGeometry(2.0, 0),
                pos: new THREE.Vector3(8, 8, -18),
                speed: 0.9
            },
            {
                // 5th wireframe: TorusKnot for variety
                geo: new THREE.TorusKnotGeometry(2.0, 0.5, 64, 8, 2, 3),
                pos: new THREE.Vector3(0, -12, -16),
                speed: 0.6
            }
        ];

        // Slightly brighter wireframe material (0.35, 0.5, 0.9) at opacity 0.12
        const wireMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.35, 0.5, 0.9),
            wireframe: true,
            transparent: true,
            opacity: 0.12
        });

        for (const def of defs) {
            const mesh = new THREE.Mesh(def.geo, wireMaterial.clone());
            mesh.position.copy(def.pos);

            // Store original position for parallax offset calculations
            mesh.userData.basePosition = def.pos.clone();
            mesh.userData.speed = def.speed;

            // Give each geometry a random starting rotation
            mesh.rotation.x = Math.random() * Math.PI * 2;
            mesh.rotation.y = Math.random() * Math.PI * 2;

            this.geometries.push(mesh);
            this.scene.add(mesh);
        }
    }

    /**
     * Create a field of 1000 tiny points that act like distant stars.
     * Slightly brighter than before (opacity 0.4).
     */
    _initParticles() {
        const count = 1000;
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            // Spread particles across a wide volume
            positions[i3]     = (Math.random() - 0.5) * 80;  // x
            positions[i3 + 1] = (Math.random() - 0.5) * 80;  // y
            positions[i3 + 2] = (Math.random() - 0.5) * 60 - 10; // z (biased behind camera)
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x8899cc,
            size: 1.5,
            transparent: true,
            opacity: 0.4,
            sizeAttenuation: true,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    /**
     * Create a cursor particle trail using a BufferGeometry with ~100 positions.
     * Each frame the positions shift down by one index and the current mouse
     * world-position is placed at index 0, creating a fading trail effect.
     */
    _initCursorTrail() {
        const count = this.trailLength;
        const positions = new Float32Array(count * 3);

        // Initialize all trail positions off-screen so they are not visible initially
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3]     = 0;
            positions[i3 + 1] = 0;
            positions[i3 + 2] = -100; // far behind camera, invisible
        }

        this.trailGeometry = new THREE.BufferGeometry();
        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Cyan-tinted trail particles
        const trailMaterial = new THREE.PointsMaterial({
            color: new THREE.Color(0.3, 0.8, 1.0), // cyan tint
            size: 2,
            transparent: true,
            opacity: 0.25,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.trailMesh = new THREE.Points(this.trailGeometry, trailMaterial);
        this.scene.add(this.trailMesh);
    }

    /**
     * Convert normalized mouse coordinates (-1 to 1) to world-space coordinates
     * at a given z-depth, using the camera's projection.
     * @param {number} nx - Normalized x (-1 to 1)
     * @param {number} ny - Normalized y (-1 to 1)
     * @param {number} z  - Target z depth in world space
     * @returns {THREE.Vector3}
     */
    _mouseToWorld(nx, ny, z) {
        // Create a vector in NDC space (note: Three.js NDC y is flipped from screen y)
        const ndc = new THREE.Vector3(nx, -ny, 0.5);
        ndc.unproject(this.camera);

        // Direction from camera to the unprojected point
        const dir = ndc.sub(this.camera.position).normalize();

        // Calculate the distance from the camera to the target z plane
        const distToPlane = (z - this.camera.position.z) / dir.z;

        // Get the world position at that z depth
        return this.camera.position.clone().add(dir.multiplyScalar(distToPlane));
    }

    /**
     * Set up the post-processing pipeline:
     * RenderPass -> UnrealBloomPass (stronger glow) -> OutputPass
     */
    _initPostProcessing() {
        const size = new THREE.Vector2(window.innerWidth, window.innerHeight);

        this.composer = new EffectComposer(this.renderer);

        // Base render
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom with increased strength (0.5) for a more visible glow
        this.bloomPass = new UnrealBloomPass(size, 0.5, 0.5, 0.7);
        this.composer.addPass(this.bloomPass);

        // Output pass for correct color space
        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------

    /**
     * Set the current scroll progress.
     * @param {number} progress - Value between 0 (top) and 1 (bottom)
     */
    setScroll(progress) {
        this.scrollProgress = Math.max(0, Math.min(1, progress));
    }

    /**
     * Set the current mouse position (normalized).
     * @param {number} x - Normalized x, range -1 to 1
     * @param {number} y - Normalized y, range -1 to 1
     */
    setMouse(x, y) {
        this.mouseX = x;
        this.mouseY = y;
    }

    /**
     * Set the current scroll velocity for shader distortion.
     * @param {number} v - Absolute velocity value, normalized (e.g. 0 to ~1)
     */
    setVelocity(v) {
        if (!this.enabled) return;
        this.bgUniforms.velocity.value = v;
    }

    /**
     * Main update loop. Call this every frame (typically via requestAnimationFrame).
     * Updates shader uniforms, wireframes, particles, cursor trail, and renders.
     */
    update() {
        if (!this.enabled) return;

        const elapsed = this.clock.getElapsedTime();

        // 1. Update background shader uniforms
        this.bgUniforms.time.value = elapsed;
        this.bgUniforms.scroll.value = this.scrollProgress;
        this.bgUniforms.mouse.value.set(this.mouseX, this.mouseY);

        // Gradually decay velocity toward 0 for a smooth stop
        this.bgUniforms.velocity.value *= 0.95;

        // 2. Animate wireframe geometries
        for (const mesh of this.geometries) {
            const speed = mesh.userData.speed;

            // Slow, meditative rotation on multiple axes
            mesh.rotation.x += 0.001 * speed;
            mesh.rotation.y += 0.0015 * speed;
            mesh.rotation.z += 0.0005 * speed;

            // Subtle mouse-driven parallax offset
            // Objects further away (larger z) get less parallax for depth realism
            const depthFactor = 1.0 - (Math.abs(mesh.userData.basePosition.z) / 25.0);
            const parallaxStrength = 0.8 * depthFactor;
            mesh.position.x = mesh.userData.basePosition.x + this.mouseX * parallaxStrength;
            mesh.position.y = mesh.userData.basePosition.y + this.mouseY * parallaxStrength;

            // Gentle floating motion (sine-based bob)
            mesh.position.y += Math.sin(elapsed * 0.3 * speed + mesh.userData.speed * 10) * 0.15;
        }

        // 3. Slowly drift and rotate the particle field
        if (this.particles) {
            this.particles.rotation.y = elapsed * 0.01;
            this.particles.rotation.x = elapsed * 0.005;
        }

        // 4. Update cursor particle trail
        this._updateCursorTrail();

        // 5. Render through the post-processing pipeline
        this.composer.render();
    }

    /**
     * Shift all trail positions down by one index and place the current
     * mouse world-position at index 0, creating a trailing particle effect.
     */
    _updateCursorTrail() {
        if (!this.trailGeometry) return;

        const posAttr = this.trailGeometry.getAttribute('position');
        const arr = posAttr.array;
        const count = this.trailLength;

        // Shift all positions down by one (from end to start)
        for (let i = count - 1; i > 0; i--) {
            const dst = i * 3;
            const src = (i - 1) * 3;
            arr[dst]     = arr[src];
            arr[dst + 1] = arr[src + 1];
            arr[dst + 2] = arr[src + 2];
        }

        // Place current mouse world-position at index 0
        // Use z = 5 (in front of wireframes, behind camera) for the trail plane
        const worldPos = this._mouseToWorld(this.mouseX, this.mouseY, 5);
        arr[0] = worldPos.x;
        arr[1] = worldPos.y;
        arr[2] = worldPos.z;

        // Flag the attribute as needing an update
        posAttr.needsUpdate = true;
    }

    /**
     * Handle viewport resize. Updates camera, renderer, composer, and shader resolution.
     * @param {number} width  - New viewport width in CSS pixels
     * @param {number} height - New viewport height in CSS pixels
     */
    resize(width, height) {
        if (!this.enabled) return;

        // Update camera
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Update renderer
        this.renderer.setSize(width, height);

        // Update post-processing composer
        this.composer.setSize(width, height);

        // Update shader resolution uniform
        this.bgUniforms.resolution.value.set(width, height);

        // Resize the background plane to cover the new viewport
        const dist = 30 + 50;
        const vFov = THREE.MathUtils.degToRad(45);
        const planeHeight = 2 * Math.tan(vFov / 2) * dist;
        const planeWidth = planeHeight * (width / height);

        this.bgMesh.geometry.dispose();
        this.bgMesh.geometry = new THREE.PlaneGeometry(planeWidth * 1.2, planeHeight * 1.2);
    }
}
