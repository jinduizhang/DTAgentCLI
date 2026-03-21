# Mock 经验库使用说明

本目录存放项目特定的 Mock 经验，在生成测试时会自动匹配并应用。

## 文件结构

```
.opencode/skills/generate-java-ut/experiences/
├── README.md           # 本文件
├── template.md         # 经验模板
├── mockito.md          # Mockito 框架经验
└── your-custom.md      # 你的自定义经验
```

## 快速开始

### 方式一：从现有测试提取

```bash
dtagent extract-experience --dir src/test/java --save
```

### 方式二：手动添加经验

1. 复制模板
2. 编辑内容
3. 保存生效

## 经验文件格式

```markdown
---
title: 经验标题
type: 二方件Mock
tags: [tag1, tag2]
---

## 适用场景
描述什么情况下使用

## 代码示例
\`\`\`java
@Mock
private YourDependency dependency;
\`\`\`

## 注意事项
- 注意点
```

## 自动匹配规则

| 匹配维度 | 权重 |
|----------|------|
| import 匹配 | 40% |
| 注解匹配 | 30% |
| 类名关键词 | 20% |
| 框架推断 | 10% |

- 匹配度 >= 80%: 必须应用
- 匹配度 60-80%: 建议应用
- 匹配度 < 60%: 忽略