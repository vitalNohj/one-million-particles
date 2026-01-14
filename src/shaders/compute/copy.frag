/**
 * Simple copy shader - copies input texture to output
 * Used for initializing render targets from data textures
 */

precision highp float;

uniform sampler2D uInputTexture;
uniform vec2 uTextureResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uTextureResolution;
    gl_FragColor = texture2D(uInputTexture, uv);
}
