---
title: 你的经验标题
type: 二方件Mock
# 可选类型：二方件Mock, 框架组件Mock, 工具类Mock, 框架配置, 外部服务Mock
tags: [tag1, tag2, tag3]
# tags 用于自动匹配，建议包含：包名、框架名、工具名
---

## 适用场景

描述什么情况下使用这个经验。

例如：当测试类依赖 Diamond 配置中心获取配置值时使用。

## 代码示例

```java
// 在这里粘贴完整的 Mock 代码或测试代码
// 包括 import 语句

import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.BeforeEach;

@ExtendWith(MockitoExtension.class)
class YourTest {
    
    @Mock
    private YourDependency mockDependency;
    
    @InjectMocks
    private YourClass target;
    
    @BeforeEach
    void setUp() {
        // 配置 Mock 行为
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