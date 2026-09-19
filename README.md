# Race for Eggs Wiki

Roblox《Race for Eggs》的粉丝 wiki 与攻略站。

**线上**：https://raceforeggs.site · **部署**：Cloudflare Workers（static assets）· **模板**：[AnvilWiki](https://github.com/PNGTRID/AnvilWiki)（MIT）

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Astro 7（`output: 'static'`，零 JS 优先，Lighthouse 4×100） |
| 内容 | Content Collections + MDX，Zod 构建时硬校验（`src/content.config.ts`） |
| 样式 | Tailwind CSS 3 + CSS 变量主题（品牌色 `#16a34a`） |
| 部署 | Cloudflare Workers static assets，Git 集成自动构建 |
| 包管理 | pnpm 11（需 Node ≥ 22.13，仓库 `.nvmrc` = 22） |

## 目录结构（三层分离，改动前先读）

```
src/pages, src/components, src/lib   → 框架层（fork-once，不逐游戏改）
src/config, src/locales, globals.css → 配置层（游戏标识/主题/文案）
src/content/wiki/<locale>/<category> → 内容层（文章 MDX，随游戏更新）
```

详细规范见 [`AGENTS.md`](./AGENTS.md) 与 [`docs/content-format.md`](./docs/content-format.md)。

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:4321

# 生产构建（SITE_URL 是构建时变量，必须带上）
SITE_URL=https://raceforeggs.site pnpm build
pnpm preview        # 预览 dist/
```

## 内容工作流

文章路径即 URL：`src/content/wiki/en/<category>/<slug>.mdx` → `/<category>/<slug>/`

**分类（`src/config/navigation.ts`）**：`codes` · `pets` · `guides`

**写文章硬规则**（构建时 Zod 校验，不过就 build 失败）：

- `title` ≤ 80 字符；`description` 40–165 字符
- `category` 必须是 navigation 里的 key
- 正文从 H2 起（H1 由 frontmatter title 渲染）
- 内链必须带尾斜杠（`/pets/all-pets/`）
- 每篇正文 ≥ 3 条内链
- 不确定的数据不写；创作者口播的数值标记为 creator-reported

**常用命令**：

```bash
pnpm check-content      # 内容 lint（frontmatter/内链/长度）
pnpm check-links        # 全站内链审计
pnpm gen-covers         # 用标题+品牌色生成封面并写入 frontmatter
pnpm new-post           # 交互式新建文章
pnpm submit-indexnow -- --site https://raceforeggs.site   # 推送 URL 给 Bing/Yandex
```

**数据来源纪律**：codes 用 ≥2 个新鲜源交叉验证（GameRant / 创作者视频 / 竞品站核对）；游戏机制用官方描述 + 多个创作者视频共识；来源写进 frontmatter 的 `codes[].source` 或正文。游戏**每周六更新**——更新后必须刷新 codes 页并检查是否有新内容。

## 部署（关键：部署 = commit + push）

**Cloudflare Workers Builds（Git 集成）**：push 到 `main` → 自动构建 → 部署。**本地 `wrangler deploy` 只是临时生效，会被下一次 Git 构建覆盖——任何改动必须 commit + push。**

- Build command（dashboard 里配置）：`SITE_URL=https://raceforeggs.site pnpm run build`
- Deploy command：`npx wrangler deploy`
- 输出目录：`dist/`（由 `wrangler.jsonc` 的 `assets.directory` 指定）

### 踩过的坑（从 commandanarmy 移植的修复）

1. **`wrangler.jsonc` 必须在仓库根目录**：wrangler 配置发现会向上找，父目录的 `wrangler.jsonc` 会抢占（`.toml` 输给父目录的 `.jsonc`）。
2. **构建时环境变量走 build command**：`SITE_URL` / `PUBLIC_GA_ID` / `INDEXNOW_KEY` 都是构建时读取，dashboard 运行时 vars 对静态站无效。
3. **IndexNow key 文件已提交**：`public/<key>.txt`，勿删。
4. **CI 修复已内置**：gates action 补 SITE_URL、write-indexnow-key 兼容 `WORKERS_CI_COMMIT_SHA`、移除模板自维护测试、测试 fixture 对齐单语言站。
5. **模板同步**：`upstream` remote 指向 AnvilWiki（`git fetch upstream && git merge upstream/main`），合并时保留上述 fork 差异。

## 配置速查

| 配置 | 位置 | 当前值 |
| --- | --- | --- |
| 站点标识/域名 | `src/config/site.ts` | Race for Eggs Wiki · raceforeggs.site |
| 主题色 | `src/styles/globals.css` | `#16a34a` |
| 导航/分类 | `src/config/navigation.ts` | codes / pets / guides |
| 首页模块 | `src/locales/en.json` → `home` | hero/start/explore/faq |
| IndexNow | `public/<key>.txt` | 已提交 |

## 运营链接

| 项 | 地址 |
| --- | --- |
| GSC 属性 | `sc-domain:raceforeggs.site`（待接入） |
| Cloudflare | Workers & Pages → raceforeggs（待接线） |
| 验收 | `node ~/Desktop/david/Ship/scripts/verify.mjs`（待加入基线） |
| 上游模板 | https://github.com/PNGTRID/AnvilWiki |

## 内容清单（2026-09-19 第一批）

| 分类 | 页面 |
| --- | --- |
| codes | all-codes（RELEASE → Lizard 宠物，双源验证） |
| pets | all-pets（蛋/宠物/等级/变异/秘密宠物系统） |
| guides | beginner-guide（首小时路线）· rebirth-guide（倍率与时机） |

## 许可

站点代码基于 [AnvilWiki](https://github.com/PNGTRID/AnvilWiki)（MIT）。《Race for Eggs》游戏内容与素材版权归 xFrozen x Dudes 与 Roblox Corporation 所有；本站为粉丝站，无官方关联。
