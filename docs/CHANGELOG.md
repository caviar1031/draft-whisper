# Changelog

All notable changes to DraftWhisper will be documented in this file.

## [Unreleased]

### Fixed
- 原生文件拖拽使用 `NSWorkspace.iconForFileType` 获取音频图标，修复因未公开的 `NSImageName` 常量导致图标获取失败的问题
- 前端 `nativeDragFile` 调用添加 `.catch()` 兜底，避免 unhandled promise rejection

### Changed
- 设置页从弹出层（Popover）改为全屏页面，点击标题栏齿轮按钮切换显示
- 设置按钮图标从铅笔改为齿轮（Settings）
- Model 下拉列表改为手动点击按钮从 API 获取，获取失败时回退到内置默认列表

### Added
- `tts_list_models` Rust 命令：调用 `GET {baseUrl}/v1/models` 获取可用模型列表
- TTS 并行生成：支持在设置中配置并发数（1-20），使用 worker 池模式并行调用 API
- 句子新增 `queued` 状态：等待生成的句子显示灰色圆点，与正在生成的蓝色脉冲区分
- 状态栏显示当前活跃请求数：`Generating X / Y (N active)...`

## [0.1.0] - 2026-06-29

### Added
- MVP 核心功能：导入文本、自动切句、TTS 生成、试听播放、单句重新生成、本地缓存
- 小米 MiMo v2.5 TTS 协议支持（chat-completions 风格）
- macOS Liquid Glass 毛玻璃窗口（window-vibrancy）
- 原生红黄绿交通灯按钮
- 原生文件拖拽（NSDraggingSession）支持拖入剪映/Premiere
- 复制到剪贴板、Finder 中显示
- 设置页：Base URL / API Key / Model / Voice / Speed 配置 + API 连通性测试
- Zustand 状态管理 + 持久化
- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui 技术栈
