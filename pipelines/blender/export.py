"""The one Blender-specific operation needed to prove its own BVH export round trip."""

import os

import bpy


def export_bvh(armature, path, frame_start, frame_end):
    bpy.ops.object.mode_set(mode="OBJECT") if armature.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_anim.bvh(
        filepath=os.path.abspath(path),
        frame_start=frame_start,
        frame_end=frame_end,
        rotate_mode="NATIVE",
        root_transform_only=False,
    )
