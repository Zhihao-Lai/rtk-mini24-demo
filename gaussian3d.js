const elements = {
  card: document.getElementById("gaussianSplatCard"),
  viewport: document.getElementById("gaussianSplatViewport"),
  status: document.getElementById("gaussianSplatStatus"),
  assetSelect: document.getElementById("gaussianSplatAsset"),
  defaultView: document.getElementById("gaussianSplatDefault"),
  topView: document.getElementById("gaussianSplatTop"),
  fullscreen: document.getElementById("gaussianSplatFullscreen"),
  loading: document.getElementById("gaussianSplatLoading"),
  loadingTitle: document.getElementById("gaussianSplatLoadingTitle"),
  loadingDetail: document.getElementById("gaussianSplatLoadingDetail"),
  progress: document.getElementById("gaussianSplatProgress"),
  count: document.getElementById("gaussianSplatCount"),
  gaussianView: document.getElementById("gaussianView"),
};

const state = {
  THREE: null,
  SplatMesh: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  mesh: null,
  run: null,
  asset: null,
  loadToken: 0,
  enginePromise: null,
  defaultCamera: null,
};

function isGaussianVisible() {
  return window.location.hash === "#gaussian" && !elements.gaussianView.hidden;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function showLoading(title, detail, percent = 4) {
  elements.loading.hidden = false;
  elements.loadingTitle.textContent = title;
  elements.loadingDetail.textContent = detail;
  elements.progress.style.width = `${Math.max(3, Math.min(100, percent))}%`;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function resizeRenderer() {
  if (!state.renderer || !state.camera) return;
  const rect = elements.viewport.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
}

function applyCamera(kind = "default") {
  if (!state.camera || !state.controls || !state.defaultCamera) return;
  const spec = state.defaultCamera;
  const position = kind === "top" ? spec.topPosition : spec.position;
  state.camera.up.fromArray(spec.up).normalize();
  state.camera.position.fromArray(position);
  state.controls.target.fromArray(spec.lookAt);
  state.controls.update();
}

function disposeMesh() {
  if (!state.mesh) return;
  state.scene?.remove(state.mesh);
  state.mesh.dispose?.();
  state.mesh = null;
}

async function ensureEngine() {
  if (state.renderer) return;
  if (state.enginePromise) return state.enginePromise;

  state.enginePromise = (async () => {
    showLoading("正在启动 3D Gaussian 渲染器", "首次进入需加载本站自托管的 Spark 与 Three.js 模块。", 7);
    const [THREE, sparkModule, controlsModule] = await Promise.all([
      import("three"),
      import("@sparkjsdev/spark"),
      import("three/addons/controls/OrbitControls.js"),
    ]);

    state.THREE = THREE;
    state.SplatMesh = sparkModule.SplatMesh;
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0d1315);
    state.camera = new THREE.PerspectiveCamera(55, 1, 0.03, 1500);
    state.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    state.renderer.setClearColor(0x0d1315, 1);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.domElement.setAttribute("aria-label", "交互式 3D Gaussian 场景");
    state.renderer.domElement.tabIndex = 0;
    elements.viewport.insertBefore(state.renderer.domElement, elements.loading);

    // ReconDrive is rendered by gsplat in "classic" mode, whose default
    // eps2d=0.3 widens sub-pixel Gaussians without attenuating their alpha.
    // Spark's blurAmount performs energy-preserving alpha attenuation, which
    // makes this particular feed-forward scene look almost black in an
    // overview.  preBlurAmount is the matching covariance-floor equivalent.
    const spark = new sparkModule.SparkRenderer({
      renderer: state.renderer,
      preBlurAmount: 0.3,
      blurAmount: 0,
    });
    state.scene.add(spark);
    state.controls = new controlsModule.OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.08;
    state.controls.screenSpacePanning = true;
    state.controls.rotateSpeed = 0.55;
    state.controls.zoomSpeed = 0.8;
    state.controls.panSpeed = 0.75;
    state.controls.minDistance = 0.15;
    state.controls.maxDistance = 900;

    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(elements.viewport);
    window.addEventListener("resize", resizeRenderer);
    document.addEventListener("fullscreenchange", resizeRenderer);
    resizeRenderer();

    state.renderer.setAnimationLoop(() => {
      if (!isGaussianVisible() && document.fullscreenElement !== elements.card) return;
      state.controls.update();
      state.renderer.render(state.scene, state.camera);
    });
  })();

  try {
    await state.enginePromise;
  } catch (error) {
    state.enginePromise = null;
    throw error;
  }
}

function populateAssets(run) {
  const config = run?.interactive3d;
  const assets = config?.assets || [];
  const previous = elements.assetSelect.value;
  elements.assetSelect.innerHTML = "";
  assets.forEach((asset) => {
    const option = document.createElement("option");
    option.value = asset.id;
    option.textContent = asset.label;
    elements.assetSelect.appendChild(option);
  });
  const preferred = assets.some((asset) => asset.id === previous)
    ? previous
    : config?.defaultAsset || assets[0]?.id;
  if (preferred) elements.assetSelect.value = preferred;
  elements.assetSelect.disabled = assets.length < 2;
  return assets.find((asset) => asset.id === elements.assetSelect.value) || assets[0] || null;
}

function progressHandler(asset, token) {
  return (event) => {
    if (token !== state.loadToken) return;
    const loaded = Number(event.loaded) || 0;
    const total = Number(event.total) || 0;
    const computable = Boolean(event.lengthComputable && total > 0);
    const percent = computable ? Math.min(94, (loaded / total) * 94) : 18;
    const progressText = computable
      ? `${Math.round((loaded / total) * 100)}% · ${formatBytes(loaded)} / ${formatBytes(total)}`
      : loaded > 0 ? `已读取 ${formatBytes(loaded)}` : "正在解码 Gaussian 数据";
    showLoading("正在加载全量 3D 场景", `${asset.note || asset.label} · ${progressText}`, percent);
  };
}

async function loadInteractiveRun(run, force = false) {
  const previousRunId = state.run?.id;
  state.run = run;
  const asset = populateAssets(run);
  if (!run?.interactive3d || !asset) {
    state.loadToken += 1;
    disposeMesh();
    elements.status.textContent = "当前批次没有可交互 3D 资产";
    elements.count.textContent = "3D Gaussian 未导出";
    showLoading("暂无交互式 3D 场景", "请切换到 ReconDrive 官方 Stage2 复现批次。", 0);
    return;
  }
  if (!isGaussianVisible() && !force) return;
  if (state.mesh && state.asset?.id === asset.id && previousRunId === run.id) {
    resizeRenderer();
    return;
  }

  const token = ++state.loadToken;
  state.asset = asset;
  elements.status.textContent = `${asset.label} · 加载中`;
  elements.count.textContent = `${Number(asset.gaussianCount || run.interactive3d.gaussianCount).toLocaleString()} Gaussians`;
  showLoading("正在加载全量 3D 场景", asset.note || asset.label, 5);

  try {
    await ensureEngine();
    if (token !== state.loadToken) return;
    disposeMesh();

    const camera = run.interactive3d.camera || {};
    state.defaultCamera = {
      fov: Number(camera.fov) || 55,
      up: camera.up || [0, 0, 1],
      position: camera.position || [-40, -45, 28],
      lookAt: camera.lookAt || [3.5, -3.2, 3],
      topPosition: camera.topPosition || [3.5, -3.2, 105],
    };
    state.camera.fov = state.defaultCamera.fov;
    state.camera.updateProjectionMatrix();
    applyCamera("default");

    const url = new URL(`${run.root}/${asset.path}`, document.baseURI).toString();
    const mesh = new state.SplatMesh({
      url,
      onProgress: progressHandler(asset, token),
      raycastable: false,
    });
    state.scene.add(mesh);
    state.mesh = mesh;
    await mesh.initialized;
    if (token !== state.loadToken) {
      state.scene.remove(mesh);
      mesh.dispose?.();
      return;
    }

    const gaussianCount = Number(mesh.numSplats || asset.gaussianCount || run.interactive3d.gaussianCount);
    elements.count.textContent = `${gaussianCount.toLocaleString()} Gaussians`;
    elements.status.textContent = `${asset.label} · 已加载`;
    hideLoading();
    resizeRenderer();
    applyCamera("default");
  } catch (error) {
    console.error("3D Gaussian viewer failed", error);
    if (token !== state.loadToken) return;
    elements.status.textContent = "3D 场景加载失败";
    showLoading("无法加载 3D Gaussian", error?.message || String(error), 0);
  }
}

async function ensureGaussian3D() {
  const run = window.__gaussianCurrentRun?.() || state.run;
  if (!run) {
    showLoading("正在读取高斯结果清单", "结果清单就绪后会自动加载 3D 场景。", 3);
    return;
  }
  await loadInteractiveRun(run, true);
}

elements.assetSelect.addEventListener("change", () => {
  if (state.run) loadInteractiveRun(state.run, true);
});
elements.defaultView.addEventListener("click", () => applyCamera("default"));
elements.topView.addEventListener("click", () => applyCamera("top"));
elements.fullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement === elements.card) {
    await document.exitFullscreen();
  } else {
    await elements.card.requestFullscreen();
  }
});
document.addEventListener("fullscreenchange", () => {
  elements.fullscreen.textContent = document.fullscreenElement === elements.card ? "退出全屏" : "全屏";
});
window.addEventListener("gaussian-run-changed", (event) => {
  state.run = event.detail?.run || null;
  if (isGaussianVisible()) loadInteractiveRun(state.run, true);
  else populateAssets(state.run);
});
window.addEventListener("site-view-changed", (event) => {
  if (event.detail?.view === "gaussian") ensureGaussian3D();
});

window.__ensureGaussian3D = ensureGaussian3D;
window.__gaussian3DState = () => ({
  runId: state.run?.id || null,
  assetId: state.asset?.id || null,
  loaded: Boolean(state.mesh?.isInitialized),
  gaussianCount: Number(state.mesh?.numSplats || state.asset?.gaussianCount || 0),
});

if (window.location.hash === "#gaussian") ensureGaussian3D();
