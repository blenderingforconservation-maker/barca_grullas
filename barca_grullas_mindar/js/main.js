import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

/* ============================================================
   La Barca de las Grullas · MindAR (tracking de imagen)
   Optimizaciones para móvil:
   - Sin WebXR / sin detección de piso (el ancla es la imagen)
   - Plano de agua de baja poligonización (24×16)
   - Shader ligero: 2 muestras de normal, sin fbm costoso
   - Pixel ratio limitado a 1.5
   - Calibración guardada en localStorage
   ============================================================ */

const TARGET_SRC = 'targets/targets.mind';
const CAL_KEY = 'barca-grullas-calibration-v1';
const AUDIO_REMOTE = 'https://raw.githubusercontent.com/blenderingforconservation-maker/videAR/main/bosque_noche.mp3';

const introEl = document.querySelector('#intro');
const btnStart = document.querySelector('#btn-start');
const scanFrame = document.querySelector('#scan-frame');
const statusText = document.querySelector('#status-text');
const statusDot = document.querySelector('#status-dot');
const toastEl = document.querySelector('#toast');
const audioEl = document.querySelector('#audioBosque');

let toastTimer = null;
function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toastEl.classList.remove('visible'), 3000);
}
function setStatus(text, found=false){
  statusText.textContent = text;
  statusDot.classList.toggle('found', found);
}

/* ---------- Textura de normal procedural (ligera, tileable) ---------- */
function makeWaterNormalTexture(){
  const size = 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data, tau = Math.PI * 2;
  const hFn = (u,v)=> Math.sin(u*tau*3 + Math.cos(v*tau*2)*0.6)*0.45 + Math.cos(v*tau*4 - u*tau*2)*0.35;
  const eps = 1/size;
  for(let y=0;y<size;y++){
    const v = y/size;
    for(let x=0;x<size;x++){
      const u = x/size;
      const dx = (hFn(u+eps,v)-hFn(u-eps,v))*2.4;
      const dy = (hFn(u,v+eps)-hFn(u,v-eps))*2.4;
      const inv = 1/Math.sqrt(dx*dx+dy*dy+1);
      const i = (y*size+x)*4;
      d[i]   = Math.round((-dx*inv*0.5+0.5)*255);
      d[i+1] = Math.round((-dy*inv*0.5+0.5)*255);
      d[i+2] = Math.round((inv*0.5+0.5)*255);
      d[i+3] = 255;
    }
  }
  ctx.putImageData(img,0,0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------- Calibración ---------- */
const defaultCal = { y:-0.35, z:0.12, w:1.6, l:1.1, rot:0, opacity:0.65, flow:0.9 };
let cal = { ...defaultCal };
try{
  const saved = localStorage.getItem(CAL_KEY);
  if(saved) cal = { ...defaultCal, ...JSON.parse(saved) };
}catch(_){}

const els = {
  y: document.querySelector('#cal-y'), z: document.querySelector('#cal-z'),
  w: document.querySelector('#cal-w'), l: document.querySelector('#cal-l'),
  rot: document.querySelector('#cal-rot'), opacity: document.querySelector('#cal-opacity'),
  flow: document.querySelector('#cal-flow'),
  yVal: document.querySelector('#cal-y-val'), zVal: document.querySelector('#cal-z-val'),
  wVal: document.querySelector('#cal-w-val'), lVal: document.querySelector('#cal-l-val'),
  rotVal: document.querySelector('#cal-rot-val'), opVal: document.querySelector('#cal-opacity-val'),
  flowVal: document.querySelector('#cal-flow-val'),
  panel: document.querySelector('#cal-panel'),
};

let waterGroup = null;
let waterMat = null;
let splashMat = null;
let reveal = 0;
let targetFound = false;

function syncCalUI(){
  els.y.value = cal.y; els.z.value = cal.z; els.w.value = cal.w; els.l.value = cal.l;
  els.rot.value = cal.rot; els.opacity.value = cal.opacity; els.flow.value = cal.flow;
  updateCalLabels();
}
function updateCalLabels(){
  els.yVal.textContent = parseFloat(els.y.value).toFixed(2);
  els.zVal.textContent = parseFloat(els.z.value).toFixed(2);
  els.wVal.textContent = parseFloat(els.w.value).toFixed(2);
  els.lVal.textContent = parseFloat(els.l.value).toFixed(2);
  els.rotVal.textContent = `${els.rot.value}°`;
  els.opVal.textContent = parseFloat(els.opacity.value).toFixed(2);
  els.flowVal.textContent = parseFloat(els.flow.value).toFixed(2);
}
function applyCalibration(){
  if(!waterGroup) return;
  cal = {
    y: parseFloat(els.y.value), z: parseFloat(els.z.value),
    w: parseFloat(els.w.value), l: parseFloat(els.l.value),
    rot: parseFloat(els.rot.value), opacity: parseFloat(els.opacity.value),
    flow: parseFloat(els.flow.value),
  };
  updateCalLabels();
  waterGroup.position.set(0, cal.y, cal.z);
  waterGroup.rotation.set(-Math.PI/2, 0, THREE.MathUtils.degToRad(cal.rot));
  waterGroup.scale.set(cal.w, cal.l, 1);
  if(waterMat){
    waterMat.uniforms.uOpacity.value = cal.opacity;
    waterMat.uniforms.uFlowSpeed.value = cal.flow;
    // El tamaño del hueco del casco escala con el agua
    waterMat.uniforms.uBoatHalfSize.value.set(0.42 * cal.w, 0.18 * cal.l);
  }
  if(splashMat) splashMat.uniforms.uFlowSpeed.value = cal.flow;
}
Object.values(els).forEach(el=>{
  if(el && el.tagName === 'INPUT') el.addEventListener('input', applyCalibration);
});
document.querySelector('#btn-cal').addEventListener('click', ()=>{
  els.panel.classList.remove('hidden');
});
document.querySelector('#btn-cal-close').addEventListener('click', ()=>{
  els.panel.classList.add('hidden');
});
document.querySelector('#btn-cal-save').addEventListener('click', ()=>{
  try{ localStorage.setItem(CAL_KEY, JSON.stringify(cal)); showToast('Ajuste guardado en este teléfono'); }catch(_){}
  els.panel.classList.add('hidden');
});
document.querySelector('#btn-cal-reset').addEventListener('click', ()=>{
  cal = { ...defaultCal };
  syncCalUI(); applyCalibration();
  try{ localStorage.removeItem(CAL_KEY); }catch(_){}
  showToast('Ajuste restablecido');
});

/* ---------- Audio ambiente ---------- */
let audioOn = false;
let audioFade = null;
const btnAudio = document.querySelector('#btn-audio');
audioEl.addEventListener('error', ()=>{
  if(audioEl.src !== AUDIO_REMOTE) audioEl.src = AUDIO_REMOTE;
}, { once:true });

btnAudio.addEventListener('click', async ()=>{
  audioOn = !audioOn;
  clearInterval(audioFade);
  if(audioOn){
    try{
      audioEl.volume = 0;
      await audioEl.play();
      let v = 0;
      audioFade = setInterval(()=>{
        v = Math.min(0.7, v + 0.05);
        audioEl.volume = v;
        if(v >= 0.7) clearInterval(audioFade);
      }, 150);
      btnAudio.textContent = '🔊 Audio';
      showToast('Audio ambiente activado');
    }catch(_){ showToast('Toca de nuevo para activar el audio'); audioOn=false; }
  }else{
    let v = audioEl.volume;
    audioFade = setInterval(()=>{
      v = Math.max(0, v - 0.08);
      audioEl.volume = v;
      if(v <= 0){ audioEl.pause(); clearInterval(audioFade); }
    }, 100);
    btnAudio.textContent = '🔇 Audio';
  }
});

/* ---------- Ayuda ---------- */
const helpModal = document.querySelector('#help-modal');
document.querySelector('#btn-help').addEventListener('click', ()=>helpModal.classList.remove('hidden'));
document.querySelector('#btn-help-close').addEventListener('click', ()=>helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e)=>{ if(e.target === helpModal) helpModal.classList.add('hidden'); });

/* ---------- Foto (composición video + canvas, solo al tocar) ---------- */
document.querySelector('#btn-photo').addEventListener('click', ()=>{
  const video = document.querySelector('#container video');
  const canvas = document.querySelector('#container canvas');
  if(!video || !canvas){ showToast('La cámara aún no está lista'); return; }
  const w = canvas.width, h = canvas.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Fondo: video de cámara
  if(video.readyState >= 2){
    const vw = video.videoWidth || w, vh = video.videoHeight || h;
    const scale = Math.max(w/vw, h/vh);
    const sw = w/scale, sh = h/scale;
    ctx.drawImage(video, (vw-sw)/2, (vh-sh)/2, sw, sh, 0, 0, w, h);
  }
  ctx.drawImage(canvas, 0, 0, w, h);
  const fs = Math.max(18, Math.round(w*0.024));
  ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillStyle = 'rgba(244,249,248,0.9)';
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 8;
  ctx.fillText('Museo Leonora Carrington · SLP', fs*1.3, h - fs*1.3);
  c.toBlob(async (blob)=>{
    if(!blob) return;
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const file = new File([blob], `BarcaGrullas_${stamp}.jpg`, { type:'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files:[file] })){
      try{ await navigator.share({ files:[file], title:'La Barca de las Grullas AR' }); showToast('Guardado'); return; }catch(err){ if(err.name==='AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    showToast('Foto descargada');
  }, 'image/jpeg', 0.92);
});

/* ---------- Escena MindAR + agua ---------- */
let mindarThree = null;
let started = false;

function buildWater(){
  const group = new THREE.Group();

  // Plano de agua: baja poligonización para no castigar la CPU/GPU
  const geo = new THREE.PlaneGeometry(1, 1, 24, 16);
  geo.rotateX(-Math.PI/2);

  const normalTex = makeWaterNormalTexture();

  waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFlowSpeed: { value: cal.flow },
      uOpacity: { value: cal.opacity },
      uBoatHalfSize: { value: new THREE.Vector2(0.42 * cal.w, 0.18 * cal.l) },
      uColorDeep: { value: new THREE.Color(0x0a2e52) },
      uColorMid: { value: new THREE.Color(0x1168b5) },
      uColorShallow: { value: new THREE.Color(0x3aa7e8) },
      uFoamColor: { value: new THREE.Color(0xeaf8ff) },
      uLightColor: { value: new THREE.Color(0xc2e9ff) },
      uNormalMap: { value: normalTex },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uFlowSpeed;
      varying vec2 vLocalXZ;
      varying vec3 vWorldPos;
      varying float vBowImpact;
      void main(){
        vec3 pos = position;
        float flow = uTime * uFlowSpeed;
        // Olas suaves en vértices (el detalle fino va en normales)
        pos.y += sin(pos.x*3.0 - flow*2.0 + sin(pos.z*4.0)*0.5) * 0.012;
        pos.y += cos(pos.z*3.5 - flow*1.6) * 0.008;
        // Acumulación en proa (-X local)
        float bow = exp(-pow((pos.x + 0.42)*3.2, 2.0) - pow(pos.z*2.4, 2.0));
        pos.y += bow * 0.03 * (0.8 + 0.2*sin(uTime*7.0));
        vBowImpact = bow;
        vLocalXZ = pos.xz;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uReveal;
      uniform float uFlowSpeed;
      uniform float uOpacity;
      uniform vec2 uBoatHalfSize;
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorShallow;
      uniform vec3 uFoamColor;
      uniform vec3 uLightColor;
      uniform sampler2D uNormalMap;
      varying vec2 vLocalXZ;
      varying vec3 vWorldPos;
      varying float vBowImpact;

      void main(){
        float flow = uTime * uFlowSpeed;
        vec2 localXZ = vLocalXZ;
        vec2 hull = max(uBoatHalfSize, vec2(0.15));
        vec2 q = localXZ / hull;
        float r = length(q);

        // Hueco elíptico del casco (ajustable en calibración vía uBoatHalfSize)
        float insideHull = 1.0 - smoothstep(0.78, 0.98, r);
        float cutout = 1.0 - insideHull;
        if(cutout < 0.02) discard;

        // Normales en espacio local (metros), sin aliasing por UV gigante
        vec2 uvN1 = localXZ * 1.6 + vec2(-flow*0.35, sin(uTime*0.4)*0.04);
        vec2 uvN2 = localXZ * 3.2 + vec2(-flow*0.6, -cos(uTime*0.3)*0.04);
        vec3 texN1 = texture2D(uNormalMap, uvN1).xyz * 2.0 - 1.0;
        vec3 texN2 = texture2D(uNormalMap, uvN2).xyz * 2.0 - 1.0;

        // Espuma: borde del casco + proa + estela en V
        float rim = exp(-pow((r - 0.98)*5.0, 2.0));
        float bowBias = 0.55 + 0.55 * (1.0 - smoothstep(-1.0, 0.4, q.x));
        float hullFoam = rim * bowBias;

        float trailX = localXZ.x + hull.x * 0.9;
        float wakeDecay = exp(-max(0.0, trailX) * 0.9);
        float wakeArmZ = max(hull.y * 0.42, trailX * 0.35);
        float distArm = abs(abs(localXZ.y) - wakeArmZ);
        float kelvin = max(0.0, cos((abs(localXZ.y) - wakeArmZ) * 10.0 - uTime*6.0));
        float kelvinWake = kelvin * exp(-distArm * 3.0) * smoothstep(-0.2, 0.3, trailX) * wakeDecay;

        float foam = clamp(vBowImpact*0.9 + hullFoam*0.9 + kelvinWake*0.6, 0.0, 1.0);

        vec2 normXY = (texN1.xy*0.6 + texN2.xy*0.4) * 1.25;
        normXY.x -= vBowImpact * 0.5;
        normXY.y += sign(localXZ.y) * kelvinWake * 0.5;
        vec3 normal = normalize(vec3(normXY.x, normXY.y, 1.0));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 lightDir = normalize(vec3(-0.45, 1.0, 0.45));
        float height = 0.5 + 0.5 * (texN1.z*0.5 + texN2.z*0.5);
        float spec = pow(max(dot(normal, lightDir), 0.0), 28.0);
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

        vec3 color = mix(uColorDeep, uColorMid, smoothstep(0.25, 0.65, height));
        color = mix(color, uColorShallow, smoothstep(0.55, 0.9, height));
        color = mix(color, uFoamColor, foam * 0.85);
        color += uLightColor * spec * (1.1 + foam*0.5);
        color = mix(color, uLightColor, fresnel * 0.32);

        // Transparencia: se ve la escultura/piso a través, no lámina opaca
        float alpha = mix(0.38, 0.68, smoothstep(0.2, 0.8, height));
        alpha = max(alpha, max(fresnel*0.5, foam*0.9));
        alpha *= uOpacity * cutout * uReveal;

        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const water = new THREE.Mesh(geo, waterMat);
  water.renderOrder = 2;
  water.frustumCulled = false;
  group.add(water);

  // Salpicadura mínima en proa (80 puntos, tamaño pequeño)
  const splashCount = 80;
  const splashPos = new Float32Array(splashCount * 3);
  const splashSeed = new Float32Array(splashCount * 4);
  for(let i=0;i<splashCount;i++){
    splashSeed[i*4] = (Math.random()-0.5)*1.2;
    splashSeed[i*4+1] = 0.5 + Math.random()*0.6;
    splashSeed[i*4+2] = Math.random();
    splashSeed[i*4+3] = Math.random()<0.5?-1:1;
  }
  const splashGeo = new THREE.BufferGeometry();
  splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
  splashGeo.setAttribute('aSplash', new THREE.BufferAttribute(splashSeed, 4));

  // Textura de partícula simple generada en canvas
  const pc = document.createElement('canvas'); pc.width = pc.height = 32;
  const pctx = pc.getContext('2d');
  const pg = pctx.createRadialGradient(16,16,0,16,16,16);
  pg.addColorStop(0,'rgba(255,255,255,1)'); pg.addColorStop(0.5,'rgba(220,245,255,0.6)'); pg.addColorStop(1,'rgba(10,70,140,0)');
  pctx.fillStyle = pg; pctx.fillRect(0,0,32,32);
  const ptex = new THREE.CanvasTexture(pc);

  splashMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uReveal: { value: 0 }, uFlowSpeed: { value: cal.flow },
      uTexture: { value: ptex }, uPixelRatio: { value: Math.min(window.devicePixelRatio||1, 1.5) },
    },
    vertexShader: `
      uniform float uTime; uniform float uReveal; uniform float uPixelRatio;
      attribute vec4 aSplash; varying float vA;
      void main(){
        float angle = aSplash.x, speed = aSplash.y, phase = aSplash.z;
        float life = fract(uTime * (0.8*speed) + phase);
        float bowX = -0.40 * cos(angle*0.5) * 0.94;
        float bowZ = 0.18 * sin(angle*0.8) * 0.98;
        float vx = 0.35 + 0.25*speed;
        float vz = sign(bowZ+0.001) * (0.12 + 0.1*speed);
        float vy = 0.28 * speed;
        vec3 pos;
        pos.x = bowX + vx*life;
        pos.z = bowZ + vz*life;
        pos.y = max(0.0, vy*life - 1.4*life*life);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp((10.0*speed*(1.0-life*0.4)) * uPixelRatio * (1.0/max(0.2,-mv.z)), 2.0, 10.0);
        vA = sin(life*3.14159) * 0.5 * uReveal;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture; varying float vA;
      void main(){ vec4 t = texture2D(uTexture, gl_PointCoord); gl_FragColor = vec4(vec3(0.92,0.98,1.0), t.a*vA); }
    `
  });
  const splash = new THREE.Points(splashGeo, splashMat);
  splash.renderOrder = 3;
  splash.frustumCulled = false;
  group.add(splash);

  group.userData.waterMat = waterMat;
  group.userData.splashMat = splashMat;
  return group;
}

async function startAR(){
  if(started) return;
  started = true;
  btnStart.disabled = true;
  btnStart.textContent = 'Cargando cámara…';

  // Verificar que exista targets.mind antes de arrancar
  try{
    const res = await fetch(TARGET_SRC, { method:'HEAD' });
    if(!res.ok) throw new Error('no-target');
  }catch(_){
    btnStart.disabled = false;
    btnStart.textContent = 'Iniciar experiencia AR';
    started = false;
    showToast('Falta targets/targets.mind · sigue el README para generarlo');
    return;
  }

  try{
    mindarThree = new MindARThree({
      container: document.querySelector('#container'),
      imageTargetSrc: TARGET_SRC,
      // Suavizado para que el agua no tiemble (valores recomendados para móvil)
      filterMinCF: 0.01,
      filterBeta: 10,
      missTolerance: 5,
      warmupTolerance: 5,
      maxTrack: 1,
    });

    const { renderer, scene, camera } = mindarThree;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Luces suaves de museo
    scene.add(new THREE.HemisphereLight(0xd2efff, 0x10314a, 1.1));
    const key = new THREE.DirectionalLight(0xfff4d6, 1.3);
    key.position.set(-2, 3, 2);
    scene.add(key);

    const anchor = mindarThree.addAnchor(0);
    waterGroup = buildWater();
    anchor.group.add(waterGroup);
    syncCalUI();
    applyCalibration();

    anchor.onTargetFound = ()=>{
      targetFound = true;
      setStatus('Escultura detectada · agua anclada', true);
      scanFrame.classList.remove('visible');
    };
    anchor.onTargetLost = ()=>{
      targetFound = false;
      setStatus('Buscando la escultura…', false);
      scanFrame.classList.add('visible');
    };

    await mindarThree.start();

    introEl.style.display = 'none';
    scanFrame.classList.add('visible');
    setStatus('Buscando la escultura…', false);

    let last = performance.now();
    renderer.setAnimationLoop(()=>{
      const now = performance.now();
      const dt = Math.min(0.05, (now - last)/1000);
      last = now;
      const t = now/1000;

      // Reveal suave al encontrar el target, y ocultado gradual al perderlo
      const targetReveal = targetFound ? 1 : 0;
      reveal += (targetReveal - reveal) * Math.min(1, dt * 6);
      if(waterMat) waterMat.uniforms.uReveal.value = reveal;
      if(splashMat) splashMat.uniforms.uReveal.value = reveal;
      if(waterMat) waterMat.uniforms.uTime.value = t;
      if(splashMat) splashMat.uniforms.uTime.value = t;

      renderer.render(scene, camera);
    });
  }catch(err){
    console.error(err);
    started = false;
    btnStart.disabled = false;
    btnStart.textContent = 'Iniciar experiencia AR';
    showToast('No se pudo iniciar la cámara. Revisa permisos y HTTPS.');
  }
}

btnStart.addEventListener('click', startAR);

// Si el usuario ya había calibrado antes, reflejar valores en la UI al cargar
syncCalUI();
