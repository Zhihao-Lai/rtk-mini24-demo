(() => {
  const views = {
    rtk: document.getElementById("rtkView"),
    gaussian: document.getElementById("gaussianView"),
  };
  const subtitles = {
    rtk: "图像 → VGGT 稠密几何 → RTK 地理配准",
    gaussian: "多相机输入 → 前馈高斯预测 → RGB / 深度 / Alpha",
  };
  const buttons = Array.from(document.querySelectorAll("[data-site-view]"));
  const subtitle = document.getElementById("siteSubtitle");

  function validView(value) {
    return Object.prototype.hasOwnProperty.call(views, value) ? value : "rtk";
  }

  function showView(name, updateHash = true) {
    const selected = validView(name);
    Object.entries(views).forEach(([key, element]) => {
      element.hidden = key !== selected;
    });
    buttons.forEach((button) => {
      const active = button.dataset.siteView === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    subtitle.textContent = subtitles[selected];
    document.body.classList.toggle("gaussian-mode", selected === "gaussian");
    document.title = selected === "gaussian"
      ? "前馈高斯渲染｜场景重建"
      : "VGGT + RTK｜地理配准场景重建";
    if (updateHash && window.location.hash !== `#${selected}`) {
      history.replaceState(null, "", `#${selected}`);
    }
    if (selected === "rtk") {
      window.__ensureRtkBoot?.();
      window.dispatchEvent(new Event("resize"));
    } else {
      window.__ensureGaussian3D?.();
    }
    window.dispatchEvent(new CustomEvent("site-view-changed", { detail: { view: selected } }));
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.siteView));
  });
  window.addEventListener("hashchange", () => showView(window.location.hash.slice(1), false));
  window.__combinedSiteState = () => ({ view: validView(window.location.hash.slice(1)) });

  showView(window.location.hash.slice(1), false);
})();
