[English](README.md) · [简体中文](README.zh-CN.md)

# DraftWhisper

DraftWhisper 是一款 AI 配音工作台，专门优化创作者最常见的一段工作流：
修改一句文案、重新生成、立即试听，下载音频，再把音频拖进剪辑软件。

```text
修改一句文案 → 重新生成 → 试听 → 拖入剪辑软件
```

它把整篇稿件拆成可以独立管理的 WAV 音频片段，而不是把所有内容当成一次长 TTS 任务处理。
当前 MVP 使用小米 MiMo v2.5 TTS，并将项目、设置和生成的音频保存在本地。

## 功能

### 逐句配音工作流

- 粘贴脚本，预览自动切句；也可以手动按行输入，一行一句。
- 通过可配置的并发任务池批量生成（1–16 个并发请求）。
- 逐句播放、编辑、重新生成、重试失败任务，并查看可读的错误信息。
- 编辑句子后会自动清理旧音频并开始新的生成任务。
- 每句保留最近 5 个音频版本，并可以在版本之间切换。

### 声音生成

- MiMo 基础音色，包含中文和英文预置音色。
- 根据文字描述进行声音设计，并保存可复用的声音设计方案。
- 使用 WAV 或 MP3 样本进行声音克隆，并保存可复用的本地样本。
- 基础音色和声音克隆支持可选的自由文本演绎指令。
- 独立试听声音，不会写入句子的音频历史。
- 在设置中心按能力编辑模型 ID，并分别进行真实合成测试。

### 本地剪辑协作

- 本地项目：脚本、声音设置和音频缓存按项目管理。
- 支持 macOS 原生文件拖拽，可拖入剪映、Premiere、DaVinci Resolve、Final Cut Pro 等软件。
- 可将音频文件复制到 macOS 剪贴板，或在 Finder 中定位文件。
- 自动清理被淘汰的历史版本和不再使用的音频缓存。
- 支持浅色、深色和跟随系统主题；界面支持 English 与简体中文。

## 当前支持的 Provider

Provider 注册结构已预留扩展能力，但当前只实现了小米 MiMo。

| Provider | 协议 | 默认 Base URL | 支持模式 |
| --- | --- | --- | --- |
| Xiaomi MiMo | Chat Completions 风格 TTS | `https://api.xiaomimimo.com/v1` | 基础音色、声音设计、声音克隆 |

新建 MiMo 配置时会使用以下默认模型映射，所有模型 ID 都可以在设置中心编辑：

| 模式 | 默认模型 |
| --- | --- |
| 基础音色 | `mimo-v2.5-tts` |
| 声音设计 | `mimo-v2.5-tts-voicedesign` |
| 声音克隆 | `mimo-v2.5-tts-voiceclone` |

API 使用方式和账号信息请参考 [MiMo v2.5 语音合成文档](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5)。

### 声音克隆限制

样本保存或发送前会进行本地校验：必须是签名有效的 WAV 或 MP3 文件，时长小于 30 秒，并且
转换为完整 Base64 Data URI 后小于 MiMo 的 10 MB 限制。

## 快速开始

### 环境要求

- 当前 MVP 以 macOS 为主要目标平台，原生拖拽、剪贴板、Finder 和 Keychain 集成也以 macOS 为准。
- 较新版本的 Node.js/npm。
- 与项目 Tauri 工具链兼容的 Rust 和 Cargo（Rust 1.77.2 或更高版本）。
- 一个 MiMo API Key。

### 启动桌面应用

```bash
npm install
npm run tauri dev
```

首次启动后：

1. 打开设置，添加一套 MiMo API 配置。
2. 填入 API Key，并测试需要使用的能力。
3. 粘贴脚本，选择声音模式，生成逐句音频。

如果只进行前端开发，可以使用 `npm run dev`。Tauri 命令和 macOS 原生行为需要通过桌面应用命令运行。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动仅包含前端的 Vite 开发服务器 |
| `npm run tauri dev` | 启动完整 Tauri 桌面应用 |
| `npm run build` | 类型检查并构建前端 |
| `npm run tauri build` | 构建生产桌面安装包 |
| `npm run lint` | 运行 Biome 检查 |
| `npm run lint:fix` | 使用 Biome 自动修复 lint 问题 |
| `npm run format` | 使用 Biome 格式化仓库 |
| `npm test` | 运行前端和 Rust 测试 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 检查 Rust 后端 |

## 架构与数据存储

```text
React + TypeScript + Zustand
          │ Tauri IPC
          ▼
Rust + reqwest ──────► MiMo v2.5 TTS API
          │
          ├─ 项目元数据与偏好设置：localStorage
          ├─ API Key：macOS Keychain
          └─ WAV 音频与声音样本：本地音频缓存
```

- 前端负责项目和设置状态；Rust 负责 HTTP 请求、文件读写、音频缓存和 macOS 原生集成。
- API Key 按 API 配置分别存储在 macOS Keychain，不会写入 `localStorage`。
- 生成的音频写入本地。应用会优先使用系统缓存/数据目录，开发环境不可写时回退到 `.cache/audio`。
- 声音克隆样本会复制到本地声音样本缓存，只有在发起声音克隆生成或试听请求时才会发送给 MiMo。

## 项目结构

```text
draft-whisper/
├── docs/                 # 产品需求和项目文档
├── src/                  # React 前端
│   ├── components/dw/    # DraftWhisper UI
│   ├── hooks/            # 生成与播放 hooks
│   ├── services/         # Tauri IPC service 封装
│   ├── stores/           # Zustand stores
│   ├── types/            # TypeScript 领域类型
│   └── utils/            # 切句、ID、缓存和配置工具
├── src-tauri/            # Rust/Tauri 后端
│   ├── src/lib.rs        # Tauri 初始化和命令注册
│   └── src/tts.rs        # MiMo 请求、音频缓存和原生操作
├── tests/                # 前端与 Rust 相关测试
├── package.json
└── biome.json
```

## 当前范围

原生文件拖拽、剪贴板、Finder 和 Keychain 功能与 macOS 绑定；随着 Provider 和桌面架构继续演进，macOS 仍是当前主要支持平台。

## License

[MIT](LICENSE)
