// Particle rendering vertex shader
// Reads particle positions from GPGPU texture

uniform sampler2D uPositionsTexture;
uniform float uPointSize;
uniform float uPixelRatio;

varying vec2 vUv;
varying float vTemperature;

void main() {
  // Position attribute contains UV coordinates into the positions texture
  vec4 positionData = texture2D(uPositionsTexture, position.xy);
  vec3 particlePosition = positionData.rgb;
  
  // Temperature represents how displaced the particle is from its original position
  vTemperature = positionData.a;
  vUv = uv;
  
  // Transform to clip space
  vec4 mvPosition = modelViewMatrix * vec4(particlePosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Point size with attenuation
  gl_PointSize = uPointSize * uPixelRatio;
  gl_PointSize *= (1.0 / -mvPosition.z);
}

