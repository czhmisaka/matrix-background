import { ref, reactive, watch, type Ref } from 'vue';
import {
  textToBitmap,
  fileToImage,
  imageToBitmap,
  type MatrixRainInstance,
  type MatrixRainOptions,
  type ThemeName,
  type VariantName
} from '@xietuier/matrix-rain';

/** LLM 三种模式 */
export type LlmMode = 'precise' | 'numerical' | 'complex';

/** 描述词汇触发 LLM 模式判断的简单规则 */
export function inferLlmMode(text: string): LlmMode {
  const t = text.toLowerCase();
  // 数字微调关键词
  if (/(再|更|稍|微|加|减|亮|快|慢|高|低|强|弱)(一|点|些)?/.test(t) ||
      /(稍微|轻度|微调|微调|brightness|trail|speed)/i.test(t)) {
    return 'numerical';
  }
  // 复杂描述关键词(整体氛围/美学)
  if (/(赛博|朋克|黑客|熔岩|末日|梦幻|极简|黑白|胶片|影|海|潮|气质|风格|美学|vibe|aesthetic|cyberpunk|hacker|minimal|dreamy|lava)/i.test(t)) {
    return 'complex';
  }
  // 精准点修:出现具体字段名 / "改成 X" / "X = Y"
  if (/(改成|设为|设定|设置|=|:|从|改到|调整为)/.test(t) ||
      /(theme|variant|fontSize|trailAlpha|brightness|chroma|themeParams|variantParams|hueShift|colorOverrides)/i.test(t)) {
    return 'precise';
  }
  // 默认复杂
  return 'complex';
}

/** LLM 配置(持久化到 localStorage) */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionEnabled: boolean;
}

const LLM_STORAGE_KEY = 'mr-llm-config-v1';

function readStored(): LlmConfig {
  const defaults: LlmConfig = {
    baseUrl: 'https://api.minimax.io/v1',
    apiKey: '',
    model: 'MiniMax-M3',
    visionEnabled: true
  };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    }
  } catch (e) { /* corrupt */ }
  return defaults;
}

function writeStored(cfg: LlmConfig) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(cfg)); } catch (e) { /* quota */ }
}

/** 6 个本地预设(无需 LLM) */
export interface PresetConfig {
  id: string;
  label: string;
  prompt: string;
  patch: Partial<MatrixRainOptions>;
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    prompt: '想要更赛博朋克一点,雨下慢一些',
    patch: {
      theme: 'cyber-blue',
      variant: 'ripple',
      fontSize: 18,
      trailAlpha: 0.3,
      hueRotateSpeed: 30,
      hueRotateAmount: 360,
      themeParams: { brightness: 1.2, chroma: 1 }
    }
  },
  {
    id: 'lava',
    label: '激情熔岩',
    prompt: '激情一点,暖色更明显,雨速加快',
    patch: {
      theme: 'lava-red',
      variant: 'avalanche',
      fontSize: 20,
      trailAlpha: 0.18,
      warmthRadius: 0.9,
      variantParams: { phaseStep: 0.08, avalancheSpeed: 1.2, chUpdateProb: 0.4 }
    }
  },
  {
    id: 'zen',
    label: '慢节奏冥想',
    prompt: '慢节奏,字符变化少,亮度降低,适合长时间观看',
    patch: {
      theme: 'silicon-valley',
      variant: 'classic',
      fontSize: 16,
      trailAlpha: 0.4,
      flickerSpeed: 0.4,
      themeParams: { brightness: 0.7, lightnessShift: -0.1 },
      variantParams: { phaseStep: 0.01, chUpdateProb: 0 }
    }
  },
  {
    id: 'hacker',
    label: '经典黑客',
    prompt: '纯黑客帝国,经典绿,雨快一些,数字疯狂闪',
    patch: {
      theme: 'matrix-green',
      variant: 'classic',
      fontSize: 14,
      trailAlpha: 0.12,
      flickerSpeed: 2,
      sparkProbability: 0.02,
      themeParams: { chroma: 0.8 },
      variantParams: { brightCurve: 4, chUpdateProb: 0.3 }
    }
  },
  {
    id: 'dreamy',
    label: '梦幻轻柔',
    prompt: '明亮梦幻,字符少,残影长,雨速中等',
    patch: {
      theme: 'cyber-blue',
      variant: 'classic',
      fontSize: 22,
      trailAlpha: 0.5,
      flickerSpeed: 0.7,
      themeParams: { brightness: 1.4, lightnessShift: 0.2, chroma: 0.6 },
      lightCenter: { x: 0.5, y: 0.5 }
    }
  },
  {
    id: 'minimal',
    label: '极简灰',
    prompt: '极简灰阶,无颜色,雨慢,字符少',
    patch: {
      theme: 'pure-mono',
      variant: 'avalanche',
      fontSize: 18,
      trailAlpha: 0.2,
      flickerSpeed: 0.3,
      themeParams: { chroma: 0, brightness: 0.95 },
      variantParams: { phaseStep: 0.02, avalancheSpeed: 0.4 }
    }
  }
];

/** 字段手册(给 LLM 看) */
const FIELD_DOCS = `# @xietuier/matrix-rain 参数手册

## 5 主题(选 1)
- 'silicon-valley' (默认·青冷光)
- 'matrix-green' (黑客帝国绿)
- 'lava-red' (熔岩橙红)
- 'cyber-blue' (赛博蓝紫)
- 'pure-mono' (黑白胶片)

## 4 变体(选 1)
- 'classic' (默认·随机闪动)
- 'avalanche' (雪崩下落·头亮尾追)
- 'ripple' (退潮波动·从中心向外)
- 'ascii' (全字符刷·乱码感)

## 顶层
- theme: 主题名
- variant: 变体
- fontSize: 字符宽 px · 8-40
- charset: 字符集字符串
- trailAlpha: 残影透明度 · 0.05=长拖尾 0.5=无拖尾
- flickerSpeed: 闪烁速度倍率 · 0=冻结 1=默认 3=狂暴
- sparkProbability: 雪崩头额外爆闪概率
- hueRotateSpeed / hueRotateAmount: 时间驱动色相
- lightCenter: {x, y} 0-1
- warmthRadius: 暖色范围 0-1
- driftSpeed: {x, y} 光心漂移
- colorOverrides: {'0': [r,g,b], ...} 颜色注入(键 '0'-'9' = 亮度档)

## themeParams(主题色微调)
- brightness 0-2(默认 1)
- chroma 0-1(默认 1)· 0=灰阶
- hueShift -180 到 180
- saturationShift -1 到 1
- lightnessShift -0.5 到 0.5
- invertHue 0-1
- contrast 0-2(默认 1)

## variantParams(变体动作微调)
- phaseStep 0-0.2(默认 0.04)
- phaseJitter 0-0.1
- brightCurve 1-10(默认 3.5)
- chUpdateProb 0-1(avalanche 默认 0.3)
- headBright 7-9
- avalancheSpeed 0-2(默认 0.5)

## coldThemeParams / warmThemeParams: 冷暖色板独立微调(同 themeParams 字段)

## 禁忌
- 不要输出 canvas/container/apiKey 等环境字段
- 不要调 themeParams.contrast=0
- theme='X' 同时大调 themeParams.XX 会丢失主题识别度
`;

/** 3 种 LLM 系统 prompt 模板 */
const SYSTEM_PROMPTS: Record<LlmMode, string> = {
  precise: `你是 matrix-rain 数字矩阵背景的精准调参助手。
任务:用户会明确说"把 X 改成 Y"或"X = Y",你只改具体字段。

# 输出格式(严格)
**只输出一个 JSON 对象,无任何额外文字、markdown code block。**
格式: {"patch": {"field": value, "nested.field": value}}

# 当前配置(基线·只返回差异字段)
\`\`\`json
{CURRENT}
\`\`\`

# 字段手册
${FIELD_DOCS}

# 示例
用户: "把亮度从 0.5 改成 0.8"
输出: {"patch": {"themeParams.brightness": 0.8}}

用户: "fontSize 调到 20"
输出: {"patch": {"fontSize": 20}}`,

  numerical: `你是 matrix-rain 数字矩阵背景的微调助手。
任务:用户会说要"再亮一点"、"再快一点"、"再慢一点"等模糊方向,你需要根据字段默认范围合理调整(±10-30%)。

# 输出格式(严格)
**只输出一个 JSON 对象,无任何额外文字。**
格式: {"patch": {...}, "reason": "短评·5字内"}

# 当前配置(基线)
\`\`\`json
{CURRENT}
\`\`\`

# 字段手册
${FIELD_DOCS}

# 微调规则
- "再亮一点" → themeParams.brightness +0.1~0.2
- "再快一点" → variantParams.phaseStep +0.02 / flickerSpeed +0.5
- "再慢一点" → variantParams.phaseStep -0.01 / flickerSpeed -0.3
- "再长点拖尾" → trailAlpha -0.05
- "再大点字" → fontSize +2

# 示例
用户: "再亮一点"
输出: {"patch": {"themeParams.brightness": 1.2}, "reason": "亮度+0.2"}

用户: "再快一点"
输出: {"patch": {"flickerSpeed": 1.5, "variantParams.phaseStep": 0.06}, "reason": "速度+50%"}`,

  complex: `你是 matrix-rain 数字矩阵背景的创意总监。
任务:用户描述一种氛围、美学、情绪、场景,你根据整体气质推荐一个协调的方案。

# 输出格式(严格)
**只输出一个 JSON 对象,无任何额外文字。**
格式: {"patch": {...}, "summary": "一行描述你的设计意图"}

# 当前配置(基线)
\`\`\`json
{CURRENT}
\`\`\`

# 字段手册
${FIELD_DOCS}

# 调色板美学对照
| 关键词 | 推荐 |
|--------|------|
| 赛博朋克 / 蓝紫 | theme='cyber-blue' + hueRotateSpeed=30 |
| 黑客帝国 | theme='matrix-green' + brightCurve=4 |
| 熔岩 / 末日 / 火焰 | theme='lava-red' + warmthRadius=0.9 + variant='avalanche' |
| 慢节奏 / 冥想 | trailAlpha=0.4 + flickerSpeed=0.4 + phaseStep=0.01 |
| 梦幻 / 轻柔 | brightness=1.4 + trailAlpha=0.5 + lightCenter={x:0.5,y:0.5} |
| 极简 / 黑白 | theme='pure-mono' + chroma=0 |
| 雪崩 | variant='avalanche' + avalancheSpeed=1.5 |
| 退潮 / 波动 | variant='ripple' + lightCenter={x:0.5,y:0.5} |

# 示例
用户: "想要更赛博朋克"
输出: {"patch": {"theme": "cyber-blue", "variant": "ripple", "hueRotateSpeed": 30, "hueRotateAmount": 360, "themeParams": {"brightness": 1.2}}, "summary": "蓝紫动态·波纹扩散"}`
};

/** LLM 调用结果 */
export interface LlmResult {
  patch: Record<string, unknown>;
  reason?: string;
  summary?: string;
  raw: string;
}

/** ChatLog 消息 */
export type ChatRole = 'user' | 'ai' | 'system';
export interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  timestamp: number;
  /** 关联的 patch(ai 消息带) */
  patch?: Record<string, unknown>;
  /** 关联的 reason / summary */
  meta?: string;
}

let _msgId = 0;
const nextId = () => ++_msgId;

/** AI 单模式 prompt 构建 */
function buildSystemPrompt(mode: LlmMode, currentConfig: Partial<MatrixRainOptions>): string {
  return SYSTEM_PROMPTS[mode].replace('{CURRENT}', JSON.stringify(currentConfig, null, 2));
}

/**
 * brace-counting 找第一个完整 {...} 块(支持字符串嵌套)
 */
function extractFirstBalancedJson(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

/** 容错解析 LLM 响应 */
function parseLlmResponse(text: string): { patch: Record<string, unknown>; reason?: string; summary?: string } | null {
  if (!text) return null;
  // 去除 <think> 块(M3 推理模式)
  const cleaned0 = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const tryExtract = (s: string): { patch: Record<string, unknown>; reason?: string; summary?: string } | null => {
    if (!s) return null;
    // 容错清洗
    const cleaned = s
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === 'object') {
        // 多种形状归一
        if (obj.patch && typeof obj.patch === 'object') {
          return { patch: obj.patch, reason: obj.reason, summary: obj.summary };
        }
        if (obj.patches && Array.isArray(obj.patches)) {
          // 老格式:{patches: [{op, path, value}]} → 还原为 patch dict
          const patch: Record<string, unknown> = {};
          for (const p of obj.patches) {
            if (p?.op === 'set' && p.path) patch[p.path] = p.value;
          }
          return { patch, reason: obj.reason, summary: obj.summary };
        }
        // 直接是 patch 对象
        if (!Array.isArray(obj)) return { patch: obj as Record<string, unknown> };
      }
    } catch (e) { /* parse error */ }
    return null;
  };

  // 1) 纯 JSON
  const r1 = tryExtract(cleaned0);
  if (r1) return r1;
  // 2) ```json 围栏
  const fences = [...cleaned0.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)];
  for (const m of fences) {
    const r2 = tryExtract(m[1]);
    if (r2) return r2;
  }
  // 3) brace-counting
  const obj = extractFirstBalancedJson(cleaned0, '{', '}');
  if (obj) {
    const r3 = tryExtract(obj);
    if (r3) return r3;
  }
  return null;
}

/** 应用 patch(走 setXxx / setThemeParams / setFlickerSpeed 等 setter,其余 rebuild) */
function applyPatch(
  inst: MatrixRainInstance,
  patch: Record<string, unknown>,
  currentSnapshot: Record<string, unknown>,
  onRebuildNeeded: () => void
): { applied: string[]; rebuilt: boolean } {
  const applied: string[] = [];
  let rebuilt = false;

  for (const [path, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const segs = path.split('.');
    const top = segs[0];
    currentSnapshot[path] = value;

    try {
      if (top === 'theme' && typeof value === 'string') {
        inst.setTheme(value as ThemeName);
        applied.push(`theme → ${value}`);
      } else if (top === 'themeParams' && typeof value === 'object' && value !== null) {
        inst.setThemeParams(value as any);
        applied.push(`themeParams ← ${JSON.stringify(value)}`);
      } else if (top === 'coldThemeParams' && typeof value === 'object' && value !== null) {
        inst.setColdThemeParams(value as any);
        applied.push(`coldThemeParams ← ${JSON.stringify(value)}`);
      } else if (top === 'warmThemeParams' && typeof value === 'object' && value !== null) {
        inst.setWarmThemeParams(value as any);
        applied.push(`warmThemeParams ← ${JSON.stringify(value)}`);
      } else if (top === 'variantParams' && typeof value === 'object' && value !== null) {
        inst.setVariantParams(value as any);
        applied.push(`variantParams ← ${JSON.stringify(value)}`);
      } else if (top === 'flickerSpeed' && typeof value === 'number') {
        inst.setFlickerSpeed(value);
        applied.push(`flickerSpeed → ${value}`);
      } else if (top === 'hueRotateSpeed' || top === 'hueRotateAmount') {
        const speed = (patch.hueRotateSpeed ?? currentSnapshot.hueRotateSpeed ?? 0) as number;
        const amount = (patch.hueRotateAmount ?? currentSnapshot.hueRotateAmount ?? 360) as number;
        inst.setHueRotate(speed, amount);
        if (top === 'hueRotateSpeed') applied.push(`hueRotateSpeed → ${value}`);
        else applied.push(`hueRotateAmount → ${value}`);
      } else if (top === 'colorOverrides') {
        inst.setColorOverrides((value as any) ?? null);
        applied.push(`colorOverrides → ${JSON.stringify(value)}`);
      } else if (top === 'targetFPS' && typeof value === 'number') {
        inst.setTargetFPS(value);
        applied.push(`targetFPS → ${value}`);
      } else {
        // 顶层需要重建的字段(fontSize, trailAlpha, variant, charset, maxDPR, lightCenter, driftSpeed, warmthRadius, warmthLerp, sparkProbability, flickerRates, ...)
        // 标记需要 rebuild,统一在循环结束后处理
        if (!rebuilt) {
          onRebuildNeeded();
          rebuilt = true;
        }
        applied.push(`${path} → ${JSON.stringify(value)}`);
      }
    } catch (e: any) {
      applied.push(`${path} ❌ ${e?.message || 'setter 失败'}`);
    }
  }
  return { applied, rebuilt };
}

/** 截屏:把 canvas 当前帧转 base64(返回 null 表示失败) */
async function captureStage(canvas: HTMLCanvasElement | null, maxW = 320): Promise<string | null> {
  if (!canvas || !canvas.width) return null;
  // 等 3 帧
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
  try {
    const scale = Math.min(1, maxW / Math.max(canvas.width, canvas.height));
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.6);
  } catch (e) {
    return null;
  }
}

/** useAitune - 主 composable */
export function useAitune(opts: {
  /** 当前 matrix-rain 实例(MatrixRainInstance | null) */
  instance: Ref<MatrixRainInstance | null>;
  /** canvas ref(用于截屏) */
  canvas: Ref<HTMLCanvasElement | null>;
  /** 当前 options 快照(用于展示) */
  currentOptions: Ref<Partial<MatrixRainOptions>>;
}) {
  const { instance, canvas, currentOptions } = opts;

  // === LLM 配置(响应式 + localStorage) ===
  const llmConfig = reactive<LlmConfig>(readStored());
  watch(llmConfig, (cfg) => writeStored(cfg), { deep: true });

  const llmConfigured = () => !!llmConfig.apiKey.trim();
  const llmStatus = () => llmConfigured()
    ? `✓ ${llmConfig.model || 'auto'} @ ${llmConfig.baseUrl ? new URL(llmConfig.baseUrl).host : 'no host'}`
    : '⚠️ 缺少 API key';

  // === 聊天日志 ===
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const currentRound = ref(0);
  const maxRounds = 3;

  function addMsg(role: ChatRole, content: string, patch?: Record<string, unknown>, meta?: string) {
    const m: ChatMessage = {
      id: nextId(),
      role,
      content,
      timestamp: Date.now(),
      patch,
      meta
    };
    messages.value.push(m);
    return m;
  }

  function clearMessages() {
    messages.value = [];
  }

  // === 应用预设(本地,无需 LLM) ===
  function applyPreset(preset: PresetConfig): { applied: string[]; rebuilt: boolean } {
    if (!instance.value) return { applied: [], rebuilt: false };
    addMsg('user', `🎛 应用预设: ${preset.label} · ${preset.prompt}`);
    const result = applyPatch(
      instance.value,
      preset.patch as Record<string, unknown>,
      currentOptions.value as Record<string, unknown>,
      () => onRebuildRequest(preset.patch as Record<string, unknown>)
    );
    addMsg('ai',
      `✓ 已应用预设「${preset.label}」`,
      preset.patch as Record<string, unknown>,
      `${result.applied.length} 项`);
    return result;
  }

  // === 重建请求(由 useMatrixRain 监听 options 变化自动重建) ===
  function onRebuildRequest(patch: Record<string, unknown>) {
    // 把所有需要 rebuild 的字段应用到 currentOptions
    // 这样外层 useMatrixRain 的 deep watch 就会触发重建
    for (const [path, value] of Object.entries(patch)) {
      const segs = path.split('.');
      const top = segs[0];
      // 只处理未走 setter 的字段
      if (
        top === 'theme' || top === 'themeParams' || top === 'coldThemeParams' ||
        top === 'warmThemeParams' || top === 'variantParams' || top === 'flickerSpeed' ||
        top === 'hueRotateSpeed' || top === 'hueRotateAmount' || top === 'colorOverrides' ||
        top === 'targetFPS'
      ) continue;
      // 顶层写入
      if (segs.length === 1) {
        (currentOptions.value as any)[top] = value;
      } else {
        // 嵌套:确保中间对象存在
        let cur: any = currentOptions.value;
        for (let i = 0; i < segs.length - 1; i++) {
          if (cur[segs[i]] == null) cur[segs[i]] = {};
          cur = cur[segs[i]];
        }
        cur[segs[segs.length - 1]] = value;
      }
    }
  }

  // === 文本 → bitmap ===
  function applyTextBitmap(text: string, anchor: 'topLeft'|'center'|'topRight'|'bottomLeft'|'bottomRight' = 'center', motion: 'static'|'drift'|'bounce'|'float' = 'static') {
    if (!instance.value || !canvas.value) {
      addMsg('system', '✗ 文字应用失败:实例未就绪');
      return;
    }
    const t = (text || '').trim() || ' ';
    const w = canvas.value.clientWidth;
    const h = canvas.value.clientHeight;
    const fontSize = (currentOptions.value.fontSize as number) || 14;
    const cols = Math.max(8, Math.ceil(w / fontSize));
    const rows = Math.max(6, Math.ceil(h / (fontSize * 1.1)));
    try {
      const bitmap = textToBitmap(t, cols, rows);
      instance.value.setTargetBitmap(bitmap, { anchor, motion, motionSpeed: 0.3, hold: Infinity });
      addMsg('ai', `✓ 文字「${t}」已涌现 · ${cols}×${rows} · 位置=${anchor} 运动=${motion}`);
    } catch (e: any) {
      addMsg('system', `✗ 文字转 bitmap 失败: ${e?.message || e}`);
    }
  }

  // === 图片 → bitmap ===
  async function applyImageBitmap(file: File, anchor: 'topLeft'|'center'|'topRight'|'bottomLeft'|'bottomRight' = 'center', motion: 'static'|'drift'|'bounce'|'float' = 'static') {
    if (!instance.value || !canvas.value) {
      addMsg('system', '✗ 图片应用失败:实例未就绪');
      return;
    }
    try {
      const img = await fileToImage(file);
      const w = canvas.value.clientWidth;
      const h = canvas.value.clientHeight;
      const fontSize = (currentOptions.value.fontSize as number) || 14;
      const cols = Math.max(8, Math.ceil(w / fontSize));
      const rows = Math.max(6, Math.ceil(h / (fontSize * 1.1)));
      const bitmap = imageToBitmap(img, cols, rows);
      instance.value.setTargetBitmap(bitmap, { anchor, motion, motionSpeed: 0.3, hold: Infinity });
      addMsg('ai', `✓ 图片「${file.name}」已涌现 · ${cols}×${rows} · 位置=${anchor} 运动=${motion}`);
    } catch (e: any) {
      addMsg('system', `✗ 图片转 bitmap 失败: ${e?.message || e}`);
    }
  }

  function clearBitmap() {
    if (!instance.value) return;
    instance.value.clearTargetBitmap();
    addMsg('system', '已清除目标位图');
  }

  // === LLM 调用(OpenAI 兼容 chat completions) ===
  async function callLlm(
    userText: string,
    mode: LlmMode,
    system: string,
    imageBase64: string | null
  ): Promise<string> {
    const url = `${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages: any[] = [{ role: 'system', content: system }];
    if (imageBase64 && llmConfig.visionEnabled) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageBase64 } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userText });
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages,
        temperature: 0.3
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // === 主流程:用户发请求 ===
  async function send(userText: string, imageBase64: string | null = null) {
    if (!instance.value) return;
    const text = (userText || '').trim();
    if (!text) return;
    if (!llmConfigured()) {
      addMsg('system', '✗ 未配置 API key · 只能用 6 个本地预设,或先在「LLM 配置」折叠区填写 baseUrl/apiKey/model');
      return;
    }

    addMsg('user', text);
    isLoading.value = true;
    currentRound.value = 0;
    const startedAt = Date.now();
    const allApplied: string[] = [];
    const rounds: { applied: string[]; reason?: string }[] = [];
    let finalRaw = '';
    let lastReason = '';
    try {
      // 推断模式
      const mode: LlmMode = inferLlmMode(text);
      const system = buildSystemPrompt(mode, currentOptions.value);

      for (let round = 1; round <= maxRounds; round++) {
        currentRound.value = round;
        const isFirst = round === 1;
        // 截屏(让 LLM 看到当前画面)
        const imgB64 = await captureStage(canvas.value, 320);
        const userMsg = isFirst
          ? `【用户原话】${text}。**附了当前背景截图,请看起点状态再推荐调整。**`
          : `【审核】重检用户需求: "${text}"。已应用: ${rounds.flatMap(r => r.applied).join('; ') || '（暂无）'}。**附了上一轮调整后的截图,请看效果决定是否还调。**`;

        finalRaw = await callLlm(userMsg, mode, system, imgB64);
        const parsed = parseLlmResponse(finalRaw);
        if (!parsed || Object.keys(parsed.patch).length === 0) {
          // 解析失败 / 空 patch
          if (parsed?.reason) lastReason = parsed.reason;
          rounds.push({ applied: [], reason: parsed?.reason || '无需调整' });
          if (isFirst) {
            // 第一轮就解析失败 → 整体失败
            throw new Error('LLM 输出无法解析为 JSON patch');
          }
          break;
        }
        const { applied, rebuilt } = applyPatch(
          instance.value,
          parsed.patch,
          currentOptions.value as Record<string, unknown>,
          () => onRebuildRequest(parsed.patch)
        );
        allApplied.push(...applied);
        rounds.push({ applied, reason: parsed.reason || parsed.summary });
        lastReason = parsed.reason || parsed.summary || '';
        // 简化的"完成"信号:首轮就空 patch → 停止
        if (!rebuilt && applied.length === 0) break;
      }
      const durMs = Date.now() - startedAt;
      const summary = `${mode === 'precise' ? '精准点修' : mode === 'numerical' ? '数字微调' : '复杂描述'} · ${rounds.length} 轮 · ${allApplied.length} 项 · ${durMs}ms`;
      addMsg('ai', lastReason || '已应用补丁', {}, summary);
    } catch (e: any) {
      addMsg('system', `✗ 调用失败: ${e?.message || e}`);
    } finally {
      isLoading.value = false;
      currentRound.value = 0;
    }
  }

  return {
    // config
    llmConfig,
    llmConfigured,
    llmStatus,
    // chat
    messages,
    isLoading,
    currentRound,
    maxRounds,
    addMsg,
    clearMessages,
    send,
    // presets
    presets: PRESETS,
    applyPreset,
    // bitmap
    applyTextBitmap,
    applyImageBitmap,
    clearBitmap,
    // utils
    inferLlmMode
  };
}
