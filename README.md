# openUBMC plugin market for DSH

This custom index lists qualified `dsh-openubmc` packages. DSH does not provide a central official market; Discover reads the sources its user adds.

On official DSH 0.2.1-rc.2, open **Plugins → Experimental plugins → More**, enable **Custom plugin markets**, then add this source in **Discover**:

```text
https://raw.githubusercontent.com/lihuabai629-star/deepseek-harness-openubmc/codex/openubmc-market/market.json
```

Choose openUBMC 0.3.1. Its install source is pinned to an immutable commit containing the prebuilt package, with no build or install scripts. The source repository remains on its main branch. Linux/WSL, Node 24 and Python 3.10+ are required. The index declares the exact qualified DSH versions; other versions remain incompatible.

Official 0.1.7-rc.2 and 0.2.0-rc.2 can install the same plugin through **Add plugin** or `dsh plugin`. Use the [release archive, checksum and installation guide](https://github.com/lihuabai629-star/deepseek-harness-openubmc/releases/tag/openubmc-plugin-v0.3.1) when custom markets are unavailable.

## 中文

DSH 的 Discover 只读取用户添加的市场源，没有默认官方市场。在官方 0.2.1-rc.2 中，从侧边栏“插件”的“实验性插件 → 更多”启用“自定义插件市场”，在“发现”中添加上面的索引地址，再选择 openUBMC 0.3.1。安装来源固定到已验证的预构建插件提交。

官方 0.1.7-rc.2 和 0.2.0-rc.2 可通过“添加插件”或发行包安装。支持 Linux/WSL；模型、设备账号和执行授权由使用者自行配置。
