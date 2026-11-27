// Home's living background: a slow green flow behind the Next-up card.
//
// A tiny WebGL fragment shader (domain-warped noise) drawn at about a fifth of the card's
// size and scaled up by CSS, so the blur is free and the GPU cost is a few thousand pixels.
// Loaded by js/home/app.js with a dynamic import after the page has painted and gone idle,
// so it can never delay Start. Runs at most 30 frames a second, stops when the tab is hidden
// or the card is off screen, and draws one still frame under reduced motion.
// No WebGL? Nothing happens: the card's CSS glow is already there.

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec3 base;uniform vec3 g1;uniform vec3 g2;uniform float k;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec2 p=uv*vec2(r.x/r.y,1.)*1.7;
  float s=t*.055;
  vec2 q=vec2(fbm(p+vec2(0.,s)),fbm(p+vec2(5.2,1.3)-s));
  vec2 w=vec2(fbm(p+2.2*q+vec2(1.7,9.2)+s*1.4),fbm(p+2.2*q+vec2(8.3,2.8)-s*.8));
  float f=fbm(p+2.6*w);
  float top=.45+.55*uv.y;
  vec3 c=mix(base,g2,smoothstep(.25,.85,f)*.6*k*top);
  c=mix(c,g1,smoothstep(.5,1.,f)*.55*k*top);
  gl_FragColor=vec4(c,1.);
}`;

const rgb = (css) => {
  const m = css.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map((v) => Number(v) / 255) : [0.1, 0.12, 0.11];
};

export function startField() {
  const canvas = document.createElement("canvas");
  canvas.className = "field";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  if (!gl) return { mount() {}, stop() {} };

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { mount() {}, stop() {} };
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(["r", "t", "base", "g1", "g2", "k"].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let card = null, raf = 0, last = 0, visible = true, t0 = performance.now() - 40000 * Math.random();

  function colours() {
    if (!card) return;
    const cs = getComputedStyle(card);
    const light = document.documentElement.dataset.theme === "light" || (!document.documentElement.dataset.theme && !dark.matches);
    gl.uniform3fv(U.base, rgb(cs.backgroundColor));
    gl.uniform3fv(U.g1, rgb("rgb(41,186,116)"));  // BCG green, bright
    gl.uniform3fv(U.g2, rgb("rgb(25,122,86)"));   // BCG green, deep
    gl.uniform1f(U.k, light ? 0.42 : 1);
  }
  function size() {
    if (!card) return;
    const w = Math.max(48, Math.round(card.clientWidth * 0.2)), h = Math.max(48, Math.round(card.clientHeight * 0.2));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(U.r, w, h);
  }
  function draw(now) {
    gl.uniform1f(U.t, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    raf = 0;
    if (!running()) return;
    if (now - last >= 33) { last = now; draw(now); }
    raf = requestAnimationFrame(frame);
  }
  const running = () => card && visible && !document.hidden && !still.matches;
  function kick() {
    if (!card) return;
    size();
    if (still.matches) { draw(t0 + 12000); return; } // one calm frame
    if (!raf && running()) raf = requestAnimationFrame(frame);
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; kick(); }) : null;
  const ro = "ResizeObserver" in window ? new ResizeObserver(() => { size(); if (still.matches || !raf) draw(performance.now()); }) : null;
  document.addEventListener("visibilitychange", kick);
  still.addEventListener?.("change", kick);
  dark.addEventListener?.("change", () => { colours(); kick(); });

  return {
    /** Put the field behind this card (Home re-renders the card, so it's mounted again each time). */
    mount(next) {
      if (!next || next === card) return;
      io?.disconnect(); ro?.disconnect();
      card = next;
      card.prepend(canvas);
      io?.observe(card); ro?.observe(card);
      colours();
      size();
      draw(performance.now());
      requestAnimationFrame(() => canvas.classList.add("on"));
      kick();
    },
    /** The theme changed: read the colours again. */
    refresh() { colours(); kick(); },
    stop() { cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); canvas.remove(); card = null; },
  };
}
