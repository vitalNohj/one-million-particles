/**
 * Operation codes for the self-directing shader engine.
 * These codes are stored in textures and read by the GPU to determine
 * which operation to execute on each particle.
 * 
 * The shader reads the operation code from the texture and branches
 * to execute the corresponding math (gravity, wind, noise, etc.)
 */

// Operation code constants - must match values in pipeline.frag
export const OP_CODES = {
  // No operation - particle remains static
  NONE: 0.0,
  
  // Apply gravity force to velocity
  GRAVITY: 1.0,
  
  // Apply wind force to velocity
  WIND: 2.0,
  
  // Apply curl noise displacement to position
  NOISE: 3.0,
  
  // Apply attractor/repeller force
  ATTRACTOR: 4.0,
  
  // Spring back to original position
  RETURN_HOME: 5.0,
  
  // Apply pointer interaction (repel from mouse)
  POINTER: 6.0,
  
  // Apply turbulence (combination of noise frequencies)
  TURBULENCE: 7.0,
  
  // Apply vortex force (swirling around axis)
  VORTEX: 8.0,
  
  // Apply all forces combined (default behavior)
  ALL: 9.0,
  
  // Custom operation slots for user-defined behaviors
  CUSTOM_1: 10.0,
  CUSTOM_2: 11.0,
  CUSTOM_3: 12.0,
  CUSTOM_4: 13.0,
  CUSTOM_5: 14.0,
  
  // Center pull - gently pulls particles toward origin (0,0,0)
  CENTER_PULL: 15.0,
  
  // Maximum operation code (reserved)
  MAX: 16.0
};

// Particle lifecycle states - stored in velocity texture alpha
export const PARTICLE_STATE = {
  DEAD: 0.0,        // Particle is inactive, skip processing
  ACTIVE: 1.0,      // Particle is active and being processed
  SPAWNING: 2.0,    // Particle is initializing
  DYING: 3.0        // Particle is fading out
};

/**
 * Get operation name from code
 * @param {number} code - Operation code
 * @returns {string} Operation name
 */
export function getOperationName(code) {
  for (const [name, value] of Object.entries(OP_CODES)) {
    if (value === code) return name;
  }
  return 'UNKNOWN';
}

/**
 * Get operation code from name
 * @param {string} name - Operation name
 * @returns {number} Operation code
 */
export function getOperationCode(name) {
  const upperName = name.toUpperCase();
  return OP_CODES[upperName] ?? OP_CODES.NONE;
}

/**
 * Check if operation code is valid
 * @param {number} code - Operation code
 * @returns {boolean}
 */
export function isValidOperation(code) {
  return code >= OP_CODES.NONE && code <= OP_CODES.MAX;
}

/**
 * Get all available operation codes as an array
 * @returns {Array<{name: string, code: number}>}
 */
export function getAllOperations() {
  return Object.entries(OP_CODES).map(([name, code]) => ({ name, code }));
}

/**
 * Pack multiple operation codes into a single float for operation queue
 * Packs up to 8 operations (4 bits each) into a 32-bit float
 * @param {number[]} operations - Array of operation codes (max 8)
 * @returns {number} Packed operation queue
 */
export function packOperationQueue(operations) {
  let packed = 0;
  for (let i = 0; i < Math.min(operations.length, 8); i++) {
    const op = Math.floor(operations[i]) & 0xF; // Clamp to 4 bits (0-15)
    packed += op * Math.pow(16, i);
  }
  return packed;
}

/**
 * Unpack operation queue from a single float
 * @param {number} packed - Packed operation queue
 * @param {number} count - Number of operations to extract
 * @returns {number[]} Array of operation codes
 */
export function unpackOperationQueue(packed, count = 8) {
  const operations = [];
  let value = packed;
  for (let i = 0; i < count; i++) {
    operations.push(value % 16);
    value = Math.floor(value / 16);
  }
  return operations;
}

/**
 * Get operation at specific index from packed queue
 * @param {number} packed - Packed operation queue
 * @param {number} index - Index (0-7)
 * @returns {number} Operation code at index
 */
export function getOperationAtIndex(packed, index) {
  return Math.floor(packed / Math.pow(16, index)) % 16;
}

/**
 * Create GLSL constant declarations for operation codes
 * Useful for generating shader code dynamically
 * @returns {string} GLSL constant declarations
 */
export function generateGLSLConstants() {
  let glsl = '// Operation codes - auto-generated\n';
  for (const [name, code] of Object.entries(OP_CODES)) {
    glsl += `const float OP_${name} = ${code.toFixed(1)};\n`;
  }
  glsl += '\n// Particle states\n';
  for (const [name, state] of Object.entries(PARTICLE_STATE)) {
    glsl += `const float STATE_${name} = ${state.toFixed(1)};\n`;
  }
  return glsl;
}

/**
 * Default operation parameters for each operation type
 */
export const DEFAULT_OPERATION_PARAMS = {
  [OP_CODES.GRAVITY]: {
    direction: [0, -1, 0],
    strength: 9.8
  },
  [OP_CODES.WIND]: {
    direction: [1, 0, 0],
    strength: 1.0
  },
  [OP_CODES.NOISE]: {
    frequency: 0.15,
    amplitude: 0.002
  },
  [OP_CODES.ATTRACTOR]: {
    position: [0, 0, 0],
    strength: 1.0,
    radius: 10.0
  },
  [OP_CODES.RETURN_HOME]: {
    strength: 0.1
  },
  [OP_CODES.POINTER]: {
    radius: 1.0,
    strength: 2.5
  },
  [OP_CODES.TURBULENCE]: {
    frequency: 0.3,
    amplitude: 0.01,
    octaves: 3
  },
  [OP_CODES.VORTEX]: {
    axis: [0, 1, 0],
    strength: 1.0,
    radius: 5.0
  },
  [OP_CODES.CENTER_PULL]: {
    center: [0, 0, 0],
    strength: 0.5
  }
};
