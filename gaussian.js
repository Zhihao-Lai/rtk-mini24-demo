(() => {
  const cameraButtons = document.getElementById("gaussianCameraButtons");
  const frameButtons = document.getElementById("gaussianFrameButtons");
  const timeline = document.getElementById("gaussianTimeline");
  const runSelect = document.getElementById("gaussianRunSelect");
  const frameReadout = document.getElementById("gaussianFrameReadout");
  const title = document.getElementById("gaussianRunTitle");
  const kicker = document.getElementById("gaussianRunKicker");
  const description = document.getElementById("gaussianRunDescription");
  const stageBadge = document.getElementById("gaussianStageBadge");
  const depthTitle = document.getElementById("gaussianDepthTitle");
  const depthSubtitle = document.getElementById("gaussianDepthSubtitle");
  const runNote = document.getElementById("gaussianRunNote");
  const artifacts = document.getElementById("gaussianArtifacts");
  const runStatus = document.getElementById("gaussianRunStatus");
  const resultGrid = document.querySelector(".gaussian-grid");
  const inputTitle = document.getElementById("gaussianInputTitle");
  const inputSubtitle = document.getElementById("gaussianInputSubtitle");
  const images = {
    input: document.getElementById("gaussianInputImage"),
    render: document.getElementById("gaussianRenderImage"),
    depth: document.getElementById("gaussianDepthImage"),
    alpha: document.getElementById("gaussianAlphaImage"),
  };
  const comparisonEnabled = false;

  let manifest = null;
  let run = null;
  let cameraId = "CAM_FRONT";
  let frameIndex = 3;

  function safeFrame(index) {
    const fallback = run.frames[0];
    return run.frames.find((frame) => frame.index === index) || fallback;
  }

  function assetPath(frame, outputKey) {
    return `${run.root}/${frame.slug}/${cameraId}/${run.outputs[outputKey]}`;
  }

  function updateResult() {
    if (!run) return;
    const frame = safeFrame(frameIndex);
    frameIndex = frame.index;
    timeline.value = String(frameIndex);
    const lastIndex = run.frames[run.frames.length - 1].index;
    frameReadout.textContent = `${String(frameIndex).padStart(2, "0")} / ${String(lastIndex).padStart(2, "0")} · ${frame.label}`;

    const isEndpointInput = String(frame.role || "").startsWith("endpoint");
    inputTitle.textContent = isEndpointInput ? "模型输入（端点）" : "参考真值（未输入）";
    inputSubtitle.textContent = isEndpointInput ? "Endpoint input RGB" : "Novel-view ground truth";

    if (comparisonEnabled) {
      Object.entries(images).forEach(([key, image]) => {
        image.src = assetPath(frame, key);
        image.dataset.frame = String(frameIndex);
        image.dataset.camera = cameraId;
      });
    }

    cameraButtons.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.camera === cameraId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    frameButtons.querySelectorAll("button").forEach((button) => {
      const active = Number(button.dataset.frame) === frameIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderControls() {
    cameraButtons.innerHTML = "";
    run.cameras.forEach((camera) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.camera = camera.id;
      button.textContent = camera.label;
      button.title = camera.id;
      button.addEventListener("click", () => {
        cameraId = camera.id;
        updateResult();
      });
      cameraButtons.appendChild(button);
    });

    frameButtons.innerHTML = "";
    run.frames.forEach((frame) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.frame = String(frame.index);
      button.textContent = String(frame.index).padStart(2, "0");
      button.title = frame.label;
      button.addEventListener("click", () => {
        frameIndex = frame.index;
        updateResult();
      });
      frameButtons.appendChild(button);
    });

    timeline.min = String(run.frames[0].index);
    timeline.max = String(run.frames[run.frames.length - 1].index);
    timeline.value = String(frameIndex);
  }

  function applyRun(nextRun) {
    run = nextRun;
    cameraId = run.cameras[0].id;
    frameIndex = run.frames.find((frame) => frame.default)?.index
      ?? run.frames.find((frame) => frame.role === "target-mid")?.index
      ?? run.frames[0].index;
    kicker.textContent = run.kicker || "Static Gaussian result";
    title.textContent = run.title;
    description.textContent = run.description;
    stageBadge.textContent = run.stageBadge || "DynaForward 动态结果待恢复";
    depthTitle.textContent = run.depthLabel || "投影深度";
    depthSubtitle.textContent = run.depthSubtitle || "Projected depth";
    runNote.textContent = run.note || "输入与渲染按同一相机、同一帧对应。";
    resultGrid.style.setProperty("--gaussian-media-aspect", `${run.resolution[0]} / ${run.resolution[1]}`);

    artifacts.innerHTML = "";
    (run.artifacts || []).forEach((artifact) => {
      const link = document.createElement("a");
      link.href = `${run.root}/${artifact.path}`;
      link.textContent = artifact.label;
      link.download = artifact.download || "";
      artifacts.appendChild(link);
    });
    artifacts.hidden = artifacts.childElementCount === 0;

    const metricText = run.metrics?.psnr != null
      ? ` · PSNR ${Number(run.metrics.psnr).toFixed(2)} dB · SSIM ${Number(run.metrics.ssim).toFixed(3)} · LPIPS ${Number(run.metrics.lpips).toFixed(3)}`
      : "";
    runStatus.textContent = `${run.frames.length} 帧 · ${run.cameras.length} 相机 · ${run.resolution[0]}×${run.resolution[1]}${metricText}`;
    renderControls();
    updateResult();
    window.dispatchEvent(new CustomEvent("gaussian-run-changed", { detail: { run } }));
  }

  function showLoadError(error) {
    console.error(error);
    description.textContent = "高斯结果清单或图像加载失败。请通过本地 HTTP 服务打开本页。";
    runStatus.textContent = "加载失败";
  }

  async function bootGaussian() {
    const response = await fetch(`gaussian_runs/manifest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load gaussian manifest");
    manifest = await response.json();
    const readyRuns = manifest.runs.filter((item) => item.status === "ready");
    run = readyRuns.find((item) => item.id === manifest.defaultRun) || readyRuns[0];
    if (!run) throw new Error("Gaussian manifest has no runs");

    runSelect.innerHTML = "";
    readyRuns.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.title;
      runSelect.appendChild(option);
    });
    runSelect.value = run.id;
    applyRun(run);
  }

  timeline.addEventListener("input", () => {
    frameIndex = Number(timeline.value);
    updateResult();
  });

  runSelect.addEventListener("change", () => {
    const nextRun = manifest?.runs.find((item) => item.id === runSelect.value && item.status === "ready");
    if (nextRun) applyRun(nextRun);
  });

  window.__gaussianGalleryState = () => ({
    runId: run?.id || null,
    cameraId,
    frameIndex,
    manifestLoaded: Boolean(manifest),
  });
  window.__gaussianCurrentRun = () => run;

  bootGaussian().catch(showLoadError);
})();
