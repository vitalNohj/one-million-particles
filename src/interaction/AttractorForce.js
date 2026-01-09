import { Force } from './Force.js';
import * as THREE from 'three';

export class AttractorForce extends Force {
  constructor() {
    super('attractor');
    this.uniforms = {
      uAttractorPosition: { value: new THREE.Vector3() },
      uAttractorStrength: { value: 0.0 }, // Positive for attraction, negative for repulsion
      uAttractorRadius: { value: 100.0 }
    };
  }

  setPosition(x, y, z) {
    this.uniforms.uAttractorPosition.value.set(x, y, z);
  }

  setStrength(strength) {
    this.uniforms.uAttractorStrength.value = strength;
  }

  setRadius(radius) {
    this.uniforms.uAttractorRadius.value = radius;
  }
}

