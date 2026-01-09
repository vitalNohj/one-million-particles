import * as THREE from 'three';

// Import shaders as modules (vite-plugin-glsl handles this)
import quadVertexShader from '../shaders/compute/quad.vert';
import positionFragmentShader from '../shaders/compute/position.frag';
import velocityFragmentShader from '../shaders/compute/velocity.frag';

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
      uDeltaTime: { value: 0 }
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
      uHighlightColor: { value: new THREE.Vector3(0.3, 0.6, 1.0) },
      uOpacity: { value: 0.6 }
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
   * Create particle render material using onBeforeCompile for Three.js integration
   * @param {THREE.Texture} colorTexture - Texture for particle coloring
   * @returns {THREE.PointsMaterial}
   */
  createParticleMaterial(colorTexture = null) {
    const material = new THREE.PointsMaterial({
      size: 0.04,
      opacity: 0.6,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Store uniforms for external access
    const customUniforms = {
      uPositionsTexture: { value: null },
      uColorTexture: { value: colorTexture },
      uHighlightColor: { value: new THREE.Vector3(0.3, 0.6, 1.0) }
    };

    // Attach uniforms to material for external access
    material.userData.uniforms = customUniforms;

    material.onBeforeCompile = (shader) => {
      // Merge our uniforms with Three.js's
      shader.uniforms = {
        ...shader.uniforms,
        ...customUniforms
      };

      // Inject vertex shader modifications
      shader.vertexShader = `
        uniform sampler2D uPositionsTexture;
        varying vec2 vUv;
        varying float vTemperature;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
          #include <begin_vertex>
          vec4 posData = texture2D(uPositionsTexture, position.xy);
          transformed = posData.rgb;
          vTemperature = posData.a;
          vUv = uv;
        `
      );

      // Inject fragment shader modifications
      shader.fragmentShader = `
        uniform sampler2D uColorTexture;
        uniform vec3 uHighlightColor;
        varying float vTemperature;
        varying vec2 vUv;
        ${shader.fragmentShader}
      `.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
          vec3 texColor = texture2D(uColorTexture, vUv).rgb;
          vec3 finalColor = mix(texColor, uHighlightColor, vTemperature / 1.5);
          vec4 diffuseColor = vec4(finalColor, opacity);
        `
      );
    };

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

