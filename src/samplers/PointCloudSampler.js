import * as THREE from 'three';
import { BaseSampler } from './BaseSampler.js';

/**
 * Samples from a predefined set of points
 * Useful for custom point distributions or imported point clouds
 */
export class PointCloudSampler extends BaseSampler {
  /**
   * @param {Float32Array|Array<THREE.Vector3>} points - The points to sample from
   * @param {Object} options - Options
   * @param {boolean} options.repeat - If count > points, repeat points (default: true)
   * @param {boolean} options.shuffle - Randomize point order (default: false)
   */
  constructor(points, options = {}) {
    super();
    
    this.options = {
      repeat: true,
      shuffle: false,
      ...options
    };
    
    // Convert to Float32Array if needed
    if (Array.isArray(points) && points[0] instanceof THREE.Vector3) {
      this.points = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        const i3 = i * 3;
        this.points[i3 + 0] = points[i].x;
        this.points[i3 + 1] = points[i].y;
        this.points[i3 + 2] = points[i].z;
      }
    } else {
      this.points = points;
    }
    
    this.pointCount = this.points.length / 3;
  }

  /**
   * Compute bounding box and prepare sampler
   * @returns {Promise<void>}
   */
  async prepare() {
    // Compute bounding box from points
    this.boundingBox.makeEmpty();
    
    const tempVec = new THREE.Vector3();
    for (let i = 0; i < this.pointCount; i++) {
      const i3 = i * 3;
      tempVec.set(
        this.points[i3 + 0],
        this.points[i3 + 1],
        this.points[i3 + 2]
      );
      this.boundingBox.expandByPoint(tempVec);
    }
    
    this.isReady = true;
  }

  /**
   * Sample positions from the point cloud
   * @param {number} count - Number of positions to sample
   * @returns {Float32Array} Position data in RGBA format
   */
  sample(count) {
    if (!this.isReady) {
      throw new Error('PointCloudSampler: Sampler not ready. Call prepare() first.');
    }

    const data = new Float32Array(count * 4);
    
    // Create index array for optional shuffling
    let indices = [];
    if (this.options.shuffle) {
      for (let i = 0; i < this.pointCount; i++) {
        indices.push(i);
      }
      // Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }

    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      
      // Get source index
      let srcIndex;
      if (this.options.repeat) {
        srcIndex = i % this.pointCount;
      } else {
        srcIndex = Math.min(i, this.pointCount - 1);
      }
      
      if (this.options.shuffle) {
        srcIndex = indices[srcIndex % indices.length];
      }
      
      const src3 = srcIndex * 3;
      
      data[i4 + 0] = this.points[src3 + 0];
      data[i4 + 1] = this.points[src3 + 1];
      data[i4 + 2] = this.points[src3 + 2];
      data[i4 + 3] = 0;
    }

    return data;
  }

  /**
   * Add random jitter to sampled positions
   * @param {Float32Array} data - Position data to jitter
   * @param {number} amount - Jitter amount
   * @returns {Float32Array} The modified data
   */
  addJitter(data, amount) {
    const count = data.length / 4;
    
    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      data[i4 + 0] += (Math.random() - 0.5) * amount;
      data[i4 + 1] += (Math.random() - 0.5) * amount;
      data[i4 + 2] += (Math.random() - 0.5) * amount;
    }
    
    return data;
  }

  /**
   * Clean up
   */
  dispose() {
    this.points = null;
    super.dispose();
  }
}

