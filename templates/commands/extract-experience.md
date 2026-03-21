# 提取 Mock 经验

从现有测试代码中提取 Mock 模式，保存到经验库，用于指导后续测试生成。

## 参数

- `{target}` - 目标文件或目录（可选，默认 `src/test/java`）
- `--save` - 保存提取的经验到经验库（推荐）

## 使用示例

```
# 提取并保存（推荐）
/extract-experience src/test/java --save

# 仅查看，不保存
/extract-experience src/test/java
/extract-experience src/test/java/OrderServiceTest.java
```

## 执行步骤

### 步骤 1：扫描测试文件

扫描 `src/test/java/**/*.java` 或指定目录：

1. 识别所有 `*Test.java` 或 `*Tests.java` 文件
2. 读取文件内容

### 步骤 2：识别 Mock 模式

提取以下模式：

1. **Mock 声明**
   ```java
   @Mock
   private Dependency dependency;
   
   @MockBean
   private Repository repository;
   ```

2. **Mock 配置**
   ```java
   when(dependency.method()).thenReturn(value);
   when(repository.findById(1L)).thenReturn(Optional.of(entity));
   ```

3. **注入模式**
   ```java
   @InjectMocks
   private Service service;
   ```

4. **框架配置**
   ```java
   @SpringBootTest
   @ExtendWith(MockitoExtension.class)
   @DataJpaTest
   ```

### 步骤 3：分类整理

按类型分类：
- 二方件 Mock（公司内部库）
- 框架组件 Mock（Repository、Service 等）
- 工具类 Mock
- 框架配置

### 步骤 4：保存到经验库（--save）

如果指定 `--save`，将经验保存到：

```
.opencode/skills/generate-java-ut/experiences/
├── diamondclient-mock.md
├── orderrepository-mock.md
└── ...
```

同时更新 `DT_AGENTS.md` 的 Mock 经验库章节。

### 步骤 5：生成经验文件

每个经验文件格式：

```markdown
---
title: DiamondClient Mock
type: 二方件Mock
tags: [diamondclient, mock, extracted]
---

## 适用场景
从 OrderServiceTest.java 中自动提取的 Mock 模式。

## 代码示例
\`\`\`java
@Mock
private DiamondClient diamondClient;

when(diamondClient.get("key")).thenReturn("value");
\`\`\`

## 注意事项
- 无特殊注意事项

## 来源
自动提取自: OrderServiceTest.java
```

## 输出格式

```
📋 Mock 经验提取完成

扫描文件: 25 个
提取模式: 12 个

按类型统计:
- 二方件 Mock: 5 个
- 框架组件 Mock: 4 个
- 工具类 Mock: 2 个
- 框架配置: 1 个

新增经验:
1. DiamondClient Mock (来自 ConfigServiceTest.java)
2. OrderRepository Mock (来自 OrderServiceTest.java)
3. UserServiceClient Mock (来自 UserServiceTest.java)

✅ Saved 12 patterns to .opencode/skills/generate-java-ut/experiences/
   These patterns will be automatically matched when generating tests.
```

## 经验应用流程

```
用户运行 /extract-experience --save
        ↓
经验保存到 .opencode/skills/generate-java-ut/experiences/
        ↓
DT_AGENTS.md 同步更新
        ↓
用户运行 /generate-single Service.java
        ↓
自动匹配经验（import/tags 匹配）
        ↓
生成融入经验的测试代码
```

## 自动匹配

提取的经验会在后续 `/generate-single` 和 `/generate-dir` 中自动匹配应用：

- 代码中出现 `import com.alibaba.diamond.DiamondClient` → 匹配 `diamondclient-mock.md`
- 代码中出现 `@Service` → 匹配框架组件 Mock 模板

## 注意事项

1. 使用 `--save` 参数才会保存到经验库
2. 已存在的经验不会重复添加
3. 建议定期运行此命令，保持经验库更新
4. 可以手动编辑经验文件，添加更多注意事项