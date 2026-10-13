#!/usr/bin/env node
/**
 * Race for Eggs 变化监控（零 AI、零依赖）
 *
 * 为什么：/codes/ 是本站唯一有真实搜索意图的页，游戏每周六更新 + 10 月连续掉新码
 * （UPD1 10-03、TRAIN1/LUCK1 10-07），竞品几小时内就收录。本站 2026-09-19 建站后
 * 停更 22 天，codes 页还只有 RELEASE，GSC 点击从每 10 天 59 掉到 9（-85%）。
 * 这个脚本每小时做三件事：
 *
 *   1. Roblox 元数据比对（名称/描述/版本时间/群组 shout）：更新 = 新码信号；
 *      同时检查 codes 页 lastModified 是否落后于游戏 updated（落后 = 该同步了）
 *   2. 三个码源页比对：出现「本站还没有、且 ≥2 个源同时列出」的码 → 高优先级通知
 *   3. 本站已收录的码在所有源上消失 → 记录（可能过期，人工确认）
 *
 * 只提示，不自动改 MDX —— 收录门槛是人工双源确认后改
 * src/content/wiki/en/codes/all-codes.mdx。
 *
 * cron: 29 * * * * NODE_USE_ENV_PROXY=1 https_proxy=http://127.0.0.1:7897 /opt/homebrew/bin/node <本文件>
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SHIP = join(REPO, '..');
const UNIVERSE_ID = 10371406677; // placeId 122278212262864
const GROUP_ID = 719390069; // xFrozen x Dudes（4.2M 成员）
const CODES_FILE = join(REPO, 'src', 'content', 'wiki', 'en', 'codes', 'all-codes.mdx');
const STATE = join(SHIP, 'out', 'raceforeggs-watch.json');
const LOG = '/tmp/raceforeggs-watch.log';

/** 码源：≥2 个源同时出现才提示（防聚合站错拼 / 别的游戏串词）。 */
const CODE_SOURCES = [
  { id: 'urgametips', url: 'https://urgametips.com/race-for-eggs-codes/' },
  { id: 'gachapocket', url: 'https://gachapocket.com/race-for-eggs-codes/' },
  { id: 'rfwiki', url: 'https://raceforeggs.wiki/codes' },
];

// 全大写 token 里这些不是码（页面词汇）。注意别把真码停掉：RELEASE 是码，
// TRAIN1/LUCK1/UPD1 带数字本来就会被 knownCodes 拦住。
const STOP = new Set(
  `COPY NEW CODES CODE WORKING ACTIVE EXPIRED REDEEM FREEBIES CLAIM LIST HERE TABLE
   STATUS ENTER BONUS MORE INFO NOTE READ WHEN WHERE WHAT WHY HOW ALL USE UPDATED
   UPDATE ROBLOX DISCORD PRIVACY CONTACT HOME GUIDES WIKI TIER TIERS RACE RACES
   RACING EGGS EGG PETS PET SPEED CASH LUCK TRAIN TRAINING POTION POTIONS REBIRTH
   MUTATIONS MUTATION GOLD RAINBOW RADIOACTIVE SECRET SECRETS REWARD REWARDS
   PLAYERS PLAYER SATURDAY WEEKEND OCTOBER NOVEMBER SEPTEMBER DECEMBER JANUARY
   FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST AND THE FOR YOU YOUR WITH THIS THAT
   FROM HAVE WILL JUST ONLY OVER ALSO INTO START STARTER FIRST BEST TOP NEXT LAST
   GAME GAMES ITEM ITEMS MODE MODES PRESS OPEN CURRENT LATEST SHOP MENU LIVING
   LIZARD GAMEPASS BADGE BADGES STAGE STAGES WORLD WORLDS RWD THUMBNAIL VIDEO
   FACEBOOK TWITTER YOUTUBE GOOGLE XBOX PLAYSTATION NINTENDO MOBILE DESKTOP
   CHEATS NEWS PATCH PATCHES EVENT EVENTS REWARDS TOTAL NUMBER COUNT`.split(/\s+/),
);

const log = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);

const PUSH_SCRIPT = new URL('../../scripts/notify.mjs', import.meta.url).pathname;

function notify(title, body, sound = 'Glass') {
  // 先推飞书（Ship/scripts/notify.mjs，2026-10-11 加：用户不在电脑前会漏 macOS 通知）；推不出去再走下面的 macOS 通知。
  try {
    execFileSync(process.execPath, [PUSH_SCRIPT, '--title', String(title), '--body', String(body)], { stdio: 'ignore', timeout: 30000 });
    return;
  } catch {}
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 220);
  try {
    execFileSync('osascript', [
      '-e',
      `display notification "${esc(body)}" with title "${esc(title)}" sound name "${sound}"`,
    ]);
  } catch {}
}

// Roblox API 偶发瞬时 SSL 错误 → 短重试；429 限流（雷达每天 13 点前后扫 Roblox）→ 长等待
async function getJson(url) {
  for (let i = 1; ; i++) {
    let limited = false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      limited = r.status === 429;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= (limited ? 5 : 3)) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, limited ? 30000 * i : 3000 * i));
    }
  }
}

async function get(url) {
  for (let i = 1; ; i++) {
    let limited = false;
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        },
      });
      limited = r.status === 429;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= (limited ? 3 : 2)) throw new Error(`${url.slice(0, 60)}: ${e.message}`);
      await new Promise((res) => setTimeout(res, limited ? 20000 * i : 2500 * i));
    }
  }
}

/** 从码源 HTML 里抽候选码：全大写 4–20 位、至少含一个字母，剔除页面词汇。 */
function extractCodes(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  const out = new Set();
  for (const m of text.matchAll(/\b[A-Z0-9]{4,20}\b/g)) {
    const tok = m[0];
    if (!/[A-Z]/.test(tok)) continue; // 纯数字不是码
    if (STOP.has(tok)) continue;
    if (/^\d+[A-Z]?$/.test(tok)) continue;
    out.add(tok);
  }
  return out;
}

// ─── 本站码表 + codes 页新鲜度（MDX 是唯一事实来源） ──────────────────────────
const mdx = readFileSync(CODES_FILE, 'utf8');
const known = new Set(
  [...mdx.matchAll(/^\s*-\s*code:\s*['"]?([A-Za-z0-9_]+)['"]?\s*$/gm)].map((m) => m[1]),
);
const pageLastModified = mdx.match(/^lastModified:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;

// ─── 1. Roblox 元数据 ─────────────────────────────────────────────────────────
let now;
try {
  const [game, group] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`).then((d) => d.data[0]),
    getJson(`https://groups.roblox.com/v1/groups/${GROUP_ID}`),
  ]);
  now = {
    name: game.name,
    description: game.description,
    updated: game.updated,
    playing: game.playing,
    visits: game.visits,
    shout: group.shout?.body ?? '',
    pageLastModified,
  };
} catch (e) {
  log(`GAME_FETCH_FAILED ${e.message}`);
  process.exit(1);
}

// ─── 2. 码源比对 ──────────────────────────────────────────────────────────────
const perSource = {};
const sourceErrors = [];
for (const s of CODE_SOURCES) {
  try {
    perSource[s.id] = extractCodes(await get(s.url));
  } catch (e) {
    sourceErrors.push(`${s.id}: ${e.message}`);
  }
}

const counts = new Map();
for (const set of Object.values(perSource)) {
  for (const tok of set) counts.set(tok, (counts.get(tok) ?? 0) + 1);
}
// 出现在 ≥2 个源、且不在本站码表里的 → 新码候选
const newCandidates = [...counts.entries()]
  .filter(([tok, n]) => n >= 2 && !known.has(tok))
  .map(([tok, n]) => `${tok}(${n}源)`)
  .sort();

// 我们的码里，已从所有成功抓取的源上消失的 → 可能过期
const liveSources = Object.values(perSource);
const gone = liveSources.length
  ? [...known].filter((c) => liveSources.every((s) => !s.has(c)))
  : [];

// ─── 3. 状态比对 + 通知 ───────────────────────────────────────────────────────
const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;

// 游戏 updated 晚于 codes 页 lastModified = 页还没跟上这次更新（每个版本只提醒一次）
const gameDay = now.updated.slice(0, 10);
const stalePage = Boolean(
  pageLastModified && prev && pageLastModified < gameDay && prev.staleNotifiedFor !== gameDay,
);

writeFileSync(
  STATE,
  JSON.stringify(
    {
      game: now,
      knownCodes: [...known].sort(),
      newCandidates,
      staleNotifiedFor: stalePage ? gameDay : prev?.staleNotifiedFor ?? null,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

if (!prev) {
  log(
    `BASELINE ${now.name} | updated ${now.updated} | codes ${[...known].join(',')} | candidates ${newCandidates.length}`,
  );
  process.exit(0);
}

// 2026-10-13：变化交给自动更新引擎（Ship/scripts/autopilot）——它多源确认后改数据、构建、上线，再推飞书说改了什么；
// 引擎不在才退回原来的「请手动更新」通知
async function handoff(reason, fallback) {
  try {
    const { trigger } = await import(join(SHIP, 'scripts', 'autopilot', 'trigger.mjs'));
    if (trigger('raceforeggs', reason)) { log(`AUTOPILOT ${reason}`); return; }
  } catch {}
  fallback();
}

const changed = ['name', 'description', 'updated', 'shout'].filter((k) => prev.game?.[k] !== now[k]);
if (changed.length) {
  const isUpdate = changed.includes('updated') || changed.includes('description');
  for (const k of changed) {
    log(`CHANGED ${k}: ${JSON.stringify(String(prev.game?.[k] ?? '').slice(0, 120))} → ${JSON.stringify(String(now[k]).slice(0, 120))}`);
  }
  await handoff(`Race for Eggs ${isUpdate ? '游戏更新' : '数据源变化'}（${changed.join('/')}${changed.includes('shout') ? `，群组公告：${now.shout.slice(0, 150)}` : ''}）`, () => notify(
    isUpdate ? '🆕 Race for Eggs 更新' : '数据源有变化',
    `${changed.join('/')} 变化 → 查新码并同步 /codes/all-codes/（正文 ${pageLastModified ?? '?'}）`,
    isUpdate ? 'Glass' : 'Blow',
  ));
}

if (stalePage) {
  log(`STALE_CODES page ${pageLastModified} < game ${gameDay}`);
  await handoff(`codes 页 ${pageLastModified} 落后于游戏更新 ${gameDay}`, () => notify(
    '🔔 codes 页落后于游戏更新',
    `页面 ${pageLastModified}，游戏已更新到 ${gameDay} → 同步新码/日期（三源确认后改 all-codes.mdx）`,
    'Glass',
  ));
}

if (newCandidates.length) {
  log(`🚨 NEW_CODES ${newCandidates.join(' ')}`);
  await handoff(`码源出现本站没有的码 ${newCandidates.slice(0, 8).join(' ')}`, () => notify(
    '🚨 新码待确认',
    `${newCandidates.slice(0, 8).join(' ')} → 双源确认后补进 all-codes.mdx（含标题日期）`,
    'Sosumi',
  ));
}

if (gone.length) log(`GONE ${gone.join(' ')}（所有成功抓取的源都不再列出，人工确认后标过期）`);
if (sourceErrors.length) log(`SOURCE_ERRORS ${sourceErrors.join(' | ')}`);
if (!changed.length && !newCandidates.length && !stalePage) log('no change');
