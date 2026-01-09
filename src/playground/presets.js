/**
 * Preset configurations for the particle playground
 */

export const Presets = {
  // Default text preset
  text: {
    name: 'Text Particles',
    type: 'text',
    text: '1,000,000\nPARTICLES',
    particleCount: 1_000_000,
    physics: {
      noiseFrequency: 0.15,
      noiseAmplitude: 0.002
    }
  },

  // High particle count
  massive: {
    name: 'Massive (10M)',
    type: 'text',
    text: 'MASSIVE',
    particleCount: 10_000_000,
    physics: {
      noiseFrequency: 0.1,
      noiseAmplitude: 0.001
    }
  },

  // Minimal particles
  minimal: {
    name: 'Minimal (100K)',
    type: 'text',
    text: 'MINIMAL',
    particleCount: 100_000,
    physics: {
      noiseFrequency: 0.2,
      noiseAmplitude: 0.005
    }
  },

  // Calm waves
  waves: {
    name: 'Calm Waves',
    type: 'text',
    text: 'WAVES',
    particleCount: 500_000,
    physics: {
      noiseFrequency: 0.05,
      noiseAmplitude: 0.01
    }
  },

  // Energetic
  energetic: {
    name: 'Energetic',
    type: 'text',
    text: 'ENERGY',
    particleCount: 1_000_000,
    physics: {
      noiseFrequency: 0.3,
      noiseAmplitude: 0.008
    }
  },

  // Custom - will be populated by user
  custom: {
    name: 'Custom',
    type: 'text',
    text: 'CUSTOM',
    particleCount: 1_000_000,
    physics: {
      noiseFrequency: 0.15,
      noiseAmplitude: 0.002
    }
  }
};

/**
 * Get preset by name
 * @param {string} name - Preset name
 * @returns {Object}
 */
export function getPreset(name) {
  return Presets[name] ?? Presets.text;
}

/**
 * Get all preset names
 * @returns {string[]}
 */
export function getPresetNames() {
  return Object.keys(Presets);
}

/**
 * Create a custom preset from current settings
 * @param {Object} settings - Current settings
 * @returns {Object}
 */
export function createCustomPreset(settings) {
  return {
    name: 'Custom',
    type: settings.type ?? 'text',
    text: settings.text ?? 'CUSTOM',
    particleCount: settings.particleCount ?? 1_000_000,
    physics: {
      noiseFrequency: settings.noiseFrequency ?? 0.15,
      noiseAmplitude: settings.noiseAmplitude ?? 0.002
    }
  };
}

