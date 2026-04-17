# DTAgent Skill 自动化测评系统

## 概述

通用 Skill 自动化测评框架，适用于 OpenCode Agent Skill 评估。

## 特性

- ✅ 多维度测评（成功率、性能、覆盖率、质量）
- ✅ 自动化测试执行
- ✅ 基准对比评估
- ✅ 趋势分析
- ✅ CI/CD 集成
- ✅ 可扩展架构

## 快速开始

```bash
# 安装依赖
npm install

# 运行所有测评
npm run eval:all

# 运行特定 Skill
npm run eval:skill --skill=generate-java-ut

# 运行特定用例
npm run eval:case --case=TC-GEN-001

# CI 模式
npm run eval:ci
```

## 配置

```json
{
  "parallelism": 4,
  "timeout": {
    "default": 180000,
    "init-dt": 60000
  },
  "thresholds": {
    "overall": 80
  }
}
```

## 目录结构

```
evals/
├── src/
│   ├── core/           # 核心组件
│   ├── skills/         # Skill 测评器
│   └── utils/          # 工具函数
├── test-cases/         # 测试用例
├── fixtures/           # 基准数据
└── reports/            # 测评报告
```

## License

MIT
