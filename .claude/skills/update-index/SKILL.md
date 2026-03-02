---
name: update-index
description: |
  根据 docs/ 的最新更改更新 README 索引。当文件在 docs/learns/ 或 docs/best-choices/ 中被添加/删除/重命名、用户提到"update index"、"更新索引"、"sync readme"或创建新学习笔记后使用此技能。确保所有文档索引一致完整。
---

# 更新索引

将所有 README 索引与实际文档文件同步。

## 何时使用

- 添加新学习笔记后
- 删除或重命名文档后
- 重新组织类别后
- 用户要求"更新索引"或"同步 readme"
- 定期确保一致性

## 步骤

### 1. 扫描所有文档

扫描 `docs/learns/` 和 `docs/best-choices/` 获取实际文件列表：

```bash
# 扫描各父类别
find docs/learns/harness -name "*.md" -type f | sort
find docs/learns/evaluation -name "*.md" -type f | sort
find docs/learns/training -name "*.md" -type f | sort

find docs/best-choices -name "*.md" -type f | sort
```

### 2. 更新 docs/learns/README.md

作为学习笔记的主索引：

1. 更新 Harness 类别的主题表格
2. 更新 Evaluation 类别的主题表格（如有新主题）
3. 更新 Training 类别的主题表格（如有新主题）
4. 更新按优先级分类的全局列表

### 3. 更新 docs/learns/{harness,evaluation,training}/README.md

对于每个父类别：

1. 列出该类别中的所有主题子目录
2. 确保 README 包含所有主题部分
3. 每个主题部分格式：

```markdown
### [主题名称](./<主题>/)

| 文档 | 描述 | 优先级 |
|------|------|--------|
| [文档标题](./<主题>/<文件名>.md) | <第一行或描述> | P0/P1/P2 |
```

### 4. 更新 docs/README.md

如果需要，更新主文档索引中的引用。

### 5. 更新根 README.md

更新文档部分：

1. 统计每个父类别的文档数
2. 更新 Harness 主题表格的计数
3. 如 Evaluation 或 Training 有内容，添加对应部分
4. 更新总计统计

### 6. 更新 docs/best-choices/README.md

确保 `docs/best-choices/` 中的所有文件都已列出。

### 7. 验证交叉引用

检查所有相对链接是否有效：
- 从 learns/README.md 到各父类别的链接
- 从各父类别 README 到主题文档的链接
- 从 docs/README.md 到 learns 的链接
- 从根 README.md 到 learns 的链接
- 文档间的相互链接

### 8. 更新最后更新日期

更新以下文件的"最后更新"日期：
- `docs/learns/README.md`
- `docs/learns/harness/README.md`
- `docs/learns/evaluation/README.md`
- `docs/learns/training/README.md`
- `docs/README.md`
- `README.md`

## 示例

用户："更新索引，我添加了一些新笔记"

操作：
1. 扫描 `docs/learns/harness/**/*.md`
2. 扫描 `docs/learns/evaluation/**/*.md`
3. 扫描 `docs/learns/training/**/*.md`
4. 更新 `docs/learns/harness/README.md`
5. 更新 `docs/learns/evaluation/README.md`
6. 更新 `docs/learns/training/README.md`
7. 更新 `docs/learns/README.md` 主索引
8. 更新 `README.md` 中的计数
9. 验证所有链接

## 输出格式

报告所做的更改：

```
索引更新摘要：
- 添加 3 个新条目到 docs/learns/harness/README.md
- 添加 1 个新条目到 docs/learns/evaluation/README.md
- 更新 docs/learns/README.md 主索引
- 更新 README.md 中的计数
- 修复 2 个损坏链接
- 最后更新：2026-03-02
```

## 修改的文件

- `docs/learns/README.md` - 学习笔记主索引
- `docs/learns/harness/README.md` - Harness 类别索引
- `docs/learns/evaluation/README.md` - Evaluation 类别索引
- `docs/learns/training/README.md` - Training 类别索引
- `docs/README.md` - 主文档索引
- `README.md` - 根 README 统计
- `docs/best-choices/README.md` - 最佳实践索引

## 验证

1. `docs/learns/harness/` 中的所有文件出现在 `docs/learns/harness/README.md`
2. `docs/learns/evaluation/` 中的所有文件出现在 `docs/learns/evaluation/README.md`
3. `docs/learns/training/` 中的所有文件出现在 `docs/learns/training/README.md`
4. 各父类别的统计出现在 `docs/learns/README.md`
5. `README.md` 中的计数与实际文件数匹配
6. 没有损坏的相对链接

## 目录结构

```
docs/learns/
├── README.md              # 主索引
├── harness/
│   ├── README.md          # Harness 类别索引
│   └── <主题>/            # 主题子目录
├── evaluation/
│   ├── README.md          # Evaluation 类别索引
│   └── <主题>/
└── training/
    ├── README.md          # Training 类别索引
    └── <主题>/
```
