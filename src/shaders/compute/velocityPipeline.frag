/**
 * Velocity Pipeline Shader
 * 
 * Companion to pipeline.frag - this shader outputs velocity data.
 * Runs the same operation logic but outputs velocity instead of position.
 */

precision highp float;

// Texture samplers
uniform sampler2D uPositionsTexture;
uniform sampler2D uVelocitiesTexture;
uniform sampler2D uOriginalPositionsTexture;

// Resolution and time
uniform vec2 uTextureResolution;
uniform float uTime;
uniform float uDeltaTime;

// Global operation override
uniform float uGlobalOperation;

// Operation parameters
uniform vec3 uGravity;
uniform vec3 uWindDirection;
uniform float uWindStrength;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform vec3 uAttractorPosition;
uniform float uAttractorStrength;
uniform float uAttractorRadius;
uniform vec3 uPointer;
uniform vec3 uPointerStart;
uniform float uPointerRadius;
uniform float uPointerStrength;
uniform float uReturnHomeStrength;
uniform vec3 uVortexCenter;
uniform vec3 uVortexAxis;
uniform float uVortexStrength;
uniform float uVortexRadius;
uniform float uDamping;
uniform float uMaxSpeed;

// Include noise functions
#include "../includes/noise.glsl"

// Include operation implementations
#include "../includes/operations.glsl"

void main() {
    vec2 uv = gl_FragCoord.xy / uTextureResolution;
    
    // Read current state
    vec4 posData = texture2D(uPositionsTexture, uv);
    vec4 velData = texture2D(uVelocitiesTexture, uv);
    vec3 originalPos = texture2D(uOriginalPositionsTexture, uv).rgb;
    
    vec3 position = posData.rgb;
    vec3 velocity = velData.rgb;
    float opCode = posData.a;
    float particleState = velData.a;
    
    // Use global operation override if set
    if (uGlobalOperation > 0.0) {
        opCode = uGlobalOperation;
    }
    
    // Dead particles - output zero velocity
    if (particleState == STATE_DEAD) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, STATE_DEAD);
        return;
    }
    
    // Spawning particles - zero velocity, set to active
    if (particleState == STATE_SPAWNING) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, STATE_ACTIVE);
        return;
    }
    
    // Apply operation based on code
    if (opCode == OP_GRAVITY) {
        velocity = opGravity(velocity, normalize(uGravity), length(uGravity), uDeltaTime);
    }
    else if (opCode == OP_WIND) {
        velocity = opWind(velocity, uWindDirection, uWindStrength, uDeltaTime);
    }
    else if (opCode == OP_NOISE) {
        // Noise affects position, not velocity - velocity stays the same
    }
    else if (opCode == OP_ATTRACTOR) {
        velocity = opAttractor(position, velocity, uAttractorPosition, 
                               uAttractorStrength, uAttractorRadius, uDeltaTime);
    }
    else if (opCode == OP_RETURN_HOME) {
        velocity = opReturnHome(position, velocity, originalPos, uReturnHomeStrength);
    }
    else if (opCode == OP_POINTER) {
        velocity = opPointer(position, velocity, uPointer, uPointerStart, 
                            uPointerRadius, uPointerStrength);
    }
    else if (opCode == OP_TURBULENCE) {
        // Turbulence affects position directly
    }
    else if (opCode == OP_VORTEX) {
        velocity = opVortex(position, velocity, uVortexCenter, uVortexAxis, 
                           uVortexStrength, uVortexRadius, uDeltaTime);
    }
    else if (opCode == OP_ALL) {
        // Combined operations
        vec3 target = originalPos;
        
        // Pointer interaction
        vec3 diffToPointer = position - uPointer;
        float pointerDiffLength = distance(uPointer, uPointerStart);
        float distanceToPointer = length(position.xy - uPointer.xy);
        float isHit = 1.0 - smoothstep(0.0, uPointerRadius, distanceToPointer);
        vec3 pointerOffset = normalize(diffToPointer) * clamp(pow(2.5, pointerDiffLength * 4.0), 1.0, 100.0) * isHit;
        target += pointerOffset;
        
        // Attractor
        float distToAttractor = distance(position, uAttractorPosition);
        if (distToAttractor < uAttractorRadius && uAttractorRadius > 0.0) {
            vec3 dirToAttractor = normalize(uAttractorPosition - position);
            float pct = 1.0 - smoothstep(0.0, uAttractorRadius, distToAttractor);
            target += dirToAttractor * uAttractorStrength * pct;
        }
        
        // Gravity
        target += uGravity;
        
        // Velocity toward target
        velocity = target - position;
    }
    
    // Apply damping
    if (uDamping > 0.0 && uDamping < 1.0) {
        velocity = opDamping(velocity, uDamping);
    }
    
    // Clamp speed
    float speed = length(velocity);
    float maxSpd = uMaxSpeed > 0.0 ? uMaxSpeed : 100.0;
    if (speed > maxSpd) {
        velocity = velocity / speed * maxSpd;
    }
    
    // Output: velocity (RGB) + particle state (A)
    gl_FragColor = vec4(velocity, particleState);
}
