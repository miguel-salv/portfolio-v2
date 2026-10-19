#!/usr/bin/env python3
"""Validate the authoring draft, including continuity between timeline segments.

Run from any directory: python3 reel/world/validate_world.py
Future render/export paths are intentionally not required to exist yet.
"""

import json
import math
from pathlib import Path
import sys


WORLD_DIR = Path(__file__).resolve().parent
ROOT = WORLD_DIR.parent.parent


def validate(world, root=ROOT):
    errors = []

    def check(condition, message):
        if not condition:
            errors.append(message)

    def index(entries, label):
        result = {entry["id"]: entry for entry in entries}
        check(len(result) == len(entries), f"Duplicate {label} ids")
        return result

    def contiguous(entries, field, start, end, label):
        previous = start
        for entry in entries:
            a, b = entry[field]
            check(a == previous, f"{label} {entry['id']} starts at {a}, expected {previous}")
            check(a < b, f"{label} {entry['id']} has an empty or reversed range")
            previous = b
        check(previous == end, f"{label} ends at {previous}, expected {end}")

    sources = index(world["sources"], "source")
    stations = index(world["stations"], "station")
    sets = index(world["room"]["sets"], "set")
    poses = index(world["camera"]["poses"], "camera pose")
    copies = index(world["copy"], "copy")
    anchors = index(world["anchors"], "anchor")
    interactions = index(world["interactions"], "interaction")
    timeline = world["timeline"]
    beats = index(timeline["beats"], "beat")
    segments = index(timeline["segments"], "segment")
    rests = index(timeline["rests"], "rest")
    check(world["schema_version"] == 1, "Unsupported schema version")
    check(set(stations) == set("ABCDE"), "Expected five lab stations A–E")
    check(set(p for station in stations.values() for p in station["projects"]) == {"impedance", "vehicle", "robot", "companion", "keychain"}, "All five projects must remain represented")

    for source in sources.values():
        if source["state"] == "existing":
            check((root / source["path"]).is_file(), f"Missing source: {source['path']}")

    for station in stations.values():
        check(station["set"] in sets, f"Unknown set for station {station['id']}")
        for source in station["source_ids"]:
            check(source in sources, f"Unknown source {source} at station {station['id']}")
        for rest in station["rest_ids"]:
            check(rest in rests and rests[rest]["station"] == station["id"], f"Invalid rest {rest} at station {station['id']}")

    for pose in poses.values():
        coordinates = pose["position_m"] + pose["target_m"] + pose["up_hint"]
        check(len(coordinates) == 9 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in coordinates), f"Invalid coordinates in {pose['id']}")
        check(all(0 <= v <= size for v, size in zip(pose["position_m"], world["room"]["size_m"])), f"Camera pose outside the room: {pose['id']}")
        check(pose["position_m"] != pose["target_m"], f"Zero camera direction in {pose['id']}")
        check(pose["lens_mm"] > 0, f"Invalid lens for {pose['id']}")

    contiguous(timeline["beats"], "scroll_range_percent", 0, 100, "Beat")
    contiguous(timeline["segments"], "scroll_range_percent", 0, 100, "Segment scroll")
    contiguous(timeline["segments"], "frame_range", *timeline["frame_range"], "Segment frames")
    check(math.isclose((timeline["frame_range"][1] - timeline["frame_range"][0]) / timeline["fps"], timeline["reference_duration_seconds"]), "Frame count disagrees with film duration")
    check(timeline["loader"]["scroll_range_percent"] is None, "Loader must stay outside the scroll budget")
    check(timeline["loader"]["pose"] == "hero", "Loader must use the hero pose")

    used_segments = []
    for beat in beats.values():
        check(beat["station"] in stations, f"Unknown station for beat {beat['id']}")
        check((root / beat["concept_frame"]).is_file(), f"Missing concept frame: {beat['concept_frame']}")
        if beat["copy_id"]:
            check(beat["copy_id"] in copies, f"Unknown copy for beat {beat['id']}")
        if beat["rest_id"]:
            check(beat["rest_id"] in rests, f"Unknown rest for beat {beat['id']}")
        check(bool(beat["carrier"]), f"Missing carrier for beat {beat['id']}")
        beat_segments = [segments[s] for s in beat["segment_ids"] if s in segments]
        check(len(beat_segments) == len(beat["segment_ids"]), f"Unknown segment in beat {beat['id']}")
        contiguous(beat_segments, "scroll_range_percent", *beat["scroll_range_percent"], f"Segments within {beat['id']}")
        used_segments.extend(beat["segment_ids"])
    check(used_segments == list(segments), "Beat segments must cover the ordered timeline exactly once")
    check((root / timeline["loader"]["concept_frame"]).is_file(), "Missing loader concept")

    previous_pose = None
    for segment in segments.values():
        path = segment["camera_path"]
        check(bool(path) and all(p in poses for p in path), f"Invalid camera path in {segment['id']}")
        if previous_pose:
            check(path[0] == previous_pose, f"Camera jumps at segment {segment['id']}")
        previous_pose = path[-1]
        if segment["kind"] == "rest":
            rest = rests.get(segment["rest_id"])
            check(rest is not None, f"Missing rest for {segment['id']}")
            if rest:
                check(path == [rest["pose"]], f"Camera moves during rest {rest['id']}")
                check(rest["scroll_range_percent"] == segment["scroll_range_percent"], f"Rest and segment ranges disagree for {rest['id']}")
                check(segment["frame_range"][0] <= rest["sample_frame"] < segment["frame_range"][1], f"Rest sample is outside {segment['id']}")
        else:
            check(segment["kind"] == "move" and len(path) >= 2 and bool(segment.get("carrier")), f"Move requires a path and carrier: {segment['id']}")

    for rest in rests.values():
        check(rest["pose"] in poses and rest["copy_id"] in copies and rest["station"] in stations, f"Invalid rest references in {rest['id']}")
        check((root / rest["fallback_source"]).is_file(), f"Missing fallback for {rest['id']}")
        check(all(i in interactions and interactions[i]["rest"] == rest["id"] for i in rest["interaction_ids"]), f"Invalid interaction list at {rest['id']}")
        if rest.get("content_steps"):
            contiguous(rest["content_steps"], "scroll_range_percent", *rest["scroll_range_percent"], f"Content steps at {rest['id']}")

    for anchor in anchors.values():
        check(anchor["station"] in stations and anchor["rest"] in rests, f"Invalid anchor references in {anchor['id']}")
        check(anchors[anchor["id"]]["station"] == rests[anchor["rest"]]["station"], f"Anchor station mismatch in {anchor['id']}")
    for interaction in interactions.values():
        check(interaction["rest"] in rests, f"Unknown rest for {interaction['id']}")
        anchor = interaction["anchor"]
        check(anchor is None or anchor in anchors and anchors[anchor]["rest"] == interaction["rest"], f"Invalid anchor for {interaction['id']}")
        for source_path in interaction["source_paths"]:
            check((root / source_path).is_file(), f"Missing interaction source: {source_path}")

    check(timeline["beats"][-2]["scroll_range_percent"][0] == 92 and timeline["beats"][-1]["scroll_range_percent"][1] == 100, "Final reveal must retain its 8% budget")
    check(world["fallbacks"]["rest_order"] == list(rests), "Fallbacks must retain the ordered camera rests")
    dom_ids = {dom_id for station in stations.values() for dom_id in station["dom_ids"]}
    for content in copies.values():
        for action in content.get("actions", []):
            if action.get("href", "").startswith("#"):
                check(action["href"][1:] in dom_ids, f"Unresolved chapter link in {content['id']}")
            if "interaction" in action:
                check(action["interaction"] in interactions, f"Unresolved action in {content['id']}")
    animatic_status = world["gates"]["animatic"]["status"]
    check(animatic_status in {"not-started", "rendered-for-review", "revision-required", "approved"}, "Unknown animatic review state")
    if animatic_status in {"rendered-for-review", "approved"}:
        for asset in ("lab-greybox.blend", "lab-greybox.mp4", "lab-greybox-reverse.mp4", "camera.json", "audit.json"):
            check((root / "reel/world/animatic" / asset).is_file(), f"Missing animatic evidence: {asset}")
    if animatic_status == "approved":
        check(bool(world["gates"]["animatic"].get("owner_approval")), "An approved animatic needs an explicit owner approval record")
    return errors


def main():
    path = WORLD_DIR / "world.json"
    try:
        world = json.loads(path.read_text())
        errors = validate(world)
    except (KeyError, TypeError, ValueError, OSError) as error:
        print(f"Invalid world specification: {error}", file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    rests = world["timeline"]["rests"]
    rest_budget = sum(r["scroll_range_percent"][1] - r["scroll_range_percent"][0] for r in rests)
    print(f"Draft valid: {len(world['timeline']['beats'])} timed beats + loader, {len(world['timeline']['segments'])} contiguous segments, {len(rests)} camera rests.")
    print(f"Reading rests: {rest_budget:g}%; travel: {100 - rest_budget:g}%. Reference film: {world['timeline']['reference_duration_seconds']}s at {world['timeline']['fps']} fps.")
    if world["gates"]["animatic"]["status"] == "not-started":
        print("All existing sources and concept frames resolve. Camera splines, screen projections and collision clearance await the Blender animatic.")
    else:
        print("Animatic evidence resolves; owner review and final device/rig verification remain separate production gates.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
