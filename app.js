const canvas = document.getElementById("viewerCanvas");
const titleEl = document.getElementById("viewerTitle");
const statusEl = document.getElementById("viewerStatus");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const inputStrip = document.getElementById("inputStrip");
const sceneGrid = document.getElementById("sceneGrid");
const viewButtons = Array.from(document.querySelectorAll("#viewControls [data-view]"));
const localCloudButton = document.getElementById("localCloudButton");
const localCloudInput = document.getElementById("localCloudInput");

let gl;
let program;
let positionBuffer;
let colorBuffer;
let currentScene = null;
let sceneItems = [];
let pointCount = 0;
let cardByStem = new Map();
let yaw = 0.45;
let pitch = -0.5;
let zoom = 1.18;
let panX = 0;
let panY = 0;
let dragging = false;
let dragMode = "rotate";
let lastPointer = null;
let activeLoadToken = 0;
let renderRequested = false;

window.__viewerInteractionState = () => ({ yaw, pitch, zoom, panX, panY, dragging, dragMode });

const VIEW_PRESETS = {
  angle: { yaw: 0, pitch: -1.42, zoom: 0.9 },
  top: { yaw: 0, pitch: -1.52, zoom: 0.85 },
};

function formatCount(value) {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(value >= 1000000000 ? 0 : 1)}亿`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  }
  return String(value);
}

function sceneModeLabel(scene) {
  return scene.rtkMetrics ? "视觉 + RTK" : "纯视觉";
}

function setActiveView(name) {
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
}

function cloudSpecFor(scene) {
  return {
    label: "全量",
    cloud: scene.cloud,
    chunks: scene.chunks,
    displayPoints: scene.displayPoints,
    cloudMb: scene.cloudMb,
  };
}

function applyView(name) {
  if (name === "turn-left" || name === "turn-right" || name === "turn-back") {
    const delta = {
      "turn-left": -Math.PI / 2,
      "turn-right": Math.PI / 2,
      "turn-back": Math.PI,
    }[name];
    yaw += delta;
    setActiveView(null);
    requestRender();
    return;
  }

  const preset = VIEW_PRESETS[name === "reset" ? "angle" : name];
  if (!preset) {
    return;
  }
  yaw = preset.yaw;
  pitch = preset.pitch;
  zoom = preset.zoom;
  panX = 0;
  panY = 0;
  setActiveView(name === "reset" ? "angle" : name);
  requestRender();
}

function midpoint(values, lowerRatio, upperRatio) {
  values.sort((a, b) => a - b);
  const lower = values[Math.floor((values.length - 1) * lowerRatio)];
  const upper = values[Math.floor((values.length - 1) * upperRatio)];
  return (lower + upper) * 0.5;
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }
  return shader;
}

function createProgram() {
  const vertex = createShader(gl.VERTEX_SHADER, `
    attribute vec3 a_position;
    attribute vec3 a_color;
    uniform float u_yaw;
    uniform float u_pitch;
    uniform float u_zoom;
    uniform float u_aspect;
    uniform vec2 u_pan;
    uniform float u_point_size;
    varying vec3 v_color;

    void main() {
      float cy = cos(u_yaw);
      float sy = sin(u_yaw);
      float cp = cos(u_pitch);
      float sp = sin(u_pitch);
      vec3 p = a_position;
      vec3 yrot = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
      vec3 q = vec3(yrot.x, yrot.y * cp - yrot.z * sp, yrot.y * sp + yrot.z * cp);
      gl_Position = vec4(q.x * u_zoom / u_aspect + u_pan.x, q.y * u_zoom + u_pan.y, q.z * 0.35, 1.0);
      gl_PointSize = u_point_size;
      v_color = a_color;
    }
  `);
  const fragment = createShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 v_color;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float radius = dot(uv, uv);
      if (radius > 0.25) {
        discard;
      }
      float edge = smoothstep(0.25, 0.12, radius);
      vec3 lifted = pow(max(v_color, vec3(0.0)), vec3(0.78));
      gl_FragColor = vec4(lifted * (0.92 + edge * 0.08), edge);
    }
  `);
  const linked = gl.createProgram();
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(linked) || "Program link failed");
  }
  return linked;
}

function setupGl() {
  gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) {
    statusEl.textContent = "当前浏览器不支持三维显示";
    return false;
  }
  program = createProgram();
  positionBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
  gl.clearColor(0.157, 0.192, 0.227, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return true;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function parsePointCloud(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "PCD1") {
    throw new Error("Unexpected point cloud format");
  }
  const count = view.getUint32(4, true);
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);
  let offset = 8;
  for (let i = 0; i < count; i += 1) {
    const p = i * 3;
    positions[p] = view.getInt16(offset, true) / 32767;
    positions[p + 1] = view.getInt16(offset + 2, true) / 32767;
    positions[p + 2] = view.getInt16(offset + 4, true) / 32767;
    colors[p] = view.getUint8(offset + 6);
    colors[p + 1] = view.getUint8(offset + 7);
    colors[p + 2] = view.getUint8(offset + 8);
    offset += 10;
  }
  return { count, positions, colors };
}

function orientPositions(positions, scene) {
  const oriented = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (scene.upAxis === "z") {
      oriented[i] = x;
      oriented[i + 1] = -z;
      oriented[i + 2] = y;
    } else {
      oriented[i] = x;
      oriented[i + 1] = y;
      oriented[i + 2] = z;
    }
    if (scene.flipY) {
      oriented[i + 1] *= -1;
    }
    if (scene.flipZ) {
      oriented[i + 2] *= -1;
    }
  }
  return oriented;
}

function centerPositions(positions) {
  const pointTotal = positions.length / 3;
  const maxSamples = 24000;
  const stride = Math.max(1, Math.floor(pointTotal / maxSamples));
  const xs = [];
  const ys = [];
  const zs = [];

  for (let p = 0; p < pointTotal; p += stride) {
    const i = p * 3;
    xs.push(positions[i]);
    ys.push(positions[i + 1]);
    zs.push(positions[i + 2]);
  }

  const centerX = midpoint(xs, 0.02, 0.98);
  const centerY = midpoint(ys, 0.02, 0.98);
  const centerZ = midpoint(zs, 0.02, 0.98);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= centerX;
    positions[i + 1] -= centerY;
    positions[i + 2] -= centerZ;
  }
  return positions;
}

async function fetchCloudBuffer(cloudSpec, loadToken) {
  if (Array.isArray(cloudSpec.chunks) && cloudSpec.chunks.length > 0) {
    const parts = [];
    let totalBytes = 0;
    for (let index = 0; index < cloudSpec.chunks.length; index += 1) {
      statusEl.textContent = `${cloudSpec.label}加载中 ${index + 1}/${cloudSpec.chunks.length}`;
      const response = await fetch(cloudSpec.chunks[index], { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load ${cloudSpec.chunks[index]}`);
      }
      const part = new Uint8Array(await response.arrayBuffer());
      if (loadToken !== activeLoadToken) {
        return null;
      }
      parts.push(part);
      totalBytes += part.byteLength;
    }
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.byteLength;
    }
    return combined.buffer;
  }

  const response = await fetch(cloudSpec.cloud, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${cloudSpec.cloud}`);
  }
  return response.arrayBuffer();
}

async function loadCloud(scene) {
  const loadToken = activeLoadToken + 1;
  activeLoadToken = loadToken;
  const cloudSpec = cloudSpecFor(scene);
  currentScene = scene;
  if (Number.isFinite(scene.viewYaw)) {
    yaw = scene.viewYaw;
  }
  if (Number.isFinite(scene.viewPitch)) {
    pitch = scene.viewPitch;
  }
  if (Number.isFinite(scene.viewZoom)) {
    zoom = scene.viewZoom;
  }
  pointCount = 0;
  titleEl.textContent = scene.title;
  detailTitle.textContent = scene.title;
  statusEl.textContent = `${cloudSpec.label}加载中`;
  inputStrip.innerHTML = "";
  scene.inputs.forEach((src, index) => {
    const figure = document.createElement("figure");
    figure.innerHTML = `<img src="${src}" alt="${scene.title}视角${index + 1}" loading="lazy" decoding="async">`;
    inputStrip.appendChild(figure);
  });
  const framesTotal = scene.framesTotal ?? scene.rtkMetrics?.frames_total ?? scene.inputs.length;
  const metaParts = [
    sceneModeLabel(scene),
    `${formatCount(scene.displayPoints)}点`,
    `${framesTotal}帧`,
  ];
  if (scene.coordinateFrame) {
    metaParts.push(`坐标系：${scene.coordinateFrame}`);
  }
  if (scene.rtkMetrics && Number.isFinite(scene.rtkMetrics.rmse_3d_m_holdout)) {
    const metricLabel = scene.rtkMetricLabel || "留出 RTK RMSE";
    metaParts.push(`${metricLabel}：${scene.rtkMetrics.rmse_3d_m_holdout.toFixed(2)}m`);
  } else if (scene.rtkMetrics && Number.isFinite(scene.rtkMetrics.rmse_3d_m_all_frames_diagnostic)) {
    metaParts.push(`全帧拟合诊断：${scene.rtkMetrics.rmse_3d_m_all_frames_diagnostic.toFixed(2)}m`);
  }
  if (scene.rtkMetrics?.fit_frames && Number.isFinite(scene.rtkMetrics.fit_inliers)) {
    const inlierLabel = scene.rtkInlierLabel || "一致内点";
    metaParts.push(`${inlierLabel}：${scene.rtkMetrics.fit_inliers}/${scene.rtkMetrics.fit_frames}`);
  }
  detailMeta.innerHTML = metaParts.map((part) => `<span>${part}</span>`).join("");
  cardByStem.forEach((card, stem) => {
    card.classList.toggle("active", stem === scene.stem);
  });

  const buffer = await fetchCloudBuffer(cloudSpec, loadToken);
  if (!buffer) {
    return;
  }
  const cloud = parsePointCloud(buffer);
  if (loadToken !== activeLoadToken) {
    return;
  }
  const positions = centerPositions(orientPositions(cloud.positions, scene));
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cloud.colors, gl.STATIC_DRAW);
  pointCount = cloud.count;
  statusEl.textContent = `${cloudSpec.label} ${formatCount(cloud.count)}点`;
  requestRender();
}

async function loadLocalCloud(file) {
  if (!file) {
    return;
  }
  const loadToken = activeLoadToken + 1;
  activeLoadToken = loadToken;
  const scene = currentScene || {};
  pointCount = 0;
  titleEl.textContent = file.name.replace(/\.[^.]+$/, "") || "本地点云";
  detailTitle.textContent = "本地点云";
  statusEl.textContent = "本地点云加载中";
  detailMeta.innerHTML = "<span>本地文件</span><span>不会上传</span>";
  cardByStem.forEach((card) => card.classList.remove("active"));

  const cloud = parsePointCloud(await file.arrayBuffer());
  if (loadToken !== activeLoadToken) {
    return;
  }
  const positions = centerPositions(orientPositions(cloud.positions, scene));
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cloud.colors, gl.STATIC_DRAW);
  pointCount = cloud.count;
  statusEl.textContent = `本地点云 ${formatCount(cloud.count)}点`;
  requestRender();
}

function renderGrid(items) {
  sceneGrid.innerHTML = "";
  cardByStem = new Map();
  for (const item of items) {
    const framesTotal = item.framesTotal ?? item.rtkMetrics?.frames_total ?? item.inputs.length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "case-card";
    card.innerHTML = `
        <img src="${item.preview}" alt="${item.title}预览" loading="lazy">
      <div class="case-body">
        <h3>${item.title}</h3>
        <p>${sceneModeLabel(item)} · ${formatCount(item.displayPoints)}点 · ${framesTotal}帧</p>
      </div>
    `;
    card.addEventListener("click", () => {
      applyView("angle");
      loadCloud(item).catch(showError);
    });
    sceneGrid.appendChild(card);
    cardByStem.set(item.stem, card);
  }
}

function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(draw);
  }
}

function draw() {
  renderRequested = false;
  if (!gl || !program) {
    return;
  }
  resizeCanvas();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (pointCount > 0) {
    gl.useProgram(program);
    const positionLoc = gl.getAttribLocation(program, "a_position");
    const colorLoc = gl.getAttribLocation(program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, "u_yaw"), yaw);
    gl.uniform1f(gl.getUniformLocation(program, "u_pitch"), pitch);
    gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), zoom);
    gl.uniform1f(gl.getUniformLocation(program, "u_aspect"), canvas.width / canvas.height);
    gl.uniform2f(gl.getUniformLocation(program, "u_pan"), panX, panY);
    gl.uniform1f(gl.getUniformLocation(program, "u_point_size"), Math.max(2.0, Math.min(5.0, window.devicePixelRatio * 2.05)));
    gl.drawArrays(gl.POINTS, 0, pointCount);
  }
}

function showError(error) {
  console.error(error);
  statusEl.textContent = "加载失败";
}

function onPointerMove(event) {
  if (!dragging || !lastPointer) {
    return;
  }
  const requiredMouseButton = dragMode === "pan" ? 2 : 1;
  if (event.pointerType === "mouse" && (event.buttons & requiredMouseButton) !== requiredMouseButton) {
    dragging = false;
    dragMode = "rotate";
    lastPointer = null;
    return;
  }
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  if (dragMode === "pan") {
    const rect = canvas.getBoundingClientRect();
    panX += (dx / rect.width) * 2;
    panY -= (dy / rect.height) * 2;
  } else {
    yaw += dx * 0.008;
    pitch = Math.max(-1.52, Math.min(1.52, pitch + dy * 0.006));
  }
  lastPointer = { x: event.clientX, y: event.clientY };
  requestRender();
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
canvas.addEventListener("pointerdown", (event) => {
  let mode = "rotate";
  if (event.pointerType === "mouse") {
    if (event.button === 2) {
      mode = "pan";
    } else if (event.button !== 0) {
      return;
    }
  }
  event.preventDefault();
  dragging = true;
  dragMode = mode;
  setActiveView(null);
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  dragMode = "rotate";
  lastPointer = null;
  canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
  dragMode = "rotate";
  lastPointer = null;
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  setActiveView(null);
  zoom = window.viewerZoom.computeWheelZoom(zoom, event.deltaY);
  requestRender();
}, { passive: false });
window.addEventListener("resize", requestRender);

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyView(button.dataset.view);
  });
});

localCloudButton.addEventListener("click", () => {
  localCloudInput.click();
});

localCloudInput.addEventListener("change", () => {
  const file = localCloudInput.files && localCloudInput.files[0];
  loadLocalCloud(file).catch(showError);
  localCloudInput.value = "";
});

async function boot() {
  if (!setupGl()) {
    return;
  }
  const response = await fetch(`pointclouds/manifest.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("加载场景列表失败");
  }
  const manifest = await response.json();
  sceneItems = manifest.items;
  renderGrid(sceneItems);
  const first = sceneItems.find((item) => item.stem === manifest.defaultScene) || sceneItems[0];
  applyView("angle");
  await loadCloud(first);
  requestRender();
}

boot().catch(showError);
