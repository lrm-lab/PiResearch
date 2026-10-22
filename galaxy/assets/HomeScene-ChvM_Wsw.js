import{H as e,R as t,S as n,U as r,V as i,W as a,Y as o,_ as s,b as c,c as l,d as u,et as d,f,g as p,h as m,l as h,m as g,p as _,rt as v,s as y,u as b,x}from"./index-Cym-u67o.js";import{D as S,G as C,I as w,J as T,M as E,U as D,_ as O,a as k,c as A,d as j,g as M,i as ee,k as N,l as te,m as P,n as F,o as I,p as L,q as R,r as z,s as ne,t as B,u as V,v as re,y as H}from"./space-BZPtkyUU.js";var U=v(d()),ie=(0,U.createContext)(null);function ae({iterations:e=10,ms:t=250,threshold:n=.75,step:r=.1,factor:i=.5,flipflops:a=1/0,bounds:o=e=>e>100?[60,100]:[40,60],onIncline:s,onDecline:c,onChange:l,onFallback:u,children:d}){let[f,p]=(0,U.useState)(()=>({fps:0,index:0,factor:i,flipped:0,refreshrate:0,fallback:!1,frames:[],averages:[],subscriptions:new Map,subscribe:e=>{let t=Symbol();return f.subscriptions.set(t,e.current),()=>void f.subscriptions.delete(t)}})),m=0;return L(()=>{let{frames:i,averages:d}=f;if(!f.fallback&&d.length<e){i.push(performance.now());let p=i[i.length-1]-i[0];if(p>=t){if(f.fps=Math.round(i.length/p*1e3*1)/1,f.refreshrate=Math.max(f.refreshrate,f.fps),d[f.index++%e]=f.fps,d.length===e){let[t,i]=o(f.refreshrate),p=d.filter(e=>e>=i),h=d.filter(e=>e<t);p.length>e*n&&(f.factor=Math.min(1,f.factor+r),f.flipped++,s&&s(f),f.subscriptions.forEach(e=>e.onIncline&&e.onIncline(f))),h.length>e*n&&(f.factor=Math.max(0,f.factor-r),f.flipped++,c&&c(f),f.subscriptions.forEach(e=>e.onDecline&&e.onDecline(f))),m!==f.factor&&(m=f.factor,l&&l(f),f.subscriptions.forEach(e=>e.onChange&&e.onChange(f))),f.flipped>a&&!f.fallback&&(f.fallback=!0,u&&u(f),f.subscriptions.forEach(e=>e.onFallback&&e.onFallback(f))),f.averages=[]}f.frames=[]}}}),U.createElement(ie.Provider,{value:f},d)}var W={uTime:{value:0},uScale:{value:1e3},uMotion:{value:1},uPixelRatio:{value:1}},oe=`
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0, 0, 0)), f - vec3(0, 0, 0)), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
                   mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
                   mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
`,se=`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,ce=`
  uniform float uTime;
  varying vec3 vDir;
  ${oe}
  void main() {
    vec3 d = normalize(vDir);
    float drift = uTime * 0.006;
    float n = fbm(d * 2.1 + vec3(drift, 0.0, -drift * 0.5)) * 0.5 + 0.5;
    float m = fbm(d * 4.3 + vec3(0.0, drift, n * 1.4)) * 0.5 + 0.5;
    float w = fbm(d * 9.0 + n * 2.0) * 0.5 + 0.5;
    float band = exp(-pow((d.y + 0.22 * sin(d.x * 2.4 + 0.6)) * 2.4, 2.0));
    vec3 indigo = vec3(0.106, 0.122, 0.290);
    vec3 teal = vec3(0.051, 0.231, 0.247);
    vec3 rose = vec3(0.20, 0.08, 0.22);
    vec3 col = indigo * smoothstep(0.38, 0.92, n) * 0.85;
    col += teal * smoothstep(0.48, 0.95, m) * 0.75;
    col += rose * pow(smoothstep(0.55, 1.0, n * m * 1.6), 2.0) * 0.9;
    col *= 0.45 + 0.85 * band;
    col += vec3(0.035, 0.04, 0.075) * band * (0.6 + 0.4 * w);
    // Dark dust lanes cut through the band.
    col *= 1.0 - 0.55 * smoothstep(0.55, 0.8, w) * band;
    gl_FragColor = vec4(col * 0.42, 1.0);
  }
`,le=`
  uniform float uTime;
  uniform float uMotion;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 2.2) + aPhase * 60.0);
    vAlpha = mix(1.0, 0.45 + 0.55 * tw, uMotion);
    vColor = color;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`,ue=`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float core = exp(-d * 10.0);
    float glow = exp(-d * 3.0) * 0.25;
    // Thin diffraction cross on the brightest stars.
    float cross = max(0.0, 1.0 - abs(uv.x) * 14.0) * max(0.0, 1.0 - abs(uv.y)) + max(0.0, 1.0 - abs(uv.y) * 14.0) * max(0.0, 1.0 - abs(uv.x));
    float a = (core + glow + cross * 0.12) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`,de=`
  uniform float uTime;
  uniform float uScale;
  uniform float uMotion;
  uniform float uPulse;
  uniform float uImplode;
  uniform float uIgnite;
  attribute float aSize;
  attribute float aKind;
  attribute float aPhase;
  attribute float aState;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float r = length(p.xz);
    if (uImplode > 0.0) {
      float k = uImplode * uImplode;
      float a = k * (5.0 + 5.0 * aPhase) / (0.25 + r);
      float c = cos(a);
      float s = sin(a);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p *= 1.0 - smoothstep(0.0, 1.0, uImplode * (1.15 + 0.35 * aPhase));
    }
    if (uIgnite < 1.0) {
      // Launch: dust unfurls from the core, outer particles last.
      float grow = smoothstep(r * 0.55, r * 0.55 + 0.45, uIgnite);
      float a = (1.0 - grow) * 3.5;
      float c = cos(a);
      float s = sin(a);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p *= grow;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = aSize;
    float alpha = 1.0;
    float tw = 0.5 + 0.5 * sin(uTime * (1.1 + aPhase * 2.4) + aPhase * 50.0);
    vColor = color;
    if (aKind < 0.5) {
      alpha = 0.42 + 0.3 * mix(0.5, tw, uMotion);
      if (aState > 3.5) { alpha *= 0.4; vColor = vec3(dot(color, vec3(0.33))); }
    } else if (aKind < 1.5) {
      if (aState < 1.5 && aState > 0.5) {
        // open: dim protostar, slow 6 s breathing
        alpha = 0.5 + 0.18 * sin(uTime * 1.047 + aPhase * 6.28) * uMotion;
        size *= 0.9;
      } else if (aState < 2.5 && aState > 1.5) {
        // in_progress: 1.6 s pulse
        float pl = 0.5 + 0.5 * sin(uTime * 3.927 + aPhase * 6.28);
        alpha = 1.05 + 0.45 * pl * uMotion;
        size *= 1.0 + 0.3 * pl * uMotion;
      } else if (aState > 3.5) {
        // cancelled: cooled ember
        alpha = 0.45;
        vColor = vec3(dot(color, vec3(0.3, 0.4, 0.3))) * vec3(0.9, 0.85, 0.8);
      } else {
        alpha = 1.0 + 0.12 * (tw - 0.5) * uMotion;
      }
    } else {
      float pulse = 0.5 + 0.5 * sin(uTime * 2.6);
      size *= 1.0 + uPulse * 0.16 * pulse * uMotion;
      alpha = 1.0 + uPulse * 0.25 * pulse * uMotion;
    }
    if (uImplode > 0.0) alpha *= 1.0 + uImplode * 2.0 * (1.0 - uImplode);
    vAlpha = alpha;
    vKind = aKind;
    vDepth = -mv.z;
    gl_PointSize = max(1.0, size * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`,fe=`
  uniform float uBright;
  uniform float uSat;
  uniform float uFade;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    vec3 col;
    float a;
    if (vKind > 1.5) {
      float r = sqrt(d);
      a = exp(-d * 22.0) * 2.2 + exp(-r * 4.2) * 0.55 * (1.0 - r);
      col = mix(vColor, vec3(1.0), exp(-d * 34.0));
    } else if (vKind > 0.5) {
      a = exp(-d * 10.0) * 1.35 + exp(-d * 2.6) * 0.32 * (1.0 - d);
      col = mix(vColor, vec3(1.0), exp(-d * 40.0) * 0.85);
    } else {
      a = exp(-d * 5.0) * 1.05;
      col = vColor;
    }
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    a *= vAlpha * uBright * uFade;
    gl_FragColor = vec4(col * a, a);
  }
`,pe=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,me=`
  uniform float uTime;
  uniform float uTwist;
  uniform float uArms;
  uniform float uBright;
  uniform float uSat;
  uniform float uFade;
  uniform float uImplode;
  uniform float uIgnite;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float shrink = (1.0 - uImplode * 0.95) * max(0.001, uIgnite);
    p /= max(0.02, shrink);
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float spiral = 0.5 + 0.5 * cos(uArms * (a + uImplode * 6.0) - log(r + 0.04) * uTwist * uArms * 0.5);
    float fall = exp(-r * 3.4);
    float v = fall * (0.3 + 0.7 * pow(spiral, 2.5)) * smoothstep(1.0, 0.55, r);
    v += exp(-r * r * 60.0) * 0.6;
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.7, r));
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    float alpha = v * 0.62 * uBright * uFade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`,he=`
  uniform float uTime;
  uniform float uScale;
  uniform float uMotion;
  attribute float aAngle;
  attribute float aSize;
  varying float vGlow;
  void main() {
    float head = fract(aAngle / 6.28318 - uTime * 0.11 * uMotion);
    float tail = pow(head, 14.0);
    float second = pow(fract(head + 0.5), 30.0) * 0.5;
    vGlow = 0.1 + tail * 1.9 + second;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * (0.6 + tail * 1.4) * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`,ge=`
  uniform vec3 uColor;
  uniform float uFade;
  varying float vGlow;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float a = exp(-d * 6.0) * vGlow * uFade;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(vGlow - 1.0, 0.0, 1.0)) * a, a);
  }
`,_e=pe,ve=`
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uRing;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a;
    if (uRing > 0.0) {
      a = exp(-pow((r - 0.82) * 14.0, 2.0)) + exp(-r * 3.0) * 0.08;
    } else {
      a = exp(-r * r * 18.0) * 1.6 + exp(-r * 4.0) * 0.4;
    }
    a *= uIntensity * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), exp(-r * r * 40.0)) * a, a);
  }
`,ye=`
  uniform float uTime;
  uniform float uWarp;
  attribute float aSeed;
  attribute float aEnd;
  varying float vAlpha;
  void main() {
    float ang = aSeed * 6.28318 * 37.0;
    float rad = 0.7 + fract(aSeed * 91.7) * 5.5;
    float z = -(1.0 - fract(aSeed * 13.1 + uTime * (0.7 + fract(aSeed * 7.3) * 0.9))) * 40.0 - 1.0;
    float len = (0.5 + fract(aSeed * 3.7) * 2.0) * uWarp * 9.0;
    vec3 p = vec3(cos(ang) * rad, sin(ang) * rad, z - aEnd * len);
    vAlpha = uWarp * (0.35 + 0.65 * fract(aSeed * 5.1)) * (1.0 - aEnd * 0.85) * smoothstep(-41.0, -30.0, z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`,be=`
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * vAlpha * 1.6, vAlpha);
  }
`,G=t(),xe=[[1,1,1],[.78,.86,1],[.66,.78,1],[1,.92,.8],[1,.84,.7],[.8,1,.96]];function Se(e,t,n,r,i,a){let o=ee(a),s=new Float32Array(e*3),c=new Float32Array(e*3),l=new Float32Array(e),u=new Float32Array(e);for(let a=0;a<e;a+=1){let e=o()*2-1,d=o()*Math.PI*2,f=o()<.45?e*.28:e,p=Math.sqrt(1-f*f),m=t+(n-t)*o();s[a*3]=Math.cos(d)*p*m,s[a*3+1]=f*m,s[a*3+2]=Math.sin(d)*p*m;let h=xe[Math.floor(o()*xe.length)],g=.35+o()**3*.9;c[a*3]=h[0]*g,c[a*3+1]=h[1]*g,c[a*3+2]=h[2]*g,l[a]=r+o()**4*(i-r),u[a]=o()}let d=new O;return d.setAttribute(`position`,new M(s,3)),d.setAttribute(`color`,new M(c,3)),d.setAttribute(`aSize`,new M(l,1)),d.setAttribute(`aPhase`,new M(u,1)),d}function Ce({quality:e}){let t=(0,U.useRef)(null),n=(0,U.useRef)(null),r=(0,U.useMemo)(()=>({nebulaGeometry:new C(320,48,32),nebula:new D({vertexShader:se,fragmentShader:ce,uniforms:{uTime:W.uTime},side:1,depthWrite:!1}),stars:new D({vertexShader:le,fragmentShader:ue,uniforms:{uTime:W.uTime,uMotion:W.uMotion,uPixelRatio:W.uPixelRatio},transparent:!0,depthWrite:!1,blending:2}),farStars:Se(e===`high`?5200:2600,180,260,1.2,4.2,11),nearStars:Se(e===`high`?1300:700,45,110,1.6,5.5,23)}),[e]);return(0,U.useEffect)(()=>()=>{r.nebulaGeometry.dispose(),r.nebula.dispose(),r.stars.dispose(),r.farStars.dispose(),r.nearStars.dispose()},[r]),L(()=>{let e=W.uTime.value*W.uMotion.value;t.current.rotation.y=e*.0035-b.scroll*.004,t.current.rotation.x=.12,n.current.rotation.y=e*.008-b.scroll*.016,n.current.rotation.x=.1+b.pointer.y*.01}),(0,G.jsxs)(G.Fragment,{children:[(0,G.jsxs)(`group`,{ref:t,children:[(0,G.jsx)(`mesh`,{geometry:r.nebulaGeometry,material:r.nebula,renderOrder:-10}),(0,G.jsx)(`points`,{geometry:r.farStars,material:r.stars,frustumCulled:!1,renderOrder:-9})]}),(0,G.jsx)(`group`,{ref:n,children:(0,G.jsx)(`points`,{geometry:r.nearStars,material:r.stars,frustumCulled:!1,renderOrder:-8})})]})}var K={warp:0,flashEl:null,galaxies:new Map,dive:null},we=.9,Te=2,q=520,Ee=new T,De=new T,Oe=new T(0,0,0),ke=new T;function Ae(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}function je(e){return e*e*e*e}function Me(){let e=P(e=>e.camera),t=(0,U.useRef)(null),r=(0,U.useRef)({start:-1}),i=(0,U.useRef)(new T),a=(0,U.useRef)(null),o=(0,U.useMemo)(()=>{let e=new O,t=new Float32Array(q*2*3),n=new Float32Array(q*2),r=new Float32Array(q*2);for(let e=0;e<q;e+=1){let t=(e+.5)/q;n[e*2]=t,n[e*2+1]=t,r[e*2]=0,r[e*2+1]=1}return e.setAttribute(`position`,new M(t,3)),e.setAttribute(`aSeed`,new M(n,1)),e.setAttribute(`aEnd`,new M(r,1)),{geometry:e,material:new D({vertexShader:ye,fragmentShader:be,uniforms:{uTime:W.uTime,uWarp:{value:0}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2})}},[]);(0,U.useEffect)(()=>()=>{o.geometry.dispose(),o.material.dispose()},[o]),(0,U.useEffect)(()=>s.subscribe((e,t)=>{if(!e.focused||e.focused===t.focused)return;let{running:r,done:i}=n(e.rows??[]),a=r.some(t=>t.id===e.focused)?r:i,o=a.findIndex(t=>t.id===e.focused);if(o<0)return;let s=m(o,a.length,b.params.spacing,b.bounds.fits);b.velocity=0,b.target=_(b.target,s,b.params,b.bounds)}),[]);function l(e){x(e),c.stay&&setTimeout(()=>s.getState().resetMotion(),1400)}function u(n,r){let a=!n||s.getState().reducedMotion;t.current={start:W.uTime.value,from:e.position.clone(),fromLook:i.current.clone(),target:(n??i.current).clone(),href:r,done:a},a&&l(r)}return L((n,c)=>{let d=s.getState(),f=b.params,p=W.uTime.value;if(d.flight&&!t.current){let e=K.galaxies.get(d.flight.id);u(e?e.getWorldPosition(ke):null,d.flight.href)}K.dive&&!t.current&&(u(K.dive.target,K.dive.href),K.dive=null),!d.flight&&!d.launch&&t.current?.done&&(t.current=null,e.fov!==38&&(e.fov=38,e.updateProjectionMatrix()));let m=t.current;if(m&&!m.done){let t=Math.min(1,(p-m.start)/we),n=je(t)*.82+Ae(t)*.18,r=ke.copy(m.target).add(Ee.set(0,.02,.35));e.position.lerpVectors(m.from,r,n),i.current.lerpVectors(m.fromLook,m.target,Math.min(1,Ae(Math.min(1,t*1.6)))),e.lookAt(i.current),e.fov=38-14*je(t),e.updateProjectionMatrix(),K.warp=N.smoothstep(t,.12,.75),K.flashEl&&(K.flashEl.style.opacity=N.smoothstep(t,.6,1).toFixed(3)),t>=1&&(m.done=!0,l(m.href))}else if(!m){r.current.start<0&&(r.current.start=p);let t=d.reducedMotion?1:Math.min(1,(p-r.current.start)/Te),n=1-Ae(t),a=+!d.reducedMotion;De.set(b.pointer.x*.45*a,.25+b.pointer.y*.25*a+n*5,f.camDist+n*12),Oe.set(b.pointer.x*.12*a,.05-n*1.5,0),d.reducedMotion||t<1?e.position.copy(De):e.position.lerp(De,1-Math.exp(-c*3)),i.current.lerp(Oe,d.reducedMotion||t<1?1:1-Math.exp(-c*3)),e.lookAt(i.current),K.warp=N.damp(K.warp,0,6,c),K.flashEl&&K.flashEl.style.opacity!==`0`&&(K.flashEl.style.opacity=`0`)}let h=a.current;h.position.copy(e.position),h.quaternion.copy(e.quaternion),h.visible=K.warp>.002,o.material.uniforms.uWarp.value=K.warp}),(0,G.jsx)(`lineSegments`,{ref:a,geometry:o.geometry,material:o.material,frustumCulled:!1,renderOrder:20})}var Ne=0,Pe=1,Fe=2,Ie=3,Le=4;function J(e){let t=e.replace(`#`,``),n=t.length===3?t.replace(/./g,e=>e+e):t,r=Number.parseInt(n,16);return Number.isNaN(r)?[1,1,1]:[(r>>16&255)/255,(r>>8&255)/255,(r&255)/255]}var Y=1e-6;function Re(e){switch(e){case`open`:return Pe;case`in_progress`:return Fe;case`resolved`:return Ie;case`cancelled`:return Le;default:return Ne}}function ze(e,t,n){return[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n]}var Be=[1,1,1],Ve=J(`#7f9cc8`);function He(e,t,n={}){let o=n.radius??1.25,s=n.dust??560,c=ee(Math.floor(B(t)*4294967296)),l=e&&e.ok?e.nodes??[]:[],u=e&&e.ok?e.edges??[]:[],d=l.length>0,f=F(l,u,t),p=0;for(let e of f.values())p=Math.max(p,Math.hypot(e.x,e.z));let m=p>1e-6?o*.86/p:1,h=Math.min(1,m*1.6),g=[],_=new Map,v=[],y=l.find(e=>e.goal),b=y?J(a(y.tone)):Ve,x=new Map,S=0;for(let e of l){let t=f.get(e.id);if(!t)continue;let n=[t.x*m,t.y*h,t.z*m];x.set(e.id,n);let r=_.get(e.tone)??J(a(e.tone));if(_.set(e.tone,r),e.goal)continue;S+=1,v.push(r);let i=Math.min(1,Math.max(0,(e.radius-40)/60)),o=Re(e.status);g.push({p:n,c:r,s:.15+.11*i,k:1,st:o});let s=10+Math.round(10*i);for(let e=0;e<s;e+=1){let e=.07+.06*i;g.push({p:[n[0]+z(c,Y)*e,n[1]+z(c,Y)*e*.5,n[2]+z(c,Y)*e],c:ze(r,Be,c()*.25),s:.025+c()*.04,k:0,st:o})}}v.length||v.push(Ve,J(r.cyan),J(r.violet));let C=c()<.3?3:2,w=2.6+c()*1.6,T=c()*Math.PI*2;for(let e=0;e<s;e+=1){let t=e%5==0,n=c()**(t?.6:.85),r=.08+n*o*(t?1.15:1.05),i=T+Math.floor(c()*C)/C*Math.PI*2+Math.log(1+n*6)*w+z(c,Y)*(t?1.2:.22),a=(1-n)*.12+.025,s=ze(v[Math.floor(c()*v.length)],Be,Math.max(0,.65-n)*.9);g.push({p:[Math.cos(i)*r,z(c,Y)*a,Math.sin(i)*r],c:t?ze(s,Ve,.4):s,s:(t?.026:.034)+c()*(t?.034:.06)*(1-n*.5),k:0,st:Ne})}let E=y&&x.get(y.id)||[0,0,0];g.push({p:E,c:ze(b,Be,.35),s:d?.95:.75,k:2,st:Ne});let D=g.length,O=new Float32Array(D*3),k=new Float32Array(D*3),A=new Float32Array(D),j=new Float32Array(D),M=new Float32Array(D),N=new Float32Array(D);g.forEach((e,t)=>{O.set(e.p,t*3),k.set(e.c,t*3),A[t]=e.s,j[t]=e.k,M[t]=c(),N[t]=e.st});let te=[],P=[],I=new Map(l.map(e=>[e.id,e.tone]));for(let e of u){let t=x.get(e.from),n=x.get(e.to);if(!t||!n)continue;let r=e.relation===`parent`,o=J(r?a(I.get(e.to)):i[e.relation]??i.parent),s=r?.42:.26;te.push(...t,...n);for(let e=0;e<2;e+=1)P.push(o[0]*s,o[1]*s,o[2]*s)}return{count:D,position:O,color:k,size:A,kind:j,phase:M,state:N,edgePosition:new Float32Array(te),edgeColor:new Float32Array(P),core:b,hasGraph:d,tasks:S}}var X=1.25,Ue=1.05,We=8,Ge=240,Ke=new re(X*1.15,32),qe=new E({colorWrite:!1,depthWrite:!1,transparent:!0,opacity:0}),Je=new H(`#7fe6ff`);function Ye(){let e=new Float32Array(720),t=new Float32Array(Ge),n=new Float32Array(Ge);for(let r=0;r<Ge;r+=1){let i=r/Ge*Math.PI*2,a=X*1.18;e.set([Math.cos(i)*a,0,Math.sin(i)*a],r*3),t[r]=i,n[r]=.07}let r=new O;return r.setAttribute(`position`,new M(e,3)),r.setAttribute(`aAngle`,new M(t,1)),r.setAttribute(`aSize`,new M(n,1)),r}var Xe=new T,Ze=new T,Qe=(0,U.memo)(function({row:e,rowIndex:t,index:n,rowLen:i}){let a=e.id,c=s(e=>e.thumbs[a]),u=s(e=>!!e.removing[a]),d=(0,U.useRef)(null),f=(0,U.useRef)(null),h=(0,U.useRef)({lift:0,bright:1,implode:0,fade:0,placed:!1,visible:!1,removeAt:0}),_=e.status===`running`,v=e.status===`failed`,C=(0,U.useMemo)(()=>{let e=B(a),t=B(`${a}#tilt`);return{tiltX:.92+(e-.5)*.35,tiltZ:(t-.5)*.55,spin:e*Math.PI*2,bob:t*Math.PI*2}},[a]),T=(0,U.useMemo)(()=>{let e=He(c??null,a,{radius:X}),t=new O;t.setAttribute(`position`,new M(e.position,3)),t.setAttribute(`color`,new M(e.color,3)),t.setAttribute(`aSize`,new M(e.size,1)),t.setAttribute(`aKind`,new M(e.kind,1)),t.setAttribute(`aPhase`,new M(e.phase,1)),t.setAttribute(`aState`,new M(e.state,1)),t.computeBoundingSphere();let n=new O;return n.setAttribute(`position`,new M(e.edgePosition,3)),n.setAttribute(`color`,new M(e.edgeColor,3)),{data:e,points:t,lines:n}},[c,a]),E=(0,U.useMemo)(()=>{let e=J(B(`${a}#hue`)<.5?r.blue:r.violet);return{pointsMaterial:new D({vertexShader:de,fragmentShader:fe,uniforms:{uTime:W.uTime,uScale:W.uScale,uMotion:W.uMotion,uPulse:{value:0},uImplode:{value:0},uIgnite:{value:1},uBright:{value:1},uSat:{value:1},uFade:{value:0}},transparent:!0,depthWrite:!1,blending:2}),discMaterial:new D({vertexShader:pe,fragmentShader:me,uniforms:{uTime:W.uTime,uTwist:{value:2.4+B(`${a}#twist`)*1.8},uArms:{value:B(`${a}#arms`)<.3?3:2},uBright:{value:1},uSat:{value:1},uFade:{value:0},uImplode:{value:0},uIgnite:{value:1},uInner:{value:new H},uOuter:{value:new H(...e)}},transparent:!0,depthWrite:!1,side:2,blending:2}),lineMaterial:new S({vertexColors:!0,transparent:!0,opacity:0,depthWrite:!1,blending:2}),ringMaterial:new D({vertexShader:he,fragmentShader:ge,uniforms:{uTime:W.uTime,uScale:W.uScale,uMotion:W.uMotion,uColor:{value:Je},uFade:{value:0}},transparent:!0,depthWrite:!1,blending:2})}},[a]);(0,U.useLayoutEffect)(()=>{let[e,t,n]=T.data.core;E.discMaterial.uniforms.uInner.value.setRGB(Math.min(1,e*.6+.4),Math.min(1,t*.6+.4),Math.min(1,n*.6+.4))},[T,E]);let k=(0,U.useMemo)(()=>_?Ye():null,[_]),A=(0,U.useMemo)(()=>new w(X*2.5,X*2.5),[]);return(0,U.useEffect)(()=>()=>{T.points.dispose(),T.lines.dispose()},[T]),(0,U.useEffect)(()=>()=>{E.pointsMaterial.dispose(),E.discMaterial.dispose(),E.lineMaterial.dispose(),E.ringMaterial.dispose()},[E]),(0,U.useEffect)(()=>()=>k?.dispose(),[k]),(0,U.useEffect)(()=>()=>A.dispose(),[A]),(0,U.useEffect)(()=>(K.galaxies.set(a,d.current),()=>{K.galaxies.get(a)===d.current&&K.galaxies.delete(a),p(a,!1)}),[a]),(0,U.useEffect)(()=>{u&&(h.current.removeAt=W.uTime.value)},[u]),L((e,r)=>{let o=Math.min(r,.05),c=s.getState(),x=b.params,S=+!c.reducedMotion,w=t===0&&b.launchSlot?1:0,T=m(n+w,i+w,x.spacing,b.bounds.fits)-b.scroll,D=g(T,t,x),O=!c.launch&&(c.hovered===a||c.focused===a),k=h.current;k.lift=N.damp(k.lift,+!!O,7,o);let A=Math.sin(e.clock.elapsedTime*.45+C.bob)*.09*S,j=Ze.set(D.x,D.y+A+k.lift*(t===1?.75:.22),D.z+k.lift*1.6),M=d.current;if(!k.placed)M.position.copy(j),k.placed=!0;else{let e=c.reducedMotion?1:1-Math.exp(-o*7);M.position.lerp(j,e)}M.rotation.y=N.damp(M.rotation.y,D.rotY*(1-k.lift*.7),6,o);let ee=1+k.lift*.14;M.scale.setScalar(ee),f.current.rotation.y+=o*S*(_?.16:v?0:.035)*(1+k.lift*.8),u&&(k.implode=Math.min(1,(W.uTime.value-k.removeAt)/Ue),k.implode>=1&&c.finishRemove(a)),k.fade=Math.min(1,k.fade+o*1.2);let te=v?.5:_?1.08:.92;k.bright=N.damp(k.bright,te*(1+k.lift*.55),6,o);let P=E.pointsMaterial.uniforms;P.uBright.value=k.bright,P.uSat.value=v?.18:1,P.uPulse.value=+!!_,P.uImplode.value=k.implode,P.uFade.value=k.fade;let F=E.discMaterial.uniforms;F.uBright.value=k.bright*(_?1.1:.85),F.uSat.value=v?.12:1,F.uImplode.value=k.implode,F.uFade.value=k.fade,E.lineMaterial.opacity=k.fade*(.55+k.lift*.45)*(1-k.implode)*(v?.45:1),E.ringMaterial.uniforms.uFade.value=k.fade*(1-k.implode)*(.75+k.lift*.5),Xe.set(M.position.x,M.position.y-X*ee*.98,M.position.z).project(e.camera);let I=y.get(a),L=Math.abs(Xe.x);if(I){let e=(Xe.x*.5+.5)*b.width,t=(-Xe.y*.5+.5)*b.height,n=N.clamp(x.camDist/Math.max(1,x.camDist-M.position.z),.7,1.25),r=l.get(a);if(r){let i=r.width*n/2;b.width>i*2+16&&(e=N.clamp(e,i+We,b.width-i-We)),b.composerReserve>0&&(t=Math.min(t,b.height-b.composerReserve-r.height*n))}let i=(1-N.smoothstep(L,.8,.98))*(1-k.implode)*k.fade*(c.flight||c.launch?0:1);I.style.transform=`translate3d(${e.toFixed(1)}px, ${t.toFixed(1)}px, 0) translateX(-50%) scale(${n.toFixed(3)})`,I.style.opacity=i.toFixed(3),I.dataset.hidden=i<.05?`true`:`false`}let R=L<1.25;R!==k.visible&&(k.visible=R,p(a,R))}),(0,G.jsxs)(`group`,{ref:d,children:[(0,G.jsx)(`group`,{rotation:[C.tiltX,0,C.tiltZ],children:(0,G.jsxs)(`group`,{ref:f,rotation:[0,C.spin,0],children:[(0,G.jsx)(`mesh`,{geometry:A,material:E.discMaterial,rotation:[-Math.PI/2,0,0],renderOrder:1}),(0,G.jsx)(`lineSegments`,{geometry:T.lines,material:E.lineMaterial,renderOrder:2}),(0,G.jsx)(`points`,{geometry:T.points,material:E.pointsMaterial,renderOrder:3}),k&&(0,G.jsx)(`points`,{geometry:k,material:E.ringMaterial,renderOrder:4})]})}),(0,G.jsx)(`mesh`,{geometry:Ke,material:qe,dispose:null,onPointerOver:e=>{e.stopPropagation(),b.dragging||s.getState().hover(a),document.body.style.cursor=`pointer`},onPointerOut:()=>{s.getState().unhover(a),document.body.style.cursor=``},onClick:e=>{if(e.stopPropagation(),e.delta>6||b.dragged)return;let t=s.getState();if(t.removing[a])return;let n=o(a);t.reducedMotion?x(n):t.fly({id:a,href:n})}})]})}),$e=new T;function et(){let e=s(e=>e.rows),t=P(e=>e.size),r=(0,U.useMemo)(()=>n(e??[]),[e]);(0,U.useEffect)(()=>{f(t.width,t.height,Math.max(r.running.length+ +!!b.launchSlot,r.done.length))},[t.width,t.height,r]),L((e,t)=>{let n=b.params;if(!b.dragging&&b.velocity!==0&&(b.target+=b.velocity*Math.min(t,.05),b.velocity*=Math.exp(-Math.min(t,.05)*4.2),Math.abs(b.velocity)<.01&&(b.velocity=0)),!b.dragging){let{min:e,max:n}=b.bounds;b.target<e&&(b.target=N.damp(b.target,e,9,t)),b.target>n&&(b.target=N.damp(b.target,n,9,t))}b.scroll=s.getState().reducedMotion?b.target:N.damp(b.scroll,b.target,8,t);for(let t of[0,1]){$e.set(0,n.rowY[t]+n.galaxyRadius*1.02,0).project(e.camera);let r=(-$e.y*.5+.5)*b.height,i=u[t];i&&(i.style.transform=`translate3d(0, ${r.toFixed(1)}px, 0)`);let a=h[t];a&&($e.set(0,n.rowY[t],0).project(e.camera),a.style.transform=`translate3d(-50%, ${((-$e.y*.5+.5)*b.height).toFixed(1)}px, 0)`)}});let i=[...r.running.map((e,t)=>(0,G.jsx)(Qe,{row:e,rowIndex:0,index:t,rowLen:r.running.length},e.id)),...r.done.map((e,t)=>(0,G.jsx)(Qe,{row:e,rowIndex:1,index:t,rowLen:r.done.length},e.id))];return(0,G.jsx)(G.Fragment,{children:i})}var Z=56,tt=.35,nt=1.15,rt=.7,it=new H(`#8fe9ff`),at=new R,ot=new T,Q=new T,st=new T,$=new T;function ct(e,t,n,r,i){let a=1-i;return e.set(a*a*t.x+2*a*i*n.x+i*i*r.x,a*a*t.y+2*a*i*n.y+i*i*r.y,a*a*t.z+2*a*i*n.z+i*i*r.z)}function lt(){let e=s(e=>e.launch);return(0,U.useEffect)(()=>{e||(b.launchSlot=!1)},[e]),e?(0,G.jsx)(ut,{launch:e},e.href):null}function ut({launch:e}){let t=P(e=>e.camera),i=(0,U.useRef)(null),a=(0,U.useRef)(null),o=(0,U.useRef)(null),c=(0,U.useRef)(-1),l=(0,U.useRef)(new T),u=(0,U.useRef)(!1),d=(0,U.useMemo)(()=>{let t=He(null,e.href,{radius:1.25,dust:640}),n=new O;n.setAttribute(`position`,new M(t.position,3)),n.setAttribute(`color`,new M(t.color,3)),n.setAttribute(`aSize`,new M(t.size,1)),n.setAttribute(`aKind`,new M(t.kind,1)),n.setAttribute(`aPhase`,new M(t.phase,1)),n.setAttribute(`aState`,new M(t.state,1));let i=new D({vertexShader:de,fragmentShader:fe,uniforms:{uTime:W.uTime,uScale:W.uScale,uMotion:W.uMotion,uPulse:{value:1},uImplode:{value:0},uIgnite:{value:0},uBright:{value:1.3},uSat:{value:1},uFade:{value:1}},transparent:!0,depthWrite:!1,blending:2}),a=new w(3.1,3.1),o=new D({vertexShader:pe,fragmentShader:me,uniforms:{uTime:W.uTime,uTwist:{value:3},uArms:{value:2},uBright:{value:1.2},uSat:{value:1},uFade:{value:1},uImplode:{value:0},uIgnite:{value:.001},uInner:{value:new H(`#d9f6ff`)},uOuter:{value:new H(r.blue)}},transparent:!0,depthWrite:!1,side:2,blending:2}),s=new O,c=new Float32Array(168),l=new Float32Array(168),u=new Float32Array(Z),d=new Float32Array(Z).fill(1),f=new Float32Array(Z),p=new Float32Array(Z).fill(3);for(let e=0;e<Z;e+=1){let t=1-e/Z;l.set([.55+.45*t,.8+.2*t,1],e*3),u[e]=.06+.3*t**2.2,f[e]=e/Z}s.setAttribute(`position`,new M(c,3)),s.setAttribute(`color`,new M(l,3)),s.setAttribute(`aSize`,new M(u,1)),s.setAttribute(`aKind`,new M(d,1)),s.setAttribute(`aPhase`,new M(f,1)),s.setAttribute(`aState`,new M(p,1));let m=i.clone();m.uniforms={...i.uniforms,uIgnite:{value:1},uPulse:{value:0},uFade:{value:1},uBright:{value:1}};let h=new w(1,1),g=new D({vertexShader:_e,fragmentShader:ve,uniforms:{uColor:{value:it},uIntensity:{value:1},uRing:{value:0}},transparent:!0,depthWrite:!1,blending:2}),_=g.clone();return _.uniforms={uColor:{value:new H(`#bfefff`)},uIntensity:{value:0},uRing:{value:1}},{galaxy:n,galaxyMaterial:i,disc:a,discMaterial:o,trail:s,trailMaterial:m,glowGeometry:h,glowMaterial:g,shockMaterial:_}},[e.href]);return(0,U.useEffect)(()=>()=>{for(let e of Object.values(d))e.dispose()},[d]),(0,U.useEffect)(()=>{let e=n(s.getState().rows??[]);return b.launchSlot=!0,f(b.width,b.height,Math.max(e.running.length+1,e.done.length)),b.velocity=0,b.target=b.bounds.min,()=>{b.launchSlot=!1;let e=n(s.getState().rows??[]);f(b.width,b.height,Math.max(e.running.length,e.done.length))}},[]),L(()=>{let r=W.uTime.value;if(c.current<0){c.current=r,at.set(e.from.x/b.width*2-1,-(e.from.y/b.height)*2+1),ot.set(at.x,at.y,.5).unproject(t).sub(t.position).normalize();let n=(5-t.position.z)/ot.z;l.current.copy(t.position).addScaledVector(ot,n)}let f=r-c.current,p=b.params,h=n(s.getState().rows??[]),_=g(m(0,h.running.length+1,p.spacing,b.bounds.fits)-b.scroll,0,p);$.set(_.x,_.y,_.z+.4),st.set(l.current.x*.4+$.x*.6,$.y+2.6,3.4);let v=N.clamp((f-tt)/nt,0,1),y=v<.5?2*v*v:1-(-2*v+2)**2/2;ct(Q,l.current,st,$,y),i.current.position.copy($),i.current.rotation.set(.95,0,.12);let x=d.trail.getAttribute(`position`),S=x.array;if(S.copyWithin(3,0,165),f<tt)for(let e=0;e<Z;e+=1)S.set([Q.x,Q.y,Q.z],e*3);else S.set([Q.x,Q.y,Q.z],0);x.needsUpdate=!0;let C=N.smoothstep(f,0,tt),w=N.clamp((f-tt-nt)/rt,0,1);d.trailMaterial.uniforms.uFade.value=C*(1-w),a.current.position.copy(Q),a.current.quaternion.copy(t.quaternion),o.current.quaternion.copy(t.quaternion);let T=1+Math.sin(r*14)*.08;a.current.scale.setScalar((.6+C*1.1+w*2.4*(1-w))*T),d.glowMaterial.uniforms.uIntensity.value=C*(1.4-w*.6);let E=1-(1-w)**3;d.galaxyMaterial.uniforms.uIgnite.value=E,d.discMaterial.uniforms.uIgnite.value=Math.max(.001,E),o.current.position.copy($),o.current.scale.setScalar(.2+w*6.5),d.shockMaterial.uniforms.uIntensity.value=w>0?(1-w)*1.6:0,w>=1&&!u.current&&(u.current=!0,K.dive={target:$.clone(),href:e.href})}),(0,G.jsxs)(G.Fragment,{children:[(0,G.jsxs)(`group`,{ref:i,children:[(0,G.jsx)(`mesh`,{geometry:d.disc,material:d.discMaterial,rotation:[-Math.PI/2,0,0],renderOrder:5}),(0,G.jsx)(`points`,{geometry:d.galaxy,material:d.galaxyMaterial,renderOrder:6})]}),(0,G.jsx)(`points`,{geometry:d.trail,material:d.trailMaterial,frustumCulled:!1,renderOrder:7}),(0,G.jsx)(`mesh`,{ref:a,geometry:d.glowGeometry,material:d.glowMaterial,renderOrder:8}),(0,G.jsx)(`mesh`,{ref:o,geometry:d.glowGeometry,material:d.shockMaterial,renderOrder:8})]})}var dt=new R(7e-4,5e-4),ft=6;function pt(){return L(e=>{let t=s.getState();W.uTime.value=e.clock.elapsedTime,W.uMotion.value=+!t.reducedMotion,W.uPixelRatio.value=e.gl.getPixelRatio(),W.uScale.value=e.size.height*e.gl.getPixelRatio()/(2*Math.tan(19*Math.PI/180))}),null}function mt({quality:e}){let t=e===`high`;return(0,G.jsxs)(ne,{multisampling:0,enableNormalPass:!1,children:[(0,G.jsx)(k,{mipmapBlur:!0,luminanceThreshold:.5,luminanceSmoothing:.25,intensity:t?1.25:1,radius:.78,resolutionScale:t?1:.5}),(0,G.jsx)(I,{offset:t?dt:new R(0,0),radialModulation:!0,modulationOffset:.35,blendFunction:t?V.NORMAL:V.SKIP}),(0,G.jsx)(A,{premultiply:!0,opacity:t?.32:0,blendFunction:t?V.SCREEN:V.SKIP}),(0,G.jsx)(te,{offset:.28,darkness:.78})]})}function ht(e){(0,U.useEffect)(()=>{let t=e.current;if(!t)return;let n=0,r=0,i=0,a=null,o=()=>b.params.halfWidth*2/Math.max(1,b.width),c=e=>{e.button!==0||s.getState().flight||s.getState().launch||(a=e.pointerId,n=r=e.clientX,i=performance.now(),b.dragged=!1,b.velocity=0)},l=e=>{if(b.pointer.x=e.clientX/Math.max(1,innerWidth)*2-1,b.pointer.y=-(e.clientY/Math.max(1,innerHeight)*2-1),a!==e.pointerId)return;let c=e.clientX-r;if(!b.dragging&&Math.abs(e.clientX-n)>ft&&(b.dragging=!0,b.dragged=!0,s.getState().hover(null),t.classList.add(`is-dragging`)),b.dragging){let e=performance.now(),t=c*o(),{min:n,max:r}=b.bounds,a=b.target<n||b.target>r;b.target-=a?t*.35:t;let s=Math.max(1,e-i)/1e3;b.velocity=b.velocity*.6+-t/s*.4,i=e}r=e.clientX},u=e=>{a===e.pointerId&&(a=null,b.dragging&&(b.dragging=!1,t.classList.remove(`is-dragging`),performance.now()-i>90&&(b.velocity=0),setTimeout(()=>b.dragged=!1,0)))},d=e=>{if(s.getState().flight||s.getState().launch||b.bounds.fits)return;e.preventDefault();let t=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY,n=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;b.velocity=0;let{min:r,max:i}=b.bounds;b.target=Math.min(i+.8,Math.max(r-.8,b.target+t*n*o()*.9))};return t.addEventListener(`pointerdown`,c),window.addEventListener(`pointermove`,l),window.addEventListener(`pointerup`,u),window.addEventListener(`pointercancel`,u),t.addEventListener(`wheel`,d,{passive:!1}),()=>{t.removeEventListener(`pointerdown`,c),window.removeEventListener(`pointermove`,l),window.removeEventListener(`pointerup`,u),window.removeEventListener(`pointercancel`,u),t.removeEventListener(`wheel`,d)}},[e])}function gt({stage:t}){let n=s(e=>e.quality),r=s(e=>e.setQuality);return ht(t),(0,U.useEffect)(()=>(K.flashEl=document.querySelector(`.home-flash`),s.getState().setSceneReady(!0),()=>{K.flashEl=null,s.getState().setSceneReady(!1),document.body.style.cursor=``}),[]),(0,G.jsx)(`div`,{className:`home-canvas`,"aria-hidden":`true`,children:(0,G.jsxs)(j,{dpr:n===`high`?[1,2]:1,gl:{antialias:!1,powerPreference:`high-performance`,alpha:!1,stencil:!1},camera:{position:[0,5,27],fov:38,near:.05,far:900},onPointerMissed:()=>s.getState().hover(null),children:[(0,G.jsx)(`color`,{attach:`background`,args:[e]}),(0,G.jsx)(pt,{}),(0,G.jsx)(ae,{onDecline:()=>r(`low`),flipflops:2}),(0,G.jsx)(Ce,{quality:n}),(0,G.jsx)(et,{}),(0,G.jsx)(lt,{}),(0,G.jsx)(Me,{}),(0,G.jsx)(mt,{quality:n})]})})}export{gt as default};