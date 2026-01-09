/**
 * Buffer utilities for efficient Float32Array management
 * Implements pooling to reduce garbage collection pressure
 */

class BufferPool {
  constructor() {
    this.pools = new Map();
  }

  /**
   * Get a buffer from the pool or create a new one
   * @param {number} size - Required buffer size
   * @returns {Float32Array}
   */
  acquire(size) {
    const pool = this.pools.get(size);
    if (pool && pool.length > 0) {
      return pool.pop();
    }
    return new Float32Array(size);
  }

  /**
   * Return a buffer to the pool for reuse
   * @param {Float32Array} buffer - Buffer to return
   */
  release(buffer) {
    const size = buffer.length;
    if (!this.pools.has(size)) {
      this.pools.set(size, []);
    }
    
    const pool = this.pools.get(size);
    // Limit pool size to prevent memory bloat
    if (pool.length < 5) {
      // Zero out the buffer for clean reuse
      buffer.fill(0);
      pool.push(buffer);
    }
  }

  /**
   * Clear all pools
   */
  clear() {
    this.pools.clear();
  }

  /**
   * Get statistics about pool usage
   * @returns {Object}
   */
  getStats() {
    const stats = {};
    for (const [size, pool] of this.pools) {
      stats[size] = pool.length;
    }
    return stats;
  }
}

// Singleton instance
export const bufferPool = new BufferPool();

/**
 * Create position data for GPGPU texture
 * @param {number} count - Number of particles
 * @param {Function} sampleFn - Function that returns [x, y, z] for each sample
 * @returns {Float32Array} RGBA data (4 floats per particle)
 */
export function createPositionData(count, sampleFn) {
  const data = bufferPool.acquire(count * 4);
  
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    const [x, y, z] = sampleFn(i);
    data[i4 + 0] = x;
    data[i4 + 1] = y;
    data[i4 + 2] = z;
    data[i4 + 3] = 0; // Alpha channel (unused or for metadata)
  }
  
  return data;
}

/**
 * Create velocity data for GPGPU texture (initialized to zero)
 * @param {number} count - Number of particles
 * @returns {Float32Array} RGBA data (4 floats per particle)
 */
export function createVelocityData(count) {
  // Already zeroed from pool or new allocation
  return bufferPool.acquire(count * 4);
}

/**
 * Create particle geometry attributes
 * @param {number} count - Number of particles
 * @param {number} textureWidth - Width of the GPGPU texture
 * @param {number} textureHeight - Height of the GPGPU texture
 * @param {Function} uvSampleFn - Function that returns [u, v] for each particle
 * @returns {{ positions: Float32Array, uvs: Float32Array }}
 */
export function createParticleAttributes(count, textureWidth, textureHeight, uvSampleFn) {
  const positions = bufferPool.acquire(count * 3);
  const uvs = bufferPool.acquire(count * 2);
  
  for (let i = 0; i < count; i++) {
    const i2 = i * 2;
    const i3 = i * 3;
    
    // Position encodes texture lookup coordinates
    positions[i3 + 0] = (i % textureWidth + 0.5) / textureWidth;
    positions[i3 + 1] = (Math.floor(i / textureWidth) + 0.5) / textureHeight;
    positions[i3 + 2] = 0;
    
    // UVs for color texture sampling
    if (uvSampleFn) {
      const [u, v] = uvSampleFn(i);
      uvs[i2 + 0] = u;
      uvs[i2 + 1] = v;
    } else {
      uvs[i2 + 0] = positions[i3 + 0];
      uvs[i2 + 1] = positions[i3 + 1];
    }
  }
  
  return { positions, uvs };
}

/**
 * Copy position data with optional transformation
 * @param {Float32Array} source - Source position data
 * @param {Float32Array} target - Target position data
 * @param {Function} [transformFn] - Optional transform function (x, y, z) => [x, y, z]
 */
export function copyPositionData(source, target, transformFn) {
  const count = Math.min(source.length, target.length) / 4;
  
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    
    if (transformFn) {
      const [x, y, z] = transformFn(source[i4], source[i4 + 1], source[i4 + 2]);
      target[i4 + 0] = x;
      target[i4 + 1] = y;
      target[i4 + 2] = z;
    } else {
      target[i4 + 0] = source[i4 + 0];
      target[i4 + 1] = source[i4 + 1];
      target[i4 + 2] = source[i4 + 2];
    }
    target[i4 + 3] = source[i4 + 3];
  }
}

