/**
 * generate-tags.js
 *
 * 扫描所有同步后的 Markdown 文件，提取 tags 字段，
 * 将新发现的标签追加到 tags.yml。
 */

const fs = require('fs-extra');
const path = require('path');
const matter = require('gray-matter');

const WEBSITE_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.resolve(WEBSITE_DIR, 'docs');
const TAGS_FILE = path.resolve(WEBSITE_DIR, 'tags.yml');

/**
 * 递归收集所有 .md 文件
 */
function collectMarkdownFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 从文件中提取 tags
 */
function extractTags(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data } = matter(content);

  if (!data.tags) return [];

  if (Array.isArray(data.tags)) return data.tags;
  if (typeof data.tags === 'string') {
    return data.tags.split(',').map(t => t.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 解析现有 tags.yml 中已定义的标签 key
 */
function parseExistingTagKeys(tagsContent) {
  const keys = new Set();
  const lines = tagsContent.split('\n');
  for (const line of lines) {
    // 匹配顶级 key（不以空格开头，以冒号结尾）
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*$/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

// ── 主流程 ──────────────────────────────────

console.log('扫描文档标签...\n');

const mdFiles = collectMarkdownFiles(DOCS_DIR);
const allTags = new Set();

for (const file of mdFiles) {
  const tags = extractTags(file);
  tags.forEach(tag => allTags.add(tag));
}

console.log(`  扫描了 ${mdFiles.length} 个文件`);
console.log(`  发现 ${allTags.size} 个标签: ${[...allTags].join(', ')}`);

// 读取现有 tags.yml
let tagsContent = '';
if (fs.existsSync(TAGS_FILE)) {
  tagsContent = fs.readFileSync(TAGS_FILE, 'utf-8');
}

const existingKeys = parseExistingTagKeys(tagsContent);
const newTags = [...allTags].filter(tag => !existingKeys.has(tag));

if (newTags.length > 0) {
  console.log(`\n追加 ${newTags.length} 个新标签: ${newTags.join(', ')}`);

  let appendContent = '\n# 自动发现的标签\n';
  for (const tag of newTags.sort()) {
    appendContent += `${tag}:\n`;
    appendContent += `  label: ${tag}\n`;
    appendContent += `  permalink: /${tag}\n`;
    appendContent += `  description: 自动发现的标签\n\n`;
  }

  fs.appendFileSync(TAGS_FILE, appendContent, 'utf-8');
} else {
  console.log('\n所有标签已存在于 tags.yml 中');
}

console.log('标签生成完成');
