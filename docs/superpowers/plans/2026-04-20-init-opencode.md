# Init --opencode 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `dtagent init` 命令中添加 `--opencode` 选项，初始化完成后自动启动 opencode。

**Architecture:** 
1. 在 CLI 入口添加 `--opencode` 命令行选项
2. 扩展 InitOptions 接口支持 opencode 参数
3. 创建独立的 opencode-launcher.ts 模块处理进程启动
4. 在 init.ts 主流程中集成启动逻辑

**Tech Stack:** Node.js, TypeScript, Commander.js, child_process.spawn

---

## 文件结构

```
src/
├── commands/
│   └── init.ts                    # 修改：添加 opencode 调用逻辑
├── utils/
│   └── opencode-launcher.ts       # 新建：独立启动模块
└── index.ts                       # 修改：导出 launcher（可选）

bin/
└── dtagent.js                     # 修改：添加 --opencode 选项

docs/
├── init/
│   └── opencode-auto-launch-design.md  # 已存在：设计文档
└── superpowers/
    └── plans/
        └── 2026-04-20-init-opencode.md   # 本计划文档
```

---

## Task 1: 添加命令行选项

**Files:**
- Modify: `bin/dtagent.js:13-31`

- [ ] **Step 1: 添加 --opencode 选项到 init 命令**

```javascript
// bin/dtagent.js
program
  .command('init [file]')
  .description('初始化 DTAgent 配置')
  .option('-d, --dry-run', '仅显示将要执行的操作，不实际执行')
  .option('-f, --force', '强制覆盖已有配置')
  .option('--decompile <packages>', '反编译二方件，多个包用逗号分隔（如 com.alibaba.*,com.taobao.*）')
  .option('--m2-repo <path>', 'Maven 本地仓库路径')
  .option('--opencode', '初始化完成后自动启动 opencode')  // 新增选项
  .action(async (file, options) => {
    const { initCommand } = require('../dist/commands/init');
    const initOptions = { ...options, file };
    if (options.decompile) {
      initOptions.decompilePackages = options.decompile.split(',').map(s => s.trim());
    }
    if (options.m2Repo) {
      initOptions.m2Repo = options.m2Repo;
    }
    await initCommand(initOptions);
  });
```

- [ ] **Step 2: 验证命令行选项**

Run: `node bin/dtagent.js init --help`
Expected: 输出中包含 `--opencode` 选项

- [ ] **Step 3: Commit**

```bash
git add bin/dtagent.js
git commit -m "feat(cli): add --opencode option to init command"
```

---

## Task 2: 扩展 InitOptions 接口

**Files:**
- Modify: `src/commands/init.ts:14-21`

- [ ] **Step 1: 添加 opencode 属性到 InitOptions**

```typescript
// src/commands/init.ts
export interface InitOptions {
  dryRun?: boolean;
  force?: boolean;
  file?: string;
  decompilePackages?: string[];
  m2Repo?: string;
  opencode?: boolean;  // 新增属性
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat(types): add opencode option to InitOptions interface"
```

---

## Task 3: 创建 Opencode Launcher 模块

**Files:**
- Create: `src/utils/opencode-launcher.ts`

- [ ] **Step 1: 创建 opencode-launcher.ts 文件**

```typescript
/**
 * Opencode Launcher - 启动 opencode 工具
 *
 * 提供统一的 opencode 启动接口，支持错误处理和交互式体验
 */

import { spawn, execSync } from 'child_process';

/**
 * 检查 opencode 是否已安装
 * @returns true 如果 opencode 可用
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
 *
 * @param projectDir - 项目目录（opencode 将以此目录为工作目录）
 * @returns Promise 在 opencode 退出时 resolve
 * @throws Error 如果 opencode 未安装或启动失败
 */
export async function launchOpencode(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查 opencode 是否已安装
    if (!isOpencodeInstalled()) {
      reject(new Error('opencode not found. Please install opencode first.'));
      return;
    }

    // 启动 opencode（用户配置中已设置默认代理为 dtagent）
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

/**
 * 获取 opencode 版本信息
 *
 * @returns 版本号字符串，如果未安装则返回 null
 */
export function getOpencodeVersion(): string | null {
  try {
    const version = execSync('opencode --version', { 
      encoding: 'utf-8', 
      stdio: ['ignore', 'pipe', 'ignore'] 
    });
    return version.trim();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npm run build`
Expected: 编译成功，生成 `dist/utils/opencode-launcher.js`

- [ ] **Step 3: Commit**

```bash
git add src/utils/opencode-launcher.ts
git commit -m "feat(utils): create opencode-launcher module"
```

---

## Task 4: 在 init.ts 中集成启动逻辑

**Files:**
- Modify: `src/commands/init.ts`

- [ ] **Step 1: 导入 launchOpencode**

在文件顶部添加导入：
```typescript
// src/commands/init.ts
import { execSync } from 'child_process';
import { detectFramework, formatFrameworkInfo, FrameworkInfo } from '../utils/detector';
import { parsePomDependencies, identifyInternalDeps, scanLocalMavenRepo, setMavenConfig } from '../utils/dependency';
import { decompileJars, generateIndex, saveIndex } from '../utils/cfr';
import { launchOpencode } from '../utils/opencode-launcher';  // 新增导入
```

- [ ] **Step 2: 修改 initCommand 成功后的逻辑**

找到 `spinner.succeed('DTAgent 初始化完成！');` 后的代码，修改为：

```typescript
// src/commands/init.ts - initCommand 函数末尾
spinner.succeed('DTAgent 初始化完成！');

// Step 5: Launch opencode if --opencode flag is set
if (options.opencode && !options.dryRun) {
  console.log(chalk.blue('\n🚀 正在启动 opencode...'));
  try {
    await launchOpencode(projectDir);
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  无法启动 opencode，请手动运行:'));
    console.log(chalk.gray('   opencode'));
    console.log(chalk.gray('\n然后执行 /agent dtagent 切换到 dtagent 代理\n'));
  }
} else {
  console.log(chalk.green('\n✅ 下一步操作:'));
  console.log(chalk.gray('   1. 运行 OpenCode（自动使用 DTAgent）'));
  console.log(chalk.gray('   2. 执行 /generate-dt-single <file> 生成测试'));
  console.log(chalk.gray('   3. 在 .opencode/skills/generate-java-ut/experiences/ 添加经验'));
  console.log(chalk.gray('\n📁 经验库位置:'));
  console.log(chalk.gray('   .opencode/skills/generate-java-ut/experiences/'));
  console.log(chalk.gray('   ├── README.md      # 使用说明'));
  console.log(chalk.gray('   ├── template.md    # 经验模板'));
  console.log(chalk.gray('   └── your-*.md      # 你的自定义经验'));
  console.log(chalk.gray('\n⚙️  默认代理: dtagent（已配置在 opencode.json）\n'));
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat(init): integrate opencode launcher into init command"
```

---

## Task 5: 更新错误提示信息（简化版）

由于默认代理已经是 dtagent，简化错误提示：

**Files:**
- Modify: `src/commands/init.ts`（错误提示部分）

- [ ] **Step 1: 简化错误提示**

将错误处理从：
```typescript
} catch (error) {
  console.log(chalk.yellow('\n⚠️  无法启动 opencode，请手动运行:'));
  console.log(chalk.gray('   opencode'));
  console.log(chalk.gray('\n然后执行 /agent dtagent 切换到 dtagent 代理\n'));
}
```

改为：
```typescript
} catch (error) {
  console.log(chalk.yellow('\n⚠️  无法启动 opencode，请手动运行:'));
  console.log(chalk.gray('   opencode\n'));
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "refactor(init): simplify error message for opencode launch"
```

---

## Task 6: 完整功能测试

**Files:**
- 测试命令: `dtagent init --opencode`

- [ ] **Step 1: 构建项目**

Run: `npm run build`
Expected: 编译成功，生成 dist/ 目录

- [ ] **Step 2: 测试帮助信息**

Run: `node bin/dtagent.js init --help`
Expected: 输出包含 `--opencode` 选项描述

- [ ] **Step 3: 测试预览模式**

Run: `node bin/dtagent.js init --opencode --dry-run`
Expected: 
- 显示预览信息
- 不启动 opencode（因为 dry-run 模式跳过）

- [ ] **Step 4: 测试正常流程（在测试项目中）**

Run: 在测试项目中执行 `node /path/to/dtagent init --opencode`
Expected:
- 完成初始化流程
- 显示 "正在启动 opencode..."
- 成功启动 opencode 进程

- [ ] **Step 5: Commit 测试文档**

```bash
git add -A
git commit -m "test: verify --opencode feature functionality"
```

---

## Task 7: 更新文档

**Files:**
- Modify: `docs/init/opencode-auto-launch-design.md`（添加实现状态）

- [ ] **Step 1: 更新设计文档**

在文档末尾添加：

```markdown
## 实现记录

**实现日期**: 2026-04-20
**状态**: ✅ 已完成

### 实现文件列表

- `bin/dtagent.js` - 添加 `--opencode` 选项
- `src/commands/init.ts` - 集成启动逻辑
- `src/utils/opencode-launcher.ts` - 独立启动模块

### 测试验证

- [x] 命令行选项显示正确
- [x] TypeScript 编译通过
- [x] 正常流程启动 opencode 成功
- [x] dry-run 模式跳过启动
- [x] 错误处理友好提示
```

- [ ] **Step 2: Commit 文档更新**

```bash
git add docs/init/opencode-auto-launch-design.md
git commit -m "docs: update design doc with implementation status"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| 需求 | 任务 | 状态 |
|------|------|------|
| 添加 --opencode 选项 | Task 1 | ✅ |
| 扩展 InitOptions 接口 | Task 2 | ✅ |
| 创建独立启动模块 | Task 3 | ✅ |
| 集成启动逻辑到 init.ts | Task 4 | ✅ |
| 简化错误提示 | Task 5 | ✅ |
| 功能测试 | Task 6 | ✅ |
| 文档更新 | Task 7 | ✅ |

### 2. Placeholder Scan

- [x] 无 "TBD", "TODO" 等占位符
- [x] 每个步骤包含完整代码
- [x] 文件路径精确
- [x] 命令和预期输出明确

### 3. Type Consistency

- [x] `InitOptions.opencode` 为 boolean 类型
- [x] `launchOpencode(projectDir: string): Promise<void>` 签名一致
- [x] 导入路径正确

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-init-opencode.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**

---

**Note**: 由于设计文档中已说明实现已完成，本计划用于文档化和验证已有实现。如果是新建功能，请按任务顺序执行。
