from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


SIZE = 1024
SCALE = 3
CANVAS = SIZE * SCALE
RADIUS = 230
OUT = Path("icon.png")


def sc(value):
    return int(round(value * SCALE))


def box(x0, y0, x1, y1):
    return (sc(x0), sc(y0), sc(x1), sc(y1))


def pts(points):
    return [(sc(x), sc(y)) for x, y in points]


def lerp(a, b, t):
    return int(round(a * (1 - t) + b * t))


def smoothstep(t):
    return t * t * (3 - 2 * t)


def vertical_gradient(size, top, bottom):
    width, height = size
    img = Image.new("RGBA", size)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = smoothstep(y / (height - 1))
        color = tuple(lerp(top[i], bottom[i], t) for i in range(3))
        draw.line((0, y, width, y), fill=(*color, 255))
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=radius,
        fill=255,
    )
    return mask


def polygon_mask(points):
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).polygon(pts(points), fill=255)
    return mask


def fill_mask(base, mask, top, bottom):
    fill = vertical_gradient((CANVAS, CANVAS), top, bottom)
    base.alpha_composite(Image.composite(fill, Image.new("RGBA", fill.size), mask))


def radial_layer(center, radius, color, alpha, blur=0, squash=(1.0, 1.0)):
    layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = sc(center[0]), sc(center[1])
    rx = sc(radius * squash[0])
    ry = sc(radius * squash[1])
    for i in range(54, 0, -1):
        t = i / 54
        a = int(alpha * (t**2.2))
        draw.ellipse(
            (cx - int(rx * t), cy - int(ry * t), cx + int(rx * t), cy + int(ry * t)),
            fill=(*color, a),
        )
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(sc(blur)))
    return layer


def cubic_points(p0, p1, p2, p3, steps=64):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def curved_cap_points():
    points = []
    points += cubic_points((344, 526), (402, 486), (622, 486), (680, 526), 34)
    points += cubic_points((680, 526), (668, 634), (632, 706), (512, 716), 36)[1:]
    points += cubic_points((512, 716), (392, 706), (356, 634), (344, 526), 36)[1:]
    return points


def draw_colored_shadow(base, mask, color=(0, 39, 112), alpha=120, blur=34, offset=(0, 38)):
    alpha_mask = mask.filter(ImageFilter.GaussianBlur(sc(blur)))
    alpha_mask = alpha_mask.point(lambda a: int(a * alpha / 255))
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (*color, 0))
    shadow.putalpha(alpha_mask)
    base.alpha_composite(shadow, (sc(offset[0]), sc(offset[1])))


def apply_inside_glow(base, mask, color, alpha, blur, expand=0):
    glow_alpha = mask.filter(ImageFilter.GaussianBlur(sc(blur))).point(lambda a: int(a * alpha / 255))
    if expand:
        glow_alpha = ImageChops.lighter(glow_alpha, mask.filter(ImageFilter.MaxFilter(sc(expand) | 1)))
    layer = Image.new("RGBA", (CANVAS, CANVAS), (*color, 0))
    layer.putalpha(ImageChops.multiply(glow_alpha, mask))
    base.alpha_composite(layer)


def draw_background():
    bg = vertical_gradient((CANVAS, CANVAS), (100, 190, 255), (20, 90, 210))

    diag = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    dd = ImageDraw.Draw(diag)
    for x in range(CANVAS):
        t = x / (CANVAS - 1)
        dd.line((x, 0, x, CANVAS), fill=(255, 255, 255, int(36 * (1 - t))))
    bg.alpha_composite(diag)

    bg.alpha_composite(radial_layer((210, 120), 440, (255, 255, 255), 130, 54, squash=(1.3, 0.8)))
    bg.alpha_composite(radial_layer((760, 140), 330, (185, 230, 255), 58, 66, squash=(1.1, 0.8)))
    bg.alpha_composite(radial_layer((520, 1030), 700, (0, 37, 140), 64, 90, squash=(1.15, 0.55)))
    bg.alpha_composite(radial_layer((900, 760), 460, (0, 62, 174), 42, 82, squash=(0.9, 1.0)))

    shine = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shine_draw = ImageDraw.Draw(shine)
    shine_draw.rounded_rectangle(box(62, 38, 962, 390), radius=sc(178), fill=(255, 255, 255, 54))
    shine = shine.filter(ImageFilter.GaussianBlur(sc(30)))
    bg.alpha_composite(shine)

    edge = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    edge_draw = ImageDraw.Draw(edge)
    edge_draw.rounded_rectangle(box(22, 22, 1002, 1002), radius=sc(RADIUS - 8), outline=(255, 255, 255, 56), width=sc(5))
    edge_draw.rounded_rectangle(box(52, 52, 972, 972), radius=sc(RADIUS - 32), outline=(0, 58, 168, 38), width=sc(4))
    bg.alpha_composite(edge)
    return bg


def draw_cap_body(base):
    cap_points = curved_cap_points()
    cap_mask = polygon_mask(cap_points)
    fill_mask(base, cap_mask, (255, 255, 255), (192, 226, 252))

    cap_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(cap_layer)
    draw.polygon(pts(cap_points), fill=(35, 126, 225, 30))
    draw.arc(box(358, 488, 666, 722), 8, 172, fill=(255, 255, 255, 92), width=sc(5))
    draw.arc(box(366, 546, 658, 744), 20, 160, fill=(71, 151, 236, 78), width=sc(7))
    draw.line(pts([(404, 652), (620, 652)]), fill=(255, 255, 255, 72), width=sc(4))
    base.alpha_composite(cap_layer)

    front_band = [(326, 638), (698, 638), (730, 706), (294, 706)]
    band_mask = polygon_mask(front_band)
    fill_mask(base, band_mask, (254, 255, 255), (211, 235, 254))
    band = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(band)
    bdraw.polygon(pts(front_band), fill=(33, 123, 224, 28))
    bdraw.line(pts([(326, 638), (698, 638)]), fill=(255, 255, 255, 135), width=sc(5))
    bdraw.line(pts([(294, 706), (730, 706)]), fill=(89, 157, 226, 86), width=sc(5))
    base.alpha_composite(band)


def draw_board(base):
    top = [(512, 232), (870, 406), (514, 560), (154, 414)]
    left_facet = [(154, 414), (514, 560), (514, 626), (190, 468)]
    right_facet = [(514, 560), (870, 406), (832, 460), (514, 626)]
    bottom_edge = [(190, 468), (514, 626), (832, 460), (514, 594)]

    fill_mask(base, polygon_mask(left_facet), (238, 248, 255), (168, 209, 246))
    fill_mask(base, polygon_mask(right_facet), (222, 241, 255), (145, 195, 240))

    facet = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(facet)
    fdraw.polygon(pts(bottom_edge), fill=(28, 104, 204, 48))
    fdraw.line(pts([(154, 414), (514, 560), (870, 406)]), fill=(255, 255, 255, 120), width=sc(4))
    fdraw.line(pts([(190, 468), (514, 626), (832, 460)]), fill=(66, 139, 218, 105), width=sc(4))
    base.alpha_composite(facet)

    top_mask = polygon_mask(top)
    fill_mask(base, top_mask, (255, 255, 255), (222, 243, 255))
    apply_inside_glow(base, top_mask, (255, 255, 255), 42, 18)

    top_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(top_layer)
    draw.polygon(pts([(512, 258), (806, 405), (514, 532), (222, 414)]), fill=(255, 255, 255, 48))
    draw.line(pts([(512, 232), (870, 406), (514, 560), (154, 414), (512, 232)]), fill=(255, 255, 255, 150), width=sc(5))
    draw.line(pts([(154, 414), (514, 560), (870, 406)]), fill=(151, 205, 245, 98), width=sc(4))
    draw.line(pts([(222, 414), (512, 300), (806, 405)]), fill=(255, 255, 255, 86), width=sc(4))
    draw.line(pts([(274, 456), (514, 540), (756, 452)]), fill=(183, 222, 250, 68), width=sc(3))
    base.alpha_composite(top_layer)


def draw_button_and_tassel(base):
    curve = cubic_points((516, 405), (630, 426), (702, 498), (660, 636), 76)

    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.line(pts([(x + 4, y + 7) for x, y in curve]), fill=(0, 52, 134, 122), width=sc(18))
    sdraw.ellipse(box(624, 622, 694, 704), fill=(0, 52, 134, 132))
    sdraw.line(pts([(660, 690), (632, 770)]), fill=(0, 52, 134, 112), width=sc(9))
    sdraw.line(pts([(664, 690), (666, 776)]), fill=(0, 52, 134, 112), width=sc(9))
    sdraw.line(pts([(668, 690), (698, 766)]), fill=(0, 52, 134, 102), width=sc(8))
    shadow = shadow.filter(ImageFilter.GaussianBlur(sc(7)))
    base.alpha_composite(shadow)

    tassel = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tassel)
    gold = (255, 210, 120, 255)
    gold_dark = (218, 151, 58, 255)
    gold_light = (255, 239, 176, 255)
    draw.line(pts(curve), fill=gold_dark, width=sc(16))
    draw.line(pts(curve), fill=gold, width=sc(11))
    draw.line(pts(curve), fill=gold_light, width=sc(4))
    draw.ellipse(box(626, 620, 694, 702), fill=gold, outline=(197, 132, 42, 220), width=sc(3))
    draw.ellipse(box(642, 632, 674, 664), fill=(255, 238, 175, 118))
    draw.line(pts([(660, 690), (632, 770)]), fill=gold_dark, width=sc(8))
    draw.line(pts([(660, 690), (636, 766)]), fill=gold_light, width=sc(4))
    draw.line(pts([(664, 690), (666, 778)]), fill=gold, width=sc(8))
    draw.line(pts([(668, 690), (698, 766)]), fill=gold, width=sc(7))
    draw.line(pts([(672, 690), (704, 758)]), fill=gold_light, width=sc(4))
    base.alpha_composite(tassel)

    draw = ImageDraw.Draw(base)
    draw.ellipse(box(486, 374, 540, 428), fill=(255, 255, 255, 255), outline=(154, 207, 246, 210), width=sc(4))
    draw.ellipse(box(501, 389, 525, 413), fill=(255, 218, 132, 255), outline=(211, 148, 55, 180), width=sc(2))
    draw.ellipse(box(493, 380, 522, 404), fill=(255, 255, 255, 82))


def draw_mortarboard(base):
    combined = Image.new("L", (CANVAS, CANVAS), 0)
    combined_draw = ImageDraw.Draw(combined)
    combined_draw.polygon(pts(curved_cap_points()), fill=255)
    for poly in (
        [(326, 638), (698, 638), (730, 706), (294, 706)],
        [(154, 414), (514, 560), (514, 626), (190, 468)],
        [(514, 560), (870, 406), (832, 460), (514, 626)],
        [(512, 232), (870, 406), (514, 560), (154, 414)],
    ):
        combined_draw.polygon(pts(poly), fill=255)

    draw_colored_shadow(base, combined, alpha=116, blur=34, offset=(0, 42))

    soft_lift = combined.filter(ImageFilter.GaussianBlur(sc(28))).point(lambda a: int(a * 0.22))
    lift = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 0))
    lift.putalpha(soft_lift)
    base.alpha_composite(lift)

    draw_cap_body(base)
    draw_board(base)
    draw_button_and_tassel(base)


def save_icon(icon):
    try:
        icon.save(OUT, "PNG")
    except PermissionError:
        OUT.unlink(missing_ok=True)
        icon.save(OUT, "PNG")


def main():
    icon = draw_background()
    draw_mortarboard(icon)

    high_mask = rounded_mask(CANVAS, sc(RADIUS))
    icon.putalpha(Image.composite(icon.getchannel("A"), Image.new("L", (CANVAS, CANVAS), 0), high_mask))
    icon = icon.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    final_mask = rounded_mask(SIZE, RADIUS)
    icon.putalpha(Image.composite(icon.getchannel("A"), Image.new("L", (SIZE, SIZE), 0), final_mask))
    save_icon(icon)


if __name__ == "__main__":
    main()
