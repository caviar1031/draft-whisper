# DraftWhisper 类型、Service 与 TTS 后端架构重构需求

## 1. 任务元数据

- 目标分支：`codex/refactor-types-service-rust-modules`
- 基线分支：`develop`
- 基线提交：`6b237cca06747662d564a46a32f8d3167c936300`
- 任务 worktree：`/Users/caviar/Developer/Projects/draft-whisper-refactor-architecture`
- 实施状态：已完成，待评审

本任务是一次保持现有产品行为与 Tauri IPC 契约不变的架构重构。实现 Agent 必须先阅读仓库根目录的 `AGENTS.md` 和 `docs/PRD.md`，并以 PRD 为最终产品行为依据。

## 2. 背景

当前前端类型定义、状态存储和 IPC service 存在职责错位与反向依赖：

- `LanguagePreference` 位于 `api-config.ts`，导致设置领域依赖 API 配置领域。
- `TtsMode` 位于 `project.ts`，但底层 API 配置又反向依赖项目类型。
- `TtsParams`、`TtsResult` 和声音样本 IPC 返回类型散落在 `src/services/tts.ts`。
- `Settings` 的所有字段均为可选，运行时完整状态与持久化旧数据输入没有区分。
- `project-store.ts` 重复定义了 `ProjectData`，并硬编码默认音色 `"冰糖"`。
- 项目声音相关字段平铺，模式之间的约束无法由 TypeScript 判别联合表达。
- `src/services/tts.ts` 同时承担 TTS、音频缓存、项目目录、凭据和声音样本等多类职责。
- `src-tauri/src/tts.rs` 超过 2000 行，混合协议、存储、校验、项目、凭据、平台原生操作及测试。
- 多个桶文件与项目当前的精准导入习惯冲突。
- 仓库中存在已确认未引用的脚手架和旧原型资源。

## 3. 总体目标

1. 建立自底向上的前端类型依赖 DAG，消除反向依赖和跨领域类型放置错误。
2. 明确区分持久化边界的不可信/不完整输入与运行时完整状态。
3. 使用 `Project` 作为项目 store 的唯一领域数据类型，移除重复结构。
4. 用可判别的模式配置表达基本音色、声音设计和声音克隆约束，同时保留模式切换前的选择。
5. 从当前默认 API Config 或 Provider Catalog 动态解析默认音色，不保留硬编码音色。
6. 按清晰领域边界拆分前端 service，不为每个 IPC 命令机械创建文件。
7. 删除桶文件并统一使用精准文件路径导入。
8. 按标准 Rust 模块边界拆分 `tts.rs`，使协议、存储、凭据和平台代码可独立测试与维护。
9. 删除已确认未引用的资源。
10. 保持 Tauri IPC 命令名、参数、返回值、错误传播、持久化数据兼容和用户可见行为不变。

## 4. 允许修改范围

实现 Agent 可以修改以下范围内的文件：

- `src/types/**`
- `src/services/**`
- `src/stores/**`
- `src/utils/**`
- `src/hooks/**`
- `src/components/dw/**`
- `src/App.tsx`
- `src/assets/**`
- `public/icons.svg`
- `tests/**`
- `src-tauri/src/**`
- `AGENTS.md`
- 与本任务直接相关的配置文件，但只有在确有必要时才可修改

实现 Agent不得修改与本任务无关的产品文案、视觉样式、依赖版本、应用标识、打包配置或发布版本。

## 5. 非目标

以下内容不属于本任务：

- 新增 TTS Provider 或修改 Provider 能力矩阵。
- 修改 MiMo、Fish Audio 或自定义 OpenAI 兼容 API 的外部协议。
- 修改 Tauri IPC 命令名或前端调用参数结构。
- 修改音频格式、缓存保留数量、文件命名规则或目录 fallback 顺序。
- 修改声音设计、声音克隆、最近五个版本等产品行为。
- 引入数据库、云同步、字幕、波形或新的 UI 功能。
- 重新设计界面或进行大规模 CSS 格式化。
- 顺便升级 npm、Cargo 依赖或 Rust edition。
- 为隐藏警告而增加全局 `allow`、关闭检查或使用忽略 warnings 的环境变量。
- 删除 `assets/draftwhisper-workspace.png`、`.trae/` 或其他未在本需求中确认的文件。

## 6. 前端类型目标结构

目标文件结构：

```text
src/types/
├── tts.ts
├── api-config.ts
├── settings.ts
├── sentence.ts
├── project.ts
└── voice-resource.ts
```

### 6.1 `src/types/tts.ts`

必须集中定义：

- `TtsMode`
- `ProviderId`
- `TtsParams`
- `TtsResult`

该文件应是底层领域类型，不得依赖 `project.ts`、`settings.ts`、store、service、组件或页面。

### 6.2 `src/types/settings.ts`

必须集中定义：

- `ThemePreference`
- `LanguagePreference`
- `Settings`

运行时 `Settings` 的字段必须全部为必填：

```ts
interface Settings {
  language: LanguagePreference
  theme: ThemePreference
  concurrency: number
  project: string | null
  apiConfigs: ApiConfig[]
  defaultApiConfigId: string | null
}
```

禁止继续用全部可选字段的 `Settings` 表示运行时状态。持久化迁移函数继续接收 `unknown`，并返回完整 `Settings`。如果需要描述旧数据，只能在持久化/迁移边界声明内部 DTO，不得让不完整类型扩散到业务代码。

### 6.3 `src/types/api-config.ts`

- 只通过精准路径依赖 `tts.ts` 中的 `ProviderId` 和 `TtsMode`。
- 保留 `ApiVoice`、`CapabilityMapping`、`CapabilityMappings`、`ApiConfig`。
- 不得定义语言、主题或项目类型。

### 6.4 `src/types/project.ts`

- 通过精准路径依赖 `tts.ts` 和 `sentence.ts`。
- `Project` 是 store、持久化序列化和业务工具使用的唯一运行时项目数据类型。
- 删除 `project-store.ts` 中的 `ProjectData` 重复定义。

推荐使用以下语义结构；允许命名微调，但不得恢复为当前的无约束平铺字段：

```ts
type ProjectVoiceConfig =
  | {
      mode: "basic"
      voice: string
      performancePrompt: string
    }
  | {
      mode: "voice-design"
      presetId: string | null
      prompt: string
    }
  | {
      mode: "voice-clone"
      sampleId: string | null
      samplePath: string | null
      performancePrompt: string
    }

type ProjectVoiceConfigs = {
  [Mode in TtsMode]: Extract<ProjectVoiceConfig, { mode: Mode }>
}

interface Project {
  apiConfigId: string | null
  mode: TtsMode
  voiceConfigs: ProjectVoiceConfigs
  sentences: Sentence[]
}
```

之所以保存三种模式各自的配置，而不是只保存当前联合分支，是为了保持现有模式切换行为：用户切换到其他模式再返回时，之前选择的音色、设计预设、克隆样本和演绎指令不得丢失。

### 6.5 声音资源类型

`SavedVoiceSample` 是 IPC 返回契约，应从 service 移入 `voice-resource.ts` 或另一个明确的声音资源类型文件。禁止把领域 DTO 留在 React service 实现文件中。

### 6.6 精准导入

必须删除并停止使用以下桶文件：

- `src/types/index.ts`
- `src/services/index.ts`
- `src/stores/index.ts`
- `src/utils/index.ts`

不得新增 `src/hooks/index.ts`。所有调用方使用如 `@/types/tts`、`@/services/audio`、`@/stores/project-store` 的精准路径。

同步修订 `AGENTS.md` 中要求 service 通过 `index.ts` re-export 的旧约定，使仓库规范明确统一为精准路径导入。

## 7. Settings 重构要求

- `SettingsState` 直接组合或扩展完整 `Settings`，不得再以 `Required<Settings>` 掩盖可选字段设计问题。
- 提供完整默认设置对象或工厂；不得共享并原地修改默认数组。
- `migratePersistedSettings(value: unknown)` 必须始终返回完整且已规范化的 `Settings`。
- 保持 Zustand persist 名称 `dw-settings`、现有版本迁移语义、API Key 不进入 localStorage 等行为。
- 保持并测试并发数范围、系统语言、主题和旧全局 API 配置迁移。

## 8. Project store 与持久化要求

### 8.1 单一领域模型

- 删除 `ProjectData`。
- 保存、加载和 store 状态使用 `Project`。
- 如果需要旧数据 DTO，只能作为私有迁移输入，并由单一 decoder 转为 `Project`。

### 8.2 默认值

- 删除 `DEFAULT_PROJECT_DATA` 和 store 初始状态中的 `"冰糖"` 字面量。
- 默认 API 配置优先使用 `defaultApiConfigId` 指向的有效配置。
- 默认基础音色优先取该配置的第一个有效 `voices` 项。
- 当配置缺失时，可从 Provider Catalog 的默认 Provider 获取 fallback；若仍无音色则使用空字符串并由现有校验阻止生成。
- Fish Audio 和自定义配置不得意外回退到 MiMo 的硬编码音色。

### 8.3 旧项目迁移

现有 localStorage 中的平铺字段必须无损迁移，包括：

- `apiConfigId`
- `mode`
- `voice`
- `voiceDesignId`
- `voiceDesignPrompt`
- `voiceCloneSampleId`
- `voiceClonePath`
- `performancePrompt`
- `sentences`
- 旧 Zustand `{ state: ... }` 包装
- 旧默认项目 key `dw-project`

损坏或字段缺失的数据必须回退到完整默认项目，不得导致应用启动崩溃。

### 8.4 保持行为

- `queued` / `generating` 重载后仍规范化为稳定状态。
- 删除、改写句子时仍清理不再引用的音频。
- 项目切换仍立即保存当前项目并释放 Blob URL。
- 声音资源删除仍清理当前项目和所有已保存项目中的引用。
- API 配置删除/替换仍能统计和重写所有项目引用。
- 300ms debounce 与关键节点的同步 flush 语义保持不变。

可以将纯持久化解析、序列化和迁移逻辑移到相邻的独立文件，以降低 `project-store.ts` 复杂度，但不得引入新的全局状态。

## 9. 前端 Service 重构要求

目标为四个明显领域边界，不按命令机械拆分：

```text
src/services/
├── tts.ts
├── audio.ts
├── projects.ts
└── credentials.ts
```

### 9.1 `tts.ts`

仅保留：

- `generateSentenceAudio`
- `previewVoiceClone`
- `previewVoice`
- `testTts`

### 9.2 `audio.ts`

集中管理：

- Blob URL 缓存、并发读取去重和释放
- `readAudioAsUrl`
- 音频删除与后台清理
- 复制、Finder/Explorer 定位和原生拖拽
- 声音样本保存与删除

必须保留首次播放用户手势链、生成后预加载以及项目切换释放 URL 的现有行为。

### 9.3 `projects.ts`

集中管理项目目录的列出、创建和删除 IPC。

### 9.4 `credentials.ts`

集中管理 API Key 保存、读取、删除和旧 Key 迁移 IPC。

### 9.5 IPC 不变量

以下命令名不得修改：

- `tts_generate`
- `tts_preview_voice_clone`
- `tts_preview_voice`
- `tts_test`
- `tts_read_audio`
- `tts_delete_audio_files`
- `tts_copy_to_clipboard`
- `tts_show_in_finder`
- `tts_drag_file`
- `tts_list_projects`
- `tts_create_project`
- `tts_delete_project`
- `save_voice_sample`
- `delete_voice_sample`
- `save_api_key`
- `load_api_key`
- `delete_api_key`
- `migrate_legacy_api_key`

命令的 camelCase 参数、返回值和可读错误传播必须与 `AGENTS.md` 第 8 节保持一致。

## 10. 废弃资源清理

删除以下已确认未引用且已被 Git 跟踪的文件：

- `src/assets/react.svg`
- `src/assets/vite.svg`
- `src/assets/hero.png`
- `public/icons.svg`

删除三个 `src/assets` 文件后目录应自然消失，不需要保留空目录。

`design/` 和 `design/icon-exports/` 当前为空且未被 Git 跟踪。新 worktree 中不会出现，因此没有可提交的删除；不得为了表现删除而添加占位文件。

## 11. Rust 模块化目标

建议结构如下；允许在保持相同职责边界的前提下微调名称：

```text
src-tauri/src/
├── tts/
│   ├── mod.rs
│   ├── types.rs
│   └── providers/
│       ├── mod.rs
│       ├── mimo.rs
│       ├── fish_audio.rs
│       └── custom.rs
├── audio/
│   ├── mod.rs
│   ├── storage.rs
│   └── validation.rs
├── projects.rs
├── credentials.rs
├── native_file/
│   ├── mod.rs
│   ├── macos.rs
│   └── windows.rs
├── lib.rs
└── main.rs
```

### 11.1 TTS 领域

- `tts/types.rs`：`TtsMode`、`ProviderId`、`TtsParams`、`TtsResult`。
- `tts/providers/mod.rs`：共享 HTTP client 和 Provider dispatch。
- Provider 子模块分别负责端点规范化、认证、请求体和响应解析。
- `tts/mod.rs`：生成、测试和试听命令编排。

### 11.2 Audio 领域

- 缓存目录三级 fallback 保持 `app_cache_dir/audio` → `app_data_dir/audio` → `.cache/audio`。
- 保留当前与历史 Bundle Identifier 的受限 allowlist。
- 所有读取、删除、复制、显示和拖拽路径仍必须经过 canonicalize 与可信目录校验。
- WAV/MP3 签名、时长、Base64 Data URI 10 MB 上限和 30 秒上限移动到独立校验模块。
- `VoiceSampleResult` 放在 audio 领域，不与 TTS 请求 DTO 混杂。

### 11.3 项目与凭据

- `projects.rs` 负责项目名称、Windows 保留名和项目目录命令。
- `credentials.rs` 负责 macOS Keychain、Windows Credential Manager、其他平台错误和旧账户迁移。
- 不改变 credential service/account 命名或迁移逻辑。

### 11.4 平台原生文件操作

- macOS 和 Windows 实现移动到各自 cfg 模块。
- 保留现有 `objc2` 类型化 API、`MainThreadMarker`、drag source 生命周期和 `unsafe` 安全说明。
- 保留 Windows OLE、CF_HDROP、Shell IDataObject 和 drag image 生命周期。
- 禁止在本任务中顺便替换原生实现或改变 UI 行为。

### 11.5 Rust 可见性和依赖方向

- 默认使用私有模块和私有函数。
- 跨模块只暴露最小必要的 `pub(crate)` API。
- Provider 不得依赖 Tauri command 层。
- Audio 校验不得依赖项目、凭据或平台 UI 模块。
- Tauri command 可以编排领域模块，但领域模块不得反向依赖 `lib.rs`。

### 11.6 测试迁移

现有测试必须随职责迁移到对应模块：

- Provider 端点和请求体测试放入各 Provider 模块。
- 音频格式、签名、时长和大小限制测试放入 audio validation。
- 项目名称与保留名测试放入 projects。
- credential account 测试放入 credentials。
- Windows OLE/拖拽测试保留在 Windows cfg 模块。
- 可信路径和文件名清理测试放入 audio storage 或命令编排模块。

不得因为移动困难而删除或弱化现有测试。

## 12. 实施顺序

实现必须按以下顺序推进，每一阶段先通过相关检查再进入下一阶段：

1. 记录重构前 lint、build、前端测试、Rust 测试和 `cargo check` 基线。
2. 补充 Settings/Project 迁移、动态默认音色和模式切换保留的特征测试。
3. 建立 `types/tts.ts`，修正类型依赖方向和精准导入。
4. 将 `Settings` 改为完整运行时类型并收敛持久化边界。
5. 重构 `Project`、project-store 和旧 localStorage 迁移。
6. 按四个领域拆分前端 service。
7. 删除桶文件和废弃资源，修订 `AGENTS.md`。
8. 先移动 Rust 类型和 Provider，再移动 audio、projects、credentials、native file。
9. 迁移并运行各领域测试。
10. 执行完整自动化门禁、GUI 回归和完整差异审查。

避免在同一个未经验证的补丁中同时修改持久化结构、IPC 参数和 Rust Provider 协议。

## 13. 自动化验收

交付前必须执行并如实报告：

```bash
git diff --check
npm run lint
npm run build
npm run test:frontend
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

补充要求：

- TypeScript 不得出现循环类型依赖或通过桶文件间接导入。
- `rg` 检查不得再发现业务代码从 `@/types`、`@/services`、`@/stores`、`@/utils` 根桶导入。
- `rg` 检查不得再发现项目默认值中的 `"冰糖"` 硬编码；Provider Catalog 中的合法预置音色除外。
- `src-tauri/src/tts.rs` 应被模块目录替代；不得留下一个同等规模的新上帝文件。
- 不得新增编译警告、Clippy 警告或未跟踪的构建产物。

如果因本机缺少 Windows target 等环境原因无法执行跨平台检查，必须明确写为“未验证”，不能写成通过。

## 14. 手工验收

必须在真实 macOS Tauri 应用中验证并记录结果：

1. 旧 `dw-settings` 数据可以重载并得到完整设置。
2. 旧默认项目 key 和旧平铺项目数据可以迁移。
3. 新建项目使用当前默认 API Config 的正确默认音色。
4. MiMo、Fish Audio、自定义 API Config 切换时不会残留错误 Provider 音色。
5. basic、voice-design、voice-clone 来回切换后各自选择和输入仍保留。
6. 单句生成、批量生成、失败重试、取消接管和最近五个版本正常。
7. 基础音色试听、声音设计试听、克隆试听正常。
8. 声音样本保存、删除以及跨项目引用清理正常。
9. 项目创建、切换、删除和应用重启后的恢复正常。
10. 音频首次播放、切换版本播放和项目切换后的 Blob URL 生命周期正常。
11. macOS Keychain 保存、读取、删除和旧 key 迁移正常。
12. 复制音频文件、Finder 定位和原生拖入剪辑软件正常。
13. 窗口透明、交通灯和 Dock 恢复行为未回归。

涉及真实付费用量的 TTS 测试应使用最短测试文本，并在交付说明中注明执行情况。

## 15. 交付格式

实现 Agent 完成后必须报告：

- 分支名、基线 SHA 和最终 HEAD SHA。
- 变更文件概览和最终模块结构。
- 持久化迁移策略与兼容数据样例。
- IPC 契约保持不变的确认。
- 已执行的命令及逐项结果。
- 已完成的 GUI 手工验收及结果。
- 未执行或无法执行的验证及原因。
- `git status --short`、未跟踪文件和工作区清洁度。
- 仍存在的风险或后续任务。

不得合并 `develop`、删除 worktree、提交 `.workbuddy/`/`.trae/` 等本地元数据，也不得在未获用户授权时主动创建 commit 或推送远端。
