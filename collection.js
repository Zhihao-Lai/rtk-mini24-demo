(() => {
  const pointcloudView = document.getElementById("rtkView");
  const gaussianView = document.getElementById("gaussianView");
  const grids = [
    document.getElementById("sceneGrid"),
    document.getElementById("gaussianAssetGrid"),
  ].filter(Boolean);
  const subtitle = document.getElementById("siteSubtitle");
  const cardsById = new Map();
  let assets = [];
  let selectionToken = 0;

  function formatCount(value) {
    const number = Number(value) || 0;
    if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
    if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}万`;
    return String(number);
  }

  function gaussianPreview(run) {
    const frame = run.frames.find((item) => item.default) || run.frames[0];
    const camera = run.cameras[0];
    const output = run.outputs.render || run.outputs.input;
    return `${run.root}/${frame.slug}/${camera.id}/${output}`;
  }

  function pointcloudAsset(item) {
    const frames = item.framesTotal ?? item.rtkMetrics?.frames_total ?? item.inputs.length;
    return {
      id: item.stem,
      kind: "pointcloud",
      title: item.title,
      preview: item.preview,
      meta: `${formatCount(item.displayPoints)}点 · ${frames}帧`,
    };
  }

  function gaussianAsset(run) {
    const gaussianCount = Number(run.interactive3d?.gaussianCount) || 0;
    return {
      id: run.id,
      kind: "gaussian",
      title: run.title,
      preview: gaussianPreview(run),
      meta: `${gaussianCount ? `${formatCount(gaussianCount)} Gaussian` : "静态结果"} · ${run.frames.length}帧`,
    };
  }

  function setActive(id) {
    cardsById.forEach((cards, assetId) => {
      cards.forEach((card) => card.classList.toggle("active", assetId === id));
    });
  }

  function renderGrid(grid) {
    grid.innerHTML = "";
    for (const asset of assets) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "case-card";
      card.dataset.assetId = asset.id;
      card.dataset.assetKind = asset.kind;
      card.innerHTML = `
        <img src="${asset.preview}" alt="${asset.title}预览" loading="lazy" decoding="async">
        <div class="case-body">
          <h3>${asset.title}</h3>
          <p>${asset.meta}</p>
        </div>
      `;
      card.addEventListener("click", () => selectAsset(asset, true));
      grid.appendChild(card);
      const matchingCards = cardsById.get(asset.id) || [];
      matchingCards.push(card);
      cardsById.set(asset.id, matchingCards);
    }
  }

  async function selectAsset(asset, updateHash) {
    if (!asset) return;
    const token = ++selectionToken;
    setActive(asset.id);
    if (asset.kind === "gaussian") {
      pointcloudView.hidden = true;
      gaussianView.hidden = false;
      document.body.classList.add("gaussian-mode");
      subtitle.textContent = "三维重建资产统一展示";
      await window.__selectGaussianRun?.(asset.id);
      if (token !== selectionToken) return;
      window.dispatchEvent(new CustomEvent("site-view-changed", { detail: { view: "gaussian" } }));
      await window.__ensureGaussian3D?.();
    } else {
      gaussianView.hidden = true;
      pointcloudView.hidden = false;
      document.body.classList.remove("gaussian-mode");
      subtitle.textContent = "三维重建资产统一展示";
      await window.__selectPointCloud?.(asset.id);
      if (token !== selectionToken) return;
      window.dispatchEvent(new CustomEvent("site-view-changed", { detail: { view: "pointcloud" } }));
    }
    if (token !== selectionToken) return;
    document.title = `${asset.title}｜三维重建资产集合`;
    if (updateHash) {
      history.replaceState(null, "", `#asset=${encodeURIComponent(asset.id)}`);
    }
    window.dispatchEvent(new CustomEvent("collection-asset-changed", { detail: { asset } }));
  }

  function hashAssetId() {
    const match = window.location.hash.match(/^#asset=(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function boot() {
    const [pointcloudResponse, gaussianResponse] = await Promise.all([
      fetch(`pointclouds/manifest.json?ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`gaussian_runs/manifest.json?ts=${Date.now()}`, { cache: "no-store" }),
    ]);
    if (!pointcloudResponse.ok || !gaussianResponse.ok) {
      throw new Error("资产清单加载失败");
    }
    const [pointcloudManifest, gaussianManifest] = await Promise.all([
      pointcloudResponse.json(),
      gaussianResponse.json(),
    ]);
    assets = [
      ...pointcloudManifest.items.map(pointcloudAsset),
      ...gaussianManifest.runs.filter((run) => run.status === "ready").map(gaussianAsset),
    ];
    grids.forEach(renderGrid);
    const requested = assets.find((asset) => asset.id === hashAssetId());
    const fallback = assets.find((asset) => asset.id === pointcloudManifest.defaultScene) || assets[0];
    await selectAsset(requested || fallback, false);
  }

  window.addEventListener("hashchange", () => {
    const asset = assets.find((item) => item.id === hashAssetId());
    if (asset) selectAsset(asset, false);
  });
  window.__assetCollectionState = () => ({
    count: assets.length,
    pointclouds: assets.filter((item) => item.kind === "pointcloud").length,
    gaussians: assets.filter((item) => item.kind === "gaussian").length,
    active: hashAssetId(),
  });

  boot().catch((error) => {
    console.error(error);
    subtitle.textContent = "资产清单加载失败";
  });
})();
