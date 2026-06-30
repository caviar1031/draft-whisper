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

---

## 不包含

✕ AI 智能断句

✕ 多 Provider

✕ 项目管理

✕ 云同步

✕ 历史版本

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

覆盖旧音频。

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

重新生成：

覆盖对应文件。

---

## 6.9 设置

设置：

```
Base URL

API Key

Model

Voice

Speed
```

支持：

Test API。

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

JSON

Audio Files

---

## API

OpenAI Compatible API

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

duration
```

Project

```
voice

model

speed

sentences[]
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
* 多音色
* 快捷键
* 深色模式
* 菜单栏模式

---

## v0.5

* Project
* 批量生成
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
* 配音项目管理

---

# 产品原则

DraftWhisper 不做一个「功能很多」的软件，而是做一个「让视频创作者几乎不用思考就能完成配音」的工具。

所有功能都遵循三个原则：

1. **更少点击。**
2. **更快反馈。**
3. **更符合剪辑工作流。**