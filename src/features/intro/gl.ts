// WebGL1 dekoratif untuk latar intro. Tidak ada teks di kanvas; seluruh isi tetap DOM.
// Warna dibaca dari CSS variable intro (bukan hard-code di JSX) dan shader memakai
// domain melingkar untuk noise korona agar tidak ada garis patah di sisi ±π.

export type EclipseGl = {
  resize: (cssWidth: number, cssHeight: number, dpr: number) => void;
  setParticles: (count: number) => void;
  draw: (state: GlState) => void;
  dispose: () => void;
};

export type GlState = {
  time: number;
  progress: number;
  cameraZ: number;
  spin: number;
  fall: number;
  bloom: number;
  comet: [number, number, number, number] | null;
  stars: number;
  corona: [number, number, number];
  background: [number, number, number];
  cool: [number, number, number];
};

const BG_VS = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';

const BG_FS = [
  '#ifdef GL_FRAGMENT_PRECISION_HIGH',
  'precision highp float;',
  '#else',
  'precision mediump float;',
  '#endif',
  'uniform vec2 u_res;',
  'uniform float u_time;',
  'uniform float u_prog;',
  'uniform vec3 u_corona;',
  'uniform vec3 u_bg;',
  'uniform float u_stars;',
  'uniform float u_spin;',
  'uniform float u_bloom;',
  'uniform vec4 u_comet;',
  'uniform vec3 u_cool;',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float noise(vec2 p) {',
  '  vec2 i = floor(p); vec2 f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  float a = hash(i); float b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
  '}',
  'void main() {',
  '  vec2 uv = gl_FragCoord.xy / u_res;',
  '  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);',
  '  float t = clamp(u_prog, 0.0, 1.0);',
  '  vec2 sun = vec2(0.0, 0.06);',
  '  vec2 moon = sun + vec2((1.0 - smoothstep(0.0, 1.0, t)) * 0.82, 0.0);',
  '  float sunR = 0.185;',
  '  float moonR = 0.178;',
  '  float d = length(p - sun);',
  '  float ang = atan(p.y - sun.y, p.x - sun.x - 0.0001);',
  // Domain melingkar: noise dievaluasi pada (cos, sin), bukan pada sudut mentah.
  '  vec2 ring = vec2(cos(ang - u_spin * 0.35), sin(ang - u_spin * 0.35));',
  '  float streak = mix(0.62, 1.0, noise(ring * 5.0 + vec2(d * 7.0, u_time * 0.035)));',
  '  float outside = smoothstep(sunR - 0.012, sunR + 0.035, d);',
  '  float corona = exp(-pow((d - sunR) * 7.0, 2.0)) * 0.9 + exp(-max(d - sunR, 0.0) * 9.0) * 0.42;',
  '  corona *= mix(1.0, streak, outside);',
  '  float sunDisc = 1.0 - smoothstep(sunR - 0.004, sunR + 0.004, d);',
  '  float disc = 1.0 - smoothstep(moonR - 0.004, moonR + 0.004, length(p - moon));',
  '  vec3 col = u_bg;',
  // Aurora: dua pita tipis yang bergeser lambat, tetap jauh di belakang konten.
  '  float band = exp(-pow((p.y + 0.14 + 0.06 * sin(p.x * 2.3 + u_time * 0.04)) * 5.0, 2.0));',
  '  float band2 = exp(-pow((p.y - 0.25 + 0.04 * cos(p.x * 1.7 - u_time * 0.03)) * 7.0, 2.0));',
  '  float curtain = smoothstep(0.35, 0.9, noise(vec2(p.x * 1.7 + u_time * 0.02, u_spin * 0.2)));',
  '  col += u_cool * (band * 0.10 + band2 * 0.06) * curtain;',
  '  col += u_corona * (corona * 0.58 * (1.0 + 0.8 * u_bloom) + sunDisc * 0.30) * (1.0 - disc);',
  // Cincin berlian hanya menyala halus saat totalitas, tanpa kilatan cepat.
  '  vec2 sparkP = sun + vec2(cos(0.7), sin(0.7)) * (sunR + 0.006);',
  '  float nearTotal = 1.0 - smoothstep(0.0, 0.10, abs(t - 0.82));',
  '  col += vec3(1.0, 0.94, 0.82) * exp(-pow(length(p - sparkP) * 32.0, 2.0)) * u_bloom * (0.18 + 0.82 * nearTotal);',
  '  if (u_comet.z > 0.001) {',
  '    vec2 q = p - u_comet.xy;',
  '    float head = exp(-dot(q, q) * 1500.0) * 1.15 + exp(-length(q) * 18.0) * 0.24;',
  '    float tailT = clamp(q.y / u_comet.w, 0.0, 1.0);',
  '    float w = mix(0.012, 0.075, tailT);',
  '    float core = exp(-pow(q.x / w, 2.0)) * pow(1.0 - tailT, 1.7) * step(0.0, q.y);',
  '    float shimmer = 0.68 + 0.32 * noise(vec2(q.x * 55.0, q.y * 8.0 - u_time * 1.8));',
  '    vec3 tailCol = mix(vec3(0.98, 0.93, 0.82), u_cool * 2.1, tailT);',
  '    col += (vec3(1.0, 0.96, 0.88) * head + tailCol * core * shimmer * 1.35) * u_comet.z;',
  '  }',
  '  float s = hash(floor(gl_FragCoord.xy / 2.0));',
  '  float twinkle = 0.72 + 0.28 * sin(u_time * 0.55 + s * 40.0);',
  '  col += vec3(0.88, 0.86, 0.78) * step(0.9984, s) * twinkle * u_stars * (1.0 - corona);',
  '  col *= 1.0 - 0.24 * dot(p, p);',
  '  float grain = hash(gl_FragCoord.xy + fract(u_time * 5.0) * 97.0);',
  '  col += (grain - 0.5) * 0.026;',
  '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
  '}',
].join('\n');

const PT_VS = [
  'attribute vec3 a_pos;',
  'attribute float a_size;',
  'uniform float u_camZ;',
  'uniform float u_len;',
  'uniform float u_aspect;',
  'uniform float u_pixel;',
  'uniform float u_spin;',
  'uniform float u_fall;',
  'varying float v_a;',
  'void main() {',
  '  float cs = cos(u_spin); float sn = sin(u_spin);',
  '  float z0 = mod(a_pos.z - u_camZ, u_len) - 0.5 * u_len;',
  '  vec2 xz = vec2(a_pos.x * cs + z0 * sn, -a_pos.x * sn + z0 * cs);',
  '  float yy = mod(a_pos.y + 1.1 + u_fall, 2.2) - 1.1;',
  '  float depth = mod(xz.y + 0.5 * u_len, u_len);',
  '  float d = depth + 0.08;',
  '  vec2 xy = vec2(xz.x / u_aspect, yy) / d * 0.46;',
  '  gl_Position = vec4(xy, 0.0, 1.0);',
  '  gl_PointSize = min(a_size * u_pixel * (1.7 / d), 26.0);',
  '  float fadeFar = 1.0 - smoothstep(u_len * 0.55, u_len, depth);',
  '  float fadeNear = smoothstep(0.0, 0.09, depth);',
  '  v_a = fadeFar * fadeNear;',
  '}',
].join('\n');

const PT_FS = [
  'precision mediump float;',
  'uniform vec3 u_tint;',
  'varying float v_a;',
  'void main() {',
  '  float r = length(gl_PointCoord - 0.5) * 2.0;',
  '  float a = (1.0 - smoothstep(0.35, 1.0, r)) * v_a;',
  '  gl_FragColor = vec4(u_tint * a * 0.55, a * 0.5);',
  '}',
].join('\n');

export function parseHex(value: string, fallback: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  const hex = match ? match[1]! : fallback.replace('#', '');
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

// Mengembalikan null bila WebGL tidak tersedia. Pemanggil memakai latar CSS.
export function createEclipseGl(canvas: HTMLCanvasElement, options: { particles: number; onLost: () => void }): EclipseGl | null {
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const backgroundProgram = link(gl, BG_VS, BG_FS);
  const particleProgram = link(gl, PT_VS, PT_FS);
  if (!backgroundProgram || !particleProgram) return null;

  const quad = gl.createBuffer();
  const points = gl.createBuffer();
  if (!quad || !points) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const bgPosition = gl.getAttribLocation(backgroundProgram, 'a_pos');
  const bgUniform = (name: string) => gl.getUniformLocation(backgroundProgram, name);
  const bg = {
    res: bgUniform('u_res'), time: bgUniform('u_time'), progress: bgUniform('u_prog'),
    corona: bgUniform('u_corona'), background: bgUniform('u_bg'), stars: bgUniform('u_stars'),
    spin: bgUniform('u_spin'), bloom: bgUniform('u_bloom'), comet: bgUniform('u_comet'), cool: bgUniform('u_cool'),
  };
  const ptPosition = gl.getAttribLocation(particleProgram, 'a_pos');
  const ptSize = gl.getAttribLocation(particleProgram, 'a_size');
  const ptUniform = (name: string) => gl.getUniformLocation(particleProgram, name);
  const pt = {
    camZ: ptUniform('u_camZ'), length: ptUniform('u_len'), aspect: ptUniform('u_aspect'),
    pixel: ptUniform('u_pixel'), tint: ptUniform('u_tint'), spin: ptUniform('u_spin'), fall: ptUniform('u_fall'),
  };

  let width = 1;
  let height = 1;
  let lost = false;
  let disposed = false;
  let count = 0;

  const onContextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    if (!disposed) options.onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);

  const result: EclipseGl = {
    resize(cssWidth, cssHeight, dpr) {
      width = Math.max(1, Math.round(cssWidth * dpr));
      height = Math.max(1, Math.round(cssHeight * dpr));
      canvas.width = width;
      canvas.height = height;
    },
    setParticles(nextCount) {
      const data = new Float32Array(nextCount * 4);
      for (let index = 0; index < nextCount; index += 1) {
        const offset = index * 4;
        data[offset] = (Math.random() * 2 - 1) * 1.7;
        data[offset + 1] = (Math.random() * 2 - 1) * 1.15;
        data[offset + 2] = Math.random();
        data[offset + 3] = 0.6 + Math.random() * 1.5;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, points);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      count = nextCount;
    },
    draw(state) {
      if (lost || disposed) return;
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.useProgram(backgroundProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(bgPosition);
      gl.vertexAttribPointer(bgPosition, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(bg.res, width, height);
      gl.uniform1f(bg.time, state.time);
      gl.uniform1f(bg.progress, state.progress);
      gl.uniform3fv(bg.corona, state.corona);
      gl.uniform3fv(bg.background, state.background);
      gl.uniform1f(bg.stars, state.stars);
      gl.uniform1f(bg.spin, state.spin);
      gl.uniform1f(bg.bloom, state.bloom);
      const comet = state.comet ?? [0, 0, 0, 1];
      gl.uniform4f(bg.comet, comet[0]!, comet[1]!, comet[2]!, comet[3]!);
      gl.uniform3fv(bg.cool, state.cool);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!count) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(particleProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, points);
      gl.enableVertexAttribArray(ptPosition);
      gl.vertexAttribPointer(ptPosition, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(ptSize);
      gl.vertexAttribPointer(ptSize, 1, gl.FLOAT, false, 16, 12);
      gl.uniform1f(pt.camZ, state.cameraZ);
      gl.uniform1f(pt.length, 1);
      gl.uniform1f(pt.aspect, width / height);
      gl.uniform1f(pt.pixel, Math.max(1, width / Math.max(1, canvas.clientWidth)));
      gl.uniform3fv(pt.tint, state.corona);
      gl.uniform1f(pt.spin, state.spin);
      gl.uniform1f(pt.fall, state.fall);
      gl.drawArrays(gl.POINTS, 0, count);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(points);
      gl.deleteProgram(backgroundProgram);
      gl.deleteProgram(particleProgram);
    },
  };

  result.setParticles(options.particles);
  return result;
}
