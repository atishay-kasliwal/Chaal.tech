"""
Blender pilot: render a bot's 3x3 "directions" atlas from a 3D bust (docs/mascots/BLENDER_PIPELINE.md).

    blender -b -P scripts/blender/directions_atlas.py -- --character ms-dhoni --out design/blender/out
    blender -b -P scripts/blender/directions_atlas.py -- --model path/to/dhoni.glb --out ...

Without --model it builds a simple procedural chibi bust from the character's palette, so the
pipeline can be tried end to end; a real sculpted or generated model (glTF/GLB, facing -Y, neck at
the origin) replaces it with the same lighting, outline, camera and atlas layout.

Atlas contract (the approved mascot system, design/mascots/bots/*/README.md): one square
transparent image, nine equal cells, viewer coordinates: row 1 up-left, up, up-right; row 2 left,
centre, right; row 3 down-left, down, down-right. Head width 45.3% of a cell, shoulder baseline
73.9% down the cell, the same scale and baseline in every cell.
"""

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--character", default="ms-dhoni")
parser.add_argument("--model", default=None)
parser.add_argument("--out", default="design/blender/out")
parser.add_argument("--cell", type=int, default=512)
parser.add_argument("--reference", default=None, help="existing atlas to place beside the render")
args = parser.parse_args(argv)

# Character palettes (hex), drawn from the approved 2D art.
PALETTES = {
    "ms-dhoni": dict(
        skin="#c98a5e", skin_shadow="#9a5f3d", hair="#1d1916", grey="#8a847d", stubble="#6e5a4b",
        jersey="#f6d21c", jersey_shadow="#d9a90f", piping="#1f4fa8", eye="#3b2414",
    ),
}
P = PALETTES[args.character]
HEAD_WIDTH, SHOULDER_LINE = 0.453, 0.739
YAW, PITCH = math.radians(32), math.radians(20)


def rgb(hex_):
    h = hex_.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def toon(name, base, shadow=None):
    """Two-tone cel material: lit colour and shadow colour, hard step (EEVEE Shader to RGB)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    emit = nt.nodes.new("ShaderNodeEmission")
    ramp.color_ramp.interpolation = "CONSTANT"
    lo = lin(rgb(shadow or base))
    hi = lin(rgb(base))
    ramp.color_ramp.elements[0].color = (*lo, 1)
    ramp.color_ramp.elements[1].position = 0.32
    ramp.color_ramp.elements[1].color = (*hi, 1)
    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    nt.links.new(emit.outputs[0], out.inputs[0])
    return mat


def flat(name, colour):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*lin(rgb(colour)), 1)
    nt.links.new(emit.outputs[0], out.inputs[0])
    return mat


OUTLINE = None


def outline_material():
    global OUTLINE
    if OUTLINE is None:
        OUTLINE = flat("outline", "#120d0b")
        OUTLINE.use_backface_culling = True
    return OUTLINE


def finish(obj, mat, outline=0.018, smooth=True, subsurf=2):
    obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if subsurf:
        m = obj.modifiers.new("subsurf", "SUBSURF")
        m.levels = m.render_levels = subsurf
    if outline:
        # Inverted hull: a slightly larger shell, normals flipped, drawn black from behind.
        obj.data.materials.append(outline_material())
        s = obj.modifiers.new("outline", "SOLIDIFY")
        s.thickness = -outline
        s.use_flip_normals = True
        s.material_offset = 1
        s.offset = 1
    return obj


def sphere(name, loc, scale, mat, parent=None, outline=0.018, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    finish(o, mat, outline)
    if parent:
        o.parent = parent
    return o


def keep_above(obj, z, below=False):
    """Cut a mesh with a plane (bisect), keeping the part above (or below) height z (world)."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=not below, clear_outer=below, use_fill=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def build_procedural():
    """A chibi bust: big head on a short neck over compact shoulders, facing -Y, neck at origin."""
    pivot = bpy.data.objects.new("HeadPivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (0, 0, 0.0)
    skin = toon("skin", P["skin"], P["skin_shadow"])
    head = sphere("head", (0, 0, 1.05), (0.92, 0.86, 1.02), skin, pivot)
    # Lower face: stubble shell over the jaw and chin.
    stub = sphere("stubble", (0, 0.0, 1.0), (0.925, 0.865, 1.02), toon("stubble", P["stubble"], P["skin_shadow"]), pivot, outline=0)
    keep_above(stub, 0.8, below=True)
    # Ears, nose.
    for x in (-0.93, 0.93):
        sphere("ear", (x, 0.04, 1.0), (0.13, 0.08, 0.2), skin, pivot)
    sphere("nose", (0, -0.86, 0.98), (0.12, 0.1, 0.15), skin, pivot, outline=0.012)
    # Eyes: whites, iris, pupil, highlight.
    white = flat("white", "#fbf7ef")
    iris = flat("iris", P["eye"])
    black = flat("pupil", "#0c0807")
    for x in (-0.33, 0.33):
        sphere("eye", (x, -0.74, 1.13), (0.2, 0.08, 0.17), white, pivot, outline=0.014)
        sphere("iris", (x * 0.98, -0.815, 1.12), (0.11, 0.03, 0.12), iris, pivot, outline=0)
        sphere("pupil", (x * 0.98, -0.84, 1.12), (0.055, 0.02, 0.06), black, pivot, outline=0)
        sphere("glint", (x * 0.98 + 0.04, -0.855, 1.17), (0.025, 0.01, 0.025), white, pivot, outline=0)
    # Brows: relaxed, slightly arched.
    brow = flat("brow", P["hair"])
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(location=(side * 0.34, -0.8, 1.36))
        b = bpy.context.object
        b.scale = (0.2, 0.04, 0.045)
        b.rotation_euler = (0, side * math.radians(-6), 0)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        b.modifiers.new("bevel", "BEVEL").width = 0.03
        finish(b, brow, outline=0, subsurf=1)
        b.parent = pivot
    # A small knowing closed-lip smile.
    bpy.ops.mesh.primitive_torus_add(location=(0, -0.83, 0.74), major_radius=0.16, minor_radius=0.022)
    smile = bpy.context.object
    smile.rotation_euler = (math.radians(90), 0, 0)
    smile.scale = (1, 0.45, 1)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    keep_above(smile, 0.74, below=True)
    finish(smile, flat("mouth", "#5a2a1e"), outline=0, subsurf=1)
    smile.parent = pivot
    # Hair: a textured cap with grey at the temples.
    hair = sphere("hair", (0, 0.1, 1.2), (1.0, 0.98, 1.06), toon("hair", P["hair"], "#0d0b0a"), pivot, outline=0.02, segments=64)
    keep_above(hair, 1.22)
    tex = bpy.data.textures.new("tuft", "CLOUDS")
    tex.noise_scale = 0.12
    d = hair.modifiers.new("tufts", "DISPLACE")
    d.texture = tex
    d.strength = 0.16
    hair.modifiers.move(len(hair.modifiers) - 1, 0)
    for x in (-0.9, 0.9):
        g = sphere("temple", (x, 0.05, 1.22), (0.12, 0.42, 0.25), toon("grey", P["grey"], "#5c5751"), pivot, outline=0)
    # Neck and shoulders (do not turn with the head).
    neck_mat = skin
    bpy.ops.mesh.primitive_cylinder_add(location=(0, 0.02, 0.08), radius=0.33, depth=0.45)
    finish(bpy.context.object, neck_mat, outline=0.016)
    jersey = toon("jersey", P["jersey"], P["jersey_shadow"])
    body = sphere("shoulders", (0, 0.12, -0.38), (1.45, 0.62, 0.55), jersey, None, outline=0.02)
    keep_above(body, -0.5)
    # Collar wings and blue piping round the neckline.
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.26, depth=0.05, location=(side * 0.2, -0.5, -0.02))
        c = bpy.context.object
        c.rotation_euler = (math.radians(90), 0, side * math.radians(28))
        finish(c, jersey, outline=0.012, subsurf=0)
    bpy.ops.mesh.primitive_torus_add(location=(0, -0.02, -0.06), major_radius=0.4, minor_radius=0.03)
    finish(bpy.context.object, flat("piping", P["piping"]), outline=0, subsurf=1)
    return pivot


def import_model(path):
    before = set(bpy.data.objects)
    if path.lower().endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise SystemExit("Only glTF/GLB models are supported in this pilot")
    new = [o for o in bpy.data.objects if o not in before]
    pivot = next((o for o in new if o.name.lower().startswith("headpivot")), None)
    if pivot is None:
        raise SystemExit("The model needs an object named HeadPivot that the head parts are parented to")
    return pivot


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = args.cell
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    # Sticker outlines: Freestyle silhouettes and creases, drawn in near-black.
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = max(1.5, args.cell / 220)
    fs = sc.view_layers[0].freestyle_settings
    lines = fs.linesets.new("outline") if not fs.linesets else fs.linesets[0]
    lines.select_by_visibility = True
    lines.select_silhouette = lines.select_border = lines.select_crease = True
    lines.linestyle = lines.linestyle or bpy.data.linestyles.new("ink")
    lines.linestyle.color = (0.04, 0.03, 0.025)
    world = bpy.data.worlds.new("world")
    sc.world = world
    sun = bpy.data.lights.new("key", "SUN")
    sun.energy = 3.0
    key = bpy.data.objects.new("key", sun)
    key.rotation_euler = (math.radians(55), math.radians(-20), math.radians(-25))
    sc.collection.objects.link(key)
    return sc


def frame_camera(sc, pivot):
    """Orthographic, from the front, scaled so the head is 45.3% of the cell and the shoulder
    line sits 73.9% down it (both measured on the neutral pose)."""
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    head = [o for o in bpy.data.objects if o.parent == pivot and o.type == "MESH"]
    xs = [(o.matrix_world @ Vector(c)).x for o in head for c in o.bound_box]
    head_w = max(xs) - min(xs)
    cam_data.ortho_scale = head_w / HEAD_WIDTH
    shoulder_z = 0.0  # neck base: the shoulder line of the procedural bust
    # A point at fraction f down the frame sits at cam_z + scale*(0.5 - f).
    cam.location = (0, -10, shoulder_z - cam_data.ortho_scale * (0.5 - SHOULDER_LINE))
    cam.rotation_euler = (math.radians(90), 0, 0)
    return cam


# Viewer coordinates: viewer's left is -X; up is +Z. A head facing -Y turns toward viewer-left with
# a negative rotation about Z, and looks up with a negative rotation about X.
CELLS = [(-1, 1), (0, 1), (1, 1), (-1, 0), (0, 0), (1, 0), (-1, -1), (0, -1), (1, -1)]


def main():
    sc = scene_setup()
    pivot = import_model(args.model) if args.model else build_procedural()
    frame_camera(sc, pivot)
    os.makedirs(args.out, exist_ok=True)
    frames = []
    for i, (h, v) in enumerate(CELLS):
        pivot.rotation_euler = (-v * PITCH, 0, h * YAW)
        path = os.path.join(args.out, f"cell-{i}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        frames.append(path)
    n = args.cell
    atlas = np.zeros((3 * n, 3 * n, 4), dtype=np.float32)
    for i, path in enumerate(frames):
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(n, n, 4)
        r, c = divmod(i, 3)
        # Blender images are stored bottom row first.
        atlas[(2 - r) * n : (3 - r) * n, c * n : (c + 1) * n] = px
        bpy.data.images.remove(img)
    out = bpy.data.images.new("atlas", 3 * n, 3 * n, alpha=True)
    out.pixels = atlas.ravel()
    for fmt, ext in (("PNG", "png"), ("WEBP", "webp")):
        out.filepath_raw = os.path.join(args.out, f"{args.character}-directions.{ext}")
        out.file_format = fmt
        out.save()
    if args.reference:
        ref = bpy.data.images.load(args.reference)
        ref.scale(3 * n, 3 * n)
        rp = np.array(ref.pixels[:], dtype=np.float32).reshape(3 * n, 3 * n, 4)
        side = np.zeros((3 * n, 6 * n + 40, 4), dtype=np.float32)
        side[..., :3] = lin(rgb("#211c2e"))
        side[..., 3] = 1
        for x0, img in ((0, rp), (3 * n + 40, atlas)):
            a = img[..., 3:4]
            side[:, x0 : x0 + 3 * n, :3] = img[..., :3] * a + side[:, x0 : x0 + 3 * n, :3] * (1 - a)
        cmp = bpy.data.images.new("compare", 6 * n + 40, 3 * n, alpha=True)
        cmp.pixels = side.ravel()
        cmp.filepath_raw = os.path.join(args.out, f"{args.character}-compare.png")
        cmp.file_format = "PNG"
        cmp.save()
    print("ATLAS", os.path.join(args.out, f"{args.character}-directions.webp"))


main()
