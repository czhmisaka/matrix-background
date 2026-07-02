#!/usr/bin/env node
/**
 * @xietuier/matrix-rain · 本地开发一键启动器
 *
 * **作用**: 并行启动 库 watch (tsup) + 站点 dev (vite),统一管理日志与关闭。
 *
 * 内部流程:
 *   1. preflight: 检查 site/node_modules、node_modules,缺失则提示 `pnpm install`/`npm install`
 *   2. spawn: 库 tsup --watch(库源) + site pnpm dev(站点 5173)
 *   3. prefix: 库日志 → [lib]    站点日志 → [site]
 *   4. signal: Ctrl-C / SIGTERM → 同时给两进程 SIGTERM,等 1s 还没走就 SIGKILL
 *
 * 与 `npm run dev` 的区别:
 *   - `npm run dev` 只跑 tsup --watch
 *   - `cd site && pnpm dev`  只跑 vite
 *   - `npm run dev:all` (本脚本)  两个一起跑 + 同步关
 *
 * 用法:
 *   npm run dev:all
 *   node scripts/dev.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const PREFIX = {
  lib: `${CYAN}[lib]${RESET}`,
  site: `${GREEN}[site]${RESET}`,
};

const children = [];
let exiting = false;

function log(tag, msg) {
  process.stdout.write(`${tag} ${msg}`);
}

function preflight() {
  const issues = [];
  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    issues.push('根目录 node_modules 缺失 → 请先 `npm install`');
  }
  if (!existsSync(resolve(ROOT, 'site/node_modules'))) {
    issues.push('site/node_modules 缺失 → 请先 `cd site && pnpm install --frozen-lockfile`');
  }
  // dist/ 完整性检查:tsup --watch 不会复制 css / woff2 / atlas
  // site/public/matrix-rain/matrix-rain.css 缺失会让站点 predev 失败
  const cssPath = resolve(ROOT, 'dist/matrix-rain.css');
  if (!existsSync(cssPath)) {
    issues.push(
      'dist/matrix-rain.css 缺失(tsup --watch 不复制 css)→ 请先 `npm run build` 跑一次完整 build,或 `cp src/matrix-rain.css dist/`'
    );
  }
  if (issues.length > 0) {
    log(`${RED}[preflight]${RESET}`, `${issues.length} 个前置问题:\n`);
    for (const issue of issues) log(`${RED}  ✗${RESET}`, `${issue}\n`);
    process.exit(1);
  }
  log(
    `${GREEN}[preflight]${RESET}`,
    `✓ node_modules / site/node_modules / dist/matrix-rain.css 已就位\n`
  );
}

function spawnChild(name, cmd, args, cwd, color) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const prefix = color || (name === 'lib' ? PREFIX.lib : PREFIX.site);

  const tag = (line) => prefix + (line.startsWith(' ') ? '  ' : ' ') + line;

  child.stdout.on('data', (buf) => {
    const text = buf.toString('utf8');
    for (const line of text.split('\n')) {
      if (line === '') continue;
      process.stdout.write(tag(line) + '\n');
    }
  });
  child.stderr.on('data', (buf) => {
    const text = buf.toString('utf8');
    for (const line of text.split('\n')) {
      if (line === '') continue;
      process.stdout.write(tag(line) + '\n');
    }
  });

  child.on('exit', (code, signal) => {
    if (exiting) return;
    if (code === 0 || signal) {
      log(
        `${DIM}[${name}]${RESET}`,
        `${YELLOW}进程退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})${RESET}\n`
      );
    } else {
      log(`${RED}[${name}]${RESET}`, `${RED}异常退出 code=${code}${RESET}\n`);
    }
    log(`${YELLOW}[manager]${RESET}`, '关闭其它子进程...\n');
    shutdown(signal || 'SIGTERM');
  });

  children.push({ name, child });
  return child;
}

function shutdown(signal = 'SIGTERM') {
  if (exiting) return;
  exiting = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(signal);
      } catch (e) {
        // already dead
      }
    }
  }
  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch (e) {}
      }
    }
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

preflight();

log(`${YELLOW}[manager]${RESET}`, `启动开发期两个并行进程 (Ctrl-C 关闭):\n`);
log(`${YELLOW}  ·${RESET}`, `${PREFIX.lib} tsup --watch   (库源 src/** → dist/)\n`);
log(`${YELLOW}  ·${RESET}`, `${PREFIX.site} pnpm dev       (站点 http://localhost:5173/)\n\n`);

spawnChild('lib', 'npx', ['tsup', '--watch'], ROOT, PREFIX.lib);
spawnChild('site', 'pnpm', ['dev'], resolve(ROOT, 'site'), PREFIX.site);

log(
  `${YELLOW}[manager]${RESET}`,
  `两个进程已起。日志实时输出。改 src/ → tsup watch rebuild → 手动 node scripts/copy-site-assets.mjs 让浏览器拿到 UMD。\n\n`
);
