---
tags: agent-architecture, livekit, voice-ai, realtime, websocket, webRTC
---

# LiveKit Agents 架构设计分析

> **Related topics**: [[agent-architecture]], [[voice-ai]], [[realtime-systems]]

## 概述

LiveKit Agents 是一个用于构建**实时语音、视频和物理 AI Agent**的开源框架。Agent 代码作为**有状态的实时桥接器**，连接强大的 AI 模型与用户。

**官方文档**: https://docs.livekit.io/agents/
**GitHub**: https://github.com/livekit/agents
**特性**: WebRTC 传输、多模态支持（语音/音频/文本/视觉）、实时对话检测、生产级部署支持

---

## 1. 核心架构

### 1.1 Agent Session（会话）

`AgentSession` 是 Voice AI 应用的主编排器，负责：

- 收集用户输入
- 管理语音管道（STT → LLM → TTS）
- 调用 LLM
- 发送输出回用户
- 发出可观测性事件

```python
session = AgentSession(
    stt="deepgram/nova-3:en",
    llm="openai/gpt-4.1-mini",
    tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    vad=silero.VAD.load(),
    turn_handling=TurnHandlingOptions(
        turn_detection=MultilingualModel(),
    ),
)
```

### 1.2 会话生命周期

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│Initializing │ ──► │  Starting   │ ──► │   Running   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                   ┌─────────────┐     ┌─────────────┐
                   │   Closing   │ ◄── │ Agent State │
                   └─────────────┘     │ transitions:│
                                      │ listening  │
                                      │ thinking   │
                                      │ speaking   │
                                      └─────────────┘
```

Agent 状态：`initializing` → `listening` → `thinking` → `speaking`

### 1.3 Agent Server

Agent Server 管理 Agent 的生命周期：

1. **注册到 LiveKit Server**（自托管或 LiveKit Cloud）
2. **等待 dispatch 请求**
3. **启动 Job 子进程**加入 room

```
Agent Server Process
       │
       ├── Registers with LiveKit Server
       │
       ├── Waits for dispatch request
       │
       └── Spawns Job subprocess ──► Joins LiveKit Room
```

---

## 2. 核心构建块

### 2.1 Components 概览

| Component | 描述 | 使用场景 |
|-----------|------|---------|
| **Agent Sessions** | 主编排器，管理输入收集、管道、输出 | 单 Agent 应用、会话生命周期 |
| **Tasks & Task Groups** | 执行特定目标的聚焦单元 | 同意收集、结构化数据捕获 |
| **Workflows** | 用 Agent、Handoff、Task 建模可重复模式 | 多角色系统、对话阶段管理 |
| **Tool Definition** | LLM 可调用的自定义函数 | API 集成、前端 RPC |
| **Pipeline Nodes & Hooks** | 在管道处理点自定义行为 | 自定义 providers、输出修改 |
| **Turn Detection** | 管理对话流程的 turn 检测和中断处理 | 自然对话时机、打断管理 |
| **Agents & Handoffs** | 定义不同推理行为并转移控制 | 基于角色的 Agent、模型专业化 |

### 2.2 Agent vs Task

| 特性 | Agent | Task |
|------|-------|------|
| 生命周期 | 持久化，控制会话 | 临时执行，完成后返回 |
| 控制权 | 长期持有，可转移 | 临时持有，执行完交回 |
| 用途 | 定义核心 AI 逻辑、指令、工具 | 封装离散操作、结构化数据捕获 |

### 2.3 Workflow 架构

```
┌──────────────────────────────────────────────────────────────┐
│                    AgentSession (Orchestrator)               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Agent A   │───►│   Agent B   │───►│   Agent C   │    │
│   │ (Primary)   │    │ (Specialist)│    │ (Escalation)│    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                   │
│                            ▼                                   │
│                    ┌─────────────────┐                        │
│                    │   Task Group    │                        │
│                    │ (Multi-step)    │                        │
│                    └─────────────────┘                        │
│                            │                                   │
│                            ▼                                   │
│                    ┌─────────────────┐                        │
│                    │     Tools       │                        │
│                    │ (Function Calls)│                        │
│                    └─────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 实时语音管道

### 3.1 STT-LLM-TTS Pipeline

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│   VAD   │ ──► │   STT   │ ──► │   LLM   │ ──► │   TTS   │
│ (Voice  │     │ (Speech │     │ (Reason │     │ (Speech │
│ Activity│     │to Text) │     │  ing)   │     │Synthesis)│
│Detect)  │     └─────────┘     └─────────┘     └─────────┘
└─────────┘
```

### 3.2 Multimodality

LiveKit Agents 支持多种输入输出模式：

| 模态 | 输入 | 输出 |
|------|------|------|
| **Speech/Audio** | 实时音频流 | 实时语音合成 |
| **Text** | 文本消息 | 文本响应、转录 |
| **Vision** | 视频帧 | 视觉理解响应 |

### 3.3 Turn Detection & Interruptions

关键特性：流式音频处理 + 实时打断支持

- **MultilingualModel**: 自定义 turn 检测模型
- **Interruption handling**: 支持用户打断 Agent 说话
- **Push-to-talk**: 可配置的手动 turn 控制

---

## 4. 连接架构

### 4.1 How Agents Connect to LiveKit

```
┌─────────────┐      WebRTC       ┌─────────────┐
│  Frontend   │ ◄────────────────► │ LiveKit     │
│   (User)    │                    │   Server    │
└─────────────┘                    └──────┬──────┘
                                          │
                                          │ HTTP/WebSocket
                                          │
                                   ┌──────▼──────┐
                                   │  Agent      │
                                   │  Server     │
                                   └──────┬──────┘
                                          │
                                          │ API Calls
                                   ┌──────▼──────┐
                                   │  AI Models  │
                                   │  (LLM/STT/  │
                                   │   TTS)      │
                                   └─────────────┘
```

### 4.2 WebRTC 传输

- WebRTC 确保 Agent 与用户之间即使在网络条件不稳定时也能平滑通信
- LiveKit WebRTC 用于前端和 Agent 之间
- Agent 与后端使用 HTTP 和 WebSocket 通信

---

## 5. 生产级特性

### 5.1 Deployment

- **LiveKit Cloud**: 托管部署，内置可观测性（transcripts、traces）、LiveKit Inference
- **Self-hosted**: 任何自定义环境
- **Kubernetes**: 原生支持

### 5.2 Agent Server Features

| 特性 | 描述 |
|------|------|
| **Dispatch** | 自动或显式分发 Agent 到 room |
| **Load Balancing** | 自动负载均衡 |
| **Graceful Shutdown** | 优雅关闭 |
| **Job Lifecycle** | 完整的 Job 管理 |

### 5.3 模型支持

支持多种 AI 提供商和模型：

- **LLM**: OpenAI, Google, Azure, AWS, xAI, Groq, Cerebras
- **STT**: Deepgram, Whisper, etc.
- **TTS**: Cartesia, ElevenLabs, etc.
- **Realtime APIs**: OpenAI Realtime, Google Gemini

---

## 6. 事件系统

### 6.1 Session Events

| Event | 描述 |
|-------|------|
| `agent_state_changed` | Agent 状态变化（listening → thinking → speaking） |
| `user_state_changed` | 用户状态变化 |
| `user_input_transcribed` | 用户语音转文字 |
| `conversation_item_added` | 消息添加到对话历史 |
| `close` | 会话关闭 |

---

## 7. 技术栈

| 组件 | 技术 |
|------|------|
| **SDK** | Python, Node.js |
| **传输** | WebRTC |
| **协议** | HTTP, WebSocket |
| **部署** | Kubernetes, LiveKit Cloud |
| **开源许可** | Apache 2.0 |

---

## 8. 使用场景

- **多模态助手**: 语音、文本、屏幕共享
- **远程医疗**: AI 辅助实时医疗咨询
- **呼叫中心**: 客服 AI，呼入/呼出支持
- **实时翻译**: 实时对话翻译
- **NPC**: 基于语言模型的逼真 NPC
- **机器人**: 云端机器人"大脑"

---

## 9. 参考资料

- [LiveKit Agents 文档](https://docs.livekit.io/agents/)
- [LiveKit Agents GitHub](https://github.com/livekit/agents)
- [LiveKit 官方介绍](https://docs.livekit.io/intro/)
- [Voice AI Quickstart](https://docs.livekit.io/agents/start/voice-ai/)
