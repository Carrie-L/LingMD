# Mermaid 测试文档

这是一个测试文档，用于验证 Mermaid 图表的渲染。

## 流程图示例

```mermaid
graph TD
    A[静态世界: 集合 List] --> B(函数式操作<br/>map, filter, flatMap)
    C[动态世界: 时间流 Flow] --> B
    B --> D{统一的声明式数据管道}

    subgraph 架构中的应用
        Repo[Repository<br/>Flow>]
        UseCase[UseCase<br/>Flow.map Either.map]
        ViewModel[ViewModel<br/>Flow.map fold .stateIn]
        UI[UI<br/>StateFlow.collect]
        Repo --> UseCase --> ViewModel --> UI
    end

    D --> Repo
```

## 序列图示例

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Server

    User->>App: 打开应用
    App->>Server: 请求数据
    Server-->>App: 返回数据
    App-->>User: 显示内容
```

## 类图示例

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }

    class Dog {
        +bark()
    }

    class Cat {
        +meow()
    }

    Animal <|-- Dog
    Animal <|-- Cat
```

## 测试要点

- [ ] Mermaid 图表应该立即显示，不是代码
- [ ] 编辑文档时图表应该保持稳定
- [ ] 图表不应该在显示后消失
- [ ] 切换主题时图表应该保持显示
- [ ] 公众号预览区的图表应该同步显示

测试完成后，请验证所有图表都能正常显示！
