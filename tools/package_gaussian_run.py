#!/usr/bin/env python3
"""Validate and add one self-contained Gaussian result batch.

The default mode is read-only.  Pass --materialize to copy the batch under
gaussian_runs/<run-id>/, and pass --apply-manifest to append its run entry to
gaussian_runs/manifest.json.  Existing runs and assets are never overwritten.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any


RUN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class BundleError(RuntimeError):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BundleError(f"cannot read JSON {path}: {exc}") from exc


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative_path(value: str, field: str) -> PurePosixPath:
    if not isinstance(value, str) or not value:
        raise BundleError(f"{field} must be a non-empty string")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise BundleError(f"{field} must be a clean relative path: {value!r}")
    return path


def safe_segment(value: Any, field: str) -> str:
    if not isinstance(value, str) or not SEGMENT_RE.fullmatch(value):
        raise BundleError(f"{field} must be one safe path segment: {value!r}")
    return value


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        header = stream.read(24)
    if len(header) != 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise BundleError(f"expected a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def resolve_source(spec_path: Path, value: Any, field: str) -> Path:
    if not isinstance(value, str) or not value:
        raise BundleError(f"{field} must be a non-empty path")
    source = Path(value).expanduser()
    if not source.is_absolute():
        source = spec_path.parent / source
    source = source.resolve()
    if not source.is_file():
        raise BundleError(f"missing source file for {field}: {source}")
    if source.stat().st_size <= 0:
        raise BundleError(f"empty source file for {field}: {source}")
    return source


def validate_run(run_value: Any, expected_root: str) -> dict[str, Any]:
    if not isinstance(run_value, dict):
        raise BundleError("spec.run must be an object")
    run = copy.deepcopy(run_value)
    run_id = run.get("id")
    if not isinstance(run_id, str) or not RUN_ID_RE.fullmatch(run_id):
        raise BundleError("run.id must match [a-z0-9][a-z0-9_-]*")
    root = run.get("root", expected_root)
    if root != expected_root:
        raise BundleError(f"run.root must equal {expected_root!r}")
    run["root"] = expected_root

    required_strings = ("title", "description", "model", "kind", "status")
    for key in required_strings:
        if not isinstance(run.get(key), str) or not run[key]:
            raise BundleError(f"run.{key} must be a non-empty string")
    if run["status"] != "ready":
        raise BundleError("run.status must be 'ready' for a published batch")

    resolution = run.get("resolution")
    if (
        not isinstance(resolution, list)
        or len(resolution) != 2
        or any(not isinstance(value, int) or value <= 0 for value in resolution)
    ):
        raise BundleError("run.resolution must be [positive width, positive height]")

    cameras = run.get("cameras")
    if not isinstance(cameras, list) or not cameras:
        raise BundleError("run.cameras must be a non-empty list")
    camera_ids: set[str] = set()
    for index, camera in enumerate(cameras):
        if not isinstance(camera, dict):
            raise BundleError(f"run.cameras[{index}] must be an object")
        camera_id = safe_segment(camera.get("id"), f"run.cameras[{index}].id")
        if camera_id in camera_ids:
            raise BundleError(f"duplicate camera id: {camera_id}")
        camera_ids.add(camera_id)
        if not isinstance(camera.get("label"), str) or not camera["label"]:
            raise BundleError(f"run.cameras[{index}].label must be non-empty")

    frames = run.get("frames")
    if not isinstance(frames, list) or not frames:
        raise BundleError("run.frames must be a non-empty list")
    frame_indexes: set[int] = set()
    frame_slugs: set[str] = set()
    last_index: int | None = None
    for position, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise BundleError(f"run.frames[{position}] must be an object")
        index = frame.get("index")
        if not isinstance(index, int) or index < 0 or index in frame_indexes:
            raise BundleError(f"invalid or duplicate frame index: {index!r}")
        if last_index is not None and index <= last_index:
            raise BundleError("run.frames must be ordered by strictly increasing index")
        last_index = index
        frame_indexes.add(index)
        slug = safe_segment(frame.get("slug"), f"run.frames[{position}].slug")
        if slug in frame_slugs:
            raise BundleError(f"duplicate frame slug: {slug}")
        frame_slugs.add(slug)
        if not isinstance(frame.get("label"), str) or not frame["label"]:
            raise BundleError(f"run.frames[{position}].label must be non-empty")

    outputs = run.get("outputs")
    if not isinstance(outputs, dict):
        raise BundleError("run.outputs must be an object")
    for key in ("input", "render", "depth", "alpha"):
        safe_segment(outputs.get(key), f"run.outputs.{key}")

    metrics = run.get("metrics")
    if not isinstance(metrics, dict):
        raise BundleError("run.metrics must be an object")
    for key in ("psnr", "ssim", "lpips"):
        if not isinstance(metrics.get(key), (int, float)):
            raise BundleError(f"run.metrics.{key} must be numeric")
    artifacts = run.setdefault("artifacts", [])
    if not isinstance(artifacts, list):
        raise BundleError("run.artifacts must be a list when provided")
    if not any(isinstance(item, dict) and item.get("path") == "metrics.json" for item in artifacts):
        artifacts.append({"label": "评估指标 JSON", "path": "metrics.json"})

    interactive = run.get("interactive3d")
    if not isinstance(interactive, dict):
        raise BundleError("run.interactive3d must describe the full .splat asset")
    assets = interactive.get("assets")
    if not isinstance(assets, list) or not assets:
        raise BundleError("run.interactive3d.assets must be a non-empty list")
    default_asset = interactive.get("defaultAsset")
    matching = [asset for asset in assets if isinstance(asset, dict) and asset.get("id") == default_asset]
    if len(matching) != 1:
        raise BundleError("interactive3d.defaultAsset must identify exactly one asset")
    if matching[0].get("format") != "splat":
        raise BundleError("the default interactive asset must use legacy .splat format")
    if not str(matching[0].get("path", "")).endswith(".splat"):
        raise BundleError("the default interactive asset path must end in .splat")
    return run


def required_destinations(run: dict[str, Any]) -> set[PurePosixPath]:
    required: set[PurePosixPath] = set()
    for frame in run["frames"]:
        for camera in run["cameras"]:
            for output_name in run["outputs"].values():
                required.add(PurePosixPath(frame["slug"], camera["id"], output_name))
    for position, asset in enumerate(run["interactive3d"]["assets"]):
        if not isinstance(asset, dict):
            raise BundleError(f"interactive3d.assets[{position}] must be an object")
        required.add(safe_relative_path(asset.get("path"), f"interactive3d.assets[{position}].path"))
    for position, artifact in enumerate(run.get("artifacts", [])):
        if not isinstance(artifact, dict):
            raise BundleError(f"run.artifacts[{position}] must be an object")
        required.add(safe_relative_path(artifact.get("path"), f"run.artifacts[{position}].path"))
    return required


def validate_bundle(spec_path: Path, repo_root: Path) -> tuple[dict[str, Any], list[tuple[Path, PurePosixPath]]]:
    spec = load_json(spec_path)
    if not isinstance(spec, dict):
        raise BundleError("bundle spec must be a JSON object")
    raw_run = spec.get("run")
    run_id = raw_run.get("id") if isinstance(raw_run, dict) else None
    if not isinstance(run_id, str):
        raise BundleError("spec.run.id is required")
    expected_root = f"gaussian_runs/{run_id}/assets"
    run = validate_run(raw_run, expected_root)

    raw_assets = spec.get("assets")
    if not isinstance(raw_assets, list) or not raw_assets:
        raise BundleError("spec.assets must be a non-empty list")
    assets: list[tuple[Path, PurePosixPath]] = []
    # metrics.json is generated from run.metrics during materialization.
    destinations: set[PurePosixPath] = {PurePosixPath("metrics.json")}
    for position, item in enumerate(raw_assets):
        if not isinstance(item, dict):
            raise BundleError(f"spec.assets[{position}] must be an object")
        source = resolve_source(spec_path, item.get("source"), f"spec.assets[{position}].source")
        destination = safe_relative_path(item.get("destination"), f"spec.assets[{position}].destination")
        if destination in destinations:
            raise BundleError(f"duplicate destination: {destination}")
        destinations.add(destination)
        assets.append((source, destination))

    missing = sorted(str(path) for path in required_destinations(run) - destinations)
    if missing:
        raise BundleError("bundle omits manifest-referenced assets:\n  " + "\n  ".join(missing))

    expected_dimensions = tuple(run["resolution"])
    outputs = set(run["outputs"].values())
    for source, destination in assets:
        if destination.name in outputs:
            if source.suffix.lower() != ".png":
                raise BundleError(f"gallery output must be PNG: {source}")
            dimensions = png_dimensions(source)
            if dimensions != expected_dimensions:
                raise BundleError(
                    f"resolution mismatch for {source}: got {dimensions}, expected {expected_dimensions}"
                )

    interactive = run["interactive3d"]
    default_id = interactive["defaultAsset"]
    default_spec = next(asset for asset in interactive["assets"] if asset["id"] == default_id)
    default_path = safe_relative_path(default_spec["path"], "interactive3d.defaultAsset.path")
    splat_source = next(source for source, destination in assets if destination == default_path)
    splat_size = splat_source.stat().st_size
    if splat_size % 32:
        raise BundleError(f"legacy .splat size must be a multiple of 32 bytes: {splat_source}")
    actual_count = splat_size // 32
    declared_count = default_spec.get("gaussianCount", interactive.get("gaussianCount"))
    if declared_count is not None and int(declared_count) != actual_count:
        raise BundleError(
            f"legacy .splat count mismatch: declared {declared_count}, file contains {actual_count}"
        )
    default_spec["gaussianCount"] = actual_count
    interactive["gaussianCount"] = actual_count

    manifest_path = repo_root / "gaussian_runs" / "manifest.json"
    manifest = load_json(manifest_path)
    if any(item.get("id") == run_id for item in manifest.get("runs", [])):
        raise BundleError(f"manifest already contains run id {run_id!r}")
    if (repo_root / "gaussian_runs" / run_id).exists():
        raise BundleError(f"destination run directory already exists: gaussian_runs/{run_id}")
    return run, assets


def materialize(repo_root: Path, run: dict[str, Any], assets: list[tuple[Path, PurePosixPath]]) -> Path:
    run_id = run["id"]
    runs_root = repo_root / "gaussian_runs"
    destination = runs_root / run_id
    staging = Path(tempfile.mkdtemp(prefix=f".{run_id}.staging-", dir=runs_root))
    try:
        asset_root = staging / "assets"
        for source, relative in assets:
            target = asset_root.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        (asset_root / "metrics.json").write_bytes(json_bytes({"runId": run_id, "metrics": run["metrics"]}))
        (staging / "manifest-entry.json").write_bytes(json_bytes(run))
        os.rename(staging, destination)
    except Exception:
        print(f"partial staging directory retained for inspection: {staging}", file=sys.stderr)
        raise
    return destination


def apply_manifest(repo_root: Path, run: dict[str, Any], make_default: bool, expected_hash: str) -> None:
    manifest_path = repo_root / "gaussian_runs" / "manifest.json"
    if file_sha256(manifest_path) != expected_hash:
        raise BundleError("manifest changed after validation; refusing to overwrite it")
    manifest = load_json(manifest_path)
    if any(item.get("id") == run["id"] for item in manifest.get("runs", [])):
        raise BundleError(f"manifest already contains run id {run['id']!r}")
    manifest["runs"].append(run)
    if make_default:
        manifest["defaultRun"] = run["id"]
    descriptor, temporary_name = tempfile.mkstemp(prefix=".manifest-", suffix=".json", dir=manifest_path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(json_bytes(manifest))
        os.replace(temporary, manifest_path)
    except Exception:
        print(f"temporary manifest retained for inspection: {temporary}", file=sys.stderr)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, required=True, help="bundle JSON; relative sources resolve beside it")
    parser.add_argument("--materialize", action="store_true", help="copy a new run directory after validation")
    parser.add_argument("--apply-manifest", action="store_true", help="append the run to gaussian_runs/manifest.json")
    parser.add_argument("--make-default", action="store_true", help="also point defaultRun at the new run")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.apply_manifest and not args.materialize:
        raise BundleError("--apply-manifest requires --materialize")
    if args.make_default and not args.apply_manifest:
        raise BundleError("--make-default requires --apply-manifest")

    repo_root = Path(__file__).resolve().parents[1]
    manifest_path = repo_root / "gaussian_runs" / "manifest.json"
    manifest_hash = file_sha256(manifest_path)
    run, assets = validate_bundle(args.spec.resolve(), repo_root)
    byte_count = sum(source.stat().st_size for source, _ in assets)
    print(f"validated {run['id']}: {len(assets)} source files, {byte_count:,} bytes")
    print(f"target root: {run['root']}")
    if not args.materialize:
        print("read-only validation complete; no files or manifests were changed")
        return 0

    destination = materialize(repo_root, run, assets)
    print(f"materialized: {destination}")
    if args.apply_manifest:
        apply_manifest(repo_root, run, args.make_default, manifest_hash)
        suffix = " and selected as default" if args.make_default else ""
        print(f"appended manifest entry{suffix}")
    else:
        print(f"manifest unchanged; entry saved at {destination / 'manifest-entry.json'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BundleError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
