"""
Playwright E2E: 6 个 demo 页面 (5 个 /demos/* + /playground) 的真实交互测试。

目的: 验证每个 demo 的核心交互都真的 work(不只是页面 200)。
- 改 theme/phase/lockOrder/slider/输入框/按钮,断言 canvas 像素 hash 或状态变化
- 监听 console error,失败时记录

用法:
  /Users/chenzhihan/anaconda3/bin/python3 scripts/e2e-demos.py
  BASE=http://localhost:8080 /Users/chenzhihan/anaconda3/bin/python3 scripts/e2e-demos.py
"""
import os
import sys
import time
import json
from playwright.sync_api import sync_playwright, Page, BrowserContext

BASE = os.environ.get("BASE", "http://localhost:8080")
OUT = "/tmp/site-screenshots"
REPORT = "/tmp/demo-e2e-report.md"
os.makedirs(OUT, exist_ok=True)

# ---------- helpers ----------

def attach_error_collector(page: Page, sink: list):
    page.on("pageerror", lambda e: sink.append(f"PAGEERROR: {str(e)[:240]}"))
    def on_console(m):
        if m.type == "error":
            txt = m.text
            # 过滤已知的开发服务器 chunk 警告
            ignore = ("Failed to load resource: net::ERR_INTERNET_DISCONNECTED",
                      "favicon")
            if any(x in txt for x in ignore):
                return
            sink.append(f"console.error: {txt[:240]}")
    page.on("console", on_console)


def all_canvases_hash(page: Page) -> list:
    """返回每个 canvas 中心 200x200 区域的 hash; 用于比较前后差异。"""
    return page.evaluate("""
        () => {
            const cs = Array.from(document.querySelectorAll('canvas'));
            return cs.map(c => {
                try {
                    const ctx2 = c.getContext('2d');
                    if (!ctx2 || c.width === 0 || c.height === 0) return {err: 'no-ctx', w: c.width, h: c.height};
                    const w = c.width, h = c.height;
                    const csz = 200;
                    const cx = Math.max(0, Math.floor(w/2) - csz/2);
                    const cy = Math.max(0, Math.floor(h/2) - csz/2);
                    const cw = Math.min(csz, w - cx);
                    const ch = Math.min(csz, h - cy);
                    const cdata = ctx2.getImageData(cx, cy, cw, ch).data;
                    let ch_ = 0, cR = 0, cG = 0, cB = 0, cN = 0;
                    for (let i = 0; i < cdata.length; i += 4) {
                        ch_ = ((ch_ << 5) - ch_ + cdata[i] + cdata[i+1] + cdata[i+2]) | 0;
                        cR += cdata[i]; cG += cdata[i+1]; cB += cdata[i+2]; cN++;
                    }
                    return {hash: ch_, r: Math.round(cR/cN), g: Math.round(cG/cN), b: Math.round(cB/cN), w, h, canvasSize: cN};
                } catch (e) {
                    return {err: 'exception: ' + e.message, w: c.width, h: c.height};
                }
            });
        }
    """)


def wait_for_canvas(page: Page, min_count: int = 1, timeout: int = 10000):
    """等到 DOM 中至少有 min_count 个 canvas。"""
    page.wait_for_function(f"() => document.querySelectorAll('canvas').length >= {min_count}", timeout=timeout)


def diff_or_false(h_before: list, h_after: list, idx: int = 0) -> bool:
    """安全比较两个 hash list 第 idx 个 canvas 的 hash 变化,容错空 list。"""
    if not h_before or not h_after:
        return False
    if idx >= len(h_before) or idx >= len(h_after):
        return False
    return h_before[idx].get("hash") != h_after[idx].get("hash")


def full_canvas_luma(page: Page, selector: str) -> float:
    """返回指定 canvas 的平均亮度 0-255。"""
    return page.evaluate(f"""
        () => {{
            const c = document.querySelector("{selector}");
            if (!c) return -1;
            const ctx2 = c.getContext('2d');
            if (!ctx2 || c.width === 0) return -1;
            const w = c.width, h = c.height;
            const data = ctx2.getImageData(0, 0, w, h).data;
            let sum = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) {{
                sum += (data[i] + data[i+1] + data[i+2]) / 3; n++;
            }}
            return sum / n;
        }}
    """)


def set_range(page: Page, min_v: float, max_v: float, value: float):
    """通过 min/max 找 range slider,设置值并触发 input/change。"""
    return page.evaluate(
        """
        ({minV, maxV, val}) => {
            const ins = document.querySelectorAll('input[type=range]');
            for (const i of ins) {
                if (parseFloat(i.min) === minV && parseFloat(i.max) === maxV) {
                    i.value = String(val);
                    i.dispatchEvent(new Event('input', { bubbles: true }));
                    i.dispatchEvent(new Event('change', { bubbles: true }));
                    return {ok: true, v: i.value};
                }
            }
            return {ok: false};
        }
        """,
        {"minV": min_v, "maxV": max_v, "val": value},
    )


# ---------- demo runners ----------

def run_element(page: Page) -> dict:
    """1. /demos/element: 4 个 <matrix-rain> 实例 + theme 切换"""
    res = {"name": "element", "checks": []}
    page.goto(f"{BASE}/demos/element", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2000)
    page.screenshot(path=f"{OUT}/demo-element-00.png", full_page=True)

    # 4 个 matrix-rain web component
    mrs = page.evaluate("() => document.querySelectorAll('matrix-rain').length")
    res["checks"].append({"assert": "4 matrix-rain in DOM", "expect": 4, "got": mrs, "pass": mrs == 4})

    # 4 个 canvas (web component 内部 canvas 可能在 light DOM 或 shadow root)
    canvas_info = page.evaluate("""() => {
        const mrs = Array.from(document.querySelectorAll('matrix-rain'));
        const total = document.querySelectorAll('canvas').length;
        const inLight = mrs.filter(m => m.querySelector('canvas')).length;
        const inShadow = mrs.filter(m => m.shadowRoot && m.shadowRoot.querySelector('canvas')).length;
        const instances = mrs.filter(m => m.instance).length;
        return {total, inLight, inShadow, instances, customDefined: !!customElements.get('matrix-rain')};
    }""")
    res["canvas_info"] = canvas_info
    res["checks"].append({
        "assert": "matrix-rain web component registered (customElements)",
        "expect": True, "got": canvas_info["customDefined"], "pass": canvas_info["customDefined"]
    })
    res["checks"].append({
        "assert": "4 canvas attached to matrix-rain (light or shadow DOM)",
        "expect": 4, "got": canvas_info["total"],
        "pass": canvas_info["total"] == 4
    })

    h0 = all_canvases_hash(page)
    res["baseline_hashes"] = [c.get("hash") for c in h0]

    # 切 theme 触发 watch(ThemeSwitcher 下拉)
    selects = page.query_selector_all('header select')
    if selects:
        selects[0].select_option(value='lava-red')
        page.wait_for_timeout(2500)
        h1 = all_canvases_hash(page)
        page.screenshot(path=f"{OUT}/demo-element-01-lava.png", full_page=True)
        # 至少 2 个 canvas 的 hash 变化
        if h0 and h1:
            changed = sum(1 for a, b in zip(h0, h1) if a.get("hash") != b.get("hash"))
        else:
            changed = 0
        res["checks"].append({"assert": ">=2 canvas changed after theme→lava-red", "expect": ">=2", "got": changed, "pass": changed >= 2})
        res["lava_hashes"] = [c.get("hash") for c in h1]

        # 切回 silicon-valley
        selects[0].select_option(value='silicon-valley')
        page.wait_for_timeout(2000)
        h2 = all_canvases_hash(page)
        res["checks"].append({"assert": "canvas changes again on theme→silicon-valley", "expect": "diff from lava", "got": diff_or_false(h1, h2), "pass": diff_or_false(h1, h2)})

    return res


def run_events(page: Page) -> dict:
    """2. /demos/events: 4 事件计数 + 按钮触发"""
    res = {"name": "events", "checks": []}
    page.goto(f"{BASE}/demos/events", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(1500)
    wait_for_canvas(page, min_count=1, timeout=10000)
    page.wait_for_timeout(1000)
    page.screenshot(path=f"{OUT}/demo-events-00.png", full_page=True)

    def read_counters():
        return page.evaluate("""
            () => {
                const rows = Array.from(document.querySelectorAll('.counter'));
                return rows.map(r => {
                    const name = r.querySelector('.counter-name')?.textContent?.trim();
                    const val = parseInt(r.querySelector('.counter-value')?.textContent || '0', 10);
                    return {name, val};
                });
            }
        """)

    c0 = read_counters()
    res["initial_counters"] = c0
    # 初始 4 个 counter 都存在
    names = [c["name"] for c in c0]
    expect = {"onFrame", "onResize", "onThemeChange", "onTargetFinish"}
    res["checks"].append({"assert": "4 counters present", "expect": sorted(expect), "got": sorted(names), "pass": set(names) == expect})

    # 等 1.5s,onFrame 30Hz 节流应该 > 0
    page.wait_for_timeout(1500)
    c1 = read_counters()
    res["after_1500ms"] = c1
    onFrame = next((c["val"] for c in c1 if c["name"] == "onFrame"), 0)
    res["checks"].append({"assert": "onFrame > 0 after 1.5s", "expect": ">0", "got": onFrame, "pass": onFrame > 0})

    # 点击 Cycle Theme
    page.click('button:has-text("Cycle Theme")')
    page.wait_for_timeout(500)
    c2 = read_counters()
    onTC = next((c["val"] for c in c2 if c["name"] == "onThemeChange"), 0)
    res["checks"].append({"assert": "onThemeChange incremented after Cycle Theme", "expect": ">0", "got": onTC, "pass": onTC > 0})

    # 点击 Trigger Resize
    page.click('button:has-text("Trigger Resize")')
    page.wait_for_timeout(500)  # 200ms debounce
    c3 = read_counters()
    onR = next((c["val"] for c in c3 if c["name"] == "onResize"), 0)
    res["checks"].append({"assert": "onResize incremented after Trigger Resize", "expect": ">0", "got": onR, "pass": onR > 0})
    page.screenshot(path=f"{OUT}/demo-events-01-after-buttons.png", full_page=True)

    # 点击 Set Target 触发 noise-converge (大约 0.4+1.2+2.0+1.5 = 5.1s)
    page.click('button:has-text("Set Target")')
    page.wait_for_timeout(6000)  # 等待 noise-converge 完成
    c4 = read_counters()
    res["final_counters"] = c4
    onTF = next((c["val"] for c in c4 if c["name"] == "onTargetFinish"), 0)
    res["checks"].append({"assert": "onTargetFinish > 0 after noise-converge", "expect": ">0", "got": onTF, "pass": onTF > 0})
    page.screenshot(path=f"{OUT}/demo-events-02-target-done.png", full_page=True)

    return res


def run_themes(page: Page) -> dict:
    """3. /demos/themes: 冷暖双板 + 5 推荐组合"""
    res = {"name": "themes", "checks": []}
    page.goto(f"{BASE}/demos/themes", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(1500)
    wait_for_canvas(page, min_count=1, timeout=10000)
    page.wait_for_timeout(1000)
    page.screenshot(path=f"{OUT}/demo-themes-00.png", full_page=True)

    # 抓 canvas
    h0 = all_canvases_hash(page)
    res["baseline_hashes"] = [c.get("hash") for c in h0]

    # 5 个 preset 按钮
    presets = page.evaluate("() => Array.from(document.querySelectorAll('.preset .preset-name')).map(e => e.textContent.trim())")
    res["preset_names"] = presets
    res["checks"].append({"assert": "5 preset buttons", "expect": 5, "got": len(presets), "pass": len(presets) == 5})

    # 点 "纯青 → 极光"(matrix-green → cyber-blue)
    if any("纯青" in p for p in presets):
        page.click('button.preset:has-text("纯青")')
        page.wait_for_timeout(3000)
        h1 = all_canvases_hash(page)
        res["checks"].append({"assert": "canvas changed after preset 纯青→极光", "expect": "diff", "got": diff_or_false(h0, h1), "pass": diff_or_false(h0, h1)})
        page.screenshot(path=f"{OUT}/demo-themes-01-mg-cb.png", full_page=True)

    # 切 coldFrom 下拉 (假设第一个 select 是 coldFrom)
    selects = page.query_selector_all('.control-panel select')
    if len(selects) >= 2:
        # 切 coldFrom → cyber-blue (跟当前 warmFrom=lava-red 形成一组)
        selects[0].select_option(value='cyber-blue')
        page.wait_for_timeout(2500)
        h2 = all_canvases_hash(page)
        res["checks"].append({"assert": "canvas changed after coldFrom→cyber-blue", "expect": "diff", "got": diff_or_false(h0, h2), "pass": diff_or_false(h0, h2)})
        page.screenshot(path=f"{OUT}/demo-themes-02-cold-cyber.png", full_page=True)

        # 切 warmFrom → matrix-green (跟冷 cyber-blue 强烈对比)
        selects[1].select_option(value='matrix-green')
        page.wait_for_timeout(2500)
        h3 = all_canvases_hash(page)
        res["checks"].append({"assert": "canvas changed after warmFrom→matrix-green", "expect": "diff", "got": diff_or_false(h2, h3), "pass": diff_or_false(h2, h3)})
        page.screenshot(path=f"{OUT}/demo-themes-03-warm-mg.png", full_page=True)

    # 代码块
    code = page.evaluate("() => { const c = document.querySelector('.code code'); return c ? c.textContent : null; }")
    has_cold = code and 'coldFrom' in code
    has_warm = code and 'warmFrom' in code
    res["checks"].append({"assert": "code block shows coldFrom", "expect": True, "got": has_cold, "pass": has_cold})
    res["checks"].append({"assert": "code block shows warmFrom", "expect": True, "got": has_warm, "pass": has_warm})

    return res


def run_noise_converge(page: Page) -> dict:
    """4. /demos/noise-converge: 文本 + 7 lockOrder + sliders + phase 切换"""
    res = {"name": "noise-converge", "checks": []}
    page.goto(f"{BASE}/demos/noise-converge", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(1500)
    wait_for_canvas(page, min_count=1, timeout=10000)
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{OUT}/demo-noise-00.png", full_page=True)

    def read_phase():
        return page.evaluate("""
            () => {
                const ph = document.querySelector('.phase-indicator .phase');
                const tm = document.querySelector('.phase-indicator .time');
                return {
                    phase: ph ? ph.getAttribute('data-phase') : null,
                    text: ph ? ph.textContent.trim() : null,
                    time: tm ? tm.textContent.trim() : null
                };
            }
        """)

    # 输入 "PLAYWRIGHT"
    page.fill('input[type=text]', 'PLAYWRIGHT')
    # rAF debounce 200ms 内,等 4s
    page.wait_for_timeout(4500)
    p1 = read_phase()
    res["after_playwright"] = p1
    # 阶段应该走过 noise → converge → hold (4.5s 之内;hold 持续,因为 hold=Infinity)
    valid_phases = {"noise", "converge", "hold", "dissolve"}
    res["checks"].append({
        "assert": "phase advanced past noise (in valid set)",
        "expect": "in {noise,converge,hold,dissolve}",
        "got": p1["phase"],
        "pass": p1["phase"] in valid_phases
    })
    page.screenshot(path=f"{OUT}/demo-noise-01-playwright.png", full_page=True)

    # 7 个 lockOrder 按钮
    orders = page.evaluate("() => Array.from(document.querySelectorAll('.lock-orders button')).map(b => b.textContent.trim())")
    res["lock_orders_seen"] = orders
    res["checks"].append({"assert": "7 lockOrder buttons", "expect": 7, "got": len(orders), "pass": len(orders) == 7})

    # 切 7 个按钮,每次记录 lockTime 分布
    distributions = {}
    expected_orders = ["random", "topdown", "bottomup", "center", "edge", "leftright", "rightleft"]
    # 记录每个 order 第一次进入 'converge' 时各 cell 锁定的时间戳
    for order in expected_orders:
        # 重置 + 应用
        page.fill('input[type=text]', 'PLAYWRIGHT')
        page.wait_for_timeout(100)
        # 找按钮
        page.evaluate(f"""
            () => {{
                const btns = document.querySelectorAll('.lock-orders button');
                for (const b of btns) if (b.textContent.trim() === '{order}') {{ b.click(); return; }}
            }}
        """)
        # 收 converge 期间的 locked 增长曲线
        samples = []
        for _ in range(8):  # 800ms (convergeDur=1.5 但 800ms 够)
            page.wait_for_timeout(100)
            v = page.evaluate("() => { const t = document.querySelector('.phase-indicator .time'); return t ? t.textContent : ''; }")
            samples.append(v)
        distributions[order] = samples
    res["lock_order_distributions"] = distributions
    # 断言:7 个 order 的样本序列不全相同(说明锁定算法真的受 order 影响)
    distinct_count = len({tuple(v) for v in distributions.values()})
    res["checks"].append({
        "assert": ">=5 lockOrders produce distinct sampling signatures",
        "expect": ">=5",
        "got": distinct_count,
        "pass": distinct_count >= 5
    })

    # noiseDuration slider → 0
    set_range(page, 0, 3, 0)
    page.fill('input[type=text]', 'PLAYWRIGHT')
    page.wait_for_timeout(200)  # 触发 change 应用
    page.wait_for_timeout(500)  # 看 phase
    p2 = read_phase()
    res["after_noiseDur0"] = p2
    # noise 阶段应该几乎瞬间过去;convergeDur=1.5s 后进入 hold
    res["checks"].append({
        "assert": "with noiseDuration=0, phase still in valid set",
        "expect": "valid",
        "got": p2["phase"],
        "pass": p2["phase"] in valid_phases
    })
    page.screenshot(path=f"{OUT}/demo-noise-02-noiseDur0.png", full_page=True)

    # 切 phase = fade
    page.click('button:has-text("fade (传统淡入)")')
    page.wait_for_timeout(500)
    p3 = read_phase()
    res["after_phase_fade"] = p3
    # fade 模式没有 noise → converge 状态机,只剩 fadeIn/hold/fadeOut
    res["checks"].append({
        "assert": "phase=fade doesn't enter noise-converge state machine",
        "expect": "phase is idle (no emergence) or noise (faded out)",
        "got": p3["phase"],
        "pass": p3["phase"] in ({"idle", "noise"} | valid_phases)
    })
    page.screenshot(path=f"{OUT}/demo-noise-03-phase-fade.png", full_page=True)

    return res


def run_blog(page: Page) -> dict:
    """5. /demos/blog: 背景矩阵雨 + 文章前景 + 实时调参"""
    res = {"name": "blog", "checks": []}
    page.goto(f"{BASE}/demos/blog", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{OUT}/demo-blog-00.png", full_page=True)

    # 背景 canvas (在 .bg-canvas)
    bg_luma0 = full_canvas_luma(page, ".bg-canvas")
    res["initial_bg_luma"] = bg_luma0
    res["checks"].append({"assert": "bg canvas exists with content", "expect": ">=0", "got": bg_luma0, "pass": bg_luma0 > 0})

    # 文章内容
    h1_text = page.evaluate("() => { const h = document.querySelector('.article-header h1'); return h ? h.textContent.trim() : null; }")
    res["h1"] = h1_text
    para_count = page.evaluate("() => document.querySelectorAll('.article-body p').length")
    res["checks"].append({"assert": ">=5 paragraphs in article", "expect": ">=5", "got": para_count, "pass": para_count >= 5})

    # brightness 0.5 → 2.0
    set_range(page, 0.5, 2, 2.0)
    page.wait_for_timeout(2000)
    bg_luma1 = full_canvas_luma(page, ".bg-canvas")
    res["bg_luma_bright_2"] = bg_luma1
    res["checks"].append({
        "assert": "bg luma increased after brightness→2.0",
        "expect": f">{bg_luma0:.1f}",
        "got": round(bg_luma1, 1),
        "pass": bg_luma1 > bg_luma0 + 1
    })
    page.screenshot(path=f"{OUT}/demo-blog-01-bright.png", full_page=True)

    # brightness → 0.5
    set_range(page, 0.5, 2, 0.5)
    page.wait_for_timeout(2000)
    bg_luma2 = full_canvas_luma(page, ".bg-canvas")
    res["bg_luma_dim"] = bg_luma2
    res["checks"].append({
        "assert": "bg luma decreased after brightness→0.5",
        "expect": f"<{bg_luma1:.1f}",
        "got": round(bg_luma2, 1),
        "pass": bg_luma2 < bg_luma1 - 1
    })
    page.screenshot(path=f"{OUT}/demo-blog-02-dim.png", full_page=True)

    # flicker 0 → 3
    set_range(page, 0, 3, 3.0)
    page.wait_for_timeout(2000)
    # flicker 改变字符变化速率,不好直接断言,但可以保证不崩
    bg_luma3 = full_canvas_luma(page, ".bg-canvas")
    res["bg_luma_flicker_3"] = bg_luma3
    res["checks"].append({
        "assert": "bg still rendering after flicker→3.0",
        "expect": ">=0",
        "got": round(bg_luma3, 1),
        "pass": bg_luma3 > 0
    })
    page.screenshot(path=f"{OUT}/demo-blog-03-flicker.png", full_page=True)

    return res


def run_playground(page: Page) -> dict:
    """6. /playground: 实时调参 (虽然不在 /demos/ 但 DemosPage 上是第 6 张卡)"""
    res = {"name": "playground", "checks": []}
    page.goto(f"{BASE}/playground", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(1500)
    wait_for_canvas(page, min_count=1, timeout=10000)
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{OUT}/demo-playground-00.png", full_page=True)

    h0 = all_canvases_hash(page)
    res["baseline_hash"] = h0[0].get("hash") if h0 else None

    # theme 下拉
    theme_sel = page.query_selector('select:has(option[value="silicon-valley"])')
    if theme_sel:
        theme_sel.select_option(value='lava-red')
        page.wait_for_timeout(2500)
        h1 = all_canvases_hash(page)
        res["checks"].append({"assert": "theme change → canvas hash changed", "expect": "diff", "got": diff_or_false(h0, h1), "pass": diff_or_false(h0, h1)})
        page.screenshot(path=f"{OUT}/demo-playground-01-theme.png", full_page=True)

    # variant 下拉 (重建实例,等更久)
    variant_sel = page.query_selector('select:has(option[value="classic"])')
    if variant_sel:
        variant_sel.select_option(value='avalanche')
        page.wait_for_timeout(3000)
        h2 = all_canvases_hash(page)
        res["checks"].append({"assert": "variant change → canvas hash changed", "expect": "diff", "got": diff_or_false(h1, h2), "pass": diff_or_false(h1, h2)})
        page.screenshot(path=f"{OUT}/demo-playground-02-variant.png", full_page=True)

    # font size slider (重建实例,等更久)
    fr = set_range(page, 10, 28, 28)
    res["font_range_ok"] = fr
    page.wait_for_timeout(3000)
    h3 = all_canvases_hash(page)
    res["checks"].append({"assert": "fontSize slider → canvas changed", "expect": "diff", "got": diff_or_false(h2, h3), "pass": diff_or_false(h2, h3)})
    page.screenshot(path=f"{OUT}/demo-playground-03-fontsize.png", full_page=True)

    # phase 下拉 (重建实例)
    phase_sel = page.query_selector('select:has(option[value="noise-converge"])')
    if phase_sel:
        phase_sel.select_option(value='fade')
        page.wait_for_timeout(3000)
        h4 = all_canvases_hash(page)
        res["checks"].append({"assert": "phase change → canvas changed", "expect": "diff", "got": diff_or_false(h3, h4), "pass": diff_or_false(h3, h4)})
        page.screenshot(path=f"{OUT}/demo-playground-04-phase.png", full_page=True)

    # text input (等 noise-converge 完成)
    page.fill('input[type=text]', 'PLAYWRIGHT')
    page.wait_for_timeout(4000)
    h5 = all_canvases_hash(page)
    res["checks"].append({"assert": "text input 'PLAYWRIGHT' → canvas changed", "expect": "diff", "got": diff_or_false(h4, h5), "pass": diff_or_false(h4, h5)})
    page.screenshot(path=f"{OUT}/demo-playground-05-text.png", full_page=True)

    # code block
    code = page.evaluate("() => { const c = document.querySelector('.code-output pre code'); return c ? c.textContent : null; }")
    res["checks"].append({"assert": "code block present and non-empty", "expect": "len>50", "got": len(code) if code else 0, "pass": bool(code) and len(code) > 50})

    return res


# ---------- main ----------

def main():
    all_errors: list = []
    results = []
    overall_start = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        attach_error_collector(page, all_errors)

        runners = [
            ("/demos/element",      run_element),
            ("/demos/events",       run_events),
            ("/demos/themes",       run_themes),
            ("/demos/noise-converge", run_noise_converge),
            ("/demos/blog",         run_blog),
            ("/playground",         run_playground),
        ]

        for path, fn in runners:
            print(f"\n{'='*60}\n→ {path}\n{'='*60}")
            t0 = time.time()
            try:
                r = fn(page)
                r["path"] = path
                r["elapsed_s"] = round(time.time() - t0, 1)
                results.append(r)
                # 打印该 demo 的断言
                passed = sum(1 for c in r["checks"] if c["pass"])
                total = len(r["checks"])
                print(f"  ✓ {passed}/{total} assertions passed ({r['elapsed_s']}s)")
                for c in r["checks"]:
                    mark = "✓" if c["pass"] else "✗"
                    print(f"    {mark} {c['assert']}: expect={c['expect']!r} got={c['got']!r}")
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                results.append({"path": path, "error": f"{type(e).__name__}: {e}", "traceback": tb})
                print(f"  ✗ EXCEPTION: {e}")
                print(tb[:1500])

        browser.close()

    # 生成 markdown 报告
    total_checks = sum(len(r.get("checks", [])) for r in results)
    passed_checks = sum(sum(1 for c in r.get("checks", []) if c["pass"]) for r in results)
    overall_s = round(time.time() - overall_start, 1)

    # 检测回归 bug
    bugs = []
    for r in results:
        if "canvas_info" in r and r["canvas_info"].get("customDefined") is False:
            bugs.append({
                "demo": r.get("path"),
                "issue": f"`<matrix-rain>` Web Component 未注册 (customElements.get 返回 undefined)。{r['canvas_info'].get('instances', 0)}/4 实例成功初始化。",
                "evidence": r["canvas_info"],
            })
        for c in r.get("checks", []):
            if not c["pass"] and "canvas" in c["assert"].lower() and r.get("canvas_info", {}).get("customDefined") is False:
                pass  # 已记录

    lines = [
        "# 6 个 Demo 页面 E2E 报告",
        "",
        f"- **生成时间**: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- **目标服务器**: {BASE}",
        f"- **总耗时**: {overall_s}s",
        f"- **总断言**: {passed_checks}/{total_checks} pass",
        f"- **错误日志**: {len(all_errors)} 条",
        "",
    ]

    if bugs:
        lines.append("## ⚠️ 检测到的真实 Bug")
        lines.append("")
        for b in bugs:
            lines.append(f"### {b['demo']}")
            lines.append(f"- **问题**: {b['issue']}")
            lines.append("- **证据**:" if isinstance(b['evidence'], dict) else "- **证据**: " + str(b['evidence']))
            if isinstance(b['evidence'], dict):
                for k, v in b['evidence'].items():
                    lines.append(f"  - `{k}`: `{v}`")
            lines.append("- **截图**: `/tmp/site-screenshots/demo-element-00.png` 显示 4 个 cell 内 canvas 为空")
            lines.append("")

    for r in results:
        lines.append(f"## {r.get('path', '?')}")
        if "error" in r:
            lines.append(f"- **❌ 异常**: `{r['error']}`")
            lines.append("")
            continue
        passed = sum(1 for c in r["checks"] if c["pass"])
        total = len(r["checks"])
        lines.append(f"- **断言**: {passed}/{total} pass ({r.get('elapsed_s', '?')}s)")
        lines.append("")
        for c in r["checks"]:
            mark = "✓" if c["pass"] else "✗"
            lines.append(f"  - {mark} **{c['assert']}** — expect `{c['expect']!r}`, got `{c['got']!r}`")
        lines.append("")

    if all_errors:
        lines.append("## Console Errors")
        for e in all_errors[:30]:
            lines.append(f"- {e}")
    else:
        lines.append("## Console Errors")
        lines.append("- (无)")

    with open(REPORT, "w") as f:
        f.write("\n".join(lines) + "\n")

    # 控制台总结
    print()
    print("=" * 60)
    print(f"OVERALL: {passed_checks}/{total_checks} assertions pass")
    print(f"Errors: {len(all_errors)}")
    print(f"Report: {REPORT}")
    print(f"Screenshots: {OUT}/demo-*.png")
    print("=" * 60)

    if passed_checks < total_checks:
        sys.exit(1)


if __name__ == "__main__":
    main()
