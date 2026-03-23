# 二方件精准 Mock 方案（CFR 反编译）

## 讨论日期

2026-03-23

## 问题背景

生成的二方件 Mock 不准确，原因是缺少二方件的 API 签名信息。

## 解决方案：CFR 反编译

使用 CFR 反编译工具，从 jar 包中提取二方件的方法签名。

**CFR 基本用法**：
```bash
# 反编译整个 jar
java -jar cfr-0.152.jar xxx.jar --outputdir ./decompiled

# 反编译指定类
java -jar cfr-0.152.jar com.example.SomeClient
```

**CFR 特性**：
- 支持 Java 8+ 特性（lambda、stream、switch 表达式）
- 支持 jar 包整体反编译
- 支持指定类反编译
- 输出为 Java 源码格式

## 方案对比

### 方案一：预置反编译范围

```
/init-dt 配置:
  反编译范围: com.alibaba.*, com.taobao.*

执行流程:
  1. 扫描 ~/.m2/repository 找到匹配的 jar
  2. CFR 批量反编译
  3. 存储到 .dtagent/deps/com/alibaba/DiamondClient.java
  4. 模型生成时，按包名路径查找反编译文件
```

**优点**：
| 项目 | 说明 |
|------|------|
| 可靠性 | ✅ 不依赖模型判断，文件一定存在 |
| 速度 | ✅ 生成时直接读取，无等待 |
| 可控性 | ✅ 用户明确知道反编译了哪些包 |
| 工程实现 | ✅ 简单，一次配置全量执行 |

**缺点**：
| 项目 | 说明 |
|------|------|
| 空间 | ❌ 可能反编译很多不用的类 |
| 时间 | ❌ 初始化时需要等待 |
| 维护 | ⚠️ 新增二方件需要重新初始化 |

**工程实现难度**: ⭐⭐ (简单)

---

### 方案二：按需反编译

```
/generate-java-ut 执行:
  1. 分析被测类，发现 @Mock DiamondClient
  2. 检查 .dtagent/deps/ 是否有 DiamondClient.java
  3. 没有 → 定位 jar → CFR 反编译 → 存储
  4. 读取反编译文件 → 精准 mock
```

**优点**：
| 项目 | 说明 |
|------|------|
| 空间 | ✅ 只反编译实际用到的类 |
| 精准 | ✅ 按需加载，无冗余 |
| 维护 | ✅ 新增依赖自动处理 |

**缺点**：
| 项目 | 说明 |
|------|------|
| 可靠性 | ⚠️ 依赖模型正确识别需要 mock 的类 |
| 速度 | ⚠️ 首次生成需要等待反编译 |
| 工程实现 | ⚠️ 需要在生成流程中嵌入反编译逻辑 |
| 模型决策 | ❌ 模型可能遗漏某些依赖 |

**工程实现难度**: ⭐⭐⭐⭐ (复杂)

---

## 确定方案：混合模式

**方案一为主，方案二兜底**：

```
┌─────────────────────────────────────────────────────────┐
│                      混合方案                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  初始化阶段（方案一）                                     │
│  ├─ 用户提供反编译范围: com.alibaba.*, com.taobao.*      │
│  ├─ 扫描 ~/.m2/repository 找到匹配的 jar                │
│  ├─ CFR 批量反编译，存储到 .dtagent/deps/               │
│  └─ 生成索引文件 .dtagent/deps/index.json              │
│                                                         │
│  生成阶段（方案二兜底）                                   │
│  ├─ 模型分析被测类依赖                                   │
│  ├─ 查找 .dtagent/deps/ 是否有对应文件                   │
│  ├─ 有 → 直接使用                                       │
│  └─ 没有 → 按需反编译单个类 → 存储 → 使用                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 实现计划

### P0 - 方案一：预置反编译

| 文件 | 修改内容 |
|------|---------|
| `src/commands/init.ts` | 新增 CFR 反编译逻辑 |
| `src/utils/cfr.ts` | 新增 CFR 工具类 |
| `src/utils/dependency.ts` | 新增依赖解析、二方件识别 |
| `.dtagent/deps/*.java` | 存储反编译后的源码 |
| `.dtagent/deps/index.json` | 类名 → 文件路径索引 |

**核心逻辑**：
```typescript
// src/utils/dependency.ts
interface DepInfo {
  groupId: string;
  artifactId: string;
  version: string;
  jarPath: string;
  isInternal: boolean;  // 是否二方件
}

function parsePomDependencies(): DepInfo[] {}
function identifyInternalDeps(deps: DepInfo[], groupWhitelist: string[]): DepInfo[] {}
function locateJarFile(dep: DepInfo): string {}
```

```typescript
// src/utils/cfr.ts
interface ClassInfo {
  className: string;
  methods: MethodInfo[];
}

interface MethodInfo {
  name: string;
  returnType: string;
  params: ParamInfo[];
}

function decompileJar(jarPath: string, outputDir: string): void {}
function extractClassInfo(decompiledDir: string): ClassInfo[] {}
```

### P1 - 方案二：按需兜底

| 文件 | 修改内容 |
|------|---------|
| `src/commands/generate.ts` | 新增按需反编译调用 |
| `src/utils/cfr.ts` | 新增单类反编译方法 |

### /init-dt 新增参数

```bash
/init-dt --decompile com.alibaba.*,com.taobao.*
```

配置存储到 `.dtagent/config.json`：
```json
{
  "decompilePackages": ["com.alibaba.*", "com.taobao.*"]
}
```

### 存储结构

```
.dtagent/
├── deps/
│   ├── index.json              # 索引文件
│   ├── com/
│   │   └── alibaba/
│   │       └── diamond/
│   │           └── DiamondClient.java
│   └── taobao/
│       └── config/
│           └── ConfigClient.java
└── config.json
```

**index.json 格式**：
```json
{
  "com.alibaba.diamond.DiamondClient": "deps/com/alibaba/diamond/DiamondClient.java",
  "com.taobao.config.ConfigClient": "deps/taobao/config/ConfigClient.java"
}
```

## 下一步

1. 用户确认方案后，创建正式的 work plan
2. 执行 `/start-work` 开始实现