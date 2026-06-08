/**
 * aitune-prompts.ts
 *
 * 大对象(PRESETS / SYSTEM_PROMPTS / FIELD_DOCS)与 LLM prompt 构建逻辑。
 * 拆出本文件,目的是让 useAitune.ts 主入口不再同步评估 ~5KB 字符串字面量,
 * 把这部分工作推迟到首次实际需要时(动态 import)。
 *
 * 触发时机:
 * - PRESETS 数组:由 useAitune / PresetChips 在 onMounted 阶段动态 import
 * - SYSTEM_PROMPTS + FIELD_DOCS:由 useAitune.send() 在用户首次发消息时动态 import
 *   (FIELD_DOCS 进一步拆为 aitune-field-docs.json,运行时 fetch)
 */
import type { MatrixRainOptions } from '@xietuier/matrix-rain';

/** LLM 三种模式 */
export type LlmMode = 'precise' | 'numerical' | 'complex';

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
      themeParams: { brightness: 1.2, chroma: 1 },
    },
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
      variantParams: { phaseStep: 0.08, avalancheSpeed: 1.2, chUpdateProb: 0.4 },
    },
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
      variantParams: { phaseStep: 0.01, chUpdateProb: 0 },
    },
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
      variantParams: { brightCurve: 4, chUpdateProb: 0.3 },
    },
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
      lightCenter: { x: 0.5, y: 0.5 },
    },
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
      variantParams: { phaseStep: 0.02, avalancheSpeed: 0.4 },
    },
  },
];

/** 3 种 LLM 系统 prompt 模板(FIELD_DOCS 拆 JSON,运行时替换 {FIELD_DOCS} 占位符) */
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
{FIELD_DOCS}

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
{FIELD_DOCS}

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
{FIELD_DOCS}

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
输出: {"patch": {"theme": "cyber-blue", "variant": "ripple", "hueRotateSpeed": 30, "hueRotateAmount": 360, "themeParams": {"brightness": 1.2}}, "summary": "蓝紫动态·波纹扩散"}`,
};

/**
 * 缓存的 FIELD_DOCS 加载 promise(避免每次 LLM 调用都重新 fetch)
 * Vite 会把 .json import 编译成异步 chunk,首次调用时下载并解析
 */
let _fieldDocsPromise: Promise<string> | null = null;
async function loadFieldDocs(): Promise<string> {
  if (!_fieldDocsPromise) {
    _fieldDocsPromise = (async () => {
      try {
        const mod = await import('./aitune-field-docs.json');
        return (mod as { docs: string }).docs;
      } catch (e) {
        // 兜底:如果 fetch 失败(SSR / 极端环境),返回空字符串而不是 throw
        return '';
      }
    })();
  }
  return _fieldDocsPromise;
}

/** AI 单模式 prompt 构建(异步:FIELD_DOCS 拆 JSON 懒加载) */
export async function buildSystemPrompt(
  mode: LlmMode,
  currentConfig: Partial<MatrixRainOptions>
): Promise<string> {
  const fieldDocs = await loadFieldDocs();
  return SYSTEM_PROMPTS[mode]
    .replace('{FIELD_DOCS}', fieldDocs)
    .replace('{CURRENT}', JSON.stringify(currentConfig, null, 2));
}
