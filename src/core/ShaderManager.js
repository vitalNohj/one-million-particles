import * as THREE from 'three';
import { OP_CODES, PARTICLE_STATE } from './OperationCodes.js';

// Import shaders as modules (vite-plugin-glsl handles this)
import quadVertexShader from '../shaders/compute/quad.vert';
import positionFragmentShader from '../shaders/compute/position.frag';
import velocityFragmentShader from '../shaders/compute/velocity.frag';
import pipelineFragmentShader from '../shaders/compute/pipeline.frag';
import velocityPipelineFragmentShader from '../shaders/compute/velocityPipeline.frag';
import particleVertexShader from '../shaders/render/particle.vert';
import particleFragmentShader from '../shaders/render/particle.frag';

/**
 * Manages shader materials for the GPGPU particle system
 * Compiles once and caches - no per-frame recompilation
 * 
 * Supports two modes:
 * - Legacy mode: separate position/velocity shaders
 * - Pipeline mode: unified self-directing shaders
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
   * Get uniforms for the self-directing pipeline shader
   * @private
   */
  _getPipelineUniforms() {
    return {
      // Texture samplers
      uPositionsTexture: { value: null },
      uVelocitiesTexture: { value: null },
      uOriginalPositionsTexture: { value: null },
      uOperationQueueTexture: { value: null },
      
      // Resolution and time
      uTextureResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uDeltaTime: { value: 0 },
      
      // Global operation override (0 = use per-particle ops from texture)
      uGlobalOperation: { value: OP_CODES.ALL },
      
      // Gravity parameters
      uGravity: { value: new THREE.Vector3(0, 0, 0) },
      
      // Wind parameters
      uWindDirection: { value: new THREE.Vector3(1, 0, 0) },
      uWindStrength: { value: 0 },
      
      // Noise parameters
      uNoiseFrequency: { value: 0.15 },
      uNoiseAmplitude: { value: 0.002 },
      
      // Attractor parameters
      uAttractorPosition: { value: new THREE.Vector3(0, 0, 0) },
      uAttractorStrength: { value: 0 },
      uAttractorRadius: { value: 100.0 },
      
      // Pointer interaction parameters
      uPointer: { value: new THREE.Vector3() },
      uPointerStart: { value: new THREE.Vector3() },
      uPointerRadius: { value: 1.0 },
      uPointerStrength: { value: 2.5 },
      
      // Return home parameters
      uReturnHomeStrength: { value: 0.1 },
      
      // Vortex parameters
      uVortexCenter: { value: new THREE.Vector3(0, 0, 0) },
      uVortexAxis: { value: new THREE.Vector3(0, 1, 0) },
      uVortexStrength: { value: 0 },
      uVortexRadius: { value: 5.0 },
      
      // Physics parameters
      uDamping: { value: 0.98 },
      uMaxSpeed: { value: 100.0 }
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
   * Create the unified pipeline position material (self-directing shader)
   * This shader reads operation codes from the texture and executes the appropriate math.
   * @returns {THREE.ShaderMaterial}
   */
  createPipelineMaterial() {
    if (this.materials.has('pipeline')) {
      return this.materials.get('pipeline');
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: pipelineFragmentShader,
      uniforms: this._getPipelineUniforms(),
      depthTest: false,
      depthWrite: false
    });

    this.materials.set('pipeline', material);
    return material;
  }

  /**
   * Create the unified pipeline velocity material (self-directing shader)
   * Companion to the pipeline material - outputs velocity data.
   * @returns {THREE.ShaderMaterial}
   */
  createVelocityPipelineMaterial() {
    if (this.materials.has('velocityPipeline')) {
      return this.materials.get('velocityPipeline');
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: quadVertexShader,
      fragmentShader: velocityPipelineFragmentShader,
      uniforms: this._getPipelineUniforms(),
      depthTest: false,
      depthWrite: false
    });

    this.materials.set('velocityPipeline', material);
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
   * Update uniforms on pipeline materials
   * @param {Object} uniforms - Uniform values to update
   */
  updatePipelineUniforms(uniforms) {
    const pipelineMat = this.materials.get('pipeline');
    const velocityPipelineMat = this.materials.get('velocityPipeline');

    for (const [key, value] of Object.entries(uniforms)) {
      if (pipelineMat?.uniforms[key]) {
        pipelineMat.uniforms[key].value = value;
      }
      if (velocityPipelineMat?.uniforms[key]) {
        velocityPipelineMat.uniforms[key].value = value;
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
    this.updatePipelineUniforms({
      uTextureResolution: new THREE.Vector2(width, height)
    });
  }

  /**
   * Set global operation for all particles
   * @param {number} opCode - Operation code from OP_CODES
   */
  setGlobalOperation(opCode) {
    this.updatePipelineUniforms({ uGlobalOperation: opCode });
  }

  /**
   * Set operation parameters
   * @param {Object} params - Operation parameters
   */
  setOperationParams(params) {
    const uniformUpdates = {};
    
    if (params.gravity !== undefined) {
      uniformUpdates.uGravity = new THREE.Vector3(...params.gravity);
    }
    if (params.windDirection !== undefined) {
      uniformUpdates.uWindDirection = new THREE.Vector3(...params.windDirection);
    }
    if (params.windStrength !== undefined) {
      uniformUpdates.uWindStrength = params.windStrength;
    }
    if (params.noiseFrequency !== undefined) {
      uniformUpdates.uNoiseFrequency = params.noiseFrequency;
    }
    if (params.noiseAmplitude !== undefined) {
      uniformUpdates.uNoiseAmplitude = params.noiseAmplitude;
    }
    if (params.attractorPosition !== undefined) {
      uniformUpdates.uAttractorPosition = new THREE.Vector3(...params.attractorPosition);
    }
    if (params.attractorStrength !== undefined) {
      uniformUpdates.uAttractorStrength = params.attractorStrength;
    }
    if (params.attractorRadius !== undefined) {
      uniformUpdates.uAttractorRadius = params.attractorRadius;
    }
    if (params.pointerRadius !== undefined) {
      uniformUpdates.uPointerRadius = params.pointerRadius;
    }
    if (params.pointerStrength !== undefined) {
      uniformUpdates.uPointerStrength = params.pointerStrength;
    }
    if (params.returnHomeStrength !== undefined) {
      uniformUpdates.uReturnHomeStrength = params.returnHomeStrength;
    }
    if (params.vortexCenter !== undefined) {
      uniformUpdates.uVortexCenter = new THREE.Vector3(...params.vortexCenter);
    }
    if (params.vortexAxis !== undefined) {
      uniformUpdates.uVortexAxis = new THREE.Vector3(...params.vortexAxis);
    }
    if (params.vortexStrength !== undefined) {
      uniformUpdates.uVortexStrength = params.vortexStrength;
    }
    if (params.vortexRadius !== undefined) {
      uniformUpdates.uVortexRadius = params.vortexRadius;
    }
    if (params.damping !== undefined) {
      uniformUpdates.uDamping = params.damping;
    }
    if (params.maxSpeed !== undefined) {
      uniformUpdates.uMaxSpeed = params.maxSpeed;
    }
    
    this.updatePipelineUniforms(uniformUpdates);
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

