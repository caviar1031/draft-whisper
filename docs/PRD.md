# DraftWhisper PRD（MVP）

**版本：** v0.1.0
**产品名称：** DraftWhisper
**中文名称：** 稿语（暂定）
**产品类型：** AI 桌面配音工作台（Desktop AI Voice Workspace）
**目标平台：** macOS（优先）→ Windows
**文档状态：** MVP

---

# 1. 产品概述

## 1.1 产品简介

DraftWhisper 是一款面向视频创作者的 AI 配音桌面工具。

不同于传统 TTS 网站，DraftWhisper 不追求复杂的编辑能力，而是专注于优化视频创作中最频繁的一段工作流：

**修改一句文案 → 重新生成 → 试听 → 放进剪辑软件。**

产品将以一个常驻桌面的悬浮窗口存在，与剪映、Premiere、Final Cut 等剪辑软件配合使用，帮助创作者快速完成 AI 配音。

---

## 1.2 产品定位

一句一句管理你的配音。

不是：

* AI 助手
* 文档编辑器
* TTS 网站

而是：

**AI Voice Workspace**

---

# 2. 产品目标

MVP 只验证一件事情：

> 是否能够让创作者的配音修改效率远高于网页 TTS。

目标：

* 极低操作成本
* 快速重新生成
* 快速试听
* 快速拖入剪辑软件

---

# 3. 用户画像

目标用户：

* AI 视频创作者
* Bilibili UP 主
* 自媒体博主
* 知识分享创作者
* AI 教程创作者

典型使用流程：

```
写稿 → 开始剪视频 → 发现一句需要修改 → 修改文本 → 重新生成 → 试听 → 下载 → 拖入剪辑软件 → 继续剪辑
```

---

# 4. MVP 范围

本版本仅完成最核心能力。

## 包含

✓ 导入口播稿

✓ 自动切句

✓ 调用 TTS API

✓ 自动生成

✓ 播放试听

✓ 单句重新生成

✓ 拖拽导出音频

✓ 本地缓存

✓ 设置页

✓ 本地项目管理

✓ 最近 5 个音频版本

✓ 声音设计与声音克隆

---

## 不包含

✕ AI 智能断句

✕ 多 Provider

✕ 云同步

✕ 波形编辑

✕ 时间轴

✕ 字幕

✕ Agent

---

# 5. 用户流程

```
导入口播稿 → 自动切句 → 自动生成全部音频 → 试听 → 修改其中一句 → 重新生成这一句 → 拖入剪辑软件 → 完成
```

---

# 6. 功能设计

## 6.1 导入文本

支持：

* 粘贴文本
* txt 文件

导入后：

自动切句。

---

## 6.2 自动切句

按照：

```
。

！

？

；
```

进行拆分。

例如：

```
今天我们学习 Agent。

它是什么？

其实很简单。
```

转换：

```
① 今天我们学习 Agent。

② 它是什么？

③ 其实很简单。
```

---

## 6.3 自动生成

切句完成后：

自动开始生成。

状态：

```
等待 → 生成中 → 完成 → 失败
```

生成完成：

自动缓存到本地。

---

## 6.4 单句 Item

每一句都是独立对象。

显示：

* 文本
* 状态
* 播放
* 重新生成
* 拖拽

---

## 6.5 播放

点击：

▶︎

立即试听。

只能播放当前句。

再次点击停止。

---

## 6.6 编辑

点击文本即可编辑。

修改以后：

状态变成：

```
待生成
```

自动触发重新生成。

新版本成为当前音频，旧版本进入最近 5 个版本的历史记录。

---

## 6.7 拖拽

每一句支持：

直接拖拽。

拖到：

* 剪映
* Premiere
* DaVinci
* Final Cut

即可导入。

> MVP 不实现真正的音频剪贴板复制，而是优先保证拖拽体验。

---

## 6.8 本地缓存

所有生成音频缓存到：

```
AppData/

audio/

001.wav

002.wav
```

重新生成会创建带时间戳的新文件。每句保留最近 5 个版本，可在句子卡片中切换；
超出上限、删除项目、删除或重写句子时自动清理不再引用的缓存文件。

---

## 6.9 设置

设置：

```
Base URL

API Key

Model

Voice

Concurrency

Model Management
```

支持：

Test API。

---

## 6.10 声音模式

支持三个 MiMo v2.5 TTS 模式，切换模式时自动绑定对应模型：

| 模式 | 模型 |
| --- | --- |
| 基础音色 | `mimo-v2.5-tts` |
| 声音设计 | `mimo-v2.5-tts-voicedesign` |
| 声音克隆 | `mimo-v2.5-tts-voiceclone` |

声音设计：

* 用户输入声音描述，描述不能为空
* 描述通过 `role: user` 发送，待合成文本通过 `role: assistant` 发送

声音克隆：

* 支持导入和复用 WAV、MP3 样本
* 导入时校验文件扩展名、真实文件签名和 Base64 Data URI 大小
* 完整 Data URI 不得超过 10 MB
* 样本以 `data:{MIME};base64,{DATA}` 形式传给 MiMo
* 用户可输入自由文本的演绎指令；该字段可选，不提供预设选项
* 支持输入试听文案并生成独立试听；试听文件不进入项目句子和历史版本
* 删除样本时清除所有本地项目中对该样本的引用

模式、模型或必填配置不匹配时，批量生成和单句重新生成均禁用并显示原因。

---

# 7. UI 设计

## 设计原则

关键词：

* Apple
* Minimal
* Glass
* Floating
* Fast

整体风格：

macOS 原生应用。

---

## 窗口

宽：

420~480px

默认高度：

700px

支持：

* Resize
* Always On Top

---

## 页面结构

```
DraftWhisper

────────────────

导入口播稿

────────────────

Toolbar

Voice

────────────────

Sentence List

────────────────

Status
```

---

## Sentence Card

```
今天我们学习 Agent。

▶︎

↻

☰（拖拽）
```

---

# 8. 设计系统

整体遵循：

Apple Human Interface Guidelines。

设计关键词：

* Liquid Glass
* Vibrancy
* Large Radius
* Soft Shadow
* Blur
* Motion

组件：

GlassButton

GlassCard

GlassInput

GlassToolbar

GlassList

GlassPopover

统一设计语言。

---

# 9. 技术方案

## Desktop

Tauri 2

---

## Frontend

React

TypeScript

Vite

---

## UI

Tailwind CSS

shadcn/ui（作为基础组件）

自定义 Glass Design System

Motion

---

## State

Zustand

---

## Backend

Rust

负责：

* 文件
* 设置
* 拖拽
* 剪贴板
* 缓存
* 系统窗口

---

## Storage

localStorage（项目元数据与设置）

macOS Keychain（API Key）

Audio Files

---

## API

小米 MiMo v2.5 TTS chat-completions 协议

第一版：

只支持一种协议。

---

# 10. 数据结构

Sentence

```
id

text

status

audioPath

audioHistory[]

duration

errorMessage
```

Project

```
mode

model

voice

voiceDesignPrompt

voiceClonePath

performancePrompt

sentences[]（包含最近 5 个 audioHistory 版本）
```

VoiceSample

```
id

name

filePath

format

mimeType

byteSize

encodedSize

createdAt
```

---

# 11. 项目目录

```
DraftWhisper

├── src
│   ├── components
│   ├── features
│   ├── hooks
│   ├── services
│   ├── stores
│   ├── types
│   ├── utils
│   └── assets
│
├── src-tauri
│
├── docs
│   ├── PRD.md
│   ├── ROADMAP.md
│   ├── MVP.md
│   └── UI.md
│
└── public
```

---

# 12. 技术栈

桌面框架：

Tauri 2

语言：

TypeScript

Rust

前端：

React

Vite

样式：

Tailwind CSS

动画：

Motion

UI：

shadcn/ui

状态：

Zustand

代码规范：

Biome

Git：

GitHub

Conventional Commits

---

# 13. MVP 验收标准

用户可以：

✓ 导入口播稿

✓ 自动拆句

✓ 自动生成全部配音

✓ 播放试听

✓ 修改任意一句

✓ 单独重新生成

✓ 拖拽音频进入剪辑软件

✓ 所有音频自动缓存

✓ 重启软件后配置仍然保留

整个流程无需打开浏览器。

---

# 14. 后续 Roadmap

## v0.2

* 多 Provider
* 快捷键
* 深色模式
* 菜单栏模式

---

## v0.5

* AI 智能断句
* 波形

---

## v0.8

* Windows
* 多语言
* 自动更新
* 插件

---

## v1.0

* AI Script Assistant
* Agent Workflow
* 时间轴同步
* 云同步

---

# 产品原则

DraftWhisper 不做一个「功能很多」的软件，而是做一个「让视频创作者几乎不用思考就能完成配音」的工具。

所有功能都遵循三个原则：

1. **更少点击。**
2. **更快反馈。**
3. **更符合剪辑工作流。**
