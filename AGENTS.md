# AGENTS.md

本文件是给 AI 编码 Agent（以及并行开发的前端 Agent）的项目指南。修改本仓库前请先读完。

> 产品文档见 [docs/PRD.md](docs/PRD.md)。功能实现以 PRD 为准；当本文件与 PRD 冲突时，以 PRD 为准并在本文件中订正。

---

## 1. 项目概述

DraftWhisper 是一款 macOS 优先的 AI 配音桌面工具（Tauri 2 + React）。

核心工作流：**改一句文案 → 重新生成 → 试听 → 拖进剪辑软件**。

当前 MVP 范围：导入文本、自动切句、调用 MiMo v2.5 / Fish Audio / 自定义 OpenAI SDK 兼容 TTS API、基础音色、声音设计、声音克隆、播放试听、单句重新生成、最近 5 个音频版本、本地项目管理、本地缓存、设置中心、多套 API 配置和中英文界面。Provider 架构可扩展，当前实现 MiMo、Fish Audio 与第三方自定义配置；不做云同步、波形、字幕。

---

## 2. 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust（edition 2021） |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 动画 | Motion |
| 状态 | Zustand |
| Lint/Format | Biome |

路径别名：`@/* → ./src/*`（见 [vite.config.ts](vite.config.ts)、[tsconfig.app.json](tsconfig.app.json)）。

---

## 3. 常用命令

```bash
npm install              # 安装前端依赖
npm run dev              # 仅启动 Vite（前端，http://localhost:5173）
npm run tauri dev        # 启动完整桌面应用（会自动起 Vite）
npm run tauri build      # 生产构建
npm run lint             # Biome 检查
npm run lint:fix         # Biome 自动修复
npm run format           # Biome 格式化

# 后端（src-tauri/）
cargo check              # 类型/编译检查
cargo build              # 构建
```

> 调 Rust 时建议先在 `src-tauri` 下 `cargo check` 验证，再起 `npm run tauri dev`。

---

## 4. 目录结构

```
draft-whisper/
├── docs/                 # 产品文档（PRD 等）
├── public/
├── src/                  # 前端
│   ├── assets/
│   ├── components/ui/    # shadcn/ui 基础组件
│   ├── lib/              # cn 等通用工具
│   ├── services/         # 封装 Tauri invoke 调用（前端面向接口层）
│   ├── stores/           # Zustand stores
│   ├── types/            # TS 类型定义
│   ├── utils/            # 领域工具（切句、id 等）
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── src-tauri/            # Rust 后端
│   ├── src/
│   │   ├── main.rs       # 入口
│   │   ├── lib.rs        # Tauri Builder / 命令注册
│   │   └── tts.rs        # TTS 实现（OpenAI 兼容 API + 本地缓存）
│   ├── capabilities/     # 权限定义
│   ├── Cargo.toml
│   └── tauri.conf.json
├── AGENTS.md             # 本文件
├── biome.json
└── package.json
```

---

## 5. 代码约定

### 前端（TypeScript / React）

- Biome：2 空格缩进、双引号、**无分号**、行宽 100（见 [biome.json](biome.json)）。
- `verbatimModuleSyntax: true` → 类型导入必须写 `import type { Foo } from "..."`。
- `noUnusedLocals` / `noUnusedParameters` 开启 → 未用变量/参数会报错。
- 优先用 `@/` 别名导入。
- 组件文件名：PascalCase（`.tsx`）。工具/store 文件：kebab-case（`.ts`）。

### 后端（Rust）

- edition 2021，`rust-version = 1.77.2`。
- 4 空格缩进。
- 错误以 `Result<T, String>` 返回给前端（`String` 是给用户看的可读错误）。
- 命令命名：`snake_case`（Tauri 自动转 camelCase 暴露给前端）。
- 公开 command 必须在 [lib.rs](src-tauri/src/lib.rs) 的 `invoke_handler` 中注册。

### Git

- Conventional Commits（`feat:`、`fix:`、`chore:` 等）。
- 不主动创建文档文件（`.md`），除非明确要求。
- 不主动提交 commit。
- 提交 git 前需检查.gitignore 文件是否有不合适上传到 github 的文件

---

## 6. 架构

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│  前端 (React)               │  IPC    │  后端 (Rust / Tauri)     │
│  stores: settings/project   │ ──────► │  tts_generate / tts_test │
│  services: invoke 封装       │ ◄────── │  tts_read_audio          │
│  <audio> 播放 Blob URL       │  bytes  │  落盘: app_data/audio/   │
└─────────────────────────────┘         └──────────────────────────┘
                                              │
                                              ▼
                                     Provider-specific TTS API
                                     MiMo / Fish / custom speech
```

要点：

- **状态在前端**：Zustand store 持有 settings 与 project（见 [src/stores](src/stores)）。项目元数据和非敏感设置已持久化到 `localStorage`，API Key 写入 macOS Keychain；后端不维护数据库状态。
- **协议**：按 Provider 分发协议：MiMo 使用 chat-completions 风格；Fish Audio 使用 `/v1/tts` REST 接口；自定义配置向用户填写的完整 Endpoint URL 发送 OpenAI SDK 兼容语音请求。详见第 10 节。
- **音频落盘**：后端把音频写到 `audio/{sentence_id}_{timestamp_ms}.wav`；命名项目写入 `audio/projects/{project}/`。每句最多保留最近 5 个版本，替换文本、删除句子或项目时会清理不再引用的文件。返回绝对路径字符串。目录选择有三级 fallback：`app_cache_dir/audio` → `app_data_dir/audio` → 项目本地 `.cache/audio`。
- **播放方式**：前端通过 `tts_read_audio` 命令取回 base64 字符串，解码为字节后转 `Blob URL` 播放（无需配置 asset 协议/权限，跨平台稳定）。封装见 `src/services/tts.ts` 的 `readAudioAsUrl`。

---

## 7. 文件命名规范

### 7.1 sentenceId 生成规则

**前端**：[src/utils/id.ts](src/utils/id.ts) 的 `generateSentenceId(index, text)` 函数

```ts
import { pinyin } from "pinyin-pro"

export function generateSentenceId(index: number, text: string): string {
  const seq = String(index + 1).padStart(3, "0")

  // 中文转拼音首字母，英文数字保留，其他字符忽略
  const raw = pinyin(text, { pattern: "first", toneType: "none", type: "array" })
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "")

  const summary = raw.charAt(0).toUpperCase() + raw.slice(1).substring(0, 19)
  const shortId = Math.random().toString(36).substring(2, 6)

  return summary.length > 0 ? `${seq}_${summary}_${shortId}` : `${seq}_${shortId}`
}
```

- **格式**：`{3位序号}_{拼音摘要}_{4位短ID}`（摘要为空时省略）
- **序号**：从 `001` 开始，按句子顺序递增
- **文本摘要**：中文取拼音首字母，英文/数字保留原样，首字母大写，取前 20 个字符
- **短 ID**：4 位随机字符串，避免同序号同文本冲突
- **依赖**：`pinyin-pro` 库（轻量，tree-shakeable）

### 7.2 文件名清理规则

**后端**：[src-tauri/src/tts.rs](src-tauri/src/tts.rs) 的 `sanitize_filename()` 函数

```rust
fn sanitize_filename(name: &str) -> String {
  name
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect()
}
```

- 保留字符：ASCII 字母数字（`a-z`、`A-Z`、`0-9`）、`-`、`_`
- 其他字符：替换为 `_`
- 目的：确保文件名在所有操作系统上安全

### 7.3 最终文件名格式

```
{audioDir}/{sanitized_sentenceId}_{timestamp_ms}.wav
```

- `audioDir`：音频目录（三级 fallback，见第 6 节）
- `sanitized_sentenceId`：经过 `sanitize_filename()` 清理的 sentenceId
- `timestamp_ms`：生成时的 Unix 毫秒时间戳，用于保留历史版本
- 扩展名：`.wav`（固定，与 TTS 输出格式一致）

### 7.4 示例

| 原文 | sentenceId | 清理后 | 最终文件名 |
|------|------------|--------|------------|
| `今天我们学习 Agent。` | `001_JinTianWMenXxAgent_k7x9` | `001_JinTianWMenXxAgent_k7x9` | `001_JinTianWMenXxAgent_k7x9_1783670400000.wav` |
| `它是什么？` | `002_TaSSM_m2n4` | `002_TaSSM_m2n4` | `002_TaSSM_m2n4_1783670400001.wav` |
| `Hello World!` | `003_HelloWorld_p6q8` | `003_HelloWorld_p6q8` | `003_HelloWorld_p6q8_1783670400002.wav` |

> 注：拼音首字母缩写（`pattern: "first"`），如「我们」→ `WM`，「什么」→ `SM`。实际输出取决于 `pinyin-pro` 的分词结果。

### 7.5 重新生成行为

- 同一 sentenceId 重新生成时创建新文件，并在前端保留最近 5 个版本
- 超出 5 个版本的文件由 `tts_delete_audio_files` 清理
- 被取消的请求、删除/重写的句子和已删除项目不会遗留可访问缓存

---

## 8. IPC 接口契约（前端必读）

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用以下命令。已封装在 [src/services/tts.ts](src/services/tts.ts)，**前端请直接 import service，不要手写 invoke**。

### 8.1 `tts_generate`

为某一句文本生成音频并缓存到本地。

| 项 | 值 |
| --- | --- |
| Rust 命令 | `tts_generate` |
| 前端调用名 | `ttsGenerate`（service 中为 `generateSentenceAudio`） |
| 参数 | `{ sentenceId: string, text: string, params: TtsParams, project?: string | null }` |
| 返回 | `Promise<{ audioPath: string }>` |
| 失败 | `reject(string)`，可读错误信息（HTTP 状态码 + 响应体） |

参数类型 `TtsParams`（由 Settings 与当前 Project 的声音配置共同组成，**camelCase**；Rust struct 加了 `#[serde(rename_all = "camelCase")]` 自动映射 snake_case）：

```ts
interface TtsParams {
  provider: ProviderId       // 当前适配器："mimo" | "fish-audio" | "custom"
  baseUrl: string          // 可编辑的 Provider API 根地址或完整端点
  apiKey: string           // Provider 对应的认证密钥
  model: string            // 当前 API 配置对该能力映射的模型 ID
  mode: TtsMode            // "basic" | "voice-design" | "voice-clone"
  voice: string            // 当前 API 配置中的音色 ID
  voiceDesignPrompt: string // 声音设计的音色描述
  voiceClonePath: string | null // 声音克隆的参考音频路径
  performancePrompt: string // 基础/克隆模式的自由文本演绎指令，可为空
}
```

行为：
- 运行时根据项目的 `apiConfigId` 与当前模式解析能力映射；模型 ID 可编辑，但启用能力时不能为空。
- 自动按 Provider 规范化 `baseUrl`：MiMo 补全 `/v1/chat/completions`；Fish Audio 补全 `/v1/tts`；自定义配置必须填写完整 Endpoint URL，除去两端空白后原样请求，不补全或改写路径。
- 请求体（MiMo chat-completions 风格）：
  ```json
  {
    "model": "<model>",
    "messages": [
      {"role": "assistant", "content": "<text>"}
    ],
    "audio": {"format": "wav", "voice": "<voice>"}
  }
  ```
  认证头：`api-key: <apiKey>`（**非** `Authorization: Bearer`）。
- 声音设计将 `voiceDesignPrompt` 作为 `role: user` 消息，且该字段必填。
- 基础模式和声音克隆将用户自由输入的 `performancePrompt` 作为可选 `role: user` 消息，不使用预设演绎选项。
- 声音克隆将参考音频编码为 `data:{MIME};base64,{DATA}` 后写入 `audio.voice`；仅支持签名有效的 WAV/MP3，完整 Data URI 不得超过 10 MB。
- 响应：JSON，音频在 `choices[0].message.audio.data`，**base64 编码**，后端解码后写盘。
- 成功后写入 `{audioDir}/{sentenceId}_{timestamp_ms}.wav`；命名项目位于 `audio/projects/{project}/`。
- `sentenceId` 仅含字母数字（来自 `generateId`），可直接作文件名。

### 8.2 `tts_test`

测试编辑弹窗中的某项能力。三项能力分别发起一次真实合成；克隆测试需要声音样本。

| 项 | 值 |
| --- | --- |
| 参数 | `{ params: TtsParams }` |
| 返回 | `Promise<void>` |
| 失败 | `reject(string)` |

行为：用一段极短测试文本 `"test"` 发起一次真实 TTS 合成请求，成功即返回，失败返回错误。页面需提示这会合成示例语音并可能产生少量用量。

### 8.3 `tts_read_audio`

读取本地音频文件字节，前端转 Blob URL 播放。

| 项 | 值 |
| --- | --- |
| 参数 | `{ path: string }`（来自 `tts_generate` 返回的 `audioPath`） |
| 返回 | `Promise<string>`（base64 编码） |
| 失败 | `reject(string)` |

前端用法（已封装为 `readAudioAsUrl(path)`，自动缓存对象 URL）：

```ts
import { readAudioAsUrl } from "@/services/tts"
const url = await readAudioAsUrl(sentence.audioPath) // blob:...
// <audio src={url} />
```

### 8.4 其他已注册命令

| 命令 | 用途 |
| --- | --- |
| `tts_preview_voice` | 为基础音色或声音设计生成独立试听文件，不写入句子历史 |
| `tts_preview_voice_clone` | 使用当前克隆样本、自由文本演绎指令和试听文案生成独立试听文件，不写入句子历史 |
| `tts_list_projects` / `tts_create_project` / `tts_delete_project` | 列出、创建和删除本地项目目录 |
| `tts_delete_audio_files` | 删除不再被项目元数据引用的缓存音频 |
| `tts_copy_to_clipboard` / `tts_show_in_finder` / `tts_drag_file` | macOS 文件复制、Finder 定位与原生拖拽 |
| `save_voice_sample` / `delete_voice_sample` | 校验并管理 WAV/MP3 声音克隆样本；保存时返回路径、格式、MIME 和大小元数据 |
| `save_api_key` / `load_api_key` / `delete_api_key` | 按 `configId` 管理 macOS Keychain 中隔离的 API Key |
| `migrate_legacy_api_key` | 将旧 `default` Keychain 条目迁移到第一张 API 配置 |

---

## 9. 数据模型

见 [src/types](src/types)。前端定义即权威，后端用对应 serde 结构。

### Sentence

```ts
type SentenceStatus = "pending" | "queued" | "generating" | "completed" | "failed"
interface Sentence {
  id: string
  text: string
  status: SentenceStatus
  audioPath: string | null   // tts_generate 成功后回填
  audioHistory: AudioVersion[] // 最近 5 个音频版本
  duration: number | null     // 前端 <audio> 加载后由 onLoadedMetadata 回填
  errorMessage?: string       // 最近一次生成失败的可读错误
}
```

### Settings / API Config

```ts
interface Settings {
  language: "system" | "zh-CN" | "en"
  concurrency: number
  project: string | null
  apiConfigs: ApiConfig[]
  defaultApiConfigId: string | null
}
// API 配置元数据进入 localStorage；API Key 只存在 Keychain 和运行时内存。
```

### Project

```ts
type TtsMode = "basic" | "voice-design" | "voice-clone"
interface Project {
  apiConfigId: string | null
  mode: TtsMode
  voice: string
  voiceDesignId: string | null
  voiceDesignPrompt: string
  voiceCloneSampleId: string | null
  voiceClonePath: string | null
  performancePrompt: string
  sentences: Sentence[]
}
```

---

## 10. TTS 实现要点

- MiMo 协议：`POST {baseUrl}/chat/completions`（chat-completions 风格，**非** OpenAI `/audio/speech`）。文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
- Fish Audio 协议：`POST {baseUrl}`（预设为 `https://api.fish.audio/v1/tts`），使用 `Authorization: Bearer`、`model` 请求头和包含 `text`、`reference_id`、`format: "wav"` 的 JSON 请求体；响应为原始 WAV 字节。文档：https://docs.fish.audio/developer-guide/getting-started/quickstart
- 自定义配置协议：用户填写第三方完整 Endpoint URL、模型和音色，后端不改写地址，使用 `Authorization: Bearer`，请求体包含 `model`、`input`、`voice`、`response_format: "wav"`，可选演绎指令映射到 `instructions`；响应为原始 WAV 字节。
- 认证：MiMo 使用 `api-key: <apiKey>`；Fish Audio 与自定义配置使用 `Authorization: Bearer <apiKey>`。
- Provider 目录为预置服务提供默认 Base URL、能力、模型和音色；自定义配置保持 Base URL、模型和音色为空，由用户填写。项目运行时从能力映射解析模型 ID，并从当前 API 配置解析音色。
- 请求体：`{ model, messages:[...], audio:{format:"wav", voice} }`。目标文本必须放 `role: assistant`。
- 风格控制：基础/克隆模式的 `performancePrompt` 是用户自由输入的可选文本；声音设计模式的 `voiceDesignPrompt` 是用户输入的必填文本。二者都通过 `role: user` 发送，MiMo 不提供原生 speed 参数。
- 声音克隆：参考音频只接受真实 WAV/MP3，以完整 Data URI 传入 `audio.voice`；Base64 Data URI 上限为 10 MB。独立试听文件存放在 `audio/voice-previews/`，不进入项目句子历史。
- 声音资源库：声音设计和克隆样本分别持久化为可复用资源；项目保存资源 ID，生成时实时解析资源内容，编辑资源后所有引用项目同步生效。
- 克隆样本保存入口和每次生成入口都会校验真实 WAV/MP3 签名、Base64 Data URI 小于 10 MB且时长小于 30 秒。
- 响应：JSON，音频在 `choices[0].message.audio.data`，**base64 编码**，后端解码后落盘。
- `audio.format` 固定 `wav`（非流式，浏览器 `<audio>` 通用支持）。
- HTTP 由 Rust 侧 `reqwest` 发起，**不需要** `tauri-plugin-http` 或前端 `fetch` 权限。
- 缓存目录：三级 fallback `app_cache_dir/audio` → `app_data_dir/audio` → 项目本地 `.cache/audio`。macOS sandbox 下前两个可能被 TCC 拒绝写入，dev 模式通常落到 `.cache/audio`（已加入 `.gitignore`）。
- 重新生成 → 唯一时间戳路径；每句保留最近 5 个版本并清理淘汰文件。
- 不在后端解析音频时长；duration 由前端 `<audio>` 元素的 `onLoadedMetadata` 提供。
- MiMo 预置音色：`冰糖` / `茉莉` / `苏打` / `白桦` / `Mia` / `Chloe` / `Milo` / `Dean` / `mimo_default`。Fish Audio 预填官方示例 `reference_id`；用户可在每套 API 配置中增删和修改音色。

---

## 11. 扩展指引

- 新增 Tauri 命令：在 [src-tauri/src/tts.rs](src-tauri/src/tts.rs)（或新建模块）写 `#[tauri::command]`，在 [lib.rs](src-tauri/src/lib.rs) 的 `invoke_handler![...]` 注册，并在本文件第 8 节补契约。
- 新增前端 service：放 `src/services/`，命名 kebab-case；通过 `index.ts` re-export。
- 新增依赖：前端用 `npm i`；后端改 [Cargo.toml](src-tauri/Cargo.toml) 后 `cargo check`。
- 涉及文件系统/网络新权限：改 [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)。

---

## 12. 多 Agent、worktree 与代码评审

### 12.1 任务分发

- 并行开发使用独立 `git worktree`，从明确的目标分支和提交创建；创建前检查
  `git status`、`git worktree list` 和同名分支。
- 分支默认使用 `codex/<task-name>`；worktree 放在仓库同级目录，避免嵌套 worktree
  污染主仓库。
- 需求文档写在任务 worktree 内，至少包含：背景、目标、允许修改范围、非目标、
  行为兼容要求、自动化验收、手工验收和交付格式。
- 实现 Agent 只能修改任务范围内的文件，不得合并目标分支，不得删除其他 worktree，
  不得提交 `.workbuddy/` 等本地 Agent 元数据。
- 交付前必须报告未完成的手工验证；“无法验证”不能写成“通过”。

### 12.2 评审门禁

评审按以下顺序执行：

1. 确认实现分支基线、PR base、HEAD SHA、工作区清洁度和未跟踪文件。
2. 审查 `develop...HEAD` 的完整差异；大量纯格式化变化应拆出，不能掩盖功能修改。
3. 执行 `git diff --check`，不接受多余空白或文件末尾格式错误。
4. 执行需求中规定的 lint、build、test、`cargo check` 和 Clippy。
5. 涉及 macOS 原生窗口、Keychain、剪贴板或拖拽时，必须进行对应的真实 GUI 回归。
6. 只有阻断项清零、目标工作区干净后才能合并；合并后再注销 worktree。
7. 注销前检查未跟踪文件，不得用 `--force` 静默删除来源不明的文件。

### 12.3 GitHub 评审可见性

- Codex 回复中的 `::code-comment` 只属于当前任务界面的本地批注，**不会自动发布到
  GitHub**。
- 用户或开发 Agent 需要在 PR 中看到意见时，必须显式提交 GitHub PR review 或
  Conversation comment。
- 发布前确认仓库、PR number、base/head 分支和 HEAD SHA，避免评论锚定到错误提交。
- 发布后必须回读 PR review，确认作者、状态、正文和 commit SHA；只运行发布命令但
  没有回读不能视为成功。
- 当前账号是 PR 作者时，GitHub 可能不允许 `REQUEST_CHANGES`；此时使用
  `COMMENTED` review，并在正文首行明确写出“需要修改，暂不合并”。
- GitHub 连接器不可用时可回退到 `gh`，但应先运行 `gh auth status`；授权失败、
  仓库权限不足或 PR 返回 404 时，必须明确报告，不能声称评论已发布。

### 12.4 Rust / Objective-C 评审经验

- 清理旧 `objc` 宏的 `unexpected_cfgs` 警告时，优先迁移到 `objc2` 类型化 API；
  禁止通过全局 `allow`、关闭 `check-cfg` 或 `RUSTFLAGS=-A warnings` 掩盖问题。
- selector 的参数、返回类型、method family 和 Objective-C ABI 必须由框架绑定或
  Apple 头文件验证，不能靠猜测。
- AppKit 对象要求主线程时使用 `MainThreadMarker` 或明确的主线程调度，不得仅依赖
  “当前通常在主线程”的假设。
- delegate/source 类型对象要覆盖完整原生会话生命周期。把局部 `Retained` 作为借用
  参数传给 AppKit 后，不能未经证明就假设系统会强持有它；应持有到对应结束回调。
- `unsafe` 块需要说明指针来源、有效期、线程约束、对象所有权和调用期间不会释放的依据。
- 编译无警告不能替代原生行为回归；窗口透明、交通灯、Dock 恢复、Finder 定位和文件
  拖拽应分别验证。
