# Changelog

All notable changes to DraftWhisper will be documented in this file.

## [Unreleased]

### Fixed
- 生成任务按项目和句子隔离，避免新任务导致其他句子永久停留在等待/生成状态
- 切换或删除项目时取消当前任务接管，并清理迟到请求生成的孤儿音频
- API Key 改为防抖串行写入 Keychain，避免逐字符并发写入覆盖最终值
- 统一项目名称校验，阻止 TTS 命令通过项目参数进行路径穿越
- 修复 Biome 检查范围和 JSONC 解析，`npm run lint` 可作为稳定质量门禁
- release 构建使用编译期调试条件，避免 `open_devtools` 阻断生产编译

### Added
- macOS 与 Windows 跨平台 CI/CD：原生检查、桌面构建及双平台安装包发布
- 每句最多保留最近 5 个音频版本，淘汰、重写和删除时自动清理缓存
- 项目删除能力，同时删除项目元数据和缓存音频
- 前端任务调度/Keychain 保存测试与 Rust 端点/路径测试
- 用户可见的 TTS、项目操作和 Keychain 保存错误
- 对设置页、脚本编辑器、项目面板和拼音库进行代码拆分，消除主包体积警告

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

### Changed
- 精简设置页文案，移除重复的分区说明、主题提示和声音资源库描述
- 设置页标题区改为透明背景，仅保留底部分割线；通用设置和生成设置保持紧凑布局
- 语言和主题选择改为可控的自定义下拉菜单，支持贴边展开、空间不足时向上展开及键盘操作
- 声音设计库和声音克隆库直接作为分区展示，声音设计描述改为单行省略并支持悬浮查看全文
- 重做声音设计的生成试听区域，统一生成、播放和完成状态的视觉层级
- 移除声音设计库卡片上没有实际价值的 reload 操作及对应的重新生成逻辑
- 编辑声音设计弹窗按“声音设计”和“试听”分区，明确区分提示词、API 配置与试听文案
- 修复编辑弹窗文本框受 flex 布局影响无法调整尺寸的问题，支持垂直拖拽缩放
- 移除设置页右侧关闭按钮，统一使用标题栏齿轮切换设置页
- 设置页标题区与主页 Toolbar 统一高度，使底部分割线保持同一位置

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
