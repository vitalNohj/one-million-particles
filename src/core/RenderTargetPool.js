import * as THREE from 'three';

/**
 * Manages WebGL render targets for GPGPU computation
 * Handles ping-pong buffer swapping and proper resource cleanup
 */
export class RenderTargetPool {
  /**
   * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.targets = new Map();
    this.swapState = new Map();
  }

  /**
   * Create render target options
   * @private
   */
  _createOptions() {
    return {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false
    };
  }

  /**
   * Create a ping-pong buffer pair for GPGPU computation
   * @param {string} name - Unique identifier for this buffer pair
   * @param {number} width - Texture width
   * @param {number} height - Texture height
   * @returns {{ read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget }}
   */
  createPingPongTargets(name, width, height) {
    // Dispose existing targets if they exist
    this.dispose(name);

    const options = this._createOptions();
    const read = new THREE.WebGLRenderTarget(width, height, options);
    const write = new THREE.WebGLRenderTarget(width, height, options);

    // Name them for debugging
    read.texture.name = `${name}_read`;
    write.texture.name = `${name}_write`;

    this.targets.set(name, { read, write, width, height });
    this.swapState.set(name, false);

    return { read, write };
  }

  /**
   * Get the current read target (contains latest computed data)
   * @param {string} name - Buffer pair identifier
   * @returns {THREE.WebGLRenderTarget}
   */
  getReadTarget(name) {
    const pair = this.targets.get(name);
    if (!pair) {
      throw new Error(`RenderTargetPool: No target found with name "${name}"`);
    }
    return this.swapState.get(name) ? pair.write : pair.read;
  }

  /**
   * Get the current write target (where next computation will be rendered)
   * @param {string} name - Buffer pair identifier
   * @returns {THREE.WebGLRenderTarget}
   */
  getWriteTarget(name) {
    const pair = this.targets.get(name);
    if (!pair) {
      throw new Error(`RenderTargetPool: No target found with name "${name}"`);
    }
    return this.swapState.get(name) ? pair.read : pair.write;
  }

  /**
   * Swap read and write targets after a compute pass
   * @param {string} name - Buffer pair identifier
   */
  swap(name) {
    if (!this.targets.has(name)) {
      throw new Error(`RenderTargetPool: No target found with name "${name}"`);
    }
    this.swapState.set(name, !this.swapState.get(name));
  }

  /**
   * Check if a buffer pair exists
   * @param {string} name - Buffer pair identifier
   * @returns {boolean}
   */
  has(name) {
    return this.targets.has(name);
  }

  /**
   * Get dimensions of a buffer pair
   * @param {string} name - Buffer pair identifier
   * @returns {{ width: number, height: number }}
   */
  getDimensions(name) {
    const pair = this.targets.get(name);
    if (!pair) {
      throw new Error(`RenderTargetPool: No target found with name "${name}"`);
    }
    return { width: pair.width, height: pair.height };
  }

  /**
   * Resize a buffer pair (disposes old and creates new)
   * @param {string} name - Buffer pair identifier
   * @param {number} width - New width
   * @param {number} height - New height
   * @returns {{ read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget }}
   */
  resize(name, width, height) {
    return this.createPingPongTargets(name, width, height);
  }

  /**
   * Dispose a specific buffer pair
   * @param {string} name - Buffer pair identifier
   */
  dispose(name) {
    const pair = this.targets.get(name);
    if (pair) {
      pair.read.dispose();
      pair.write.dispose();
      this.targets.delete(name);
      this.swapState.delete(name);
    }
  }

  /**
   * Dispose all buffer pairs
   */
  disposeAll() {
    for (const [name] of this.targets) {
      this.dispose(name);
    }
  }

  /**
   * Initialize a render target with data from a DataTexture
   * @param {string} name - Buffer pair identifier
   * @param {THREE.DataTexture} dataTexture - Source data
   * @param {THREE.Scene} scene - Scene containing the compute mesh
   * @param {THREE.Camera} camera - Orthographic camera for compute passes
   * @param {THREE.Mesh} computeMesh - The fullscreen quad mesh
   * @param {string} textureUniform - Name of the uniform to set
   */
  initializeFromDataTexture(name, dataTexture, scene, camera, computeMesh, textureUniform) {
    const writeTarget = this.getWriteTarget(name);
    
    // Temporarily set the data texture as input
    const previousTexture = computeMesh.material.uniforms[textureUniform]?.value;
    computeMesh.material.uniforms[textureUniform].value = dataTexture;
    
    // Render to write target
    this.renderer.setRenderTarget(writeTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    
    // Swap so the initialized data is now in read target
    this.swap(name);
    
    // Restore previous texture reference
    if (previousTexture) {
      computeMesh.material.uniforms[textureUniform].value = this.getReadTarget(name).texture;
    }
  }
}

