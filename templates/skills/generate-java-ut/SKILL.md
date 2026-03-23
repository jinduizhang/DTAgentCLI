---
name: generate-java-ut
description: 分析Java源代码并生成JUnit 5单元测试
compatibility: opencode
metadata:
  language: java
  framework: junit5
---

## 功能

为 Java 类生成单元测试。

## 执行步骤

### 1. 加载项目经验

扫描 `experiences/` 目录，读取经验文件。

### 2. 分析目标类

分析源代码结构，识别 public 方法和依赖。

### 3. 识别二方件依赖

**什么是二方件**：
- 公司/组织内部的依赖（如 com.huawei.*）
- 通过 Maven/Gradle 依赖引入，不在项目源码目录下
- 没有公开文档的依赖

**识别逻辑**：

```
对于每个 import 语句:
  1. 提取包名（如 com.huawei.config.DiamondClient → com.huawei.config）
  2. 检查项目源码目录（src/main/java）下是否存在该包
     - 存在 → 项目内部代码，不需要反编译
     - 不存在 → 外部依赖
  3. 判断是否匹配二方件包名前缀（com.huawei.* 等）
     - 匹配 → 二方件，需要反编译
     - 不匹配 → 三方库，有文档
```

**识别示例**：

```java
// 被测类 import 语句
import com.huawei.config.DiamondClient;    // 项目中无此文件 → 二方件
import com.huawei.common.StringUtils;      // 项目中无此文件 → 二方件
import com.alibaba.fastjson.JSON;          // 项目中无此文件 → 三方库（有文档）
import org.springframework.stereotype.Service; // 三方库
import com.example.service.UserService;    // 项目中有此文件 → 项目内部代码
```

**二方件识别规则**：

| 类型 | 示例 | 项目中存在 | 处理方式 |
|------|------|-----------|---------|
| 项目内部代码 | com.example.service.* | ✅ 存在 | 直接读取源码 |
| 二方件 | com.huawei.*, com.alibaba.* | ❌ 不存在 | 使用反编译 |
| 三方库 | org.springframework.* | ❌ 不存在 | 有文档，直接使用 |

### 4. 使用反编译文件

**查找二方件 API 签名**：

```
对于每个二方件依赖:
  1. 从 .dtagent/deps/index.json 查找类名
  2. 如果找到 → 读取对应的 .java 文件
  3. 提取方法签名、返回值类型、参数类型
  4. 生成精准 Mock
```

**反编译文件路径规则**：
```
.dtagent/deps/
├── index.json                           # 索引
├── fastjson-2.0.43/                     # jar 名
│   └── com/alibaba/fastjson/
│       └── JSON.java                    # 反编译文件
```

**从反编译文件提取的信息**：

```java
// 反编译后的 JSON.java
public abstract class JSON implements JSONAware {
    public static <T> T parseObject(String text, Class<T> clazz) { ... }
    public static String toJSONString(Object object) { ... }
    public static JSONObject parseObject(String text) { ... }
}
```

### 5. 生成精准 Mock

**基于反编译信息生成 Mock**：

```java
// 识别到二方件依赖
@Autowired
private DiamondClient diamondClient;

// 从 .dtagent/deps 读取 API 签名后生成:
@Mock
private DiamondClient diamondClient;

// 精准 Mock（知道方法签名和返回值）
when(diamondClient.getConfig("dataId", "group")).thenReturn("mockValue");
when(diamondClient.getConfig(anyString(), anyString())).thenReturn("default");
```

### 6. 匹配经验

根据 import、注解、类名匹配经验。

### 7. 生成测试

创建测试类，生成测试用例，应用匹配到的经验。

---

## 二方件处理示例

**场景**：被测类使用了 `DiamondClient`

```java
// 被测类
@Service
public class ConfigService {
    @Autowired
    private DiamondClient diamondClient;
    
    public String getConfig(String dataId) {
        return diamondClient.getConfig(dataId, "DEFAULT_GROUP");
    }
}
```

**生成流程**：

```
1. 识别依赖: DiamondClient (com.alibaba.diamond)
2. 判断: com.alibaba.* 是二方件
3. 查找: .dtagent/deps/index.json → 找到 DiamondClient
4. 读取: .dtagent/deps/.../DiamondClient.java
5. 提取方法签名:
   - String getConfig(String dataId, String group)
   - void publish(String dataId, String group, String content)
6. 生成精准 Mock
```

**生成的测试代码**：

```java
@ExtendWith(MockitoExtension.class)
class ConfigServiceTest {
    
    @Mock
    private DiamondClient diamondClient;
    
    @InjectMocks
    private ConfigService configService;
    
    @Test
    @DisplayName("getConfig_正常调用_返回配置值")
    void getConfig_normalCall_returnsConfigValue() {
        // Given
        when(diamondClient.getConfig("testDataId", "DEFAULT_GROUP"))
            .thenReturn("testValue");
        
        // When
        String result = configService.getConfig("testDataId");
        
        // Then
        assertThat(result).isEqualTo("testValue");
        verify(diamondClient).getConfig("testDataId", "DEFAULT_GROUP");
    }
}
```

---

## 注意事项

1. **二方件识别**：必须先执行 `/init-dt --decompile` 初始化
2. **索引查找**：优先从 index.json 查找，速度快
3. **API 签名**：从反编译文件中提取完整的方法签名
4. **返回值类型**：Mock 时必须匹配正确的返回值类型
5. **参数匹配**：使用 anyString() 或具体值，根据测试场景选择