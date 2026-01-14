precision highp float;

uniform sampler2D uOriginalPositionsTexture;
uniform sampler2D uPositionsTexture;
uniform sampler2D uVelocitiesTexture;
uniform vec2 uTextureResolution;
uniform vec3 uPointer;
uniform vec3 uPointerStart;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uTime;
uniform float uDeltaTime;

#include "../includes/noise.glsl"

void main() {
  vec2 uv = gl_FragCoord.xy / uTextureResolution;
  
  // Sample current state
  vec4 posData = texture2D(uPositionsTexture, uv);
  vec3 originalPosition = texture2D(uOriginalPositionsTexture, uv).rgb;
  vec3 position = posData.rgb;
  float opCode = posData.a;  // PRESERVE operation code from texture!
  vec4 velocity = texture2D(uVelocitiesTexture, uv).rgba;
  
  // Calculate displacement from original position
  vec3 diffPosition = originalPosition - position;
  float diffPositionLength = clamp(length(diffPosition), 0.0, 1.0);

  // Apply curl noise for organic movement
  position += curlNoise(originalPosition + uTime * uNoiseFrequency) * uNoiseAmplitude;
  
  // Apply velocity
  position += velocity.xyz * uDeltaTime;

  // Output position with PRESERVED operation code in alpha
  // (displacement can be calculated in render shader if needed)
  gl_FragColor = vec4(position, opCode);
}

