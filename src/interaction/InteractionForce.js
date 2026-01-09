import * as THREE from 'three';
import { PHYSICS } from '../core/constants.js';

/**
 * Types of interaction forces
 */
export const ForceType = {
  REPEL: 'repel',
  ATTRACT: 'attract',
  TURBULENCE: 'turbulence',
  VORTEX: 'vortex'
};

/**
 * Represents a force that can be applied to particles
 * Used for pointer interaction and other dynamic effects
 */
export class InteractionForce {
  /**
   * @param {Object} options - Force configuration
   * @param {string} options.type - Force type (ForceType enum)
   * @param {number} options.strength - Force strength
   * @param {number} options.radius - Effect radius
   * @param {number} options.falloff - Falloff exponent (higher = sharper falloff)
   */
  constructor(options = {}) {
    this.type = options.type ?? ForceType.REPEL;
    this.strength = options.strength ?? 1.0;
    this.radius = options.radius ?? PHYSICS.POINTER_INFLUENCE_RADIUS;
    this.falloff = options.falloff ?? 2.0;
    
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.enabled = true;
    
    // For shader uniforms
    this._uniformData = {
      position: new THREE.Vector3(),
      positionStart: new THREE.Vector3(),
      strength: this.strength,
      radius: this.radius
    };
  }

  /**
   * Set the force position
   * @param {THREE.Vector3} position
   */
  setPosition(position) {
    this.position.copy(position);
  }

  /**
   * Set the force position from pointer handler
   * @param {PointerHandler} pointerHandler
   */
  setFromPointer(pointerHandler) {
    this.position.copy(pointerHandler.getWorldPosition());
    this._uniformData.position.copy(this.position);
    this._uniformData.positionStart.copy(pointerHandler.getStartPosition());
  }

  /**
   * Update velocity (for momentum-based forces)
   * @param {THREE.Vector3} newPosition
   * @param {number} deltaTime
   */
  updateVelocity(newPosition, deltaTime) {
    if (deltaTime > 0) {
      this.velocity.subVectors(newPosition, this.position).divideScalar(deltaTime);
    }
    this.position.copy(newPosition);
  }

  /**
   * Calculate force at a given position
   * @param {THREE.Vector3} particlePosition - Position to calculate force for
   * @param {THREE.Vector3} target - Vector to store result
   * @returns {THREE.Vector3}
   */
  calculateForce(particlePosition, target = new THREE.Vector3()) {
    if (!this.enabled) {
      return target.set(0, 0, 0);
    }

    const direction = target.subVectors(particlePosition, this.position);
    const distance = direction.length();
    
    if (distance < 0.001 || distance > this.radius) {
      return target.set(0, 0, 0);
    }

    // Normalize direction
    direction.divideScalar(distance);
    
    // Calculate falloff (1 at center, 0 at radius)
    const normalizedDist = distance / this.radius;
    const falloffFactor = Math.pow(1 - normalizedDist, this.falloff);
    
    // Apply force based on type
    switch (this.type) {
      case ForceType.REPEL:
        target.copy(direction).multiplyScalar(this.strength * falloffFactor);
        break;
        
      case ForceType.ATTRACT:
        target.copy(direction).multiplyScalar(-this.strength * falloffFactor);
        break;
        
      case ForceType.TURBULENCE:
        // Add noise-based displacement
        const noise = Math.sin(distance * 10 + Date.now() * 0.001) * 0.5 + 0.5;
        target.copy(direction).multiplyScalar(this.strength * falloffFactor * noise);
        break;
        
      case ForceType.VORTEX:
        // Perpendicular force for swirling motion
        target.set(-direction.y, direction.x, direction.z);
        target.multiplyScalar(this.strength * falloffFactor);
        break;
        
      default:
        target.set(0, 0, 0);
    }
    
    return target;
  }

  /**
   * Get uniform data for shader
   * @returns {Object}
   */
  getUniformData() {
    this._uniformData.strength = this.enabled ? this.strength : 0;
    this._uniformData.radius = this.radius;
    return this._uniformData;
  }

  /**
   * Get uniforms object for Three.js material
   * @returns {Object}
   */
  getUniforms() {
    return {
      uPointer: { value: this._uniformData.position },
      uPointerStart: { value: this._uniformData.positionStart }
    };
  }

  /**
   * Enable the force
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable the force
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Toggle the force
   * @returns {boolean} New enabled state
   */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

/**
 * Manages multiple interaction forces
 */
export class ForceManager {
  constructor() {
    this.forces = new Map();
  }

  /**
   * Add a force
   * @param {string} name - Force identifier
   * @param {InteractionForce} force
   */
  add(name, force) {
    this.forces.set(name, force);
  }

  /**
   * Get a force by name
   * @param {string} name
   * @returns {InteractionForce}
   */
  get(name) {
    return this.forces.get(name);
  }

  /**
   * Remove a force
   * @param {string} name
   */
  remove(name) {
    this.forces.delete(name);
  }

  /**
   * Update all forces from a pointer handler
   * @param {PointerHandler} pointerHandler
   */
  updateFromPointer(pointerHandler) {
    for (const force of this.forces.values()) {
      force.setFromPointer(pointerHandler);
    }
  }

  /**
   * Calculate combined force at a position
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} target
   * @returns {THREE.Vector3}
   */
  calculateCombinedForce(position, target = new THREE.Vector3()) {
    target.set(0, 0, 0);
    const tempForce = new THREE.Vector3();
    
    for (const force of this.forces.values()) {
      force.calculateForce(position, tempForce);
      target.add(tempForce);
    }
    
    return target;
  }

  /**
   * Get the primary force (first one, typically pointer)
   * @returns {InteractionForce|null}
   */
  getPrimary() {
    const first = this.forces.values().next();
    return first.done ? null : first.value;
  }
}

