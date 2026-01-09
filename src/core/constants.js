/**
 * Core constants for the GPGPU particle system
 * All magic numbers extracted and documented
 */

// Camera positioning based on viewport
export const CAMERA = {
  FOV: 45,
  NEAR: 0.1,
  FAR: 1000,
  // Z positions for different viewport sizes
  MOBILE_Z: 76,
  TABLET_Z: 46,
  DESKTOP_Z: 26,
  // Breakpoints for responsive positioning
  MOBILE_BREAKPOINT: 500,
  TABLET_BREAKPOINT: 980
};

// Particle system limits and defaults
export const PARTICLES = {
  MIN_COUNT: 1_000,
  MAX_COUNT: 10_000_000,
  DEFAULT_COUNT: 1_000_000,
  // Point rendering
  DEFAULT_POINT_SIZE: 0.04,
  DEFAULT_OPACITY: 0.6
};

// Texture constraints
export const TEXTURE = {
  // Practical maximum texture size (performance-tested)
  PRACTICAL_MAX_SIZE: 3163, // sqrt(10,000,000) ≈ 3162.27
  // Fallback if GPU doesn't report max size
  DEFAULT_MAX_SIZE: 4096
};

// Physics simulation parameters
export const PHYSICS = {
  // Curl noise settings
  NOISE_FREQUENCY: 0.15,
  NOISE_AMPLITUDE: 0.002,
  // Pointer interaction
  POINTER_INFLUENCE_RADIUS: 1.0,
  POINTER_MAX_FORCE: 100.0,
  POINTER_FORCE_BASE: 2.5,
  POINTER_FORCE_MULTIPLIER: 4.0,
  // How often to sample pointer start position (in frames)
  POINTER_SAMPLE_INTERVAL: 10
};

// Text geometry defaults
export const TEXT = {
  DEFAULT_SIZE: 3,
  DEFAULT_DEPTH: 1,
  BEVEL_THICKNESS: 0,
  BEVEL_SIZE: 0.01,
  BEVEL_ENABLED: true,
  LINE_HEIGHT_MULTIPLIER: 1.2
};

// UI debounce timings (milliseconds)
export const TIMING = {
  PARTICLE_COUNT_DEBOUNCE: 300,
  TEXT_INPUT_DEBOUNCE: 500
};

// Render target configuration
export const FBO = {
  MIN_FILTER: 'NearestFilter',
  MAG_FILTER: 'NearestFilter',
  FORMAT: 'RGBAFormat',
  TYPE: 'FloatType'
};

// LOD (Level of Detail) configuration
export const LOD = {
  // FPS thresholds for automatic LOD adjustment
  MIN_FPS: 30,
  TARGET_FPS: 60,
  // How aggressively to adjust particle count
  ADJUSTMENT_RATE: 0.1,
  // Distance-based LOD
  NEAR_DISTANCE: 10,
  FAR_DISTANCE: 100,
  // Minimum particles at far distance (as percentage)
  FAR_PARTICLE_RATIO: 0.1
};

// Colors
export const COLORS = {
  BACKGROUND: 0x021119,
  HIGHLIGHT: { r: 0.3, g: 0.6, b: 1.0 },
  LIGHT_COLOR: 0xFFFFFF
};

// Particle system state enum (replaces boolean flags)
export const ParticleSystemState = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  UPDATING_TEXT: 'updating_text',
  UPDATING_COUNT: 'updating_count',
  MORPHING: 'morphing'
};

/**
 * Calculate camera Z position based on viewport width
 * @param {number} width - Viewport width in pixels
 * @returns {number} Camera Z position
 */
export function getCameraZForWidth(width) {
  if (width < CAMERA.MOBILE_BREAKPOINT) {
    return CAMERA.MOBILE_Z;
  }
  if (width < CAMERA.TABLET_BREAKPOINT) {
    return CAMERA.TABLET_Z;
  }
  return CAMERA.DESKTOP_Z;
}

/**
 * Calculate optimal texture dimensions for a particle count
 * @param {number} count - Desired particle count
 * @param {number} maxSize - Maximum texture dimension
 * @returns {{ width: number, height: number }} Texture dimensions
 */
export function calculateTextureDimensions(count, maxSize = TEXTURE.PRACTICAL_MAX_SIZE) {
  let side = Math.ceil(Math.sqrt(count));
  side = Math.min(side, maxSize);
  return { width: side, height: side };
}

