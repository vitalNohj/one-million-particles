import * as THREE from 'three';

/**
 * Base class for all forces
 * Manages uniforms and provides interface for update logic
 */
export class Force {
  constructor(name) {
    this.name = name;
    this.enabled = true;
    this.uniforms = {};
  }

  getUniforms() {
    return this.uniforms;
  }

  update(dt) {
    // Override in subclasses
  }
}

