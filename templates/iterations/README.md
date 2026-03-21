# 迭代快照存储

本目录存储每次迭代的快照，方便后期查看和回溯。

## 快照命名规则

```
{version}_{date}_{type}.md
```

- version: 版本号 (如 0.1.0)
- date: 日期 (如 20260321)
- type: 变更类型 (feature/fix/optimize/docs)

示例:
- `0.1.0_20260321_feature.md`
- `0.1.1_20260322_fix.md`

## 快照内容模板

```markdown
# 迭代快照: {version} - {date}

## 变更摘要
一句话描述本次迭代的核心变更。

## 详细变更

### 新增
1. xxx

### 修改
1. xxx

### 删除
1. xxx

## 受影响文件
- src/commands/init.ts
- templates/skills/generate-java-ut/SKILL.md

## 测试验证
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试通过

## 备注
其他需要记录的信息。
```

## 快照索引

| 版本 | 日期 | 类型 | 描述 |
|------|------|------|------|
| 0.1.0 | 2026-03-21 | feature | 初始版本发布 |