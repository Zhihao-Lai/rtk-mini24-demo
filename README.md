# 三维重建资产集合

校园、道路、新数据和 Gaussian 结果统一放在同一套资产列表中，不再按纯视觉、RTK 或渲染方式分类。当前展示 20 套点云和 5 套 Gaussian 结果。

列表按实际场景去重，每个场景只保留一个优选结果：

- Helenenschacht 保留旧版高密度点云。
- DJI Terra 保留 70 帧结果，不再重复展示 Mini24。
- 土牛溪保留 RTK 对齐结果，不再单列纯视觉版本。
- 纯视觉与 RTK 对齐版本不作为两个资产重复展示。

旧校园站和道路站继续作为静态文件源，统一页面直接读取其点云、预览和输入图，不再复制约 2 GB 二进制资源。

## 本地启动

在本目录运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开：

- `http://127.0.0.1:8765/`
- `http://127.0.0.1:8765/#asset=fullres_helenenschacht_48_10m`

不能直接双击 `index.html`，因为浏览器需要通过 HTTP 读取 JSON 清单与二进制点云。

## 数据清单

- `pointclouds/manifest.json`：去重后的统一点云清单。
- `gaussian_runs/manifest.json`：Gaussian 运行、相机、帧和图像输出。
- `collection.js`：统一资产卡片与查看器切换逻辑。
- `gaussian3d.js`：基于 Spark + Three.js 的懒加载交互式 Gaussian 查看器。
- `vendor/`：自托管的 Spark 2.1.0、Three.js r180 及轨道控制模块。
- `catalog/manifest.json`：顶层单集合入口。

运行下面的命令可从两个旧站重新生成统一点云清单：

```bash
python3 tools/build_unified_collection.py
```

两个旧 GitHub Pages 站需要保持发布状态，以便统一页面继续读取其 PCD1 资源。后续新增结果只需更新相应清单，无需新建页面或端口。

数据来源与许可说明保留在 [ATTRIBUTION.md](ATTRIBUTION.md)。
