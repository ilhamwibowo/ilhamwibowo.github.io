/**
 * shaders.js
 * ----------
 * Background shader for the portfolio site.
 * Creates a vivid, living gradient using 6-octave FBM noise with domain warping.
 * Features scroll-driven palette transitions, mouse spotlight, velocity distortion,
 * a subtle breathing pulse, vignette, and film grain.
 */

export const BackgroundShader = {
    uniforms: {
        time: { value: 0.0 },
        scroll: { value: 0.0 },
        mouse: { value: [0.0, 0.0] },
        resolution: { value: [1920, 1080] },
        velocity: { value: 0.0 }
    },

    vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */ `
        precision highp float;

        uniform float time;
        uniform float scroll;
        uniform vec2 mouse;
        uniform vec2 resolution;
        uniform float velocity;

        varying vec2 vUv;

        // --- Hash and noise utilities ---

        // Fast 2D hash based on sine
        float hash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }

        // Smooth value noise with quintic interpolation
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);

            // Four corners
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));

            // Quintic interpolation for smoother results
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

            return mix(a, b, u.x) +
                   (c - a) * u.y * (1.0 - u.x) +
                   (d - b) * u.x * u.y;
        }

        // Fractal Brownian Motion -- 6 octaves for rich detail
        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;

            // Rotation matrix to reduce axis-aligned artifacts between octaves
            mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);

            for (int i = 0; i < 6; i++) {
                value += amplitude * noise(p * frequency);
                p = rot * p;
                frequency *= 2.0;
                amplitude *= 0.5;
            }
            return value;
        }

        // Domain-warped FBM for organic, flowing patterns
        float warpedFbm(vec2 p, float t) {
            // First layer of warping
            vec2 q = vec2(
                fbm(p + vec2(0.0, 0.0) + 0.1 * t),
                fbm(p + vec2(5.2, 1.3) + 0.12 * t)
            );

            // Second layer of warping for more complexity
            vec2 r = vec2(
                fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.08 * t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.10 * t)
            );

            return fbm(p + 4.0 * r);
        }

        void main() {
            vec2 uv = vUv;
            float aspect = resolution.x / resolution.y;

            // --- Velocity distortion ---
            // When scrolling, warp UVs vertically for a stretching effect
            uv.y += sin(uv.x * 10.0) * velocity * 0.02;

            vec2 p = uv * vec2(aspect, 1.0);

            float t = time * 0.15; // Slow, ambient animation speed

            // --- Domain-warped noise field ---
            float n1 = warpedFbm(p * 1.5, t);
            float n2 = warpedFbm(p * 2.0 + vec2(3.14, 2.72), t * 0.7);
            float noiseMix = n1 * 0.6 + n2 * 0.4;

            // --- Scroll-driven color palette ---
            // Vivid colors with strong accents while keeping the dark aesthetic
            vec3 colA = vec3(0.02, 0.02, 0.08);  // Deep navy base
            vec3 colB = vec3(0.03, 0.08, 0.12);   // Teal accent -- more saturated
            vec3 colC = vec3(0.08, 0.03, 0.13);   // Purple accent -- stronger
            vec3 colD = vec3(0.04, 0.04, 0.11);   // Deep blue-purple for the end

            // Smoothly blend between palette stops based on scroll
            vec3 scrollColor;
            if (scroll < 0.3) {
                scrollColor = mix(colA, colB, scroll / 0.3);
            } else if (scroll < 0.6) {
                scrollColor = mix(colB, colC, (scroll - 0.3) / 0.3);
            } else {
                scrollColor = mix(colC, colD, (scroll - 0.6) / 0.4);
            }

            // Brighter highlight color mixed in by noise
            vec3 highlight = vec3(0.1, 0.13, 0.25);
            vec3 color = mix(scrollColor, highlight, noiseMix * 0.45);

            // --- Cyan glow pulse ---
            // A subtle pulsing cyan undertone that breathes with time
            vec3 cyanGlow = vec3(0.0, 0.15, 0.2);
            float cyanPulse = 0.5 + 0.5 * sin(time * 0.3);
            color += cyanGlow * cyanPulse * 0.12;

            // --- Purple accent from noise ---
            // Purple appears in regions of high noise values
            vec3 purpleAccent = vec3(0.1, 0.02, 0.15);
            float purpleStrength = smoothstep(0.45, 0.7, n1);
            color += purpleAccent * purpleStrength * 0.25;

            // --- Warm highlight driven by secondary noise layer ---
            float warmNoise = fbm(p * 3.0 + t * 0.2);
            vec3 warmTint = vec3(0.08, 0.04, 0.10);
            color += warmTint * warmNoise * 0.18;

            // --- Mouse spotlight ---
            // Stronger, cyan-tinted Gaussian spotlight following the cursor
            vec2 mousePos = mouse * 0.5 + 0.5; // convert from [-1,1] to [0,1]
            float mouseDist = distance(uv, mousePos);
            float spotlight = exp(-mouseDist * mouseDist * 6.0);
            // Cyan-tinted spotlight light
            color += vec3(0.05, 0.08, 0.12) * spotlight;

            // --- Subtle breathing / pulse ---
            // Slow sine-based brightness modulation across the entire image
            color += 0.01 * sin(time * 0.5);

            // --- Overall darken for text readability ---
            // Keep the shader interesting but dark enough for white text
            color *= 0.7;

            // --- Vignette ---
            // Darken edges for a natural, cinematic feel
            vec2 vignetteUv = uv * (1.0 - uv);
            float vignette = vignetteUv.x * vignetteUv.y * 15.0;
            vignette = clamp(pow(vignette, 0.2), 0.0, 1.0);
            color *= vignette;

            // --- Subtle grain for texture ---
            float grain = hash(uv * resolution + fract(time)) * 0.012;
            color += grain;

            // Clamp to ensure we stay in valid range
            color = clamp(color, 0.0, 1.0);

            gl_FragColor = vec4(color, 1.0);
        }
    `
};
