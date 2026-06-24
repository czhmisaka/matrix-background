#!/usr/bin/env node
/**
 * @xietuier/matrix-rain · 修复 tsup 产物中 d.ts 文件 hash 命名
 *
 * **问题**: tsup 用 `chunkFileNames: "[name]-[hash].d.ts"` 输出共享类型 chunk,
 *  导致 `dist/themes-XXXXXXXX.d.ts` 这样的文件名, hash 随代码内容变化。
 *  package.json `exports['./themes'].types` 指向 `./dist/themes.d.ts`,
 *  而 `themes.d.ts` 是 tsup 留下的 52B 桩 (`export { t as themes } from "./themes-F8oKFGEV.js"`)。
 *  hash 变 → consumer 升级后 `import type { themes }` 失效 (指向不存在的文件)。
 *
 * **修复**: 把 tsup 切分出的真实类型 chunk 提升为稳定的 `themes.d.ts`,
 *  同步修掉 `index.d.ts` / `index.d.cts` 中残留的 `./themes-F8oKFGEV.{js,cjs}` 引用。
 *
 * **用法**:
 *   由 `npm run build` 内部 `tsup` 完成后自动调用;
 *   也可手动 `node scripts/fix-dts-hash.mjs`。
 *
 * @since 0.5.2
 */

import { readdir, rename, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

const HASH_PATTERN = /^themes-([A-Za-z0-9_-]{8})\.d\.(ts|cts)$/;

async function findHashedFiles(dir) {
  const entries = await readdir(dir);
  return entries.map((name) => ({ name, match: name.match(HASH_PATTERN) })).filter((e) => e.match);
}

async function fixHashedThemes() {
  const hashed = await findHashedFiles(distDir);
  if (hashed.length === 0) {
    console.log('[fix-dts-hash] 没有发现 hash 命名的 themes d.ts, 跳过 (可能已修复)');
    return;
  }

  // 按 .d.ts / .d.cts 分组
  const groups = new Map();
  for (const { name, match } of hashed) {
    const ext = match[2]; // ts | cts
    if (!groups.has(ext)) groups.set(ext, []);
    groups.get(ext).push(name);
  }

  // 1) 提升 hashed themes chunk 为稳定文件名
  for (const [ext, names] of groups) {
    if (names.length > 1) {
      console.warn(
        `[fix-dts-hash] 警告: 发现 ${names.length} 个 themes-*.d.${ext}, 全部合并到 themes.d.${ext}`
      );
    }
    // 取第一个 (任意一个内容都包含完整类型声明; tsup 重复生成时它们应一致)
    const src = names[0];
    const dst = `themes.d.${ext}`;
    await rename(resolve(distDir, src), resolve(distDir, dst));
    console.log(`[fix-dts-hash] rename: ${src} -> ${dst}`);
    // 删掉多余重复
    for (let i = 1; i < names.length; i++) {
      // rename 抛错因为源已存在? 改用 unlink via readdir 删除
      const { unlink } = await import('node:fs/promises');
      await unlink(resolve(distDir, names[i]));
      console.log(`[fix-dts-hash] remove dup: ${names[i]}`);
    }
  }

  // 2) 修掉 stub themes.d.{ts,cts} 残留(如果还存在) — 它们是 52B re-export,
  //    真实类型已经搬到 themes.d.{ts,cts} 中, 重复 stub 没意义
  //    但 stub 的内容就是从 "./themes-XXXXXXXX.{js,cjs}" 引用, 留着会指向不存在的文件
  //    所以 stub 必须被覆盖删除。我们已把真类型搬到 themes.d.{ts,cts}, stub 已经被 rename 覆盖。

  // 3) 修掉 index.d.ts / index.d.cts 中对 ./themes-F8oKFGEV.{js,cjs} 的引用
  //    指向稳定的 ./themes.{js,cjs}
  for (const ext of ['ts', 'cts']) {
    const target = resolve(distDir, `index.d.${ext}`);
    const text = await readFile(target, 'utf8');
    // 匹配 ./themes-XXXXXXXX.{js,cjs}
    const fixed = text.replace(/\.\/themes-[A-Za-z0-9_-]{8}\.(js|cjs)/g, `./themes.$1`);
    if (fixed !== text) {
      await writeFile(target, fixed, 'utf8');
      console.log(`[fix-dts-hash] rewrite re-exports in: index.d.${ext}`);
    } else {
      console.log(`[fix-dts-hash] index.d.${ext} 无 hash 引用, 跳过`);
    }
  }

  // 4) 修复 themes.d.{ts,cts} 的导出名
  //    tsup 在 chunk 内部把 `const themes` 重导出为 `t`(避免与 entry 自身名冲突),
  //    所以原 stub `export { t as themes } from './themes-F8oKFGEV.js'` 是必需的。
  //    把 chunk 内容搬到 themes.d.{ts,cts} 后, 内部的 `themes as t` 还在,
  //    但用户消费 `import { themes } from '@xietuier/matrix-rain/themes'` 找的是 `themes`,
  //    所以追加 `export { themes };`(用本地 const 名直接 un-aliased 导出, 不依赖 `t` 别名)。
  for (const ext of ['ts', 'cts']) {
    const target = resolve(distDir, `themes.d.${ext}`);
    const text = await readFile(target, 'utf8');
    // 已有 const themes + export themes as t; 追加 un-aliased themes 导出
    if (
      /\bthemes\s+as\s+t\b/.test(text) &&
      !/export\s*\{[^}]*\bthemes\s+as\s+themes\b/.test(text)
    ) {
      const append = '\n\nexport { themes };\n';
      const updated = text.trimEnd() + append;
      await writeFile(target, updated, 'utf8');
      console.log(`[fix-dts-hash] append un-aliased themes export to: themes.d.${ext}`);
    } else {
      console.log(`[fix-dts-hash] themes.d.${ext} 无需补 themes 导出`);
    }
  }
}

await fixHashedThemes();
console.log('[fix-dts-hash] 完成');
