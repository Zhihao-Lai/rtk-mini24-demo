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

## 安全打包方法

`tools/package_gaussian_run.py` 可以先只读验证，等胜出方案确定后再物化并追加清单。它不覆盖任何旧批次，也不会搜索或打包清单之外的未跟踪文件。

打包 spec 是一个 JSON 对象：

```json
{
  "run": {
    "id": "method_scene_yyyymmdd",
    "title": "页面标题",
    "kicker": "Short English label",
    "description": "如实说明输入、方法与展示范围。",
    "model": "Model name",
    "kind": "static-gaussian-reconstruction",
    "status": "ready",
    "dynamicStage": false,
    "resolution": [448, 448],
    "interactive3d": {
      "defaultAsset": "full-splat",
      "gaussianCount": 1000000,
      "assets": [
        {
          "id": "full-splat",
          "label": "全量 3D Gaussian",
          "path": "gaussians/scene_full_legacy.splat",
          "format": "splat",
          "gaussianCount": 1000000,
          "note": "位置、旋转、各向异性尺度、颜色与不透明度"
        }
      ],
      "camera": {
        "fov": 55,
        "up": [0, 0, 1],
        "position": [-4, -8, 4],
        "lookAt": [0, 0, 0],
        "topPosition": [0, 0, 20]
      }
    },
    "metrics": { "psnr": 25.0, "ssim": 0.8, "lpips": 0.15 },
    "cameras": [{ "id": "CAM_MAIN", "label": "主视角" }],
    "frames": [
      { "index": 0, "slug": "frame_00", "label": "留出帧 00", "role": "heldout" }
    ],
    "outputs": {
      "input": "gt_rgb.png",
      "render": "rendered_rgb.png",
      "depth": "rendered_depth.png",
      "alpha": "rendered_alpha.png"
    },
    "artifacts": [
      { "label": "全量 Web .splat", "path": "gaussians/scene_full_legacy.splat" }
    ]
  },
  "assets": [
    {
      "source": "/absolute/export/scene_full_legacy.splat",
      "destination": "gaussians/scene_full_legacy.splat"
    },
    {
      "source": "/absolute/export/frame00/gt_rgb.png",
      "destination": "frame_00/CAM_MAIN/gt_rgb.png"
    },
    {
      "source": "/absolute/export/frame00/rendered_rgb.png",
      "destination": "frame_00/CAM_MAIN/rendered_rgb.png"
    },
    {
      "source": "/absolute/export/frame00/rendered_depth.png",
      "destination": "frame_00/CAM_MAIN/rendered_depth.png"
    },
    {
      "source": "/absolute/export/frame00/rendered_alpha.png",
      "destination": "frame_00/CAM_MAIN/rendered_alpha.png"
    }
  ]
}
```

`run.root` 可以省略，工具会固定为 `gaussian_runs/<run.id>/assets`。每个帧×相机必须齐备 RGB 真值、渲染 RGB、depth 与 alpha；图像尺寸必须和 `resolution` 一致。默认交互资产必须是每个 Gaussian 32 字节的 legacy `.splat`，声明数量必须和文件长度一致。

```bash
# 只读预检：不写文件，不改 manifest
python3 tools/package_gaussian_run.py --spec /path/to/winner-bundle.json

# 只打包新批次：manifest 仍不变
python3 tools/package_gaussian_run.py --spec /path/to/winner-bundle.json --materialize

# 胜者确认后追加批次，并设为默认展示
python3 tools/package_gaussian_run.py --spec /path/to/winner-bundle.json \
  --materialize --apply-manifest --make-default
```

工具在新批次内自动写入 `assets/metrics.json` 和 `manifest-entry.json`，便于追溯。每次运行后仍应用 `git status --short`检查，只显式 `git add gaussian_runs/<run-id> gaussian_runs/manifest.json`，不要使用 `git add .`。
