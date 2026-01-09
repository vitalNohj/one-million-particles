import * as THREE from 'three';

// Import shaders as modules (vite-plugin-glsl handles this)
import quadVertexShader from '../shaders/compute/quad.vert';
import positionFragmentShader from '../shaders/compute/position.frag';
import velocityFragmentShader from '../shaders/compute/velocity.frag';
import particleVertexShader from '../shaders/render/particle.vert';
import particleFragmentShader from '../shaders/render/particle.frag';

/**
 * Manages shader materials for the GPGPU particle system
 * Compiles once and caches - no per-frame recompilation
 */
export class ShaderManager {
  constructor() {
    this.materials = new Map();
    this.uniformDefaults = new Map();
  }

  /**
   * Get default uniforms for compute shaders
   * @private
   */
  _getComputeUniforms() {
    return {
      uOriginalPositionsTexture: { value: null },
      uPositionsTexture: { value: null },
      uVelocitiesTexture: { value: null },
      uTextureResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector3() },
      uPointerStart: { value: new THREE.Vector3() },
      uNoiseFrequency: { value: 0.15 },
      uNoiseAmplitude: { value: 0.002 },
      uTime: { value: 0 },
      uDeltaTime: { value: 0 },
      uGravity: { value: new THREE.Vector3(0, 0, 0) },
      uAttractorPosition: { value: new THREE.Vector3(0, 0, 0) },
      uAttractorStrength: { value: 0.0 },
      uAttractorRadius: { value: 100.0 }
    };
  }

  /**
   * Get default uniforms for particle rendering
   * @private
   */
  _getRenderUniforms() {
    return {
      uPositionsTexture: { value: null },
      uColorTexture: { value: null },
      uHasColorTexture: { value: false },
      uHighlightColor: { value: new THREE.Vector3(0.3, 0.6, 1.0) },
      uOpacity: { value: 0.6 },
      uPointSize: { value: 2.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2.0) }
    };
  }

  /**
   * Create the position compute material
   * @returns {THREE.ShaderMaterial}
   */
  createPositionMaterial() {
    if (this.materials.has('position')) {
      return this.materials.get('position');
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: positionFragmentShader,
      uniforms: this._getComputeUniforms(),
      depthTest: false,
      depthWrite: false
    });

    this.materials.set('position', material);
    return material;
  }

  /**
   * Create the velocity compute material
   * @returns {THREE.ShaderMaterial}
   */
  createVelocityMaterial() {
    if (this.materials.has('velocity')) {
      return this.materials.get('velocity');
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: velocityFragmentShader,
      uniforms: this._getComputeUniforms(),
      depthTest: false,
      depthWrite: false
    });

    this.materials.set('velocity', material);
    return material;
  }

  /**
   * Create particle render material
   * @param {THREE.Texture} colorTexture - Texture for particle coloring
   * @returns {THREE.ShaderMaterial}
   */
  createParticleMaterial(colorTexture = null) {
    if (this.materials.has('particle')) {
      const material = this.materials.get('particle');
      if (colorTexture) {
        material.uniforms.uColorTexture.value = colorTexture;
        material.uniforms.uHasColorTexture.value = true;
      }
      return material;
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        ...this._getRenderUniforms(),
        uColorTexture: { value: colorTexture },
        uHasColorTexture: { value: !!colorTexture }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Alias for compatibility with existing code that accesses userData.uniforms
    material.userData.uniforms = material.uniforms;

    this.materials.set('particle', material);
    return material;
  }

  /**
   * Get a cached material by name
   * @param {string} name - Material name
   * @returns {THREE.Material|undefined}
   */
  getMaterial(name) {
    return this.materials.get(name);
  }

  /**
   * Update uniforms on all compute materials
   * @param {Object} uniforms - Uniform values to update
   */
  updateComputeUniforms(uniforms) {
    const positionMat = this.materials.get('position');
    const velocityMat = this.materials.get('velocity');

    for (const [key, value] of Object.entries(uniforms)) {
      if (positionMat?.uniforms[key]) {
        positionMat.uniforms[key].value = value;
      }
      if (velocityMat?.uniforms[key]) {
        velocityMat.uniforms[key].value = value;
      }
    }
  }

  /**
   * Set texture resolution on compute materials
   * @param {number} width
   * @param {number} height
   */
  setTextureResolution(width, height) {
    this.updateComputeUniforms({
      uTextureResolution: new THREE.Vector2(width, height)
    });
  }

  /**
   * Dispose all materials
   */
  dispose() {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }
}

