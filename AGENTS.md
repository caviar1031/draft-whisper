# AGENTS.md

本文件是给 AI 编码 Agent（以及并行开发的前端 Agent）的项目指南。修改本仓库前请先读完。

> 产品文档见 [docs/PRD.md](docs/PRD.md)。功能实现以 PRD 为准；当本文件与 PRD 冲突时，以 PRD 为准并在本文件中订正。

---

## 1. 项目概述

DraftWhisper 是一款 macOS 优先的 AI 配音桌面工具（Tauri 2 + React）。

核心工作流：**改一句文案 → 重新生成 → 试听 → 拖进剪辑软件**。

当前 MVP 范围：导入文本、自动切句、调用 MiMo v2.5 TTS API、播放试听、单句重新生成、最近 5 个音频版本、本地项目管理、本地缓存、设置页。不做多 Provider、云同步、波形、字幕。

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
                                     小米 MiMo v2.5 TTS API
                                     POST {baseUrl}/chat/completions
                                     (非 OpenAI /audio/speech 协议)
```

要点：

- **状态在前端**：Zustand store 持有 settings 与 project（见 [src/stores](src/stores)）。项目元数据和非敏感设置已持久化到 `localStorage`，API Key 写入 macOS Keychain；后端不维护数据库状态。
- **协议**：MVP 固定使用小米 MiMo v2.5 TTS（chat-completions 风格，非 OpenAI `/audio/speech`）。详见第 10 节。
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

参数类型 `TtsParams`（与 `Settings` 字段一一对应，**camelCase**；Rust struct 加了 `#[serde(rename_all = "camelCase")]` 自动映射 snake_case）：

```ts
interface TtsParams {
  baseUrl: string          // MiMo API 根地址
  apiKey: string           // api-key 头
  model: string            // 用户选择的模型 ID
  mode: TtsMode            // "basic" | "voice-design" | "voice-clone"
  voice: string            // 基础模式的预置音色名
  voiceDesignPrompt: string // 声音设计的音色描述
  voiceClonePath: string | null // 声音克隆的参考音频路径
}
```

行为：
- 自动规范化 `baseUrl`：去掉尾部 `/`；若已以 `/chat/completions` 结尾则直接用；若以 `/v1` 结尾则补 `/chat/completions`；否则补 `/v1/chat/completions`。
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
- 响应：JSON，音频在 `choices[0].message.audio.data`，**base64 编码**，后端解码后写盘。
- 成功后写入 `{audioDir}/{sentenceId}_{timestamp_ms}.wav`；命名项目位于 `audio/projects/{project}/`。
- `sentenceId` 仅含字母数字（来自 `generateId`），可直接作文件名。

### 7.2 `tts_test`

测试当前 settings 是否可用（设置页「Test API」按钮）。

| 项 | 值 |
| --- | --- |
| 参数 | `{ params: TtsParams }` |
| 返回 | `Promise<void>` |
| 失败 | `reject(string)` |

行为：用一段极短测试文本 `"test"` 发起一次真实 TTS 请求，成功即返回，失败返回错误。

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
| `tts_list_models` | 从 MiMo-compatible `/v1/models` 获取模型 ID |
| `tts_list_projects` / `tts_create_project` / `tts_delete_project` | 列出、创建和删除本地项目目录 |
| `tts_delete_audio_files` | 删除不再被项目元数据引用的缓存音频 |
| `tts_copy_to_clipboard` / `tts_show_in_finder` / `tts_drag_file` | macOS 文件复制、Finder 定位与原生拖拽 |
| `save_voice_sample` / `delete_voice_sample` | 管理声音克隆参考样本 |
| `save_api_key` / `load_api_key` / `delete_api_key` | 管理 macOS Keychain 中的 API Key |

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

### Settings / TtsParams

```ts
interface Settings { baseUrl: string; apiKey: string; concurrency: number; project: string | null }
interface ModelConfig { id: string; name: string; mode: TtsMode }
// settings-store.models: ModelConfig[] — 用户配置的模型列表
```

### Project

```ts
type TtsMode = "basic" | "voice-design" | "voice-clone"
interface Project { mode: TtsMode; model: string; voice: string; voiceDesignPrompt: string; voiceClonePath: string | null; sentences: Sentence[] }
```

---

## 10. TTS 实现要点

- 协议：小米 MiMo v2.5 TTS，`POST {baseUrl}/chat/completions`（chat-completions 风格，**非** OpenAI `/audio/speech`）。文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
- 认证：`api-key: <apiKey>` 请求头（不是 `Authorization: Bearer`）。
- 请求体：`{ model, messages:[{role:assistant,content:text}], audio:{format:"wav", voice} }`。目标文本必须放 `role: assistant`。
- 风格控制：通过 `role: user` 的 `content` 传入自然语言指令（如"温柔活泼的语调"），MiMo 不提供原生 speed 参数。
- 响应：JSON，音频在 `choices[0].message.audio.data`，**base64 编码**，后端解码后落盘。
- `audio.format` 固定 `wav`（非流式，浏览器 `<audio>` 通用支持）。
- HTTP 由 Rust 侧 `reqwest` 发起，**不需要** `tauri-plugin-http` 或前端 `fetch` 权限。
- 缓存目录：三级 fallback `app_cache_dir/audio` → `app_data_dir/audio` → 项目本地 `.cache/audio`。macOS sandbox 下前两个可能被 TCC 拒绝写入，dev 模式通常落到 `.cache/audio`（已加入 `.gitignore`）。
- 重新生成 → 唯一时间戳路径；每句保留最近 5 个版本并清理淘汰文件。
- 不在后端解析音频时长；duration 由前端 `<audio>` 元素的 `onLoadedMetadata` 提供。
- 预置音色：`冰糖`(女,中) / `茉莉`(女,中) / `苏打`(男,中) / `白桦`(男,中) / `Mia`(女,英) / `Chloe`(女,英) / `Milo`(男,英) / `Dean`(男,英) / `mimo_default`。

---

## 11. 扩展指引

- 新增 Tauri 命令：在 [src-tauri/src/tts.rs](src-tauri/src/tts.rs)（或新建模块）写 `#[tauri::command]`，在 [lib.rs](src-tauri/src/lib.rs) 的 `invoke_handler![...]` 注册，并在本文件第 8 节补契约。
- 新增前端 service：放 `src/services/`，命名 kebab-case；通过 `index.ts` re-export。
- 新增依赖：前端用 `npm i`；后端改 [Cargo.toml](src-tauri/Cargo.toml) 后 `cargo check`。
- 涉及文件系统/网络新权限：改 [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)。
