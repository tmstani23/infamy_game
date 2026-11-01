import * as THREE from 'three';
import { RUNE, RUNE_GLSL } from './rune_patterns.js';
export { RUNE };

const QUAD = new THREE.PlaneGeometry(2,2);
// One shared quad, one material/draw per marker; progress never rebuilds geometry.
export function createRune(style, color, opacity=.5, depthTest=true) {
  const material=new THREE.ShaderMaterial({
    uniforms:{uStyle:{value:style},uColor:{value:new THREE.Color(color)},uOpacity:{value:opacity},uProgress:{value:-1}},
    vertexShader:'varying vec2 p; void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 p; uniform float uStyle; uniform vec3 uColor; uniform float uOpacity; uniform float uProgress;
      ${RUNE_GLSL}
      void main(){vec2 mark=runePattern(p,uStyle,uProgress);float ink=max(mark.x,mark.y);gl_FragColor=vec4(uColor,ink*uOpacity);}`,
    transparent:true,depthWrite:false,depthTest,side:THREE.DoubleSide,
  });
  material.color=material.uniforms.uColor.value;
  material.opacity=opacity;
  const mesh=new THREE.Mesh(QUAD,material);mesh.rotation.x=-Math.PI/2;
  mesh.onBeforeRender=()=>{material.uniforms.uOpacity.value=material.opacity;};
  return mesh;
}
export function runeProgress(mesh, value) {
  mesh.material.uniforms.uProgress.value=Number.isFinite(value)?Math.max(0,Math.min(1,value)):-1;
}
