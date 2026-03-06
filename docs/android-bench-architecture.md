# Android Bench 架构设计分析

## 概述

Android Bench 是一个用于在 Android 开发任务上评估大型语言模型 (LLM) 的框架。它评估 AI 模型理解移动代码库、生成准确补丁和解决 Android 特定工程问题的能力。

**项目地址**: https://github.com/android-bench/android-bench

## 核心设计理念

### 1. 两阶段基准测试
- **推理阶段 (Inference/Agent)**: Agent 读取问题描述，生成代码补丁
- **评估阶段 (Evaluation/Verifier)**: 应用补丁并运行测试来评分解决方案

### 2. Docker 隔离环境
- 任务在隔离的 Docker 容器中运行
- 每个任务有特定的 Docker 镜像
- 确保可重现的执行环境

### 3. 基于任务的数据集
- 每个任务是一个真实的 Android 开发问题
- 包含问题描述、基线代码、测试用例和验收标准

### 4. 多模型支持
- 通过 LiteLLM 集成支持多种模型
- 默认支持 Gemini、OpenAI 等模型
- 可扩展至其他兼容的 LLM

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Android Bench Framework                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────────────────────────────────┐     │
│  │   CLI       │───▶│           Harness (核心引擎)              │     │
│  │ (run_task) │    ├─────────────────────────────────────────┤     │
│  └─────────────┘    │  ┌─────────────┐    ┌─────────────┐  │     │
│                     │  │ Inference   │    │ Evaluation   │  │     │
│  ┌─────────────┐    │  │  (Agent)    │    │  (Verifier)  │  │     │
│  │  Dataset    │───▶│  │             │    │              │  │     │
│  │ Explorer    │    │  │ • Prompt    │    │ • Apply patch│  │     │
│  └─────────────┘    │  │ • LLM call  │    │ • Run tests │  │     │
│                     │  │ • Generate  │    │ • Score     │  │     │
│  ┌─────────────┐    │  │   patch     │    │ • Report    │  │     │
│  │   Results   │◀───│  └─────────────┘    └─────────────┘  │     │
│  │ Visualizer  │    └─────────────────────────────────────────┘     │
│  └─────────────┘                        │                          │
│                                        ▼                          │
│                     ┌─────────────────────────────────────────┐      │
│                     │         Docker Container                │      │
│                     │  ┌─────────────────────────────────┐   │      │
│                     │  │   Android SDK + Gradle + Tests  │   │      │
│                     │  │   Task-specific environment     │   │      │
│                     │  └─────────────────────────────────┘   │      │
│                     └─────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. CLI 工具

**文件**: `cli/`

| 命令 | 用途 |
|------|------|
| `run_task` | 运行单个任务的完整流程 (推理 + 评估) |
| `agent` | 仅运行推理阶段 |
| `verifier` | 仅运行评估阶段 |
| `benchmark` | 运行完整基准测试套件 |
| `build_images` | 构建 Docker 镜像 |
| `dataset` | 数据集浏览器 |
| `results` | 结果可视化 |

```python
# run_task.py 示例
def main():
    # 1. 构建本地镜像 (如需要)
    subprocess.run(build_command)

    # 2. 运行 Agent 生成补丁
    subprocess.run(agent_command)

    # 3. 运行 Verifier 评估
    subprocess.run(verifier_command)
```

### 2. 推理引擎 (Inference)

**文件**: `harness/inference/`

```python
# androidbench.py - Agent 实现
class AndroidBenchAgent:
    async def run(self, task: Task, model: str) -> Patch:
        # 1. 加载任务
        task_data = self.load_task(task)

        # 2. 构建提示
        prompt = self.build_prompt(task_data)

        # 3. 调用 LLM
        response = await self.llm.chat(prompt)

        # 4. 解析补丁
        patch = self.parse_patch(response)

        return patch
```

### 3. 评估引擎 (Evaluation)

**文件**: `harness/evaluation/`

```python
# harness.py - Verifier 实现
class EvaluationHarness:
    def evaluate(self, task: Task, patch: Patch) -> Score:
        # 1. 在 Docker 容器中执行
        with self.docker_container(task) as container:
            # 2. 应用补丁
            container.apply_patch(patch)

            # 3. 构建项目
            container.run_commands(task.commands.build)

            # 4. 运行测试
            test_results = container.run_tests(task.commands.unit_test)

        # 5. 评分
        score = self.calculate_score(test_results, task.acceptance_criteria)

        return score
```

### 4. 数据集结构

**文件**: `dataset/tasks/<task_id>/task.yaml`

```yaml
instance_id: "Owner__repo-pr_123"
task_type: "bugfix"
category_ids: ["compose", "hilt"]

description: |
  # 问题描述
  当用户点击按钮时，应用崩溃...

repository:
  owner: "google"
  name: "compose-samples"

before_commit:
  sha: "abc123"
  java_version: 17
  target_sdk: 34

commands:
  build: ["./gradlew assembleDebug"]
  unit_test: ["./gradlew testDebugUnitTest"]

acceptance_criteria:
  fail_to_pass:
    - "com.example.MainActivityTest#testButtonClick"
  pass_to_pass:
    - "com.example.utils.*"
```

### 5. 数据集获取流程

1. **来源**:
   - GitHub Pull Requests (来自过去 3 年的热门 Android 仓库)
   - 专家编写 (针对关键领域)

2. **技术审查**:
   - 可重现性验证
   - 测试适用性验证
   - 工程审查

3. **清理**:
   - 去除 PII
   - 添加 canary 字符串防止数据污染

## 工作流程

```
┌────────────────────────────────────────────────────────────────────┐
│                      完整基准测试流程                                │
└────────────────────────────────────────────────────────────────────┘

1. 用户执行命令
   $ run_task --model gemini/gemini-2.5-flash --task android_snippets_1

2. CLI 编排
   ├── 2.1 检查/构建 Docker 镜像
   ├── 2.2 运行 Agent (推理)
   │      └── Agent 读取问题描述
   │      └── 构建提示
   │      └── 调用 LLM
   │      └── 生成补丁
   └── 2.3 运行 Verifier (评估)
          └── 启动 Docker 容器
          └── 应用补丁
          └── 构建项目
          └── 运行测试
          └── 评分

3. 输出结果
   └── scores.json
   └── 补丁文件
   └── 日志
```

## 验收标准

```yaml
acceptance_criteria:
  # 必须失败的测试 (基线有 bug) → 修复后通过
  fail_to_pass:
    - "com.example.CrashTest#testButtonDoesNotCrash"

  # 必须一直通过的测试 (回归测试)
  pass_to_pass:
    - "com.example.utils.*"
```

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | Python 3.14+ | CLI 和核心逻辑 |
| 包管理 | uv | 快速 Python 包安装 |
| 容器化 | Docker | 隔离执行环境 |
| LLM 集成 | LiteLLM | 多模型支持 |
| 测试 | pytest | 单元和集成测试 |
| 虚拟化 | KVM | ARM64 模拟 (x86 主机) |

## 关键设计决策

### 1. 为什么两阶段分离？
- **灵活性**: 可以单独运行推理或评估
- **调试**: 方便单独调试每个阶段
- **缓存**: 生成的补丁可以重复评估

### 2. 为什么用 Docker？
- **可重现性**: 固定的 Android SDK 和 Gradle 版本
- **隔离性**: 测试不会影响主机环境
- **一致性**: 不同机器上结果一致

### 3. 为什么用任务特定镜像？
- **优化**: 每个任务只需要必要的依赖
- **速度**: 避免每次都下载所有依赖
- **隔离**: 不同任务的构建环境完全隔离

## 局限性

1. **磁盘空间**: 基础镜像 + 仓库镜像 + 任务镜像可能需要 40GB+
2. **ARM64 限制**: macOS 上无法运行嵌套虚拟化，Android SDK 只提供 x86_64
3. **首次冷启动**: 首次运行需要 5-10 分钟构建镜像

## 使用示例

```bash
# 发现任务
dataset
dataset browse --category compose

# 运行单个任务
run_task --model gemini/gemini-2.5-flash --task android_snippets_1

# 运行基准测试
benchmark --model gemini/gemini-2.5-flash --num_runs 5

# 可视化结果
results --input-dir our

# 测试验证器
verifier --test-run --run-name oracle-agent
```

## 参考资料

- [Android Bench GitHub](https://github.com/android-bench/android-bench)
- [mini-swe-agent](https://www.mini-swe-agent.com) - 推理引擎
- [LiteLLM](https://github.com/BerriAI/litellm) - 多模型集成
