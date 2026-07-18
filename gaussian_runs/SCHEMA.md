# Gaussian run 清单约定

`manifest.json` 的每个 `runs[]` 项描述一次可展示推理：

- `id`：稳定且唯一的运行标识。
- `title`、`description`：页面上的诚实标签与说明。
- `model`、`kind`、`status`、`dynamicStage`：模型与阶段状态。
- `root`：这一运行的静态资源根目录。
- `resolution`：图像宽、高。
- `cameras[]`：相机目录名与中文按钮标签。
- `frames[]`：时间索引、目录名、显示标签与帧角色。
- `outputs`：页面四个槽位对应的文件名：`input`、`render`、`depth`、`alpha`。

目录布局必须满足：

```text
<root>/<frame.slug>/<camera.id>/<outputs.input>
<root>/<frame.slug>/<camera.id>/<outputs.render>
<root>/<frame.slug>/<camera.id>/<outputs.depth>
<root>/<frame.slug>/<camera.id>/<outputs.alpha>
```

把新运行加入 `runs[]` 后，可将 `defaultRun` 指向它。现有页面代码无需硬编码相机数、帧数或运行目录。
