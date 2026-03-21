---
title: Mockito 单元测试
type: 框架配置
tags: [mockito, mock, junit, unit-test]
---

## 适用场景

使用 Mockito 进行纯单元测试，不启动 Spring 容器。

## 代码示例

### 基础 Mock 设置

```java
import org.junit.jupiter.api.*;
import org.mockito.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;
    
    @Mock
    private PaymentService paymentService;
    
    @InjectMocks
    private OrderService orderService;
    
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }
}
```

### when-thenReturn 模式

```java
@Test
void testFindOrder() {
    // Given
    Order order = new Order(1L, "ORD-001");
    when(orderRepository.findById(1L)).thenReturn(Optional.of(order));
    
    // When
    Order result = orderService.findOrder(1L);
    
    // Then
    assertEquals("ORD-001", result.getOrderNo());
    verify(orderRepository).findById(1L);
}

@Test
void testSaveOrderFailed() {
    // Given
    when(paymentService.pay(any())).thenReturn(false);
    
    // When & Then
    assertThrows(PaymentException.class, () -> orderService.saveOrder(new Order()));
}
```

### 参数匹配

```java
// 任意参数
when(repository.findById(anyLong())).thenReturn(Optional.empty());

// 多个返回值
when(repository.findAll())
    .thenReturn(List.of(order1))
    .thenReturn(List.of(order1, order2));

// 抛出异常
when(repository.save(any()))
    .thenThrow(new RuntimeException("DB Error"));

// 基于参数返回
when(repository.findByStatus(eq("PENDING"))).thenReturn(pendingOrders);
```

### 验证调用

```java
// 验证调用次数
verify(repository, times(1)).save(any());
verify(repository, never()).delete(any());
verify(repository, atLeast(2)).findById(any());

// 验证调用参数
verify(repository).save(argThat(order -> order.getAmount() > 100));

// 验证调用顺序
InOrder inOrder = inOrder(serviceA, serviceB);
inOrder.verify(serviceA).process();
inOrder.verify(serviceB).notify();
```

### Spy 部分模拟

```java
@Test
void testWithSpy() {
    List<String> list = new ArrayList<>();
    List<String> spy = spy(list);
    
    spy.add("one");
    verify(spy).add("one");
    
    // 真实调用
    assertEquals(1, spy.size());
    
    // Mock 返回值
    when(spy.size()).thenReturn(100);
    assertEquals(100, spy.size());
}
```

## 注意事项

- 使用 `@Mock` 创建 Mock 对象，`@InjectMocks` 注入被测对象
- `@BeforeEach` 中调用 `MockitoAnnotations.openMocks(this)` 初始化
- 使用 `verify()` 验证方法是否被调用
- 避免过度 Mock，只 Mock 外部依赖
- 对于复杂对象，可使用 `ArgumentCaptor` 捕获参数