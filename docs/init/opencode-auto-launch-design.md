# Init --opencode 功能设计文档

**日期**: 2026-04-20
**功能**: 初始化后自动启动 opencode

---

## 需求背景

用户希望在执行 `dtagent init` 命令后，能够自动拉起 opencode，减少手动操作步骤，提升使用体验。

**注意**: 由于用户已在全局配置中设置默认代理为 dtagent，因此无需在启动时执行 `/agent dtagent` 切换。

---

## 设计方案

### 命令行接口

添加 `--opencode` 选项到 `init` 命令：

```bash
# 基础用法
$ dtagent init --opencode

# 结合其他选项
$ dtagent init --opencode --decompile com.huawei.* --m2-repo D:/repository
```

### 工作流程

```
dtagent init --opencode
    ↓
执行 init 标准流程
  - 检测项目框架
  - 安装组件到 .opencode/
  - 提取 Mock 经验
  - 反编译二方件（可选）
  - 生成配置文件
    ↓
检测 --opencode 标志
    ↓
启动 opencode 进程
  - 检查 opencode 是否已安装
  - 使用 spawn 启动交互式进程
  - 在用户项目目录下启动
    ↓
用户进入 opencode 交互界面
  - 默认代理已经是 dtagent（用户全局配置）
  - 可以直接使用 /generate-dt-single 等命令
```

### 核心实现

#### 1. 命令行选项（bin/dtagent.js）

```javascript
program
  .command('init [file]')
  .option('--opencode', '初始化完成后自动启动 opencode')
  .action(async (file, options) => {
    // ... 参数解析 ...
    await initCommand(initOptions);
  });
```

#### 2. InitOptions 接口扩展（src/commands/init.ts）

```typescript
export interface InitOptions {
  // ... 其他选项 ...
  opencode?: boolean; // 初始化完成后启动 opencode
}
```

#### 3. Opencode Launcher 独立模块（src/utils/opencode-launcher.ts）

```typescript
import { spawn, execSync } from 'child_process';

/**
 * 检查 opencode 是否已安装
 */
export function isOpencodeInstalled(): boolean {
  try {
    execSync('opencode --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动 opencode 进程
 */
export async function launchOpencode(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isOpencodeInstalled()) {
      reject(new Error('opencode not found. Please install opencode first.'));
      return;
    }

    const child = spawn('opencode', [], {
      shell: true,
      stdio: 'inherit',
      cwd: projectDir,
    });

    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`opencode exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}
```

#### 4. 主流程集成（src/commands/init.ts）

```typescript
import { launchOpencode } from '../utils/opencode-launcher';

export async function initCommand(options: InitOptions): Promise<void> {
  // ... 初始化流程 ...
  
  spinner.succeed('DTAgent 初始化完成！');
  
  // 检测 --opencode 标志
  if (options.opencode && !options.dryRun) {
    console.log(chalk.blue('\n🚀 正在启动 opencode...'));
    try {
      await launchOpencode(projectDir);
    } catch (error) {
      // 友好错误提示
      console.log(chalk.yellow('\n⚠️  无法启动 opencode，请手动运行:'));
      console.log(chalk.gray('   opencode'));
    }
  } else {
    // 显示常规下一步提示
    // ...
  }
}
```

### 模块解耦设计

```
src/
├── commands/
│   └── init.ts                 # 主命令实现
│       ├── 初始化流程
│       └── 调用 launchOpencode()
│
└── utils/
    └── opencode-launcher.ts    # 独立模块
        ├── isOpencodeInstalled()
        ├── launchOpencode()
        └── getOpencodeVersion()
```

**解耦优势**:
1. **单一职责**: `init.ts` 专注于初始化逻辑，`opencode-launcher.ts` 专注于进程管理
2. **可复用**: 其他命令也可使用 `launchOpencode()` 启动 opencode
3. **可测试**: 独立模块便于单元测试
4. **易维护**: 修改启动逻辑不影响 init 主流程

### 错误处理

| 场景 | 处理方式 |
|------|---------|
| opencode 未安装 | 显示友好提示，告知手动运行命令 |
| opencode 启动失败 | 显示警告信息，但不中断流程 |
| dry-run 模式 | 跳过启动 opencode（仅预览）|
| 用户手动关闭 opencode | 正常退出，返回 code 0 |

### 技术要点

1. **独立模块**: 提取 `opencode-launcher.ts` 作为独立工具模块
2. **使用 `spawn` 而非 `execSync`**
   - `spawn` 支持 `stdio: 'inherit'`，保持交互式体验
   - 用户可以与 opencode 正常交互
3. **工作目录设置**
   - `cwd: projectDir` 确保 opencode 在正确的项目目录启动
   - 自动加载项目中的 `.opencode/` 配置
4. **前置检查**
   - 启动前先检查 opencode 是否可用（`opencode --version`）
   - 提前发现环境问题，给出明确错误信息
5. **无需代理切换**
   - 用户全局配置已设置默认代理为 dtagent
   - 直接启动 opencode 即可使用 dtagent 代理

## 使用示例

### 示例 1: 基础用法

```bash
$ cd my-java-project
$ dtagent init --opencode
🚀 DTAgent 初始化

✓ 检测到 Maven 项目 (Java 17)
✓ 已安装组件到 .opencode/
✓ 发现 3 个 Mock 模式
✓ 已生成 DT_AGENTS.md

🚀 正在启动 opencode...
# opencode 启动，自动使用 dtagent 代理
# 用户现在可以直接使用 dtagent 命令
>
```

### 示例 2: 结合反编译

```bash
$ dtagent init --opencode --decompile com.huawei.* --m2-repo D:/repo

🚀 DTAgent 初始化

✓ 检测到 Maven 项目 (Java 17)
✓ 已安装组件到 .opencode/
✓ 发现 3 个 Mock 模式
✓ 反编译完成: 15 新增, 0 跳过
✓ 已生成索引: 127 个类
✓ 已生成 DT_AGENTS.md

🚀 正在启动 opencode...
```

### 示例 3: opencode 未安装

```bash
$ dtagent init --opencode

🚀 DTAgent 初始化
...
✓ DTAgent 初始化完成！

🚀 正在启动 opencode...

⚠️  无法启动 opencode，请手动运行:
   opencode
```

## 兼容性

- **Node.js**: >= 18.0.0（与项目要求一致）
- **OpenCode**: 任意版本（需支持基本命令）
- **操作系统**: Windows, macOS, Linux（spawn 跨平台）

## 测试建议

1. **正常流程测试**
   - `dtagent init --opencode` 成功启动 opencode
   - 确认自动使用 dtagent 代理（用户配置）

2. **错误场景测试**
   - opencode 未安装时的提示
   - 无效项目目录的处理

3. **组合选项测试**
   - `--opencode --dry-run`（应跳过启动）
   - `--opencode --decompile ...`（组合使用）

4. **交互测试**
   - 验证可以在启动的 opencode 中正常交互
   - 验证可以正常退出 opencode

5. **模块独立性测试**
   - 验证 `opencode-launcher.ts` 可被其他模块复用
   - 验证 `init.ts` 不直接依赖 `spawn`/`execSync`

## 相关文件

- `bin/dtagent.js` - CLI 入口，添加 `--opencode` 选项
- `src/commands/init.ts` - init 命令实现，调用 launcher
- `src/utils/opencode-launcher.ts` - opencode 启动器独立模块
- `templates/agents/dtagent.md` - dtagent 代理配置

---

**实现状态**: ✅ 已完成

