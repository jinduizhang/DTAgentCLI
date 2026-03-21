# DTAgent CLI 迭代历史

本文件记录 DTAgent CLI 的迭代优化历史，按时间倒序排列。

---

## v0.1.0 - 2026-03-21

### 初始版本发布

**核心功能**:
- CLI 工具框架 (commander)
- init 命令 - 框架检测、组件安装、经验提取、配置生成
- generate 命令 - 单文件/批量 UT 生成
- extract-experience 命令 - Mock 模式提取

**OpenCode 命令**:
- `/init-dt` - 初始化项目 DT 配置
- `/generate-single` - 单文件测试生成
- `/generate-dir` - 批量测试生成
- `/extract-experience` - 提取 Mock 经验
- `/fix-ut` - 修复失败的测试
- `/coverage` - 分析测试覆盖率
- `/mr-ut` - MR 变更 UT 分析
- `/coverage-fill` - 项目级覆盖率 UT 补齐

**技术栈**:
- TypeScript
- Commander.js
- Chalk + Ora (CLI 美化)

**目录结构**:
```
DTAgentCLI/
├── bin/dtagent.js
├── src/commands/
├── src/utils/
├── templates/
│   ├── skills/
│   ├── plugins/
│   ├── agents/
│   └── commands/
└── docs/
```

**已知限制**:
- 仅支持 Java/Maven 项目
- 需要先安装 OpenCode
- MR 分析仅支持 Git

---

## 迭代记录格式

每次迭代添加新条目：

```markdown
## v{version} - {date}

### 变更类型
- [新增] 新功能
- [优化] 改进
- [修复] Bug 修复
- [文档] 文档更新

### 具体变更

**新增功能**:
- 功能描述

**优化改进**:
- 改进描述

**Bug 修复**:
- 修复描述

**已知问题**:
- 问题描述

### 影响范围
- 影响的命令/功能
- 是否需要用户重新 init
```