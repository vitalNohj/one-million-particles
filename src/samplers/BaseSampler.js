import * as THREE from 'three';

/**
 * Abstract base class for geometry samplers
 * Defines the interface for sampling points from different geometry sources
 */
export class BaseSampler {
  constructor() {
    if (new.target === BaseSampler) {
      throw new Error('BaseSampler is abstract and cannot be instantiated directly');
    }
    
    this.boundingBox = new THREE.Box3();
    this.isReady = false;
  }

  /**
   * Sample positions from the geometry
   * @param {number} count - Number of positions to sample
   * @returns {Float32Array} Position data in RGBA format (4 floats per position)
   * @abstract
   */
  sample(count) {
    throw new Error('sample() must be implemented by subclass');
  }

  /**
   * Get UVs for the sampled positions (for texture mapping)
   * @param {number} count - Number of UVs needed
   * @param {Float32Array} positions - The sampled positions
   * @returns {Float32Array} UV data (2 floats per position)
   */
  getUVs(count, positions) {
    // Default implementation: map positions to UVs based on bounding box
    const uvs = new Float32Array(count * 2);
    
    if (!this.boundingBox.isEmpty()) {
      const size = new THREE.Vector3();
      this.boundingBox.getSize(size);
      const min = this.boundingBox.min;
      
      for (let i = 0; i < count; i++) {
        const i2 = i * 2;
        const i4 = i * 4;
        
        // Normalize position to 0-1 range based on bounding box
        uvs[i2 + 0] = size.x > 0 ? (positions[i4 + 0] - min.x) / size.x : 0;
        uvs[i2 + 1] = size.y > 0 ? (positions[i4 + 1] - min.y) / size.y : 0;
      }
    }
    
    return uvs;
  }

  /**
   * Get the bounding box of the geometry
   * @returns {THREE.Box3}
   */
  getBoundingBox() {
    return this.boundingBox;
  }

  /**
   * Get the center of the geometry
   * @returns {THREE.Vector3}
   */
  getCenter() {
    const center = new THREE.Vector3();
    this.boundingBox.getCenter(center);
    return center;
  }

  /**
   * Get the size of the geometry
   * @returns {THREE.Vector3}
   */
  getSize() {
    const size = new THREE.Vector3();
    this.boundingBox.getSize(size);
    return size;
  }

  /**
   * Prepare the sampler (load resources, build acceleration structures, etc.)
   * @returns {Promise<void>}
   */
  async prepare() {
    // Override in subclass if async preparation is needed
    this.isReady = true;
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Override in subclass to clean up resources
    this.isReady = false;
  }
}

