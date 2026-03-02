---
name: add-learn-category
description: |
  添加新的学习笔记类别到 docs/learns/。当用户想要创建新的学习笔记主题类别、提到"add learn category"、"新增学习类别"、"创建文档分类"或在 新主题下组织笔记时使用此技能。
---

# 添加学习类别

添加新的主题类别用于组织学习笔记。

## 必需输入

请询问用户：

1. **类别名称**（必需）：kebab-case 名称，例如 `memory-management`
2. **显示名称**（可选）：人类可读名称，例如"内存管理"
3. **描述**（可选）：此类别涵盖什么

## 步骤

### 1. 确定父类别

确定新类别属于哪个父类别：
- **harness** - Agent 框架和编排工具相关
- **evaluation** - Agent 评估和测试相关
- **training** - Agent 训练和微调相关

### 2. 创建目录

```bash
mkdir -p docs/learns/<父类别>/<类别名称>
```

### 2. 验证名称

- 必须是 kebab-case（小写、连字符）
- 不能已存在于 `docs/learns/harness/`、`docs/learns/evaluation/` 或 `docs/learns/training/`

### 3. 更新 docs/learns/<父类别>/README.md

在相应父类别 README 中添加新主题部分：

```markdown
### [<显示名称>](./<类别名称>/)
<描述>

| 文档 | 描述 | 优先级 |
|------|------|--------|
| *暂无* | - | - |
```

### 4. 更新 docs/learns/README.md

在对应父类别表格中添加主题条目：

```markdown
| [<显示名称>](./<父类别>/<类别名称>/) | <描述> | 0 |
```

### 5. 更新 docs/README.md

如果需要在主文档索引中显示，添加对应条目。

### 6. 更新根 README.md

如果在 harness 类别下，更新"Harness 主题"表格；
如果是 evaluation 或 training 的第一个主题，添加对应类别部分。

## 示例

用户："Add a category for memory management patterns in harness"

操作：
1. 确定父类别：`harness`
2. 创建 `docs/learns/harness/memory-management/`
3. 在 `docs/learns/harness/README.md` 添加主题条目
4. 在 `docs/learns/README.md` Harness 类别表格中添加条目
5. 更新 `README.md` Harness 主题表格

## 修改的文件

- `docs/learns/<父类别>/<类别>/` - 新目录
- `docs/learns/<父类别>/README.md` - 添加主题部分
- `docs/learns/README.md` - 更新父类别表格
- `README.md` - 更新文档表格（如需要）

## 验证

1. 目录存在：`ls docs/learns/<父类别>/<类别>/`
2. `docs/learns/<父类别>/README.md` 包含新主题
3. `docs/learns/README.md` 包含新条目
4. `README.md` 表格包含新条目（如需要）

## Tags 说明

新类别创建后，该类别下的学习笔记应使用类别名称作为 tag。例如：

- `docs/learns/harness/streaming/` 下的笔记使用 tag: `streaming`
- `docs/learns/harness/error-handling/` 下的笔记使用 tag: `error-handling`
- `docs/learns/evaluation/benchmarks/` 下的笔记使用 tag: `benchmarks`

这确保 Wiki 能正确按主题分组显示文档。

## 目录结构

```
docs/learns/
├── README.md          # 分类入口
├── harness/           # 框架相关学习笔记
│   ├── README.md
│   └── <主题>/        # 各主题子目录
├── evaluation/        # 评估相关学习笔记
│   ├── README.md
│   └── <主题>/
└── training/          # 训练相关学习笔记
    ├── README.md
    └── <主题>/
```
