# Rust / Objective-C 编译警告清理需求

## 1. 任务背景

当前 macOS Rust 构建与测试能够通过，但 `src-tauri/src/lib.rs` 和
`src-tauri/src/tts.rs` 中使用旧版 `objc` 宏的代码会产生多条
`unexpected cfg condition value: cargo-clippy` 警告。

警告主要来自以下宏：

- `msg_send!`
- `class!`
- `sel!`
- `sel_impl!`

相关代码负责 macOS 窗口标题栏、毛玻璃效果和原生文件拖拽，属于核心桌面集成路径。
本任务只清理编译警告并降低 Objective-C 桥接代码的维护风险，不改变产品行为。

## 2. 开发目标

1. 消除项目代码触发的 Rust / Objective-C 编译警告。
2. 保持当前 macOS 窗口、标题栏和原生文件拖拽行为不变。
3. 保持现有 Tauri IPC 命令名称、参数和返回值不变。
4. 保持 Rust `rust-version = 1.77.2` 兼容约束。
5. 尽可能减少旧 `objc` 与 `objc2` 体系并存；若不能在本次安全完成迁移，需说明原因。

## 3. 范围

允许修改：

- `src-tauri/src/lib.rs`
- `src-tauri/src/tts.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- 与本任务直接相关的 Rust 测试
- 必要的项目说明或变更记录

重点检查：

- `setup` 中的 `NSWindow` 获取和 `setTitlebarAppearsTransparent:`
- `tts_drag_file` 中动态 `NSDraggingSource` 类注册
- `NSString`、`NSURL`、`NSWorkspace`、`NSEvent`、`NSDraggingItem` 与 `NSArray` 调用
- Objective-C 对象生命周期、线程要求、空指针处理和所有 `unsafe` 边界
- `objc`、`objc2-app-kit`、`objc2-foundation` 依赖是否仍全部必要

## 4. 非目标

本任务不得顺带实施以下改动：

- 修改前端 UI、状态管理或 TTS 协议
- 修改 IPC command 契约
- 重构音频缓存、Keychain 或项目持久化
- 增加 Windows/Linux 对原生拖拽的支持
- 改变窗口尺寸、透明度、交通灯布局或 Always On Top 行为
- 改变拖拽图标、拖拽操作类型或目标文件路径
- 升级 Tauri、React 或其他无关依赖

## 5. 实现约束

### 5.1 禁止以屏蔽代替修复

不得使用以下方式让检查表面通过：

- crate、module 或函数级全局 `#[allow(unexpected_cfgs)]`
- `RUSTFLAGS=-A warnings`、`-A unexpected_cfgs` 或等价配置
- 在 Cargo 配置中无条件忽略全部警告
- 删除 macOS 原生功能或绕过相关代码编译
- 直接关闭 `check-cfg`

如果上游依赖确实无法在当前 MSRV 下消除某条警告，只允许使用范围最小、带原因注释的局部兼容措施，
并在交付说明中列出上游来源、影响范围和后续移除条件。

### 5.2 Objective-C 迁移原则

优先评估使用现有 `objc2-app-kit`、`objc2-foundation` 和 `objc2` 生态的类型化 API
替换旧 `objc` 宏。迁移时必须：

- 不猜测 selector 签名和 ABI 类型
- 使用 AppKit/Foundation 中已有的公开类型与常量
- 避免新增不必要的动态类或永久泄漏对象
- 对不可避免的 `unsafe` 给出具体安全依据
- 避免跨线程访问仅允许主线程使用的 AppKit 对象

如果保留动态 Objective-C 类注册，应保证注册只发生一次，并安全处理类已存在或注册失败的情况，
不得依赖可触发应用崩溃的 `unwrap()`。

### 5.3 行为兼容

以下行为必须保持：

- macOS 主窗口继续应用毛玻璃效果
- Overlay 标题栏保持透明，系统交通灯按钮正常显示
- 应用关闭后隐藏窗口，重新点击 Dock 图标可以恢复
- `tts_drag_file` 继续以文件 URL 发起 `NSDragOperationCopy`
- 生成的 WAV 能拖入 Finder 及支持的剪辑软件
- 非 macOS 平台仍返回明确的“不支持”错误
- 路径仍必须经过 `is_in_audio_dir` 校验

## 6. 验收标准

### 6.1 自动化检查

在仓库根目录执行：

```bash
npm run lint
npm run build
npm test
```

在 `src-tauri` 目录执行：

```bash
cargo fmt --check
cargo check --all-targets
cargo test
cargo clippy --all-targets -- -D warnings
```

要求：

- 所有命令退出码为 0。
- 不再出现由项目中的 `objc` / `objc2` 调用触发的 `unexpected_cfgs` 警告。
- 不新增 Rust 或 TypeScript 警告。
- 若 `xcrun`、Xcode 或文件系统事件产生环境级输出，必须与项目编译警告区分记录，
  不得通过修改业务代码掩盖环境问题。

### 6.2 macOS 手工回归

使用 `npm run tauri dev` 至少验证：

1. 主窗口正常启动，透明背景和毛玻璃效果存在。
2. 红黄绿交通灯位置正常，窗口缩放后仍正常。
3. 关闭窗口后应用不退出，再次点击 Dock 图标可恢复窗口。
4. 已生成音频可以执行 Finder 定位。
5. 已生成音频可以触发原生拖拽，并成功拖入 Finder。
6. 条件允许时，至少验证一个目标剪辑软件接收拖入的 WAV 文件。

如无法执行某项手工验证，交付时必须明确标记为“未验证”，不能写成通过。

## 7. Agent 交付要求

实现 Agent 完成后应提供：

- 修改文件清单和核心技术方案
- 依赖新增、删除或版本变化及理由
- 所有验收命令的结果
- 手工回归结果
- 仍存在的警告及其来源
- `unsafe` 代码变化和安全依据
- 已知风险与建议的后续工作

不得自行合并到 `developer`，也不得重写或删除其他分支。提交前应检查 `.gitignore`，
仅提交与本需求直接相关的文件。

## 8. 评审重点

评审将重点检查：

1. 是否真正消除了警告，而不是扩大 `allow` 范围。
2. selector、参数、返回类型和 Objective-C ABI 是否正确。
3. AppKit 调用是否保证在主线程执行。
4. Objective-C 对象所有权和生命周期是否清晰。
5. 动态类注册是否可能重复、失败或发生数据竞争。
6. 是否保留路径安全检查和 IPC 契约。
7. 是否维持 Rust 1.77.2 的最低版本约束。
8. 是否存在与任务无关的依赖升级或业务重构。
9. 自动化测试与手工回归证据是否完整可信。
