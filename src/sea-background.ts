/**
 * @xietuier/matrix-rain · SeaBackground 数据海背景(0.8.0+)
 *
 * 逆向自 zeabur.com Hero 背景的 5 层 WebGL shader(见 docs/study-zeabur-hero-animation.md):
 *   Grid 网格 → Ascii 字符点阵 → FlowingGradient 数据海 → Godrays 放射光 → SineWave 波浪线
 *
 * 独立零依赖 · 设计为垫在 matrix-rain 画布底下:
 *   const sea = createSeaBackground({ container });
 *   matrixRain({ container, theme: 'zeabur', variant: 'zeabur' });
 *
 * 无 WebGL2 时静默降级(返回 noop handle,不抛错)。
 */

export interface SeaBackgroundLayers {
  grid: boolean;
  ascii: boolean;
  gradient: boolean;
  rays: boolean;
  wave: boolean;
}

export interface SeaBackgroundOptions {
  /** 挂载容器(canvas 绝对定位铺满容器,容器需 position:relative/absolute) */
  container: HTMLElement;
  /** 主题预设:'dark' 暗紫(zeabur 暗色) | 'light' 暖橙(zeabur 亮色) · 默认 'dark' */
  theme?: 'dark' | 'light';
  /** 图层开关(默认全开) */
  layers?: Partial<SeaBackgroundLayers>;
  /** 动画速度倍率(zeabur 原版极慢,建议 0.3~1)· 默认 1 */
  speed?: number;
  /** canvas 不透明度 0-1 · 默认 0.9 */
  opacity?: number;
  /** canvas zIndex · 默认 0 */
  zIndex?: number;
  /** 潮谷/潮峰颜色随时间缓慢波动(色相 ±22° + 亮度 ±12%)· 默认 true */
  colorWave?: boolean;
}

export interface SeaBackgroundHandle {
  canvas: HTMLCanvasElement;
  setTheme(theme: 'dark' | 'light'): void;
  setSpeed(speed: number): void;
  setLayers(layers: Partial<SeaBackgroundLayers>): void;
  destroy(): void;
}

const THEMES = {
  dark: {
    base: [0.094, 0.094, 0.106],
    colorA: [0.02, 0.008, 0.06],
    colorB: [0.82, 0.55, 1.0],
    ray: [0.42, 0.25, 0.72],
    grid: [0.2, 0.17, 0.26],
    char: [0.72, 0.48, 1.0],
  },
  light: {
    base: [0.976, 0.968, 0.965],
    colorA: [1.0, 0.85, 0.78],
    colorB: [0.996, 0.27, 0.0],
    ray: [1.0, 0.55, 0.3],
    grid: [0.92, 0.85, 0.82],
    char: [0.85, 0.32, 0.05],
  },
} as const;

const THEME_KEYS = ['base', 'colorA', 'colorB', 'ray', 'grid', 'char'] as const;

const VERT =
  '#version 300 es\n' +
  'const vec2 P[4] = vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));' +
  'void main(){ gl_Position = vec4(P[gl_VertexID],0.,1.); }';

const FRAG =
  '#version 300 es\n' +
  'precision highp float;' +
  'out vec4 fragColor;' +
  'uniform vec2 uRes;' +
  'uniform float uTime;' +
  'uniform sampler2D uAtlas;' +
  'uniform vec3 uBase;' +
  'uniform vec3 uColorA;' +
  'uniform vec3 uColorB;' +
  'uniform vec3 uRayColor;' +
  'uniform vec3 uGridColor;' +
  'uniform vec3 uCharColor;' +
  'uniform float uLayers;' +
  'float hash21(vec2 p){ p = fract(p*vec2(233.34,851.73)); p += dot(p,p+23.45); return fract(p.x*p.y); }' +
  'float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.-2.*f);' +
  '  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x), u.y); }' +
  'vec2 warp(vec2 uv, float detail, float t){' +
  '  vec2 p = uv;' +
  '  p.x += sin(uv.y*detail*1.7 + t*0.8)*0.12 + cos(uv.x*detail*0.9 - t*0.5)*0.05;' +
  '  p.y += cos(uv.x*detail*1.3 - t*0.6)*0.12 + sin(uv.y*detail*1.1 + t*0.7)*0.05;' +
  '  float d2 = detail*2.1;' +
  '  p.x += cos(p.y*d2*2.7 - t*0.45)*0.07 + sin(p.x*d2*1.9 + t*0.6)*0.04;' +
  '  p.y += sin(p.x*d2*2.3 + t*0.65)*0.07 + cos(p.y*d2*1.6 - t*0.4)*0.04;' +
  '  float d3 = detail*3.7;' +
  '  p.x += (sin(p.y*d3*1.8 + t*0.85)*0.04 + cos(p.x*d3*1.3 - t*0.55)*0.025) + sin((p.x+p.y)*d3*0.7 + t*0.9)*0.02;' +
  '  p.y += (cos(p.x*d3*1.6 - t*0.75)*0.04 + sin(p.y*d3*1.1 + t*0.5)*0.025) + cos((p.x+p.y)*d3*0.8 - t*0.95)*0.02;' +
  '  return p; }' +
  'float fbm2(vec2 p){ return vnoise(p)*0.6 + vnoise(p*2.13 + 17.7)*0.4; }' +
  'vec4 seaColor(vec2 uv, float t, vec3 cA, vec3 cB, float distortion, float seed){' +
  '  vec2 e = uv - 0.5;' +
  '  float aspect = uRes.x/uRes.y;' +
  '  float a1 = fbm2(e*0.9 + vec2(t*0.035, -t*0.022) + seed) - 0.5;' +
  '  float ang = a1 * 12.566371 * distortion;' +
  '  float ca = cos(ang), sa = sin(ang);' +
  '  vec2 c0 = vec2(e.x, e.y/aspect);' +
  '  vec2 p = vec2(c0.x*ca - c0.y*sa, (c0.x*sa + c0.y*ca)*aspect);' +
  '  p.x += sin(p.y*5.0 + t*0.15)/50.0*distortion*2.0;' +
  '  p.y += sin(p.x*7.5 + t*0.15)/25.0*distortion*2.0;' +
  '  float b1 = 0.5 + 0.5*sin(p.y*1.0 + p.x*0.4 + t*0.3);' +
  '  float b2 = 0.5 + 0.5*sin(p.x*0.7 - p.y*0.55 - t*0.22 + 2.1);' +
  '  float m = smoothstep(0.05, 0.95, 0.5 + 0.55*(b1-0.5) + 0.7*(b2-0.5));' +
  '  vec3 cMid = vec3(0.36, 0.13, 0.85);' +
  '  vec3 col = m < 0.5 ? mix(cA, cMid, m*2.0) : mix(cMid, cB, (m-0.5)*2.0);' +
  '  col *= 1.0 + 0.09*sin(t*1.4 + b1*6.0);' +
  '  return vec4(col, m); }' +
  'float rayOct(vec2 cell, float pw){ return pow(vnoise(cell), pw); }' +
  'float godrays(vec2 uv, float t, float density, float intensity, float spotty, float aspect, out vec2 sc){' +
  '  sc = uv - vec2(0.72, 0.78); sc.x *= aspect;' +
  '  float ang = atan(sc.y, sc.x);' +
  '  float r = length(sc);' +
  '  float ta = t*0.2;' +
  '  float pw = 4.0 - 3.0*clamp(intensity,0.,1.);' +
  '  float fade = smoothstep(-0.15, 0.15, sc.x);' +
  '  float f1 = 30.0*density;' +
  '  float o1 = rayOct(vec2(ang*f1,     r*1.0 - ta*3.0), pw);' +
  '  float o2 = rayOct(vec2(ang*f1,     r*0.5*(1.0+6.5*abs(spotty)) - ta*2.0), pw);' +
  '  float f3 = f1*4.5;' +
  '  float o3 = rayOct(vec2(ang*f3,     r*1.4 - ta*2.5), pw);' +
  '  float o4 = rayOct(vec2(ang*f3*3.5, r*0.7*(1.0+6.5*abs(spotty)) - ta*1.8), pw);' +
  '  return clamp(o1*o2 + o3*o4*0.7, 0., 1.) * fade; }' +
  'float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }' +
  'void main(){' +
  '  vec2 uv = gl_FragCoord.xy / uRes;' +
  '  float aspect = uRes.x/uRes.y;' +
  '  float L = uLayers;' +
  '  vec3 col = uBase;' +
  '  if (L >= 1.0) { float gsz = 42.0;' +
  '    vec2 gp = fract(uv*vec2(gsz*aspect, gsz));' +
  '    vec2 gd = min(gp, 1.0-gp);' +
  '    float line = 1.0 - smoothstep(0.0, 0.06, min(gd.x, gd.y));' +
  '    col = mix(col, uGridColor, line*0.03); }' +
  '  vec4 sea = vec4(uBase, 0.5);' +
  '  if (L >= 4.0) {' +
  '    sea = seaColor(uv, uTime, uColorA, uColorB, 0.5, 0.17);' +
  '    vec3 seaRGB = (L >= 2.0) ? mix(uBase*0.3, sea.rgb, 0.25 + 0.75*sea.a) : sea.rgb;' +
  '    col = seaRGB; }' +
  '  if (L >= 8.0) {' +
  '    vec2 sc2;' +
  '    float rays = godrays(uv, uTime, 0.55, 0.66, 0.35, aspect, sc2);' +
  '    float distFade = 1.0 - smoothstep(0.0, 1.2, length(sc2));' +
  '    col = mix(col, uRayColor, rays*0.28*distFade + distFade*0.16); }' +
  '  if (L >= 2.0) {' +
  '    float cols = 90.0;' +
  '    vec2 nc = vec2(cols*aspect, cols);' +
  '    vec2 cid = floor(uv*nc);' +
  '    vec2 cuc = fract(uv*nc);' +
  '    vec2 cc = (cid + 0.5)/nc;' +
  '    vec3 cellSea;' +
  '    if (L >= 4.0) { cellSea = seaColor(cc, uTime, uColorA, uColorB, 0.5, 0.17).rgb; }' +
  '    else { cellSea = mix(uBase, uCharColor, 0.25 + 0.5*hash21(cid)); }' +
  '    float srcLum = lum(cellSea);' +
  '    float bright = smoothstep(0.03, 0.45, srcLum);' +
  '    float ci = clamp(floor((1.0 - pow(clamp(srcLum,0.,1.), 1.1)) * 63.0), 0.0, 63.0);' +
  '    float ccol = mod(ci, 16.0);' +
  '    float crow = floor(ci/16.0);' +
  '    vec2 pad = clamp(cuc, 0.12, 0.88) - cuc;' +
  '    vec2 auv = vec2((ccol + cuc.x + pad.x*sign(cuc.x-0.5))/16.0,' +
  '                    1.0 - (crow + 1.0 - (cuc.y + pad.y*sign(cuc.y-0.5)))/4.0);' +
  '    float ch = texture(uAtlas, auv).a;' +
  '    float tw = sin(uTime*1.6 + hash21(cid)*6.283)*0.5 + 0.5;' +
  '    float a = ch * bright * (0.55 + 0.45*tw) * 0.3;' +
  '    col = mix(col, cellSea * 1.35, a); }' +
  '  if (L >= 16.0) {' +
  '    float wy = 0.30 + 0.06*sin(uv.x*3.0*6.28318 + uTime*0.5);' +
  '    float wl = 1.0 - smoothstep(0.0012, 0.0035, abs(uv.y - wy));' +
  '    col = mix(col, uCharColor*1.3, wl*0.6); }' +
  '  fragColor = vec4(col, 1.0);' +
  '}';

function makeAtlas(): HTMLCanvasElement {
  const chars = '01<>[]{}#$%*+=-:;.^~\\/|ABCDEFXYZ';
  const cols = 16,
    rows = 4,
    cell = 48;
  const cv = document.createElement('canvas');
  cv.width = cols * cell;
  cv.height = rows * cell;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  c.font = '600 32px ui-monospace, Menlo, monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < 64; i++) {
    c.fillText(
      chars[i % chars.length],
      ((i % cols) + 0.5) * cell,
      (Math.floor(i / cols) + 0.5) * cell
    );
  }
  return cv;
}

export function createSeaBackground(options: SeaBackgroundOptions): SeaBackgroundHandle {
  const container = options.container;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  canvas.style.zIndex = String(options.zIndex ?? 0);
  canvas.style.opacity = String(options.opacity ?? 0.9);
  container.appendChild(canvas);

  // noop 兜底(无 WebGL2):保持句柄可用,不渲染
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
  }) as WebGL2RenderingContext | null;
  if (!gl) {
    const noop = () => {};
    return {
      canvas,
      setTheme: noop,
      setSpeed: noop,
      setLayers: noop,
      destroy: () => canvas.remove(),
    };
  }

  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('[SeaBackground] ' + gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error('[SeaBackground] ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const n of [
    'uRes',
    'uTime',
    'uAtlas',
    'uBase',
    'uColorA',
    'uColorB',
    'uRayColor',
    'uGridColor',
    'uCharColor',
    'uLayers',
  ])
    U[n] = gl.getUniformLocation(prog, n);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U.uAtlas, 0);

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);
  resize();

  // 状态
  const cur: Record<string, number[]> = JSON.parse(JSON.stringify(THEMES[options.theme ?? 'dark']));
  let target: 'dark' | 'light' = options.theme ?? 'dark';
  let tweenStart = -1;
  let speed = options.speed ?? 1;
  const colorWave = options.colorWave !== false;
  const L = options.layers ?? {};
  let layerBits =
    (L.grid === false ? 0 : 1) |
    (L.ascii === false ? 0 : 2) |
    (L.gradient === false ? 0 : 4) |
    (L.rays === false ? 0 : 8) |
    (L.wave === false ? 0 : 16);

  const easeOut = (t: number): number => 1 - Math.pow(1 - t, 4);

  let t = 0;
  let last = performance.now();
  let rafId = 0;
  let destroyed = false;
  const frame = (now: number): void => {
    if (destroyed) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt * speed;
    const k = tweenStart < 0 ? 1 : Math.min((now - tweenStart) / 1200, 1);
    const e = k >= 1 ? 1 : easeOut(k);
    const T = THEMES[target];
    for (const key of THEME_KEYS)
      for (let i = 0; i < 3; i++) cur[key][i] += (T[key][i] - cur[key][i]) * e;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform3fv(U.uBase, cur.base);
    // ★ 颜色随时间波动(色相 ±22° + 亮度 ±12%, 周期 37s/23s)
    if (colorWave) {
      const drift = (seed: number, tt: number, amp: number): number => {
        const v =
          0.5 +
          0.5 * Math.sin(tt * 0.17 + seed * 12.9) * 0.72 +
          0.28 * Math.sin(tt * 0.41 + seed * 78.2);
        return (v - 0.5) * 2 * amp;
      };
      const hueShift = drift(1, t, 22);
      const lumA = 1 + drift(2, t, 0.12);
      const lumB = 1 + drift(3, t, 0.12);
      const shift = (rgb: number[], dH: number, dL: number): number[] => {
        const mx = Math.max(rgb[0], rgb[1], rgb[2]),
          mn = Math.min(rgb[0], rgb[1], rgb[2]);
        const l = (mx + mn) / 2;
        let h = 0,
          s = 0;
        if (mx !== mn) {
          const dd = mx - mn;
          s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
          h =
            mx === rgb[0]
              ? (rgb[1] - rgb[2]) / dd + (rgb[1] < rgb[2] ? 6 : 0)
              : mx === rgb[1]
                ? (rgb[2] - rgb[0]) / dd + 2
                : (rgb[0] - rgb[1]) / dd + 4;
          h *= 60;
        }
        h = (((h + dH) % 360) + 360) % 360;
        const s2 = Math.min(1, s * 1.06);
        const l2 = Math.max(0, Math.min(1, l * dL));
        const cc = (1 - Math.abs(2 * l2 - 1)) * s2;
        const hp = h / 60,
          x2 = cc * (1 - Math.abs((hp % 2) - 1));
        let r2 = 0,
          g2 = 0,
          b2 = 0;
        if (hp < 1) {
          r2 = cc;
          g2 = x2;
        } else if (hp < 2) {
          r2 = x2;
          g2 = cc;
        } else if (hp < 3) {
          g2 = cc;
          b2 = x2;
        } else if (hp < 4) {
          g2 = x2;
          b2 = cc;
        } else if (hp < 5) {
          r2 = x2;
          b2 = cc;
        } else {
          r2 = cc;
          b2 = x2;
        }
        const m2 = l2 - cc / 2;
        return [r2 + m2, g2 + m2, b2 + m2];
      };
      gl.uniform3fv(U.uColorA, shift(cur.colorA, hueShift, lumA));
      gl.uniform3fv(U.uColorB, shift(cur.colorB, hueShift * 0.6, lumB));
    } else {
      gl.uniform3fv(U.uColorA, cur.colorA);
      gl.uniform3fv(U.uColorB, cur.colorB);
    }
    gl.uniform3fv(U.uRayColor, cur.ray);
    gl.uniform3fv(U.uGridColor, cur.grid);
    gl.uniform3fv(U.uCharColor, cur.char);
    gl.uniform1f(U.uLayers, layerBits);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return {
    canvas,
    setTheme(theme: 'dark' | 'light'): void {
      target = theme;
      tweenStart = performance.now();
    },
    setSpeed(n: number): void {
      speed = Math.max(0, n);
    },
    setLayers(partial: Partial<SeaBackgroundLayers>): void {
      const merged = {
        grid: !!(layerBits & 1),
        ascii: !!(layerBits & 2),
        gradient: !!(layerBits & 4),
        rays: !!(layerBits & 8),
        wave: !!(layerBits & 16),
        ...partial,
      };
      layerBits =
        (merged.grid ? 1 : 0) |
        (merged.ascii ? 2 : 0) |
        (merged.gradient ? 4 : 0) |
        (merged.rays ? 8 : 0) |
        (merged.wave ? 16 : 0);
    },
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      canvas.remove();
    },
  };
}
