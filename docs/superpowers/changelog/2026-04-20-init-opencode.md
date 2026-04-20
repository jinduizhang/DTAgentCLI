# Changelog: Init --opencode Feature

**日期**: 2026-04-20
**版本**: 0.1.0
**提交**: cc593f4, e84ea14

---

## 新增功能

### `--opencode` 选项

在 `dtagent init` 命令中添加 `--opencode` 选项，初始化完成后自动启动 opencode，提升用户体验。

**使用方式**:
```bash
# 基础用法
$ dtagent init --opencode

# 结合其他选项
$ dtagent init --opencode --decompile com.huawei.* --m2-repo D:/repository
```

---

## 变更文件列表

### 1. bin/dtagent.js

**变更类型**: 修改

**变更内容**:
- 在 `init` 命令中添加 `--opencode` 选项
- 选项描述: "初始化完成后自动启动 opencode"

**代码变更**:
```javascript
.option('--opencode', '初始化完成后自动启动 opencode')
```

---

### 2. src/commands/init.ts

**变更类型**: 修改

**变更内容**:
1. **导入 opencode-launcher 模块**:
   ```typescript
   import { launchOpencode } from '../utils/opencode-launcher';
   ```

2. **扩展 InitOptions 接口**:
   ```typescript
   export interface InitOptions {
     // ... 其他选项 ...
     opencode?: boolean; // 可选：初始化完成后启动 opencode
   }
   ```

3. **集成启动逻辑**:
   - 在初始化成功后检测 `--opencode` 标志
   - 调用 `launchOpencode(projectDir)` 启动 opencode
   - 支持 dry-run 模式（跳过启动）
   - 友好的错误提示

**代码变更**:
```typescript
// Step 5: Launch opencode if --opencode flag is set
if (options.opencode && !options.dryRun) {
  console.log(chalk.blue('\n🚀 正在启动 opencode...'));
  try {
    await launchOpencode(projectDir);
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  无法启动 opencode，请手动运行:'));
    console.log(chalk.gray('   opencode\n'));
  }
} else {
  // 显示常规下一步提示
  // ...
}
```

---

### 3. src/utils/opencode-launcher.ts

**变更类型**: 新建

**变更内容**:
创建独立的 opencode 启动模块，封装进程管理逻辑。

**功能**:
- `isOpencodeInstalled()` - 检查 opencode 是否已安装
- `launchOpencode(projectDir)` - 启动 opencode 进程
- `getOpencodeVersion()` - 获取 opencode 版本信息

**代码**:
```typescript
/**
 * Opencode Launcher - 启动 opencode 工具
 */

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

/**
 * 获取 opencode 版本信息
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

---

### 4. docs/init/opencode-auto-launch-design.md

**变更类型**: 新建

**变更内容**:
创建原始设计文档，描述功能需求、设计方案和实现细节。

**包含内容**:
- 需求背景
- 工作流程
- 核心实现（4个部分）
- 模块解耦设计
- 错误处理
- 技术要点
- 使用示例
- 测试建议

---

### 5. docs/superpowers/specs/2026-04-20-init-opencode-design.md

**变更类型**: 新建

**变更内容**:
创建规范文档，按照 brainstorming skill 格式存储设计规范。

**包含内容**:
- 需求背景
- 设计方案
- 核心实现
- 模块解耦设计
- 错误处理
- 技术要点
- 使用示例
- 兼容性
- 测试建议
- 实现记录

---

### 6. docs/superpowers/plans/2026-04-20-init-opencode.md

**变更类型**: 新建

**变更内容**:
创建实现计划，按照 writing-plans skill 格式存储详细执行步骤。

**包含内容**:
- 文件结构
- 7个 Task 的详细步骤
- 每个步骤包含代码、验证命令、提交信息
- Self-Review Checklist

---

## 技术要点

1. **模块解耦**: 提取 `opencode-launcher.ts` 作为独立工具模块，单一职责，便于复用和测试
2. **使用 `spawn` 而非 `execSync`**: 支持 `stdio: 'inherit'`，保持交互式体验
3. **工作目录设置**: `cwd: projectDir` 确保 opencode 在正确的项目目录启动
4. **前置检查**: 启动前检查 opencode 是否可用，提前发现环境问题
5. **无需代理切换**: 用户全局配置已设置默认代理为 dtagent，直接启动即可

---

## 测试验证

- [x] 命令行选项显示正确
- [x] TypeScript 编译通过
- [x] 正常流程启动 opencode 成功
- [x] dry-run 模式跳过启动
- [x] 错误处理友好提示
- [x] npm link 全局可用

---

## 兼容性

- **Node.js**: >= 18.0.0（与项目要求一致）
- **OpenCode**: 任意版本（需支持基本命令）
- **操作系统**: Windows, macOS, Linux（spawn 跨平台）

---

## 相关提交

- `cc593f4` - feat: add --opencode option to init command
- `e84ea14` - docs: add design doc and implementation plan for --opencode feature

---

**作者**: Sisyphus Agent
**日期**: 2026-04-20
