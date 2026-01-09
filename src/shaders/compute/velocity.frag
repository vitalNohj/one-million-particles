precision highp float;

uniform sampler2D uOriginalPositionsTexture;
uniform sampler2D uPositionsTexture;
uniform sampler2D uVelocitiesTexture;
uniform vec2 uTextureResolution;
uniform vec3 uPointer;
uniform vec3 uPointerStart;

void main() {
  vec2 uv = gl_FragCoord.xy / uTextureResolution;
  
  // Sample current state
  vec3 originalPosition = texture2D(uOriginalPositionsTexture, uv).rgb;
  vec3 position = texture2D(uPositionsTexture, uv).rgb;
  vec4 velocity = texture2D(uVelocitiesTexture, uv).rgba;

  // Calculate pointer interaction
  vec3 diffToPointer = position - uPointer;    
  float pointerDiffLength = distance(uPointer, uPointerStart);
  float distanceToPointer = length(position.xy - uPointer.xy);
  
  // Smooth falloff for pointer influence
  float isHit = 1.0 - smoothstep(0.0, 1.0, distanceToPointer);
  
  // Calculate target position (particles pushed away from pointer, then spring back)
  vec3 target = originalPosition + normalize(diffToPointer) * clamp(pow(2.5, pointerDiffLength * 4.0), 1.0, 100.0) * isHit;
  
  // Update velocity to move toward target
  velocity.xyz = target - position;

  gl_FragColor = vec4(velocity.xyz, 1.0);
}

