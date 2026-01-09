// Particle rendering fragment shader
// Colors particles based on texture and displacement

uniform sampler2D uColorTexture;
uniform bool uHasColorTexture;
uniform vec3 uHighlightColor;
uniform float uOpacity;

varying vec2 vUv;
varying float vTemperature;

void main() {
  vec3 baseColor;
  
  if (uHasColorTexture) {
    // Sample base color from texture
    baseColor = texture2D(uColorTexture, vUv).rgb;
  } else {
    baseColor = vec3(1.0);
  }
  
  // Mix with highlight color based on displacement (temperature)
  vec3 finalColor = mix(baseColor, uHighlightColor, vTemperature / 1.5);
  
  gl_FragColor = vec4(finalColor, uOpacity);
}

