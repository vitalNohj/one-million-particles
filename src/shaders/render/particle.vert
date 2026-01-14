// Particle rendering vertex shader
// Reads particle positions from GPGPU texture

uniform sampler2D uPositionsTexture;
uniform sampler2D uOriginalPositionsTexture;
uniform float uPointSize;
uniform float uPixelRatio;

varying vec2 vUv;
varying float vTemperature;

void main() {
  // Position attribute contains UV coordinates into the positions texture
  vec4 positionData = texture2D(uPositionsTexture, position.xy);
  vec3 particlePosition = positionData.rgb;
  // Note: positionData.a now contains operation code, not displacement
  
  // Calculate temperature (displacement) by comparing to original position
  vec3 originalPosition = texture2D(uOriginalPositionsTexture, position.xy).rgb;
  vTemperature = clamp(length(particlePosition - originalPosition), 0.0, 1.0);
  
  vUv = uv;
  
  // Transform to clip space
  vec4 mvPosition = modelViewMatrix * vec4(particlePosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Point size with attenuation
  gl_PointSize = uPointSize * uPixelRatio;
  gl_PointSize *= (1.0 / -mvPosition.z);
}

