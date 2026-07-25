#!/usr/bin/env python3
"""Build the canonical deduplicated point-cloud collection manifest.

The older campus and road GitHub Pages repositories remain immutable asset
hosts.  Their PCD1 files, previews and input thumbnails are referenced by
absolute URL, so the unified site does not duplicate roughly two gigabytes of
binary files.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any
from urllib.request import urlopen


CAMPUS_MANIFEST_URL = (
    "https://raw.githubusercontent.com/Zhihao-Lai/"
    "reconstruction-gallery-demo/main/pointclouds/manifest.json"
)
ROAD_MANIFEST_URL = (
    "https://raw.githubusercontent.com/Zhihao-Lai/"
    "reconstruction-road-demo/main/pointclouds/manifest.json"
)
CAMPUS_ASSET_BASE = "https://zhihao-lai.github.io/reconstruction-gallery-demo/"
ROAD_ASSET_BASE = "https://zhihao-lai.github.io/reconstruction-road-demo/"

LOCAL_KEEP = {
    "dji_terra_full70_rtk_anchored_20260717": "DJI Terra 航测道路",
    "tum_downtown_road170_rtk_anchored_20260717": "TUM Downtown 道路航拍",
    "tuniu_tw_2_townbridge64_rtk_anchored_20260717": "土牛溪小镇河谷",
}

DEDUPLICATED_LOCAL_STEMS = [
    "rtk5090_mini24_image_only_20260717",
    "helenenschacht_rtk_image_only_20260717",
    "helenenschacht_rtk_image_rtk_20260717",
    "tuniu_tw_2_townbridge64_image_only_20260717",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--site-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    return parser.parse_args()


def load_json_url(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=60) as response:
        return json.load(response)


def absolute_url(value: str, base_url: str) -> str:
    if value.startswith(("https://", "http://", "data:")):
        return value
    return f"{base_url}{value.lstrip('/')}"


def representative_inputs(values: list[str], limit: int = 8) -> list[str]:
    if len(values) <= limit:
        return values
    indices = [round(index * (len(values) - 1) / (limit - 1)) for index in range(limit)]
    return [values[index] for index in indices]


def external_item(item: dict[str, Any], base_url: str, source_name: str) -> dict[str, Any]:
    result = copy.deepcopy(item)
    result.pop("asset", None)
    original_inputs = list(result.get("inputs", []))
    result["framesTotal"] = result.get("framesTotal") or len(original_inputs)
    result["cloud"] = absolute_url(result["cloud"], base_url)
    result["preview"] = absolute_url(result["preview"], base_url)
    result["inputs"] = [
        absolute_url(path, base_url)
        for path in representative_inputs(original_inputs)
    ]
    result["chunks"] = [
        absolute_url(path, base_url)
        for path in result.get("chunks", [])
    ]
    for lod in result.get("lods", {}).values():
        if lod.get("cloud"):
            lod["cloud"] = absolute_url(lod["cloud"], base_url)
        if lod.get("chunks"):
            lod["chunks"] = [absolute_url(path, base_url) for path in lod["chunks"]]
    result["originCollection"] = source_name
    result["assetKind"] = "pointcloud"
    return result


def local_item(item: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(item)
    result["title"] = LOCAL_KEEP[result["stem"]]
    result["assetKind"] = "pointcloud"
    result["originCollection"] = "rtk-mini24-demo"
    result.pop("comparisonGroup", None)
    result.pop("stageLabel", None)
    return result


def main() -> int:
    args = parse_args()
    site_root = args.site_root.resolve()
    manifest_path = site_root / "pointclouds" / "manifest.json"
    local_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    campus_manifest = load_json_url(CAMPUS_MANIFEST_URL)
    road_manifest = load_json_url(ROAD_MANIFEST_URL)

    campus_items = [
        external_item(item, CAMPUS_ASSET_BASE, "reconstruction-gallery-demo")
        for item in campus_manifest["items"]
    ]
    road_items = [
        external_item(item, ROAD_ASSET_BASE, "reconstruction-road-demo")
        for item in road_manifest["items"]
    ]
    local_by_stem = {item["stem"]: item for item in local_manifest["items"]}
    missing = sorted(set(LOCAL_KEEP) - set(local_by_stem))
    if missing:
        raise RuntimeError(f"Missing local assets required by collection: {missing}")
    selected_local = [local_item(local_by_stem[stem]) for stem in LOCAL_KEEP]

    items = campus_items + road_items + selected_local
    stems = [item["stem"] for item in items]
    if len(items) != 20 or len(stems) != len(set(stems)):
        raise RuntimeError("Expected exactly 20 unique point-cloud assets")

    output = {
        "schemaVersion": 2,
        "collection": "unified-reconstruction-assets",
        "defaultScene": "tum_downtown_road170_rtk_anchored_20260717",
        "items": items,
        "deduplication": {
            "rule": "one preferred visual asset per real scene",
            "removedLocalStems": DEDUPLICATED_LOCAL_STEMS,
            "helenenschachtPreferredStem": "fullres_helenenschacht_48_10m",
            "notes": [
                "Pure-image and RTK-aligned variants are not shown as separate cards.",
                "Helenenschacht keeps the higher-density legacy reconstruction.",
                "DJI Terra keeps the 70-frame reconstruction instead of Mini24.",
            ],
        },
        "externalAssetHosts": [
            CAMPUS_ASSET_BASE,
            ROAD_ASSET_BASE,
        ],
    }
    manifest_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(manifest_path),
                "pointcloud_assets": len(items),
                "campus": len(campus_items),
                "road": len(road_items),
                "new": len(selected_local),
                "deduplicated": len(DEDUPLICATED_LOCAL_STEMS),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
