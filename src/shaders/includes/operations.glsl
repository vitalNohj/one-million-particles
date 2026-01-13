/**
 * Operation implementations for the self-directing shader engine.
 * Each function applies a specific force/transformation to particles.
 * These are called from the main pipeline shader based on operation codes.
 */

// Operation codes - must match OperationCodes.js
const float OP_NONE = 0.0;
const float OP_GRAVITY = 1.0;
const float OP_WIND = 2.0;
const float OP_NOISE = 3.0;
const float OP_ATTRACTOR = 4.0;
const float OP_RETURN_HOME = 5.0;
const float OP_POINTER = 6.0;
const float OP_TURBULENCE = 7.0;
const float OP_VORTEX = 8.0;
const float OP_ALL = 9.0;
const float OP_CUSTOM_1 = 10.0;
const float OP_CUSTOM_2 = 11.0;
const float OP_CUSTOM_3 = 12.0;
const float OP_CUSTOM_4 = 13.0;
const float OP_CUSTOM_5 = 14.0;
const float OP_MAX = 15.0;

// Particle states
const float STATE_DEAD = 0.0;
const float STATE_ACTIVE = 1.0;
const float STATE_SPAWNING = 2.0;
const float STATE_DYING = 3.0;

// ============================================================
// OPERATION: Gravity
// Applies constant gravitational acceleration to velocity
// ============================================================
vec3 opGravity(vec3 velocity, vec3 gravityDir, float gravityStrength, float deltaTime) {
    return velocity + gravityDir * gravityStrength * deltaTime;
}

// ============================================================
// OPERATION: Wind
// Applies wind force in a specific direction
// ============================================================
vec3 opWind(vec3 velocity, vec3 windDir, float windStrength, float deltaTime) {
    return velocity + normalize(windDir) * windStrength * deltaTime;
}

// ============================================================
// OPERATION: Noise
// Applies curl noise displacement for organic movement
// Requires noise.glsl to be included before this file
// ============================================================
vec3 opNoise(vec3 position, float time, float frequency, float amplitude) {
    return position + curlNoise(position + time * frequency) * amplitude;
}

// ============================================================
// OPERATION: Attractor
// Applies force toward/away from a point
// Positive strength = attract, negative = repel
// ============================================================
vec3 opAttractor(vec3 position, vec3 velocity, vec3 attractorPos, float strength, float radius, float deltaTime) {
    vec3 toAttractor = attractorPos - position;
    float dist = length(toAttractor);
    
    if (dist > 0.001 && dist < radius) {
        vec3 dir = toAttractor / dist;
        float falloff = 1.0 - smoothstep(0.0, radius, dist);
        return velocity + dir * strength * falloff * deltaTime;
    }
    return velocity;
}

// ============================================================
// OPERATION: Return Home
// Springs particle back toward original position
// ============================================================
vec3 opReturnHome(vec3 position, vec3 velocity, vec3 originalPos, float strength) {
    vec3 toHome = originalPos - position;
    return velocity + toHome * strength;
}

// ============================================================
// OPERATION: Pointer Interaction
// Repels particles from pointer position
// ============================================================
vec3 opPointer(vec3 position, vec3 velocity, vec3 pointer, vec3 pointerStart, float radius, float strength) {
    vec3 diff = position - pointer;
    float dist = length(diff.xy);
    float pointerMovement = distance(pointer, pointerStart);
    
    // Smooth falloff based on distance
    float influence = 1.0 - smoothstep(0.0, radius, dist);
    
    if (influence > 0.001) {
        // Push particles away from pointer
        vec3 pushDir = normalize(diff);
        float force = clamp(pow(2.5, pointerMovement * 4.0), 1.0, 100.0);
        return velocity + pushDir * force * influence * strength;
    }
    return velocity;
}

// ============================================================
// OPERATION: Turbulence
// Multi-octave noise for more chaotic movement
// ============================================================
vec3 opTurbulence(vec3 position, float time, float frequency, float amplitude, int octaves) {
    vec3 result = position;
    float freq = frequency;
    float amp = amplitude;
    
    for (int i = 0; i < 4; i++) {
        if (i >= octaves) break;
        result += curlNoise(position * freq + time * freq * 0.5) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    return result;
}

// ============================================================
// OPERATION: Vortex
// Swirls particles around an axis
// ============================================================
vec3 opVortex(vec3 position, vec3 velocity, vec3 center, vec3 axis, float strength, float radius, float deltaTime) {
    vec3 toCenter = position - center;
    
    // Project position onto plane perpendicular to axis
    vec3 axisNorm = normalize(axis);
    vec3 projected = toCenter - axisNorm * dot(toCenter, axisNorm);
    float dist = length(projected);
    
    if (dist > 0.001 && dist < radius) {
        // Calculate tangent direction (perpendicular to both axis and radius)
        vec3 tangent = cross(axisNorm, normalize(projected));
        float falloff = 1.0 - smoothstep(0.0, radius, dist);
        return velocity + tangent * strength * falloff * deltaTime;
    }
    return velocity;
}

// ============================================================
// OPERATION: Damping
// Reduces velocity over time (friction/drag)
// ============================================================
vec3 opDamping(vec3 velocity, float damping) {
    return velocity * damping;
}

// ============================================================
// OPERATION: Bounds Check
// Keeps particles within bounds, reflects velocity at boundaries
// ============================================================
vec3 opBoundsReflect(vec3 position, vec3 velocity, vec3 boundsMin, vec3 boundsMax, float bounciness) {
    vec3 newVel = velocity;
    
    if (position.x < boundsMin.x || position.x > boundsMax.x) {
        newVel.x = -velocity.x * bounciness;
    }
    if (position.y < boundsMin.y || position.y > boundsMax.y) {
        newVel.y = -velocity.y * bounciness;
    }
    if (position.z < boundsMin.z || position.z > boundsMax.z) {
        newVel.z = -velocity.z * bounciness;
    }
    
    return newVel;
}

// ============================================================
// OPERATION: Separation
// Pushes particles apart (requires neighbor data in texture)
// Simplified version using pseudo-random offset
// ============================================================
vec3 opSeparation(vec3 position, vec3 velocity, vec2 uv, float separation, float deltaTime) {
    // Simple pseudo-random separation based on UV
    float noise = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 offset = vec3(noise - 0.5, fract(noise * 17.0) - 0.5, fract(noise * 31.0) - 0.5);
    return velocity + offset * separation * deltaTime;
}

// ============================================================
// UTILITY: Apply velocity to position with clamping
// ============================================================
vec3 applyVelocity(vec3 position, vec3 velocity, float deltaTime, float maxSpeed) {
    vec3 clampedVel = velocity;
    float speed = length(velocity);
    if (speed > maxSpeed) {
        clampedVel = velocity / speed * maxSpeed;
    }
    return position + clampedVel * deltaTime;
}

// ============================================================
// UTILITY: Calculate displacement from original position
// Used for coloring based on "temperature"
// ============================================================
float calcDisplacement(vec3 position, vec3 originalPos) {
    return length(position - originalPos);
}
