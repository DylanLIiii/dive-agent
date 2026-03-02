/**
 * sync-docs.js
 *
 * 从 ../docs 同步文档到 ./docs，增强 frontmatter 供 Docusaurus 使用。
 * - 复制 learns/ 和 best-choices/ 到 website/docs/
 * - 为目录生成 _category_.json（中文标签、排序）
 * - 跳过 README.md（Docusaurus 不需要）
 */

const fs = require('fs-extra');
const path = require('path');
const matter = require('gray-matter');

const WEBSITE_DIR = path.resolve(__dirname, '..');
const REPO_DOCS = path.resolve(WEBSITE_DIR, '..', 'docs');
const WEBSITE_DOCS = path.resolve(WEBSITE_DIR, 'docs');

// 中文目录标签映射
const CATEGORY_LABELS = {
  // learns 下的父类别
  harness: { label: 'Agent 框架', position: 1 },
  evaluation: { label: '评估', position: 2 },
  training: { label: '训练', position: 3 },
  streaming: { label: '流式处理', position: 4 },

  // harness 下的子类别（使用同名 key 会覆盖，按嵌套深度区分）
  'error-handling': { label: '错误处理', position: 2 },
  'context-management': { label: '上下文管理', position: 3 },
  'type-safety': { label: '类型安全', position: 4 },
  middleware: { label: '中间件', position: 5 },
  concurrency: { label: '并发', position: 6 },
  architecture: { label: '架构', position: 7 },
  abstractions: { label: '抽象层', position: 8 },
  websocket: { label: 'WebSocket', position: 9 },
  robotics: { label: '机器人技术', position: 10 },

  // evaluation 下的子类别
  'seed-driven-evaluation': { label: 'Seed 驱动评估', position: 1 },
};

/**
 * 为目录生成 _category_.json
 */
function writeCategoryJson(dirPath, dirName) {
  const config = CATEGORY_LABELS[dirName] || {
    label: dirName,
    position: 99,
  };

  const categoryFile = path.join(dirPath, '_category_.json');
  fs.writeJsonSync(categoryFile, {
    label: config.label,
    position: config.position,
    collapsible: true,
    collapsed: true,
    link: {
      type: 'generated-index',
      description: `${config.label}相关文档`,
    },
  }, { spaces: 2 });
}

/**
 * 处理单个 Markdown 文件：增强 frontmatter
 */
function processMarkdownFile(srcFile, destFile) {
  const content = fs.readFileSync(srcFile, 'utf-8');
  const parsed = matter(content);

  // 从标题或文件名生成 sidebar_label
  if (!parsed.data.sidebar_label) {
    const titleMatch = parsed.content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      parsed.data.sidebar_label = titleMatch[1].trim();
    }
  }

  // 将 tags 字符串转为数组（兼容逗号分隔格式）
  if (typeof parsed.data.tags === 'string') {
    parsed.data.tags = parsed.data.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  const output = matter.stringify(parsed.content, parsed.data);
  fs.ensureDirSync(path.dirname(destFile));
  fs.writeFileSync(destFile, output, 'utf-8');
}

/**
 * 递归同步目录
 */
function syncDirectory(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.log(`  跳过不存在的目录: ${srcDir}`);
    return;
  }

  fs.ensureDirSync(destDir);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      syncDirectory(srcPath, destPath);
      writeCategoryJson(destPath, entry.name);
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      processMarkdownFile(srcPath, destPath);
    }
  }
}

// ── 主流程 ──────────────────────────────────

console.log('同步文档到 website/docs/ ...\n');

// 清理旧数据
fs.removeSync(WEBSITE_DOCS);

// 同步 learns
const learnsSrc = path.join(REPO_DOCS, 'learns');
const learnsDest = path.join(WEBSITE_DOCS, 'learns');
console.log(`同步学习笔记: ${learnsSrc}`);
syncDirectory(learnsSrc, learnsDest);

// 同步 best-choices
const bestSrc = path.join(REPO_DOCS, 'best-choices');
const bestDest = path.join(WEBSITE_DOCS, 'best-choices');
console.log(`同步最佳实践: ${bestSrc}`);
syncDirectory(bestSrc, bestDest);

// 为每个 docs 实例生成 index.md 首页（Docusaurus 需要一个根文档作为 landing page）
const learnsIndex = `---
sidebar_position: 0
sidebar_label: 概览
slug: /
---

# 学习笔记

跨框架的 Agent 模式深度分析，按仓库类别组织。

浏览左侧目录查看所有主题。
`;

const bestChoicesIndex = `---
sidebar_position: 0
sidebar_label: 概览
slug: /
---

# 最佳实践

从多个框架中提炼的设计建议，包含决策矩阵和具体代码示例。

浏览左侧目录查看所有文档。
`;

fs.writeFileSync(path.join(learnsDest, 'index.md'), learnsIndex, 'utf-8');
fs.writeFileSync(path.join(bestDest, 'index.md'), bestChoicesIndex, 'utf-8');
console.log('生成 index.md 首页');

// 复制 tags.yml 到每个 docs 子目录（Docusaurus 要求 tags 文件在 docs path 内）
const TAGS_FILE = path.resolve(WEBSITE_DIR, 'tags.yml');
if (fs.existsSync(TAGS_FILE)) {
  fs.copySync(TAGS_FILE, path.join(learnsDest, 'tags.yml'));
  fs.copySync(TAGS_FILE, path.join(bestDest, 'tags.yml'));
  console.log('复制 tags.yml 到 docs 子目录');
}

// 统计
const countFiles = (dir) => {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.md')) count++;
    }
  };
  walk(dir);
  return count;
};

console.log(`\n同步完成`);
console.log(`  学习笔记: ${countFiles(learnsDest)} 篇`);
console.log(`  最佳实践: ${countFiles(bestDest)} 篇`);
