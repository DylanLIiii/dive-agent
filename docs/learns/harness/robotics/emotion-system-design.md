---
tags: robotics, emotion, animation, audio-sync, state-machine
---

# 机器人情绪系统设计

> **范围**：Reachy Mini 机器人的情绪动作系统设计，涵盖情绪/舞蹈/呼吸状态切换、音效同步、产品鲜活感设计
>
> **综合自**：reachy-mini-conversation-app
>
> **优先级**：P0

---

## 概述

Reachy Mini 的情绪系统是一个精心设计的分层动画架构，它将机器人的"鲜活感"（aliveness）分解为多个独立的运动层，并通过智能融合创造出自然、持续的交互体验。这个系统的核心思想是：**机器人永远不应该完全静止**。

系统采用"主要动作 + 次要偏移"的双层融合架构，在 100Hz 控制循环中实时合成最终姿态。情绪动作、舞蹈、头部定位和呼吸状态作为主要动作顺序执行，而语音摆动和人脸追踪作为次要偏移叠加在主要动作之上。

---

## 核心架构

### 1. 分层运动系统

#### 主要动作（Primary Moves）

主要动作是互斥的、顺序执行的运动：

```
队列顺序：情绪 → 舞蹈 → Goto 定位 → 呼吸
```

**代码实现**（`moves.py`）：

```python
class MovementManager:
    """协调顺序动作、附加偏移和机器人输出（100Hz）。

    职责：
    - 拥有实时循环，采样当前主要动作，融合次要偏移，调用 set_target
    - 在 idle_inactivity_delay 后启动 BreathingMove
    - 暴露线程安全 API
    """

    def __init__(self, current_robot: ReachyMini, camera_worker=None):
        self.move_queue: deque[Move] = deque()  # 主要动作队列
        self.state = MovementState()
        self.idle_inactivity_delay = 0.3  # 秒
        self.target_frequency = 100.0  # Hz
```

**设计理由**：
- **互斥执行**：避免动作冲突，确保流畅过渡
- **队列管理**：支持动作预排队，实现无缝衔接
- **单控制点**：所有运动通过 `set_target` 统一输出

#### 次要偏移（Secondary Offsets）

次要偏移是叠加在主要动作上的实时偏移：

```python
# 次要偏移组合
secondary_offsets = [
    self.state.speech_offsets[0] + self.state.face_tracking_offsets[0],  # x
    self.state.speech_offsets[1] + self.state.face_tracking_offsets[1],  # y
    self.state.speech_offsets[2] + self.state.face_tracking_offsets[2],  # z
    self.state.speech_offsets[3] + self.state.face_tracking_offsets[3],  # roll
    self.state.speech_offsets[4] + self.state.face_tracking_offsets[4],  # pitch
    self.state.speech_offsets[5] + self.state.face_tracking_offsets[5],  # yaw
]
```

**设计理由**：
- **加性融合**：多个偏移可以同时作用
- **世界坐标系**：使用 `compose_world_offset` 进行姿态合成
- **线程安全**：通过锁保护偏移更新

---

### 2. 呼吸状态配置

呼吸是机器人在空闲时自动进入的"待机动画"，创造持续鲜活感。

#### 呼吸参数设计

```python
class BreathingMove(Move):
    def __init__(self, interpolation_start_pose, interpolation_start_antennas,
                 interpolation_duration=1.0):
        # 中性位置
        self.neutral_head_pose = create_head_pose(0, 0, 0, 0, 0, 0, degrees=True)
        self.neutral_antennas = np.array([0.0, 0.0])

        # 呼吸参数
        self.breathing_z_amplitude = 0.005   # 5mm 轻微上下浮动
        self.breathing_frequency = 0.1        # Hz（每分钟 6 次呼吸）
        self.antenna_sway_amplitude = np.deg2rad(15)  # 天线摆动 15 度
        self.antenna_frequency = 0.5          # Hz（天线更快摆动）
```

**呼吸动画分两阶段**：

1. **插值阶段**：从当前姿态平滑过渡到中性位置
2. **呼吸循环**：持续的 Z 轴浮动 + 天线交替摆动

```python
def evaluate(self, t: float):
    if t < self.interpolation_duration:
        # 阶段 1：插值到中性位置
        interpolation_t = t / self.interpolation_duration
        head_pose = linear_pose_interpolation(
            self.interpolation_start_pose,
            self.neutral_head_pose,
            interpolation_t
        )
    else:
        # 阶段 2：呼吸循环
        breathing_time = t - self.interpolation_duration

        # Z 轴轻微浮动
        z_offset = self.breathing_z_amplitude * np.sin(
            2 * np.pi * self.breathing_frequency * breathing_time
        )

        # 天线交替摆动（增加鲜活感）
        antenna_sway = self.antenna_sway_amplitude * np.sin(
            2 * np.pi * self.antenna_frequency * breathing_time
        )
        antennas = np.array([antenna_sway, -antenna_sway])
```

**设计考量**：
- **5mm 浮动**：足够被感知但不分散注意力
- **6 次/分钟**：接近人类呼吸频率，创造亲和感
- **天线交替**：打破完全对称，增加有机感

#### 呼吸触发条件

```python
def _manage_breathing(self, current_time: float):
    """管理空闲时的自动呼吸"""
    if (self.state.current_move is None
        and not self.move_queue
        and not self._is_listening
        and not self._breathing_active):

        idle_for = current_time - self.state.last_activity_time
        if idle_for >= self.idle_inactivity_delay:  # 0.3 秒
            # 获取当前姿态作为插值起点
            current_head_pose = self.current_robot.get_current_head_pose()
            _, current_antennas = self.current_robot.get_current_joint_positions()

            breathing_move = BreathingMove(
                interpolation_start_pose=current_head_pose,
                interpolation_start_antennas=current_antennas,
                interpolation_duration=1.0
            )
            self.move_queue.append(breathing_move)
```

**中断机制**：任何新动作入队时，呼吸立即被中断：

```python
if isinstance(self.state.current_move, BreathingMove) and self.move_queue:
    self.state.current_move = None
    self._breathing_active = False
    logger.debug("由于新动作活动停止呼吸")
```

---

### 3. 情绪动作系统

#### 情绪库加载

情绪动作从 Hugging Face 数据集动态加载：

```python
# play_emotion.py
try:
    from reachy_mini.motion.recorded_move import RecordedMoves

    # 自动从环境变量读取 HF_TOKEN
    RECORDED_MOVES = RecordedMoves("pollen-robotics/reachy-mini-emotions-library")
    EMOTION_AVAILABLE = True
except ImportError as e:
    logger.warning(f"情绪库不可用: {e}")
    EMOTION_AVAILABLE = False
```

#### 情绪工具定义

```python
class PlayEmotion(Tool):
    name = "play_emotion"
    description = "播放预录制的情绪动作"
    parameters_schema = {
        "type": "object",
        "properties": {
            "emotion": {
                "type": "string",
                "description": """要播放的情绪名称。
                                可用情绪列表：
                                {get_available_emotions_and_descriptions()}
                                """,
            },
        },
        "required": ["emotion"],
    }

    async def __call__(self, deps: ToolDependencies, **kwargs):
        emotion_name = kwargs.get("emotion")

        # 验证情绪存在
        emotion_names = RECORDED_MOVES.list_moves()
        if emotion_name not in emotion_names:
            return {"error": f"未知情绪 '{emotion_name}'"}

        # 加入动作队列
        emotion_move = EmotionQueueMove(emotion_name, RECORDED_MOVES)
        movement_manager.queue_move(emotion_move)

        return {"status": "queued", "emotion": emotion_name}
```

#### 情绪动作包装器

```python
class EmotionQueueMove(Move):
    """将情绪动作包装为队列兼容的 Move 对象"""

    def __init__(self, emotion_name: str, recorded_moves: RecordedMoves):
        self.emotion_move = recorded_moves.get(emotion_name)
        self.emotion_name = emotion_name

    @property
    def duration(self) -> float:
        return float(self.emotion_move.duration)

    def evaluate(self, t: float):
        head_pose, antennas, body_yaw = self.emotion_move.evaluate(t)
        # 转换为标准格式
        if isinstance(antennas, tuple):
            antennas = np.array([antennas[0], antennas[1]])
        return (head_pose, antennas, body_yaw)
```

---

### 4. 舞蹈动作系统

#### 可用舞蹈动作

舞蹈动作提供更丰富的表现力：

```python
AVAILABLE_MOVES = {
    "simple_nod": "简单的连续上下点头",
    "head_tilt_roll": "连续的侧向头部滚动（耳朵贴肩膀）",
    "side_to_side_sway": "平滑的左右摇摆",
    "dizzy_spin": "结合滚转和俯仰的眩晕圆形运动",
    "stumble_and_recover": "模拟踉跄和恢复，多轴运动，氛围感好",
    "interwoven_spirals": "三轴不同频率的复杂螺旋运动",
    "sharp_side_tilt": "使用三角波形的锐利快速侧倾",
    "side_peekaboo": "多阶段躲猫猫表演，两侧躲藏和窥视",
    "yeah_nod": "强调性的两部分 yeah 点头",
    "uh_huh_tilt": "滚转和俯仰组合的同意手势",
    "neck_recoil": "快速瞬态颈部后缩",
    "chin_lead": "下巴引导的前向运动",
    "groovy_sway_and_roll": "左右摇摆配合相应滚转的律动效果",
    "chicken_peck": "锐利的前向啄食动作",
    "side_glance_flick": "快速侧视-停留-返回",
    "polyrhythm_combo": "3拍摇摆+2拍点头创造复节奏感",
    "grid_snap": "使用方波的机器人网格运动",
    "pendulum_swing": "简单平滑的钟摆式滚转摆动",
    "jackson_square": "5点路径描绘矩形，到达检查点时锐利抽动",
}
```

#### 舞蹈工具定义

```python
class Dance(Tool):
    name = "dance"
    description = "播放命名或随机舞蹈动作。非阻塞。"
    parameters_schema = {
        "type": "object",
        "properties": {
            "move": {
                "type": "string",
                "description": "动作名称；使用 'random' 或省略则随机",
            },
            "repeat": {
                "type": "integer",
                "description": "重复次数（默认 1）",
            },
        },
    }

    async def __call__(self, deps: ToolDependencies, **kwargs):
        move_name = kwargs.get("move")
        repeat = int(kwargs.get("repeat", 1))

        if not move_name or move_name == "random":
            move_name = random.choice(list(AVAILABLE_MOVES.keys()))

        # 支持重复排队
        for _ in range(repeat):
            dance_move = DanceQueueMove(move_name)
            movement_manager.queue_move(dance_move)

        return {"status": "queued", "move": move_name, "repeat": repeat}
```

---

### 5. 语音同步摆动系统

#### 音频驱动的头部运动

这是让机器人"说话时自然动起来"的关键系统：

```python
# speech_tapper.py - 音频分析参数
SR = 16_000           # 采样率
FRAME_MS = 20         # 帧长度（毫秒）
HOP_MS = 50           # 跳跃长度（毫秒）

# 摆动参数
SWAY_MASTER = 1.5     # 主增益
VAD_DB_ON = -35.0     # 语音活动检测开启阈值
VAD_DB_OFF = -45.0    # 语音活动检测关闭阈值

# 各轴摆动频率和幅度
SWAY_F_PITCH = 2.2    # 俯仰频率 Hz
SWAY_A_PITCH_DEG = 4.5  # 俯仰幅度（度）
SWAY_F_YAW = 0.6      # 偏航频率 Hz
SWAY_A_YAW_DEG = 7.5  # 偏航幅度（度）
SWAY_F_ROLL = 1.3     # 滚转频率 Hz
SWAY_A_ROLL_DEG = 2.25  # 滚转幅度（度）

# 位移摆动
SWAY_F_X = 0.35       # X 轴频率
SWAY_A_X_MM = 4.5     # X 轴幅度（毫米）
SWAY_F_Y = 0.45       # Y 轴频率
SWAY_A_Y_MM = 3.75    # Y 轴幅度
SWAY_F_Z = 0.25       # Z 轴频率
SWAY_A_Z_MM = 2.25    # Z 轴幅度
```

#### 实时音频处理流程

```python
class SwayRollRT:
    """输入音频块 → 每跳摆动输出"""

    def feed(self, pcm: NDArray, sr: int) -> List[Dict]:
        # 1. 转换为 float32 单声道
        x = _to_float32_mono(pcm)

        # 2. 如需要则重采样
        if sr_in != SR:
            x = _resample_linear(x, sr_in, SR)

        # 3. 按 HOP 大小处理
        while self.carry.size >= HOP:
            hop = self.carry[:HOP]

            # 4. 计算 RMS 响度（dBFS）
            db = _rms_dbfs(frame)

            # 5. VAD 带滞后的语音检测
            if db >= VAD_DB_ON:
                self.vad_on = True
            elif db <= VAD_DB_OFF:
                self.vad_on = False

            # 6. 计算响度增益
            loud = _loudness_gain(db) * SWAY_MASTER

            # 7. 生成各轴摆动
            pitch = math.radians(SWAY_A_PITCH_DEG) * loud * env * \
                    math.sin(2 * math.pi * SWAY_F_PITCH * self.t + phase)
            yaw = math.radians(SWAY_A_YAW_DEG) * loud * env * \
                  math.sin(2 * math.pi * SWAY_F_YAW * self.t + phase)
            # ... 其他轴

            out.append({
                "pitch_rad": pitch,
                "yaw_rad": yaw,
                "roll_rad": roll,
                "x_mm": x_mm,
                "y_mm": y_mm,
                "z_mm": z_mm,
            })
```

#### 头部摆动器

```python
class HeadWobbler:
    """将音频增量转换为头部运动偏移"""

    def __init__(self, set_speech_offsets: Callable):
        self._apply_offsets = set_speech_offsets
        self.sway = SwayRollRT()
        self.audio_queue = Queue()

        # 延迟对齐参数
        MOVEMENT_LATENCY_S = 0.2  # 音频和运动之间的延迟

    def feed(self, delta_b64: str):
        """线程安全：将音频推入队列"""
        buf = np.frombuffer(base64.b64decode(delta_b64), dtype=np.int16)
        self.audio_queue.put((generation, SAMPLE_RATE, buf))

    def working_loop(self):
        """音频 → 头部运动偏移"""
        while not self._stop_event.is_set():
            chunk = self.audio_queue.get_nowait()

            # 处理音频生成摆动数据
            results = self.sway.feed(pcm, sr)

            for r in results:
                # 时间对齐
                target = base_ts + MOVEMENT_LATENCY_S + hops_done * hop_dt
                if target > now:
                    time.sleep(target - now)

                # 应用偏移
                offsets = (
                    r["x_mm"] / 1000.0,    # mm → m
                    r["y_mm"] / 1000.0,
                    r["z_mm"] / 1000.0,
                    r["roll_rad"],
                    r["pitch_rad"],
                    r["yaw_rad"],
                )
                self._apply_offsets(offsets)
```

**设计考量**：
- **200ms 延迟**：补偿音频处理和机械延迟
- **随机相位**：每次会话使用不同的初始相位，避免机械感
- **响度驱动**：幅度随音量动态调整

---

### 6. 动作时长设计

#### Move 基类的时长协议

所有动作必须实现 `duration` 属性，控制循环依赖它来判断动作是否完成：

```python
class Move(abc.ABC):
    """动作基类，所有动作必须实现 duration 属性"""

    @property
    @abc.abstractmethod
    def duration(self) -> float:
        """返回动作持续时间（秒）"""
        pass

    @abc.abstractmethod
    def evaluate(self, t: float) -> tuple[head_pose, antennas, body_yaw]:
        """在时间 t 评估动作姿态"""
        pass
```

**时长类型**：

| 动作类型 | 时长来源 | 特点 |
|----------|----------|------|
| 情绪动作 | 预录制数据（Hugging Face） | 固定，由录制决定 |
| 舞蹈动作 | 程序生成 | 固定，由动作定义 |
| Goto 定位 | 参数指定 | 可配置（默认 1s） |
| 呼吸动作 | `float("inf")` | 无限循环，直到被中断 |

#### 时长判断逻辑

```python
def _manage_move_queue(self, current_time: float):
    """管理动作队列，判断当前动作是否完成"""
    if self.state.current_move is None or (
        self.state.move_start_time is not None
        and current_time - self.state.move_start_time >= self.state.current_move.duration
    ):
        # 当前动作完成，开始下一个
        self.state.current_move = None
        self.state.move_start_time = None

        if self.move_queue:
            self.state.current_move = self.move_queue.popleft()
            self.state.move_start_time = current_time
            logger.debug(f"Starting new move, duration: {self.state.current_move.duration}s")
```

#### 复合动作的时长计算

对于由多个子动作组成的复合动作，时长是所有子动作的总和：

```python
# 示例：sweep_look 动作的时长计算
transition_duration = 3.0  # 移动时间
hold_duration = 1.0        # 停留时间

# 总时长 = 4 次移动 + 2 次停留
total_duration = transition_duration * 4 + hold_duration * 2  # 14 秒

# 通知运动管理器
deps.movement_manager.set_moving_state(total_duration)
```

**设计考量**：
- 时长必须准确，否则会导致动作被截断或拖沓
- 呼吸动作使用无限时长，只能被新动作中断
- 复合动作需要预先计算总时长用于状态管理

---

### 7. 流式工具调用实现

#### OpenAI Realtime 事件驱动模型

工具调用采用事件驱动模式，当 LLM 决定调用工具时，系统收到完整参数后立即执行：

```python
# 事件类型：response.function_call_arguments.done
# 表示工具参数已完全接收，可以执行

if event.type == "response.function_call_arguments.done":
    tool_name = getattr(event, "name", None)
    args_json_str = getattr(event, "arguments", None)
    call_id = getattr(event, "call_id", None)

    # 立即分发执行
    tool_result = await dispatch_tool_call(tool_name, args_json_str, self.deps)

    # 将结果返回给 LLM
    await self.connection.conversation.item.create(
        item={
            "type": "function_call_output",
            "call_id": call_id,
            "output": json.dumps(tool_result),
        }
    )
```

**关键点**：
- **非流式参数**：`response.function_call_arguments.done` 事件在参数完全接收后触发
- **立即执行**：收到完整参数后立即分发到对应工具
- **异步返回**：工具执行完成后，结果通过 WebSocket 返回给 LLM

#### 工具执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI Realtime Server                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  event: response.function_call_arguments.done               │
│  { name: "play_emotion", arguments: '{"emotion":"happy"}' } │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    dispatch_tool_call()                      │
│  1. 解析 JSON 参数                                           │
│  2. 查找注册的工具                                           │
│  3. 异步执行工具 __call__                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    PlayEmotion.__call__()                    │
│  1. 验证情绪名称                                             │
│  2. 创建 EmotionQueueMove                                    │
│  3. 加入运动队列                                             │
│  4. 返回 {"status": "queued", "emotion": "happy"}           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              conversation.item.create (返回结果)             │
│  { type: "function_call_output", call_id: "...",            │
│    output: '{"status":"queued","emotion":"happy"}' }        │
└─────────────────────────────────────────────────────────────┘
```

#### 空闲触发的特殊处理

空闲时触发的工具调用有特殊逻辑，避免机器人说话：

```python
# 空闲信号发送时设置标志
async def send_idle_signal(self, idle_duration: float):
    self.is_idle_tool_call = True  # 标记为空闲触发

    await self.connection.response.create(
        response={
            "instructions": "你必须只使用函数调用 - 不要语音或文本。",
            "tool_choice": "required",  # 强制工具调用
        }
    )

# 工具执行后判断是否需要语音回复
if self.is_idle_tool_call:
    self.is_idle_tool_call = False
    # 不生成语音回复
else:
    # 正常工具调用，生成语音回复
    await self.connection.response.create(
        response={"instructions": "使用工具结果并简洁回答。"}
    )
```

#### 工具注册与发现

工具通过 Python 类继承自动注册：

```python
# 工具基类
class Tool(abc.ABC):
    name: str
    description: str
    parameters_schema: Dict[str, Any]

    @abc.abstractmethod
    async def __call__(self, deps: ToolDependencies, **kwargs) -> Dict[str, Any]:
        pass

# 自动发现所有 Tool 子类
def get_concrete_subclasses(base: type[Tool]) -> List[type[Tool]]:
    result = []
    for cls in base.__subclasses__():
        if not inspect.isabstract(cls):
            result.append(cls)
        result.extend(get_concrete_subclasses(cls))
    return result

# 注册到全局字典
ALL_TOOLS = {cls.name: cls() for cls in get_concrete_subclasses(Tool)}
ALL_TOOL_SPECS = [tool.spec() for tool in ALL_TOOLS.values()]
```

---

### 8. 状态切换与融合

#### 动作融合流程

100Hz 控制循环中的姿态合成：

```python
def working_loop(self):
    """主控制循环"""
    while not self._stop_event.is_set():
        loop_start = self._now()

        # 1) 轮询外部命令和偏移更新
        self._poll_signals(loop_start)

        # 2) 管理主要动作队列
        self._update_primary_motion(loop_start)

        # 3) 更新视觉次要偏移
        self._update_face_tracking(loop_start)

        # 4) 合成主要和次要姿态
        head, antennas, body_yaw = self._compose_full_body_pose(loop_start)

        # 5) 应用监听天线冻结或混合
        antennas_cmd = self._calculate_blended_antennas(antennas)

        # 6) 单一 set_target 调用
        self._issue_control_command(head, antennas_cmd, body_yaw)

        # 7) 自适应睡眠以对齐到下一 tick
        sleep_time = self.target_period - (self._now() - loop_start)
        if sleep_time > 0:
            time.sleep(sleep_time)
```

#### 姿态合成

```python
def _compose_full_body_pose(self, current_time: float) -> FullBodyPose:
    """合成主要和次要姿态"""
    primary = self._get_primary_pose(current_time)   # 从当前 Move
    secondary = self._get_secondary_pose()           # 语音 + 人脸追踪
    return combine_full_body(primary, secondary)

def combine_full_body(primary_pose, secondary_pose):
    """使用世界坐标系偏移组合姿态"""
    combined_head = compose_world_offset(
        primary_head,
        secondary_head,
        reorthonormalize=True
    )
    combined_antennas = (
        primary_antennas[0] + secondary_antennas[0],
        primary_antennas[1] + secondary_antennas[1],
    )
    return (combined_head, combined_antennas, primary_body_yaw)
```

#### 监听状态管理

```python
def set_listening(self, listening: bool):
    """启用/禁用监听模式

    监听时：
    - 天线位置冻结在最后命令值
    - 恢复时平滑混合回来
    - 抑制空闲呼吸
    """
    if listening:
        # 冻结：快照当前天线位置
        self._listening_antennas = (
            float(self._last_commanded_pose[1][0]),
            float(self._last_commanded_pose[1][1]),
        )
        self._antenna_unfreeze_blend = 0.0
    else:
        # 解冻：从冻结姿态开始混合
        self._antenna_unfreeze_blend = 0.0

def _calculate_blended_antennas(self, target_antennas):
    """混合目标天线与监听冻结状态"""
    if self._is_listening:
        return self._listening_antennas  # 保持冻结

    # 混合回目标姿态
    dt = now - last_update
    new_blend = min(1.0, blend + dt / blend_duration)  # 0.4 秒混合
    return (
        listening_antennas[0] * (1 - new_blend) + target_antennas[0] * new_blend,
        listening_antennas[1] * (1 - new_blend) + target_antennas[1] * new_blend,
    )
```

---

### 9. 产品鲜活感设计考量

#### 永不静止原则

系统的核心设计哲学：**机器人永远不应该完全静止**

1. **呼吸作为基础**：
   - 0.3 秒无活动后自动启动呼吸
   - 即使在"什么都不做"时也有微妙的上下浮动
   - 天线交替摆动打破对称感

2. **语音同步摆动**：
   - 说话时头部自然摆动
   - 摆动幅度与音量相关
   - 多轴独立振荡创造有机感

3. **空闲创意触发**：
   ```python
   async def send_idle_signal(self, idle_duration: float):
       """15 秒空闲后发送创意信号"""
       timestamp_msg = (
           f"[空闲时间更新：{timestamp} - 无活动 {idle_duration:.1f}s] "
           f"你已经空闲了一段时间。可以自由发挥 - "
           f"跳舞、展示情绪、四处看看、什么都不做，或者做你自己！"
       )
       await self.connection.response.create(
           response={
               "instructions": "你必须只使用函数调用 - 不要语音或文本。"
                              "选择适合空闲行为的动作。",
               "tool_choice": "required",  # 强制工具调用
           }
       )
   ```

#### 动作选择的 LLM 驱动

系统使用 LLM 来决定何时触发情绪/舞蹈动作：

```python
# 在 OpenAI Realtime 会话中注册工具
tools = [
    dance,           # 舞蹈工具
    stop_dance,      # 停止舞蹈
    play_emotion,    # 播放情绪
    stop_emotion,    # 停止情绪
    move_head,       # 移动头部
    do_nothing,      # 什么都不做
    head_tracking,   # 人脸追踪
]
```

**工具选择策略**：
- **tool_choice="auto"**：正常对话时自动选择
- **tool_choice="required"**：空闲时强制使用工具（不说话）

#### 人格配置系统

通过 profile 配置不同的机器人人格：

```
profiles/
├── default/
│   ├── instructions.txt    # 默认人格指令
│   └── tools.txt          # 启用的工具列表
├── cosmic_kitchen/         # 宇宙厨房主题
├── mars_rover/            # 火星探测器主题
├── short_bored_teenager/  # 无聊青少年主题
├── short_hype_bot/        # 炒作机器人主题
└── victorian_butler/      # 维多利亚管家主题
```

**人格指令示例**（`default_prompt.txt`）：

```markdown
## IDENTITY
你是 Reachy Mini：一个友好、紧凑的机器人助手，声音平静，幽默感微妙。
个性：简洁、有帮助、略带机智——从不讽刺或过度。

## CRITICAL RESPONSE RULES
最多回应 1-2 句话。
首先有帮助，然后如果自然合适添加一点幽默。

## TOOL & MOVEMENT RULES
只在有帮助时使用工具并简要总结结果。
头部可以移动（左/右/上/下/前）。
看人时启用人脸追踪；否则禁用。
```

---

## 比较矩阵

| 方面 | 情绪动作 | 舞蹈动作 | 呼吸状态 | 语音摆动 |
|------|----------|----------|----------|----------|
| 类型 | 主要动作 | 主要动作 | 主要动作 | 次要偏移 |
| 来源 | 预录制数据 | 程序生成 | 程序生成 | 实时音频分析 |
| 持续时间 | 固定 | 固定 | 无限 | 实时 |
| 触发方式 | LLM 工具调用 | LLM 工具调用 | 自动（空闲） | 音频输入 |
| 可中断 | 是 | 是 | 是 | N/A（叠加） |
| 互斥性 | 与其他主要动作互斥 | 与其他主要动作互斥 | 与其他主要动作互斥 | 独立叠加 |

---

## 最佳实践

1. **永远不要让机器人完全静止**
   - 使用呼吸动画作为默认状态
   - 设置合理的空闲超时（0.3 秒）
   - 天线摆动增加有机感

2. **音频同步是关键**
   - 使用 200ms 延迟补偿机械滞后
   - 多轴独立振荡避免机械感
   - 响度驱动幅度保持自然

3. **状态切换要平滑**
   - 使用插值过渡到呼吸
   - 天线冻结/解冻使用混合
   - 避免姿态突变

4. **让 LLM 驱动表现力**
   - 提供丰富的动作库
   - 空闲时强制工具调用
   - 人格配置定义行为风格

5. **时长设计要准确**
   - 所有 Move 必须实现 `duration` 属性
   - 复合动作预计算总时长
   - 呼吸使用 `float("inf")` 表示无限

6. **工具调用要即时响应**
   - 收到完整参数后立即执行
   - 异步返回结果给 LLM
   - 区分空闲触发和正常触发

7. **反模式：避免**
   - ❌ 直接操作机器人姿态（绕过队列）
   - ❌ 在控制循环中执行 I/O
   - ❌ 使用固定相位（每次会话随机化）
   - ❌ 完全对称的运动（打破天线同步）
   - ❌ 时长计算不准确（导致动作截断）

---

## 代码示例

### 基础用法：创建自定义情绪工具

```python
from reachy_mini_conversation_app.tools.core_tools import Tool, ToolDependencies

class CustomEmotion(Tool):
    name = "custom_greeting"
    description = "执行问候动作"
    parameters_schema = {
        "type": "object",
        "properties": {
            "enthusiasm": {
                "type": "string",
                "enum": ["low", "medium", "high"],
            },
        },
    }

    async def __call__(self, deps: ToolDependencies, **kwargs):
        enthusiasm = kwargs.get("enthusiasm", "medium")

        # 根据热情程度选择舞蹈
        move_map = {
            "low": "simple_nod",
            "medium": "yeah_nod",
            "high": "groovy_sway_and_roll",
        }

        dance_move = DanceQueueMove(move_map[enthusiasm])
        deps.movement_manager.queue_move(dance_move)

        return {"status": "greeting", "enthusiasm": enthusiasm}
```

### 高级用法：自定义呼吸参数

```python
class CustomBreathingMove(BreathingMove):
    """更活跃的呼吸模式"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # 更明显的呼吸
        self.breathing_z_amplitude = 0.01    # 10mm
        self.breathing_frequency = 0.15      # 9 次/分钟

        # 更多天线活动
        self.antenna_sway_amplitude = np.deg2rad(20)
        self.antenna_frequency = 0.3

        # 添加轻微滚转
        self.roll_amplitude = np.deg2rad(3)
        self.roll_frequency = 0.08

    def evaluate(self, t: float):
        head, antennas, body_yaw = super().evaluate(t)

        if t >= self.interpolation_duration:
            breathing_time = t - self.interpolation_duration
            # 添加滚转偏移
            # ... 修改 head pose

        return (head, antennas, body_yaw)
```

---

## 相关文档

- [分层运动系统](./layered-motion-system.md) - 详细的运动控制架构
- [异步流式一等公民](../streaming/async-streaming-first-class.md) - 实时音频流处理

---

## 参考

- [Reachy Mini SDK](https://github.com/pollen-robotics/reachy_mini/)
- [Reachy Mini 情绪库](https://huggingface.co/datasets/pollen-robotics/reachy-mini-emotions-library)
- [OpenAI Realtime API](https://platform.openai.com/docs/api-reference/realtime)

---

*创建时间：2026-03-02*
*更新时间：2026-03-02*
