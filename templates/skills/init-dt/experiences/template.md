---
title: 你的经验标题
type: 二方件Mock
# 可选类型：二方件Mock, 框架配置, 工具类, 数据库, 外部服务, 其他
tags: [tag1, tag2, tag3]
# tags用于自动匹配，建议包含：包名、框架名、工具名等
---

## 适用场景

描述在什么情况下使用这个经验。

例如：当测试类依赖 Diamond 配置中心获取配置值时使用。

## 代码示例

```java
// 在这里粘贴完整的Mock代码或测试代码
// 包括 import 语句

import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class YourTest {
    
    @Mock
    private YourDependency mockDependency;
    
    @BeforeEach
    void setUp() {
        // 配置Mock行为
        when(mockDependency.method()).thenReturn(value);
    }
    
    @Test
    void testScenario() {
        // 测试代码
    }
}
```

## 注意事项

- **注意点1**：描述重要的注意点或踩坑经验
- **注意点2**：例如初始化顺序、特殊配置等
- **注意点3**：版本兼容性说明（如有）

## 相关类/包（可选）

列出会触发这条经验的类或包名：

- `com.example.package.*`
- `com.example.YourClass`

## 参考资料（可选）

- [内部文档链接]
- [Wiki页面]