"""Dump every posed joint for every exported clip in one artwork-free Blender process."""

import json
import os
import sys

import bpy
from mathutils import Matrix, Vector

SCRIPT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIRECTORY not in sys.path:
    sys.path.insert(0, SCRIPT_DIRECTORY)

from export import export_bvh
from setup import DEPTH, build_armature, pose_clip, read_bvh, to_blender


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

    def value(name, required=True):
        if name not in argv:
            if required:
                raise RuntimeError(f"{name} is required")
            return None
        index = argv.index(name) + 1
        if index >= len(argv):
            raise RuntimeError(f"{name} needs a value")
        return argv[index]

    return value("--directory"), value("--output"), value("--round-trip", False), value("--round-trip-output", False)


def pose_frames(armature, joints, frames):
    """Evaluate dense samples directly; the gate needs poses, not 78,000 temporary key points."""
    axes = {}
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        axes[bone.name] = (bone.bone.matrix_local.to_3x3().inverted() @ DEPTH).normalized()

    sampled = []
    for values in frames:
        for joint in joints:
            bone = armature.pose.bones[joint["name"]]
            channels = joint["channels"]
            angle = -values[channels["Zrotation"]] if "Zrotation" in channels else 0.0
            bone.rotation_quaternion = Matrix.Rotation(
                angle * 3.141592653589793 / 180.0, 4, axes[joint["name"]]
            ).to_quaternion()
            if joint["parent"] is None and "Yposition" in channels:
                target = to_blender(Vector((
                    values[channels["Xposition"]] if "Xposition" in channels else 0.0,
                    values[channels["Yposition"]],
                    values[channels["Zposition"]] if "Zposition" in channels else 0.0,
                )))
                bone.location = bone.bone.matrix_local.inverted() @ target
        bpy.context.view_layer.update()
        points = {}
        for joint in joints:
            head = armature.matrix_world @ armature.pose.bones[joint["name"]].head
            points[joint["name"]] = [head.x, -head.z]
        sampled.append(points)
    return sampled


def main():
    directory, output, round_trip, round_trip_output = arguments()
    if (round_trip is None) != (round_trip_output is None):
        raise RuntimeError("--round-trip and --round-trip-output must be used together")

    result = {}
    files = sorted(name for name in os.listdir(directory) if name.endswith(".bvh"))
    if not files:
        raise RuntimeError(f"no BVH files in {directory}")

    armature = None
    reference_names = None
    round_trip_data = None
    for filename in files:
        key = os.path.splitext(filename)[0]
        joints, frame_time, frames = read_bvh(os.path.join(directory, filename))
        names = [joint["name"] for joint in joints]
        if armature is None:
            armature, _, _ = build_armature("svglab-gate", joints)
            reference_names = names
        elif names != reference_names:
            raise RuntimeError(f"{filename} does not carry the gate's rig")
        result[key] = pose_frames(armature, joints, frames)
        if round_trip == key:
            round_trip_data = (joints, frame_time, frames)

    if round_trip is not None and round_trip not in result:
        raise RuntimeError(f"round-trip clip '{round_trip}' was not in {directory}")
    if round_trip_data is not None:
        joints, frame_time, frames = round_trip_data
        pose_clip(armature, joints, frames, True)
        scene = bpy.context.scene
        scene.render.fps = round(1.0 / frame_time)
        scene.frame_start, scene.frame_end = 1, len(frames)
        export_bvh(armature, round_trip_output, 1, len(frames))
    with open(output, "w", encoding="utf8") as handle:
        json.dump(result, handle, separators=(",", ":"), sort_keys=True)


if __name__ == "__main__":
    main()
