# VAD 语音活动检测

语音活动检测（Voice Activity Detection）相关的学习笔记。

---

## 主题

### [VAD 架构与实现](./livekit-vad-architecture.md)

详细分析 LiveKit Agents 中 VAD 模块的架构设计、Silero 实现、CPU 部署及与其他模块的协作关系。

| 属性 | 值 |
|------|-----|
| 框架 | livekit-agents |
| 优先级 | P1 |
| 标签 | vad, silero, streaming, voice-activity-detection |

---

## 核心内容

1. **核心抽象层** - VAD, VADStream, VADEvent 类型体系
2. **Silero VAD 实现** - ONNX 模型推理、配置参数
3. **CPU 部署** - 默认 CPU 推理、生产环境建议
4. **模块协作** - VAD + STT、VAD + AgentSession、VAD + Turn Detection

---

*最后更新：2026-03-21*
