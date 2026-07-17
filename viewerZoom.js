(function (root) {
  const MIN_ZOOM = 0.55;
  const WHEEL_ZOOM_IN = 1.08;
  const WHEEL_ZOOM_OUT = 0.92;

  function computeWheelZoom(currentZoom, deltaY) {
    if (!Number.isFinite(currentZoom) || currentZoom <= 0) {
      return MIN_ZOOM;
    }
    const factor = deltaY > 0 ? WHEEL_ZOOM_OUT : WHEEL_ZOOM_IN;
    return Math.max(MIN_ZOOM, currentZoom * factor);
  }

  const api = { computeWheelZoom };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.viewerZoom = api;
}(typeof globalThis !== "undefined" ? globalThis : window));
