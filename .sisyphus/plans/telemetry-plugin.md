# DTAgent Telemetry Plugin - 工作计划

## TL;DR

> **Quick Summary**: 创建遥测插件，在 DTAgent 会话完成时自动收集统计数据并上报到远程服务
> 
> **Deliverables**:
> - `templates/plugins/telemetry.ts` - 遥测插件源码
> - 在测试项目 `D:\OpenCode\config-history` 验证功能
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - 顺序执行，依赖性强
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
用户要求增加遥测功能，在每次会话执行完成后进行数据打点，统计：
- 生成了多少测试用例
- 覆盖率是多少
- 运行成功率是多少

### Interview Summary
**Key Discussions**:
- 数据存储：远程服务上报（自定义 HTTP API，无认证）
- API配置：模板变量，写在钩子函数内部
- 覆盖率格式：自动适配常见格式（JaCoCo、Istanbul）
- 数据来源：读取已生成报告（`.dtagent/reports/ut-report.json`）
- 失败处理：静默忽略，记录日志
- 测试验证：在 `D:\OpenCode\config-history` 项目下验证

**Research Findings**:
- OpenCode 插件支持 `event` 钩子监听 `session.idle` 事件
- DTAgent 已有报告生成功能（`src/utils/report.ts`）
- 测试项目已有 `.opencode/plugins/task-manager.ts` 可参考

### Metis Review
**Skipped**: 用户反馈默认模型配置问题，跳过 Metis 咨询

---

## Work Objectives

### Core Objective
创建 OpenCode 遥测插件，实现会话结束时的自动数据收集和上报

### Concrete Deliverables
- `templates/plugins/telemetry.ts` - 遥测插件完整实现
- 插件在测试项目中正常工作，能监听事件、收集数据、触发上报

### Definition of Done
- [ ] 插件文件创建完成
- [ ] 事件监听逻辑实现
- [ ] 数据读取逻辑实现
- [ ] HTTP 上报逻辑实现
- [ ] 在测试项目中验证成功

### Must Have
- 监听 `session.idle` 事件
- 读取 `.dtagent/reports/ut-report.json`
- 解析覆盖率数据
- HTTP POST 上报
- 错误静默处理 + 日志记录

### Must NOT Have (Guardrails)
- 不实现远程服务端功能
- 不实现用户认证
- 不阻塞主流程（上报失败不影响正常执行）
- 不添加复杂的重试机制

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: NO
- **Framework**: none
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### QA Policy
每个任务包含 agent-executed QA 场景，证据保存到 `.sisyphus/evidence/`

- **插件验证**: 使用 Bash 检查文件存在、代码结构正确
- **功能验证**: 在测试项目运行 DTAgent 命令，检查日志输出

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (顺序执行 - 插件开发):
├── Task 1: 创建 telemetry 插件骨架 [quick]
├── Task 2: 实现报告读取逻辑 [quick]
├── Task 3: 实现覆盖率解析逻辑 [quick]
└── Task 4: 实现 HTTP 上报逻辑 [quick]

Wave 2 (测试验证):
└── Task 5: 在测试项目验证功能 [quick]

Wave FINAL (审查):
├── Task F1: Plan Compliance Audit (oracle)
├── Task F2: Code Quality Review (unspecified-high)
└── Task F3: Real Manual QA (unspecified-high)

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F3
Parallel Speedup: 无（顺序执行）
Max Concurrent: 1
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | - | 2, 3, 4 |
| 2 | 1 | 4 |
| 3 | 1 | 4 |
| 4 | 2, 3 | 5 |
| 5 | 4 | F1-F3 |
| F1 | 5 | - |
| F2 | 5 | - |
| F3 | 5 | - |

### Agent Dispatch Summary

- **Wave 1**: T1-T4 → `quick`
- **Wave 2**: T5 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`

---

## TODOs

- [ ] 1. 创建 telemetry 插件骨架

  **What to do**:
  - 创建 `templates/plugins/telemetry.ts` 文件
  - 导入 Plugin 类型定义
  - 实现基本插件结构（export const TelemetryPlugin: Plugin = async ({ client, directory }) => {...})
  - 添加 event 钩子监听 `session.idle` 事件
  - 添加基本日志输出验证事件触发

  **Must NOT do**:
  - 不添加具体的业务逻辑（仅骨架）
  - 不导入不必要的模块

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件创建和基础结构搭建
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2, Task 3, Task 4
  - **Blocked By**: None (can start immediately)

  **References**:
  - `templates/plugins/task-manager.ts:78-98` - 现有插件结构参考（Plugin 定义、client 使用）
  - `templates/plugins/task-manager.ts:1-5` - 导入语句参考

  **Acceptance Criteria**:
  - [ ] 文件 `templates/plugins/telemetry.ts` 存在
  - [ ] 导出 `TelemetryPlugin` 符合 Plugin 类型
  - [ ] event 钩子监听 `session.idle` 事件

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 验证插件文件创建
    Tool: Bash
    Preconditions: 无
    Steps:
      1. ls templates/plugins/telemetry.ts
      2. grep "export const TelemetryPlugin" templates/plugins/telemetry.ts
      3. grep "session.idle" templates/plugins/telemetry.ts
    Expected Result: 文件存在，包含 TelemetryPlugin 导出和 session.idle 监听
    Evidence: .sisyphus/evidence/task-1-plugin-created.txt
  ```

  **Commit**: NO

---

- [ ] 2. 实现报告读取逻辑

  **What to do**:
  - 添加读取 `.dtagent/reports/ut-report.json` 的逻辑
  - 解析报告 JSON 获取用例统计数据：
    - summary.total - 总用例数
    - summary.success - 成功数
    - summary.failed - 失败数
  - 计算成功率：success / total
  - 处理文件不存在或解析失败的情况（静默忽略）

  **Must NOT do**:
  - 不阻塞主流程
  - 不抛出异常（静默处理错误）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件读取和 JSON 解析逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `src/utils/report.ts:9-26` - ReportData 和 ReportFile 类型定义
  - `src/utils/report.ts:31-50` - 报告 JSON 结构参考
  - `templates/plugins/task-manager.ts:4` - fs 模块导入参考

  **Acceptance Criteria**:
  - [ ] 能正确读取 ut-report.json 文件
  - [ ] 能正确解析 summary 字段
  - [ ] 文件不存在时静默处理

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 验证报告读取逻辑存在
    Tool: Bash
    Preconditions: Task 1 完成
    Steps:
      1. grep "ut-report.json" templates/plugins/telemetry.ts
      2. grep "summary" templates/plugins/telemetry.ts
      3. grep "fs.readFileSync 或 fs.readFile" templates/plugins/telemetry.ts
    Expected Result: 代码包含报告文件路径和 summary 解析逻辑
    Evidence: .sisyphus/evidence/task-2-report-reading.txt
  ```

  **Commit**: NO

---

- [ ] 3. 实现覆盖率解析逻辑

  **What to do**:
  - 添加覆盖率文件查找逻辑（查找常见覆盖率输出位置）
  - 支持解析常见覆盖率格式：
    - JaCoCo: `target/site/jacoco/jacoco.xml` 或 JSON
    - Istanbul/V8: `coverage/coverage-final.json`
  - 提取覆盖率指标：
    - lineCoverage - 行覆盖率百分比
    - branchCoverage - 分支覆盖率百分比（如可用）
  - 处理覆盖率文件不存在的情况（静默忽略，返回 null）

  **Must NOT do**:
  - 不假设特定格式（需自动检测）
  - 不阻塞主流程

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件查找和格式解析
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 1, parallel with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `templates/commands/coverage.md:21-36` - 覆盖率命令说明
  - `templates/skills/java-coverage/SKILL.md:20-38` - 覆盖率分析维度

  **Acceptance Criteria**:
  - [ ] 能查找常见覆盖率文件位置
  - [ ] 能解析 JaCoCo XML/JSON 格式
  - [ ] 文件不存在时静默处理

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 验证覆盖率解析逻辑存在
    Tool: Bash
    Preconditions: Task 1 完成
    Steps:
      1. grep "jacoco" templates/plugins/telemetry.ts
      2. grep "coverage" templates/plugins/telemetry.ts
      3. grep "lineCoverage 或 branchCoverage" templates/plugins/telemetry.ts
    Expected Result: 代码包含覆盖率文件查找和解析逻辑
    Evidence: .sisyphus/evidence/task-3-coverage-parsing.txt
  ```

  **Commit**: NO

---

- [ ] 4. 实现 HTTP 上报逻辑

  **What to do**:
  - 组装上报数据结构：
    - sessionId - 会话 ID
    - timestamp - 时间戳
    - projectName - 项目名称
    - testStats - 用例统计（total, success, failed, successRate）
    - coverage - 覆盖率数据（lineCoverage, branchCoverage）
    - duration - 执行时长（从会话信息获取，如可用）
  - 实现 HTTP POST 上报（使用 fetch 或 http 模块）
  - API URL 使用模板变量（用户自行修改）
  - 无认证
  - 失败时静默忽略，记录日志到控制台或文件

  **Must NOT do**:
  - 不添加重试机制
  - 不阻塞主流程等待响应
  - 不硬编码 API URL（使用模板变量）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单 HTTP POST 逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 2, Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2, Task 3

  **References**:
  - `templates/plugins/task-manager.ts:82-98` - client.session 使用参考

  **Acceptance Criteria**:
  - [ ] 上报数据结构完整
  - [ ] HTTP POST 逻辑正确
  - [ ] API URL 使用模板变量
  - [ ] 失败静默处理

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 验证 HTTP 上报逻辑存在
    Tool: Bash
    Preconditions: Task 2, Task 3 完成
    Steps:
      1. grep "fetch 或 http" templates/plugins/telemetry.ts
      2. grep "POST" templates/plugins/telemetry.ts
      3. grep "TELEMETRY_API_URL" templates/plugins/telemetry.ts
      4. grep "sessionId" templates/plugins/telemetry.ts
    Expected Result: 代码包含 HTTP POST 逻辑和数据组装
    Evidence: .sisyphus/evidence/task-4-http-reporting.txt
  ```

  **Commit**: NO

---

- [ ] 5. 在测试项目验证功能

  **What to do**:
  - 复制 `templates/plugins/telemetry.ts` 到测试项目 `D:\OpenCode\config-history\.opencode\plugins\`
  - 验证插件能被 OpenCode 加载
  - 运行一次 DTAgent 命令（如 `/generate-dt-single`）触发会话
  - 检查会话结束后是否触发遥测上报日志

  **Must NOT do**:
  - 不修改测试项目的其他配置
  - 不删除测试项目的现有插件

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单文件复制和验证
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (depends on Task 4)
  - **Blocks**: F1, F2, F3
  - **Blocked By**: Task 4

  **References**:
  - `D:\OpenCode\config-history\.opencode\plugins\task-manager.ts` - 现有插件参考
  - `D:\OpenCode\config-history\opencode.json` - OpenCode 配置

  **Acceptance Criteria**:
  - [ ] 插件文件复制到测试项目
  - [ ] 插件能被 OpenCode 加载
  - [ ] 遥测上报日志出现

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: 验证插件文件复制成功
    Tool: Bash
    Preconditions: Task 4 完成
    Steps:
      1. ls D:\OpenCode\config-history\.opencode\plugins\telemetry.ts
    Expected Result: 文件存在于测试项目插件目录
    Evidence: .sisyphus/evidence/task-5-plugin-copied.txt

  Scenario: 验证插件结构完整（需用户手动触发 DTAgent 命令后检查）
    Tool: Bash
    Preconditions: 插件文件已复制，用户运行过 DTAgent 命令
    Steps:
      1. 检查 OpenCode 日志或控制台输出是否包含遥测相关日志
    Expected Result: 日志中出现遥测上报相关信息
    Evidence: .sisyphus/evidence/task-5-telemetry-triggered.txt
    Note: 此场景需要用户手动运行 DTAgent 命令触发
  ```

  **Commit**: YES
  - Message: `feat(telemetry): add telemetry plugin for session statistics reporting`
  - Files: `templates/plugins/telemetry.ts`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  验证所有 "Must Have" 已实现，"Must NOT Have" 未出现，检查证据文件。

- [ ] F2. **Code Quality Review** — `unspecified-high`
  运行 `tsc --noEmit`，检查代码质量（无 `as any`、无空 catch、无 console.log）

- [ ] F3. **Real Manual QA** — `unspecified-high`
  在测试项目运行 DTAgent 命令，验证插件触发，检查日志输出。

---

## Commit Strategy

- **Single Commit**: 所有任务完成后一次性提交
- Message: `feat(telemetry): add telemetry plugin for session statistics reporting`
- Files: `templates/plugins/telemetry.ts`

---

## Success Criteria

### Verification Commands
```bash
# 检查插件文件存在
ls templates/plugins/telemetry.ts

# TypeScript 编译检查
tsc --noEmit templates/plugins/telemetry.ts

# 在测试项目验证（需要用户手动执行）
cd D:\OpenCode\config-history
opencode
# 运行 /generate-dt-single 命令后检查遥测日志
```

### Final Checklist
- [ ] 插件文件 `templates/plugins/telemetry.ts` 存在
- [ ] 事件监听逻辑正确
- [ ] 数据读取逻辑正确
- [ ] HTTP 上报逻辑正确
- [ ] 测试项目验证通过