import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { BaseSampler } from './BaseSampler.js';

/**
 * Samples points from the surface of any THREE.Mesh
 * Uses Three.js MeshSurfaceSampler for uniform distribution
 */
export class MeshSampler extends BaseSampler {
  /**
   * @param {THREE.Mesh} mesh - The mesh to sample from
   * @param {Object} options - Sampling options
   * @param {boolean} options.weightByArea - Weight sampling by face area (default: true)
   * @param {string} options.weightAttribute - Vertex attribute to weight by (optional)
   */
  constructor(mesh, options = {}) {
    super();
    
    this.mesh = mesh;
    this.options = {
      weightByArea: true,
      weightAttribute: null,
      ...options
    };
    
    this.sampler = null;
    this._tempPosition = new THREE.Vector3();
    this._tempNormal = new THREE.Vector3();
  }

  /**
   * Build the surface sampler
   * @returns {Promise<void>}
   */
  async prepare() {
    if (!this.mesh || !this.mesh.geometry) {
      throw new Error('MeshSampler: Invalid mesh provided');
    }

    // Ensure geometry has necessary attributes
    if (!this.mesh.geometry.attributes.position) {
      throw new Error('MeshSampler: Mesh geometry must have position attribute');
    }

    // Compute bounding box
    this.mesh.geometry.computeBoundingBox();
    this.boundingBox.copy(this.mesh.geometry.boundingBox);
    
    // Apply mesh transformation to bounding box
    this.boundingBox.applyMatrix4(this.mesh.matrixWorld);

    // Build the sampler
    this.sampler = new MeshSurfaceSampler(this.mesh);
    
    if (this.options.weightAttribute) {
      this.sampler.setWeightAttribute(this.options.weightAttribute);
    }
    
    this.sampler.build();
    this.isReady = true;
  }

  /**
   * Sample positions from the mesh surface
   * @param {number} count - Number of positions to sample
   * @returns {Float32Array} Position data in RGBA format
   */
  sample(count) {
    if (!this.isReady || !this.sampler) {
      throw new Error('MeshSampler: Sampler not ready. Call prepare() first.');
    }

    const data = new Float32Array(count * 4);
    this._sampledUVs = new Float32Array(count * 2);
    const tempUV = new THREE.Vector2();

    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      const i2 = i * 2;
      
      // Sample a point on the mesh surface
      this.sampler.sample(this._tempPosition, this._tempNormal, undefined, tempUV);
      
      // Apply mesh world transform
      this._tempPosition.applyMatrix4(this.mesh.matrixWorld);
      
      data[i4 + 0] = this._tempPosition.x;
      data[i4 + 1] = this._tempPosition.y;
      data[i4 + 2] = this._tempPosition.z;
      data[i4 + 3] = 0; // Reserved for metadata

      this._sampledUVs[i2 + 0] = tempUV.x;
      this._sampledUVs[i2 + 1] = tempUV.y;
    }

    return data;
  }

  /**
   * Sample with optional centering
   * @param {number} count - Number of positions to sample
   * @param {boolean} center - Whether to center the positions at origin
   * @returns {Float32Array}
   */
  sampleCentered(count, center = true) {
    const data = this.sample(count);
    
    if (center) {
      const centerOffset = this.getCenter();
      
      for (let i = 0; i < count; i++) {
        const i4 = i * 4;
        data[i4 + 0] -= centerOffset.x;
        data[i4 + 1] -= centerOffset.y;
        data[i4 + 2] -= centerOffset.z;
      }
      
      // Update bounding box
      this.boundingBox.translate(centerOffset.negate());
    }
    
    return data;
  }

  /**
   * Get UVs (returns cached UVs from last sample if available)
   * @param {number} count
   * @returns {Float32Array}
   */
  getUVs(count) {
    if (this._sampledUVs && this._sampledUVs.length === count * 2) {
      return this._sampledUVs;
    }
    
    // Fallback: return default UVs (0.5, 0.5) if no cached UVs
    // We cannot reliably recalculate UVs without the original random sampling sequence
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count * 2; i++) {
        uvs[i] = 0.5;
    }
    return uvs;
  }

  /**
   * Clean up
   */
  dispose() {
    this.sampler = null;
    this.mesh = null;
    super.dispose();
  }
}

