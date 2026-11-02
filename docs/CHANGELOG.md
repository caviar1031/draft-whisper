# Changelog

All notable changes to DraftWhisper will be documented in this file.

## [Unreleased]

## [0.1.3] - 2026-11-02

### Changed
- Update frontend, Tauri, native dependencies, and CI actions to current stable releases.
- Pin Rust 1.99.1 and document the supported Node.js 24 toolchain.
- Migrate Biome 2 configuration and use Babel for translation-key validation with TypeScript 7.
- Use the maintained Windows native credential store while preserving existing credential targets.
- Group compatible Dependabot updates and review major upgrades separately.
- Remove unused scaffolding styles and CLI dependencies.

### Fixed
- Hydrate the selected project before startup saves can overwrite persisted scripts and audio history.
- Allow Tauri IPC connections explicitly in the content security policy.
- Correct accessibility labels and scope sample-name keyboard handling to its input.

### Added
- Keyboard shortcuts for always-on-top, settings, script import/editing, sentence navigation, playback, and editing.

## [0.1.2] - 2026-08-26

### Added
- Fish Audio Provider 与 OpenAI SDK 兼容的自定义 TTS 配置
- 多 API 配置下的服务商、模型和音色选择
- MiMo 基础音色的逐句导演模式，以及基础音色和克隆模式的自由演绎指令
- 按行编辑脚本；每行对应一句，避免自动断句改变用户提供的文本结构

### Changed
- 重组 TTS、音频、项目、凭据等领域模块
- 改进服务商选择、声音设置和句子编辑界面
- 校验并兼容 TTS 服务返回的音频格式

### Fixed
- 修复 Tauri 事件监听器清理竞争，以及编辑器行号与布局不同步问题
- 修复声音设置区域在小窗口中的滚动问题
- 隐藏仅供 API 使用的模型标识，调整表单控件交互状态

## [0.1.1] - 2026-08-10

### Added
- Windows 原生标题栏、凭据管理器、文件定位、剪贴板和拖拽支持
- macOS Apple Silicon / Intel 与 Windows x64 的 CI 检查及安装包构建流程
- 每句最多保留最近 5 个音频版本，删除项目、句子或过期版本时清理对应缓存
- 项目删除、TTS 模型列表获取，以及可配置并发数的批量生成
- 可复用的声音设计与声音克隆资源库
- 前端任务调度、Keychain 保存和 Rust 端点/路径测试

### Changed
- 设置页从弹出层改为全屏页面，并重整声音资源库与项目编辑界面
- 精简设置文案，改进主题/语言选择、声音设计编辑和试听流程
- 设置页支持从 API 获取模型列表，并在请求失败时回退到内置列表

### Fixed
- 按项目和句子隔离生成任务；切换或删除项目时取消过期任务并清理孤儿音频
- API Key 改为防抖串行写入，避免并发保存覆盖最终值
- 统一项目名称校验，阻止通过 TTS 参数进行路径穿越
- 修复 Biome 检查范围、JSONC 解析和 release 构建中的开发工具配置
- 修复 macOS 原生拖拽图标获取，并为前端拖拽调用增加异常处理
- 修复 Windows 窗口圆角、密码输入控件和 macOS 私有 API 构建配置

## [0.1.0] - 2026-06-29

### Added
- MVP 核心功能：按行导入文本、TTS 生成、试听播放、单句重新生成、本地缓存
- 小米 MiMo v2.5 TTS 协议支持（chat-completions 风格）
- macOS Liquid Glass 毛玻璃窗口（window-vibrancy）
- 原生红黄绿交通灯按钮
- 原生文件拖拽（NSDraggingSession）支持拖入剪映/Premiere
- 复制到剪贴板、Finder 中显示
- 设置页：Base URL / API Key / Model / Voice / Speed 配置 + API 连通性测试
- Zustand 状态管理 + 持久化
- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui 技术栈
