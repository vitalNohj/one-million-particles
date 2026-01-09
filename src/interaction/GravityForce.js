import { Force } from './Force.js';
import * as THREE from 'three';

export class GravityForce extends Force {
  constructor() {
    super('gravity');
    this.uniforms = {
      uGravity: { value: new THREE.Vector3(0, 0, 0) }
    };
  }

  setGravity(x, y, z) {
    this.uniforms.uGravity.value.set(x, y, z);
  }
}

