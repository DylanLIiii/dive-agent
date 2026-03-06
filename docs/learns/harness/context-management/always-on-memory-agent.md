---
tags: context-management, memory-agent, persistent-memory, active-consolidation, google-adk
---

# Always-On Memory Agent - 持续记忆 Agent 设计

> **Related topics**: [[session-history-management]], [[context-management-dual-mode]]

## 概述

本文分析 Google 的 Always-On Memory Agent，这是一个解决 AI Agent "失忆症" 问题的持久记忆系统。

**项目地址**: https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/agents/always-on-memory-agent

---

## 1. 核心问题：Agent 的 "失忆症"

| 方案 | 局限性 |
|------|--------|
| Vector DB + RAG | 被动 - 一次性嵌入，之后检索，无主动处理 |
| 对话摘要 | 随时间丢失细节，无交叉引用 |
| 知识图谱 | 构建和维护成本高 |

**核心差距**: 没有系统像人脑一样主动整合信息。睡眠时，大脑会重播、连接和压缩信息。这个 Agent 正是做这件事。

---

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     Always-On Memory Agent                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │  File Watcher │───▶│   IngestAgent    │───▶│  Memory DB  │ │
│  │  (./inbox)   │    │  (多模态提取)    │    │  (SQLite)   │ │
│  └──────────────┘    └──────────────────┘    └──────┬──────┘ │
│                                                     │          │
│                              ┌───────────────────────┘          │
│                              ▼                                  │
│  ┌──────────────┐    ┌──────────────────┐                     │
│  │  QueryAgent  │◀───│  Query Request   │                     │
│  │  (带引用)    │    └──────────────────┘                     │
│  └──────┬───────┘                                              │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────────┐                     │
│  │Consolidate   │───▶│  定时 (30分钟)   │                     │
│  │Agent         │    │  主动整合        │                     │
│  └──────────────┘    └──────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 三个专用 Agent

| Agent | 职责 | 触发方式 |
|-------|------|----------|
| **IngestAgent** | 从文件提取结构化信息 | 文件放入 inbox / HTTP API / Dashboard |
| **ConsolidateAgent** | 查找记忆间的连接，生成跨域洞察 | 定时器 (默认30分钟) |
| **QueryAgent** | 读取所有记忆，综合答案并带引用 | 查询请求 |

---

## 3. 核心机制

### 3.1 Ingest (摄取)

支持 27 种文件类型：
- **文本**: .txt, .md, .json, .csv, .log, .xml, .yaml, .yml
- **图片**: .png, .jpg, .jpeg, .gif, .webp, .bmp, .svg
- **音频**: .mp3, .wav, .ogg, .flac, .m4a, .aac
- **视频**: .mp4, .webm, .mov, .avi, .mkv
- **文档**: .pdf

三种摄取方式：
1. **文件监控**: 将文件放入 `./inbox` 文件夹
2. **Dashboard 上传**: Streamlit 界面上传
3. **HTTP API**: `POST /ingest`

```bash
# 方式一：放入文件
echo "重要信息" > inbox/notes.txt
cp photo.jpg inbox/

# 方式二：HTTP API
curl -X POST http://localhost:8888/ingest \
  -H "Content-Type: application/json" \
  -d '{"text": "AI agents are the future", "source": "article"}'
```

### 3.2 Consolidate (整合)

ConsolidateAgent 每 30 分钟运行一次，像人脑睡眠时一样：
- 回顾未整合的记忆
- 查找它们之间的联系
- 生成跨域洞察
- 压缩相关信息

```python
# 核心逻辑伪代码
async def consolidate():
    unconsolidated = memory_db.get_unconsolidated()
    for memory in unconsolidated:
        # 1. 找关联
        related = find_related(memory, all_memories)
        # 2. 生成洞察
        insight = generate_insight(memory, related)
        # 3. 压缩
        compressed = compress(memory, related)
        memory_db.save(compressed)
    memory_db.mark_consolidated(unconsolidated)
```

### 3.3 Query (查询)

QueryAgent 读取所有记忆和整合洞察，综合答案并带源引用：

```bash
curl "http://localhost:8888/query?q=what+do+you+know"

# 返回示例
{
  "answer": "Based on your memories...",
  "sources": [
    {"memory_id": "1", "content": "..."},
    {"memory_id": "5", "content": "..."}
  ]
}
```

---

## 4. API 参考

| 端点 | 方法 | 描述 |
|------|------|------|
| `/status` | GET | 记忆统计 (数量) |
| `/memories` | GET | 列出所有存储的记忆 |
| `/ingest` | POST | 摄取新文本 |
| `/query?q=...` | GET | 用问题查询记忆 |
| `/consolidate` | POST | 手动触发整合 |
| `/delete` | POST | 删除记忆 |
| `/clear` | POST | 删除所有记忆 (重置) |

---

## 5. 为什么选择 Gemini 3.1 Flash-Lite?

这个 Agent 持续运行，成本和速度比原始智能更重要：

- **快速**: 低延迟摄取和检索
- **便宜**: 每会话成本可忽略，使 24/7 运行可行
- **足够智能**: 提取结构、找联系、综合答案

---

## 6. 与其他方案的对比

### 被动 vs 主动

| 类型 | 行为 | 示例 |
|------|------|------|
| **被动** | 问才答，不问不想 | Vector DB + RAG |
| **主动** | 持续学习，定期整合 | Always-On Memory Agent |

### NanoClaw 的记忆系统 vs Always-On Memory Agent

| 特性 | NanoClaw | Always-On Memory |
|------|----------|------------------|
| 存储 | SQLite + CLAUDE.md | SQLite |
| 整合 | 无 | 定时主动整合 |
| 多模态 | 有限 | 支持 27 种文件类型 |
| 引用 | 无 | 带源引用 |

---

## 7. 关键洞察

1. **主动记忆 > 被动检索**: 不是等问问题了才去 RAG，而是持续学习、整合
2. **像人脑一样**: 睡眠时整合记忆，定期 "复习"
3. **轻量级模型足够**: 对于后台处理，速度和成本比原始智能更重要
4. **多模态重要**: 支持直接摄取图片、音频、视频

---

## 参考资料

- [Always-On Memory Agent GitHub](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/agents/always-on-memory-agent)
- [Google ADK](https://google.github.io/adk-docs/)
- [Gemini 3.1 Flash-Lite](https://cloud.google.com/vertex-ai/docs/gemini-model-overview)
