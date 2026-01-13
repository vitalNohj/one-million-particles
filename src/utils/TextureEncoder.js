import * as THREE from 'three';
import { OP_CODES, PARTICLE_STATE, packOperationQueue, unpackOperationQueue } from '../core/OperationCodes.js';

/**
 * Utilities for encoding and decoding particle data in GPU textures.
 * 
 * Texture Format:
 * - Position Texture (RGBA Float32):
 *   - R, G, B: position (x, y, z)
 *   - A: operation code (0.0 - 15.0)
 * 
 * - Velocity Texture (RGBA Float32):
 *   - R, G, B: velocity (x, y, z)
 *   - A: particle state (0=dead, 1=active, 2=spawning, 3=dying)
 */

/**
 * Read texture data from a WebGL render target back to CPU
 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
 * @param {THREE.WebGLRenderTarget} renderTarget - Render target to read from
 * @returns {Float32Array} RGBA float data
 */
export function readRenderTargetPixels(renderer, renderTarget) {
  const width = renderTarget.width;
  const height = renderTarget.height;
  const data = new Float32Array(width * height * 4);
  
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, data);
  return data;
}

/**
 * Create a DataTexture with the given data
 * @param {Float32Array} data - RGBA float data
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @returns {THREE.DataTexture}
 */
export function createDataTexture(data, width, height) {
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Update a DataTexture with new data
 * @param {THREE.DataTexture} texture - Texture to update
 * @param {Float32Array} data - New RGBA float data
 */
export function updateDataTexture(texture, data) {
  texture.image.data.set(data);
  texture.needsUpdate = true;
}

/**
 * Encode position data with operation code in alpha channel
 * @param {Float32Array} positions - Position data (x, y, z per particle)
 * @param {number} opCode - Operation code to set for all particles
 * @param {number} count - Number of particles
 * @returns {Float32Array} RGBA data with operation code in alpha
 */
export function encodePositionsWithOpCode(positions, opCode, count) {
  const data = new Float32Array(count * 4);
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    data[i4 + 0] = positions[i3 + 0];
    data[i4 + 1] = positions[i3 + 1];
    data[i4 + 2] = positions[i3 + 2];
    data[i4 + 3] = opCode;
  }
  
  return data;
}

/**
 * Encode velocity data with particle state in alpha channel
 * @param {Float32Array} velocities - Velocity data (x, y, z per particle)
 * @param {number} state - Particle state to set for all particles
 * @param {number} count - Number of particles
 * @returns {Float32Array} RGBA data with state in alpha
 */
export function encodeVelocitiesWithState(velocities, state, count) {
  const data = new Float32Array(count * 4);
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    data[i4 + 0] = velocities[i3 + 0];
    data[i4 + 1] = velocities[i3 + 1];
    data[i4 + 2] = velocities[i3 + 2];
    data[i4 + 3] = state;
  }
  
  return data;
}

/**
 * Set operation code for specific particles
 * @param {Float32Array} textureData - RGBA texture data
 * @param {number[]} indices - Particle indices to modify
 * @param {number} opCode - Operation code to set
 */
export function setOperationCodesAtIndices(textureData, indices, opCode) {
  for (const index of indices) {
    const alphaIndex = index * 4 + 3;
    if (alphaIndex < textureData.length) {
      textureData[alphaIndex] = opCode;
    }
  }
}

/**
 * Set operation code for all particles
 * @param {Float32Array} textureData - RGBA texture data
 * @param {number} opCode - Operation code to set
 */
export function setAllOperationCodes(textureData, opCode) {
  const count = textureData.length / 4;
  for (let i = 0; i < count; i++) {
    textureData[i * 4 + 3] = opCode;
  }
}

/**
 * Set particle states at specific indices
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @param {number[]} indices - Particle indices to modify
 * @param {number} state - Particle state to set
 */
export function setParticleStatesAtIndices(velocityData, indices, state) {
  for (const index of indices) {
    const alphaIndex = index * 4 + 3;
    if (alphaIndex < velocityData.length) {
      velocityData[alphaIndex] = state;
    }
  }
}

/**
 * Get all particles with a specific state
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @param {number} state - State to search for
 * @returns {number[]} Array of particle indices
 */
export function getParticlesWithState(velocityData, state) {
  const indices = [];
  const count = velocityData.length / 4;
  for (let i = 0; i < count; i++) {
    if (velocityData[i * 4 + 3] === state) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Get all dead particles
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @returns {number[]} Array of dead particle indices
 */
export function getDeadParticles(velocityData) {
  return getParticlesWithState(velocityData, PARTICLE_STATE.DEAD);
}

/**
 * Get all active particles
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @returns {number[]} Array of active particle indices
 */
export function getActiveParticles(velocityData) {
  return getParticlesWithState(velocityData, PARTICLE_STATE.ACTIVE);
}

/**
 * Mark particles as spawning (will be initialized on next GPU pass)
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @param {number[]} indices - Particle indices to spawn
 */
export function spawnParticles(velocityData, indices) {
  setParticleStatesAtIndices(velocityData, indices, PARTICLE_STATE.SPAWNING);
}

/**
 * Mark particles as dead
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @param {number[]} indices - Particle indices to kill
 */
export function killParticles(velocityData, indices) {
  setParticleStatesAtIndices(velocityData, indices, PARTICLE_STATE.DEAD);
}

/**
 * Extract positions from RGBA texture data
 * @param {Float32Array} textureData - RGBA texture data
 * @returns {Float32Array} Position data (x, y, z per particle)
 */
export function extractPositions(textureData) {
  const count = textureData.length / 4;
  const positions = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = textureData[i * 4 + 0];
    positions[i * 3 + 1] = textureData[i * 4 + 1];
    positions[i * 3 + 2] = textureData[i * 4 + 2];
  }
  
  return positions;
}

/**
 * Extract operation codes from position texture data
 * @param {Float32Array} textureData - Position texture RGBA data
 * @returns {Float32Array} Operation codes (one per particle)
 */
export function extractOperationCodes(textureData) {
  const count = textureData.length / 4;
  const opCodes = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    opCodes[i] = textureData[i * 4 + 3];
  }
  
  return opCodes;
}

/**
 * Extract particle states from velocity texture data
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @returns {Float32Array} Particle states (one per particle)
 */
export function extractParticleStates(velocityData) {
  const count = velocityData.length / 4;
  const states = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    states[i] = velocityData[i * 4 + 3];
  }
  
  return states;
}

/**
 * Create an operation queue texture for per-particle operation sequences
 * @param {number} count - Number of particles
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @param {number[]} defaultQueue - Default operation queue (up to 3 operations)
 * @returns {THREE.DataTexture}
 */
export function createOperationQueueTexture(count, width, height, defaultQueue = []) {
  const data = new Float32Array(count * 4);
  
  const op1 = defaultQueue[0] ?? OP_CODES.ALL;
  const op2 = defaultQueue[1] ?? OP_CODES.NONE;
  const op3 = defaultQueue[2] ?? OP_CODES.NONE;
  
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    data[i4 + 0] = 0;    // Current operation index
    data[i4 + 1] = op1;  // Operation 1
    data[i4 + 2] = op2;  // Operation 2
    data[i4 + 3] = op3;  // Operation 3
  }
  
  return createDataTexture(data, width, height);
}

/**
 * Set position for a specific particle
 * @param {Float32Array} textureData - Position texture RGBA data
 * @param {number} index - Particle index
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position
 */
export function setParticlePosition(textureData, index, x, y, z) {
  const i4 = index * 4;
  if (i4 + 2 < textureData.length) {
    textureData[i4 + 0] = x;
    textureData[i4 + 1] = y;
    textureData[i4 + 2] = z;
    // Preserve operation code in alpha
  }
}

/**
 * Set velocity for a specific particle
 * @param {Float32Array} velocityData - Velocity texture RGBA data
 * @param {number} index - Particle index
 * @param {number} vx - X velocity
 * @param {number} vy - Y velocity
 * @param {number} vz - Z velocity
 */
export function setParticleVelocity(velocityData, index, vx, vy, vz) {
  const i4 = index * 4;
  if (i4 + 2 < velocityData.length) {
    velocityData[i4 + 0] = vx;
    velocityData[i4 + 1] = vy;
    velocityData[i4 + 2] = vz;
    // Preserve particle state in alpha
  }
}

/**
 * Copy render target to data texture for CPU access
 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
 * @param {THREE.WebGLRenderTarget} source - Source render target
 * @param {THREE.DataTexture} target - Target data texture
 */
export function copyRenderTargetToDataTexture(renderer, source, target) {
  const data = readRenderTargetPixels(renderer, source);
  updateDataTexture(target, data);
}

/**
 * Calculate texture dimensions for a particle count
 * @param {number} count - Number of particles
 * @returns {{width: number, height: number}}
 */
export function calculateTextureDimensions(count) {
  const side = Math.ceil(Math.sqrt(count));
  return { width: side, height: side };
}
