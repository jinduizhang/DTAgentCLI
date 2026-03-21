# DTAgent CLI 安装指南

## 环境要求

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18.0.0 | 运行 CLI |
| OpenCode | 最新版 | AI 编程代理 |
| Java | >= 8 | 目标项目 |
| Maven 或 Gradle | 任意版本 | 构建工具 |

## 安装步骤

### 1. 安装 OpenCode

DTAgent 基于 OpenCode 运行，需要先安装 OpenCode：

**macOS / Linux:**

```bash
curl -fsSL https://opencode.ai/install | bash
```

**Windows (PowerShell):**

```powershell
npm install -g opencode-ai
```

**验证安装:**

```bash
opencode --version
```

### 2. 安装 DTAgent CLI

**方式一：NPM 全局安装**

```bash
npm install -g @dtagent/cli
```

**方式二：本地包安装（内网环境推荐）**

适用于无法访问 npm 仓库的内网环境。

```bash
# 1. 在有网络的机器上下载源码并打包
git clone https://github.com/jinduizhang/DTAgentCLI.git
cd DTAgentCLI
npm install
npm run build
npm pack                      # 生成 @dtagent/cli-x.x.x.tgz

# 2. 查看生成的包名
ls *.tgz
# 输出示例: dtagent-cli-0.1.0.tgz

# 3. 将 .tgz 文件拷贝到目标机器

# 4. 在目标机器上安装（使用实际文件名）
npm install -g ./dtagent-cli-0.1.0.tgz
```

**如果已安装过，需要先卸载：**

```bash
# 卸载旧版本
npm uninstall -g @dtagent/cli

# 然后安装新版本
npm install -g ./dtagent-cli-0.1.0.tgz
```

**验证安装：**

```bash
dtagent --version
```

**方式三：本地开发安装**

```bash
# 克隆仓库
git clone https://github.com/jinduizhang/DTAgentCLI.git
cd DTAgentCLI

# 安装依赖
npm install

# 构建项目
npm run build

# 本地链接
npm link
```

**验证安装:**

```bash
dtagent --version
dtagent --help
```

### 3. 初始化 Java 项目

在 Java 项目根目录执行：

```bash
dtagent init
```

或指定 pom.xml 路径：

```bash
dtagent init pom.xml
```

**初始化内容：**

```
项目根目录/
├── .opencode/                    # OpenCode 配置目录
│   ├── skills/                   # 技能定义
│   │   ├── generate-java-ut/     # 测试生成技能
│   │   │   └── experiences/      # 经验库
│   │   ├── fix-java-ut/          # 测试修复技能
│   │   ├── java-coverage/        # 覆盖率分析技能
│   │   └── init-dt/              # 初始化技能
│   ├── plugins/                  # 插件
│   │   └── task-manager.ts       # 任务管理插件
│   ├── agents/                   # 代理定义
│   │   └── dtagent.md            # DTAgent 代理
│   ├── commands/                 # 斜杠命令
│   └── package.json
├── opencode.json                 # OpenCode 配置
└── DT_AGENTS.md                  # 项目测试架构文档
```

### 4. 安装依赖

```bash
cd .opencode
npm install
```

### 5. 启动 OpenCode

```bash
opencode
```

启动后会自动使用 `dtagent` 代理（在 `opencode.json` 中配置）。

## 配置说明

### opencode.json

自动生成在项目根目录：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "dtagent"
}
```

此文件会自动添加到 `.gitignore`。

### DT_AGENTS.md

项目测试架构文档，包含：

- Maven 配置（settings、profiles、JVM 参数）
- 测试框架版本
- Mock 经验库
- 覆盖率目标

## 内网环境配置

如果项目需要自定义 Maven settings：

**方式一：在 DT_AGENTS.md 中配置**

```markdown
## Maven 配置

settings: /path/to/custom-settings.xml
profiles: dev, test
jvmArgs: -Xmx2g
```

**方式二：直接使用命令参数**

```bash
mvn test -s /path/to/settings.xml -Pdev
```

## 常见问题

### Q: npm pack 生成的文件名是什么？

```bash
npm pack
# 输出: dtagent-cli-0.1.0.tgz（版本号取决于 package.json）

# 查看生成的文件
ls *.tgz
```

### Q: 安装时提示文件不存在？

确保使用实际的文件名（不是 `x.x.x`）：

```bash
# 错误
npm install -g ./dtagent-cli-x.x.x.tgz

# 正确（使用实际版本号）
npm install -g ./dtagent-cli-0.1.0.tgz
```

### Q: 已安装过，重新安装报错？

```bash
# 先卸载
npm uninstall -g @dtagent/cli

# 再安装
npm install -g ./dtagent-cli-0.1.0.tgz
```

### Q: npm install 失败？

尝试使用国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: opencode 找不到命令？

确保 OpenCode 已正确安装并添加到 PATH：

```bash
# 检查
which opencode
# 或
where opencode
```

### Q: dtagent init 报错 "不是 Java 项目"？

确保项目目录包含 `pom.xml` 或 `build.gradle` 文件。

### Q: 权限不足？

Windows 上可能需要管理员权限删除 `.opencode` 目录：

```powershell
# 以管理员身份运行
Remove-Item -Recurse -Force .opencode
```

## 下一步

安装完成后，查看 [使用场景说明](./usage-scenarios.md) 了解如何使用。

## 卸载

```bash
# 取消链接
npm unlink -g @dtagent/cli

# 卸载
npm uninstall -g @dtagent/cli

# 删除项目配置
rm -rf .opencode opencode.json DT_AGENTS.md
```