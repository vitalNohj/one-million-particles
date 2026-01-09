// Particle rendering fragment shader
// Colors particles based on texture and displacement

uniform sampler2D uColorTexture;
uniform vec3 uHighlightColor;
uniform float uOpacity;

varying vec2 vUv;
varying float vTemperature;

void main() {
  // Sample base color from texture
  vec3 baseColor = texture2D(uColorTexture, vUv).rgb;
  
  // Mix with highlight color based on displacement (temperature)
  vec3 finalColor = mix(baseColor, uHighlightColor, vTemperature / 1.5);
  
  gl_FragColor = vec4(finalColor, uOpacity);
}

