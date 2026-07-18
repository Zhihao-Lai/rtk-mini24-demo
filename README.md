# 前馈场景重建合并展示页

这个目录把现有 RTK 点云页和静态高斯结果页放进同一个纯静态应用。顶栏可切换：

1. **RTK 场景重建**：保留原有 VGGT + RTK 点云查看器，只显示 RTK 结果。
2. **前馈高斯渲染**：逐帧、逐相机对照输入参考、高斯渲染 RGB、投影深度和 Alpha。

当前默认高斯场景是 **ReconDrive 官方 Stage2 权重在 scene-0120 上的真实复现结果**，包含 7 帧×6 相机的输入/参考、Gaussian RGB、真实 gsplat 深度和 Alpha。页面也保留 DynaForward Stage1 静态 sanity sample 作为比较；动态 Stage2 结果待学校端权重恢复后再补。

## 本地启动

在本目录运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开：

- `http://127.0.0.1:8765/#rtk`
- `http://127.0.0.1:8765/#gaussian`

不能直接双击 `index.html`，因为浏览器需要通过 HTTP 读取 JSON 清单与二进制点云。

## 数据清单

- `pointclouds/manifest.json`：RTK 场景与点云资源。
- `gaussian_runs/manifest.json`：高斯运行、相机、帧和四类图像输出。
- `catalog/manifest.json`：顶层展示目录，并预留了隐藏的 `旧版地图` 导入位。

后续新增结果时，添加 `gaussian_runs/<run-id>/` 并向 `gaussian_runs/manifest.json` 增加一项即可；无需新建端口或第二套页面。

数据来源与许可说明保留在 [ATTRIBUTION.md](ATTRIBUTION.md)。
