"""Open an SVGLab clip in Blender with the fighter's own artwork attached to the rig.

Run it on an export directory written by `npm run export:motions`:

    blender --python out/blender/setup.py -- bnrSwordCutNormal

A BVH carries bones and animation and no character, so this script also imports each bone's
artwork and parents it to that bone. That is what makes a clip reviewable: a fighter that
moves, rather than eleven sticks in an empty plane.

The armature is built here rather than handed to Blender's BVH importer, which rebuilds a
skeleton with conventions of its own — on this rig it welds the head to the chest's averaged
tail and moves that joint six units, so the head would turn about a pivot the lab never uses.
The file's offsets are the rig, so they are read and applied directly.

Placement is measured rather than assumed for the same reason: each art file opens with a
calibration corner at the bone's own origin, so whatever an importer does to scale, flip or
offset a document, the frame it produced can be read back and inverted.

Edit the pose, export BVH at 60 FPS, and `npm run import:motions` reads it back.
"""

import os
import sys

import bpy
from mathutils import Matrix, Vector

CALIBRATION = "svglab-calibration"
CALIBRATION_SPAN = 4.0
# SVG has no z-index: document order is paint order. The rig is flat, so coplanar art would
# leave a renderer to break the tie; a hair of depth per step restores the authored order.
DEPTH_STEP = 0.05
LINE_WIDTH = 0.45

# SVG points y down and the rig is drawn side-on, so the fighter stands in Blender's XZ plane:
# the SVG x axis maps to +X, the SVG y axis to -Z, and the unused depth axis to +Y.
TO_PLANE = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)))
DEPTH = Vector((0.0, 1.0, 0.0))


def to_blender(point):
    """BVH stands a skeleton up along +Y; Blender stands it up along +Z."""
    return Vector((point.x, -point.z, point.y))


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    clip = next((value for value in argv if not value.startswith("--")), None)
    save = argv[argv.index("--save") + 1] if "--save" in argv else None
    return clip, save, "--quiet" in argv


def script_directory():
    space = getattr(bpy.context, "space_data", None)
    text = getattr(space, "text", None) if space else None
    for path in ((text.filepath if text else None), __file__):
        if path:
            return os.path.dirname(os.path.abspath(bpy.path.abspath(path)))
    raise RuntimeError("cannot tell where this script lives; run it from the export directory")


def clip_path(directory, clip):
    if clip:
        path = os.path.join(directory, f"{clip}.bvh")
        if not os.path.exists(path):
            raise RuntimeError(f"{path} does not exist; run npm run export:motions")
        return path
    clips = sorted(name for name in os.listdir(directory) if name.endswith(".bvh"))
    if not clips:
        raise RuntimeError(f"no .bvh files in {directory}; run npm run export:motions")
    return os.path.join(directory, clips[0])


def read_bvh(path):
    """The joint tree, its channel layout, and one row of numbers per frame."""
    with open(path, encoding="utf8") as handle:
        text = handle.read()
    hierarchy, _, motion = text.partition("MOTION")
    tokens = hierarchy.split()

    joints, stack, cursor, channels = [], [], 0, 0
    by_name = {}
    while cursor < len(tokens):
        token = tokens[cursor]
        if token in ("ROOT", "JOINT"):
            joint = {
                "name": tokens[cursor + 1],
                "parent": stack[-1] if stack else None,
                "offset": Vector((0.0, 0.0, 0.0)),
                "channels": {},
                "children": [],
                "end": None,
            }
            joints.append(joint)
            by_name[joint["name"]] = joint
            if joint["parent"] is not None:
                by_name[joint["parent"]]["children"].append(joint["name"])
            stack.append(joint["name"])
            cursor += 2
        elif token == "End":
            # An End Site is a tail marker with its own braces and no channels.
            offset = tokens.index("OFFSET", cursor)
            by_name[stack[-1]]["end"] = Vector(tuple(float(value) for value in tokens[offset + 1:offset + 4]))
            cursor = tokens.index("}", offset) + 1
        elif token == "OFFSET":
            by_name[stack[-1]]["offset"] = Vector(tuple(float(value) for value in tokens[cursor + 1:cursor + 4]))
            cursor += 4
        elif token == "CHANNELS":
            count = int(tokens[cursor + 1])
            names = tokens[cursor + 2:cursor + 2 + count]
            by_name[stack[-1]]["channels"] = {name: channels + index for index, name in enumerate(names)}
            channels += count
            cursor += 2 + count
        elif token == "}":
            stack.pop()
            cursor += 1
        else:
            cursor += 1

    words = motion.split()
    frame_time = float(words[words.index("Time:") + 1])
    numbers = [float(value) for value in words[words.index("Time:") + 2:]]
    frames = [numbers[start:start + channels] for start in range(0, len(numbers), channels)]
    return joints, frame_time, [frame for frame in frames if len(frame) == channels]


def build_armature(name, joints):
    """One bone per joint, at the joint the file names — no reinterpretation."""
    armature_data = bpy.data.armatures.new(name)
    armature = bpy.data.objects.new(name, armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")

    by_name = {joint["name"]: joint for joint in joints}
    heads, tips = {}, {}
    for joint in joints:
        parent = joint["parent"]
        head = (heads[parent] if parent else Vector((0.0, 0.0, 0.0))) + to_blender(joint["offset"])
        heads[joint["name"]] = head
        if joint["end"] is not None:
            tips[joint["name"]] = head + to_blender(joint["end"])

    for joint in joints:
        bone = armature_data.edit_bones.new(joint["name"])
        bone.head = heads[joint["name"]]
        # A bone's tail is only how Blender draws it: rotation happens at the head, and this
        # script sets every rotation about a measured axis. The last child keeps the spine
        # reading upward, and a joint with no children uses the End Site the file carries.
        if joint["children"]:
            bone.tail = heads[joint["children"][-1]]
        elif joint["name"] in tips:
            bone.tail = tips[joint["name"]]
        else:
            bone.tail = heads[joint["name"]] + Vector((0.0, 0.0, 2.0))
        if (bone.tail - bone.head).length < 0.001:
            bone.tail = bone.head + Vector((0.0, 0.0, 2.0))
        bone.roll = 0.0

    for joint in joints:
        if joint["parent"]:
            armature_data.edit_bones[joint["name"]].parent = armature_data.edit_bones[joint["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature, by_name, heads


def pose_clip(armature, joints, frames, quiet):
    """Every rotation in this rig turns about the depth axis, expressed in each bone's own frame."""
    armature.animation_data_create()
    action = bpy.data.actions.new(f"{armature.name}-action")
    armature.animation_data.action = action
    slot = action.slots.new(id_type="OBJECT", name=armature.name)
    armature.animation_data.action_slot = slot

    axes = {}
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        axes[bone.name] = (bone.bone.matrix_local.to_3x3().inverted() @ DEPTH).normalized()

    for index, values in enumerate(frames):
        frame = index + 1
        for joint in joints:
            bone = armature.pose.bones[joint["name"]]
            channels = joint["channels"]
            # The writer negates the SVG rotation on the way out; negating it again here puts
            # the pose back the way the lab draws it.
            angle = -values[channels["Zrotation"]] if "Zrotation" in channels else 0.0
            bone.rotation_quaternion = Matrix.Rotation(angle * 3.141592653589793 / 180.0, 4, axes[joint["name"]]).to_quaternion()
            bone.keyframe_insert("rotation_quaternion", frame=frame)

            if joint["parent"] is None and "Yposition" in channels:
                target = to_blender(Vector((
                    values[channels["Xposition"]] if "Xposition" in channels else 0.0,
                    values[channels["Yposition"]],
                    values[channels["Zposition"]] if "Zposition" in channels else 0.0,
                )))
                bone.location = bone.bone.matrix_local.inverted() @ target
                bone.keyframe_insert("location", frame=frame)

    for curve in action.layers[0].strips[0].channelbag(slot).fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    if not quiet:
        print(f"SVGLab: posed {len(frames)} frames")
    return action


def calibration_frame(objects):
    """Read back where the importer actually put SVG (0,0) and which way its axes now point."""
    marker = next((obj for obj in objects if obj.name.startswith(CALIBRATION)), None)
    if marker is None or len(marker.data.splines) < 2:
        raise RuntimeError("artwork is missing its calibration corner; re-run npm run export:motions")
    point = lambda spline, index: marker.matrix_world @ Vector(spline.bezier_points[index].co[:3])
    origin = point(marker.data.splines[0], 0)
    return (origin,
            (point(marker.data.splines[0], 1) - origin) / CALIBRATION_SPAN,
            (point(marker.data.splines[1], 1) - origin) / CALIBRATION_SPAN)


def paint_order(name):
    """The document order the exporter wrote into each art id."""
    tail = name.rsplit("-", 1)[-1]
    digits = "".join(character for character in tail if character.isdigit())
    return int(digits) if digits else 0


def attach_art(armature, bone, path):
    """Import one bone's artwork, place it on that bone's rest pose, and parent it there."""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    origin, x_axis, y_axis = calibration_frame(imported)

    measured = Matrix((x_axis, y_axis, x_axis.cross(y_axis).normalized() * x_axis.length)).transposed()
    frame = (TO_PLANE @ measured.inverted()).to_4x4()

    attached = []
    for obj in imported:
        if obj.name.startswith(CALIBRATION):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        painted = paint_order(obj.name)
        placement = (Matrix.Translation(bone.head_local - DEPTH * (painted * DEPTH_STEP))
                     @ frame
                     @ Matrix.Translation(-origin))
        if obj.name.startswith("svglab-line"):
            # A line has no fill to give a flat curve any body, so it is drawn as a thin rod.
            # Bevel depth is in the object's own units, which the importer left at its own
            # scale, so the width is converted through the frame that was just measured.
            obj.data.dimensions = "3D"
            obj.data.fill_mode = "FULL"
            obj.data.bevel_depth = LINE_WIDTH * x_axis.length
        obj.parent = armature
        obj.parent_type = "BONE"
        obj.parent_bone = bone.name
        obj.matrix_parent_inverse = Matrix()
        obj.matrix_basis = Matrix()
        bpy.context.view_layer.update()
        # Bone parenting composes as parent @ parent_inverse @ basis, and the parent term
        # carries conventions of its own — the bone's tail becomes the origin, in an order
        # this script would only be guessing at. With both of its own terms identity, the
        # object's world matrix *is* that parent term, so it can be read at rest and inverted.
        # The art then carries the bone's delta from rest, which is what a nested SVG
        # transform does.
        obj.matrix_parent_inverse = obj.matrix_world.inverted()
        obj.matrix_basis = placement
        obj.name = f"{bone.name}-art"
        attached.append(obj)
    bpy.context.view_layer.update()
    return attached


def front_view():
    """Point every 3D view at the plane the rig lives in; the depth axis carries nothing."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            for space in area.spaces:
                if space.type != "VIEW_3D":
                    continue
                space.region_3d.view_perspective = "ORTHO"
                space.region_3d.view_rotation = Matrix.Rotation(1.5707963, 3, "X").to_quaternion()
                space.region_3d.view_distance = 260.0
                space.region_3d.view_location = Vector((0.0, 0.0, 40.0))
                space.clip_end = 10000.0


def main():
    clip, save, quiet = arguments()
    directory = script_directory()
    path = clip_path(directory, clip)
    name = os.path.splitext(os.path.basename(path))[0]

    joints, frame_time, frames = read_bvh(path)
    if abs(frame_time - 1.0 / 60.0) > 0.0001:
        print(f"SVGLab: warning — {path} runs at {1.0 / frame_time:.3f} FPS, not 60")

    armature, _, _ = build_armature(name, joints)
    armature.data.display_type = "STICK"
    armature.show_in_front = True

    art_directory = os.path.join(directory, "art")
    attached = 0
    for bone in armature.data.bones:
        art = os.path.join(art_directory, f"{bone.name}.svg")
        if os.path.exists(art):
            attached += len(attach_art(armature, bone, art))

    pose_clip(armature, joints, frames, quiet)
    scene = bpy.context.scene
    scene.render.fps = round(1.0 / frame_time)
    scene.frame_start, scene.frame_end = 1, len(frames)
    scene.frame_set(1)
    front_view()

    if save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(save))
    if not quiet:
        print(f"SVGLab: {name} at {scene.render.fps} FPS, {len(armature.data.bones)} bones, "
              f"{attached} art objects, {len(frames)} frames" + (f", saved {save}" if save else ""))


main()
