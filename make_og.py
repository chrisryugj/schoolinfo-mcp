from PIL import Image, ImageDraw, ImageFilter, ImageFont


W, H = 1200, 630
SCALE = 2
OUT = "og.png"

BOLD = "C:/Windows/Fonts/malgunbd.ttf"
REGULAR = "C:/Windows/Fonts/malgun.ttf"

NAVY = (11, 36, 71)
BLUE = (43, 126, 238)
LIGHT_BLUE = (226, 239, 255)
MUTED = (79, 105, 139)
GREEN = (76, 190, 142)
ORANGE = (245, 159, 84)
YELLOW = (255, 205, 92)
WHITE = (255, 255, 255)


def sc(value):
    return int(round(value * SCALE))


def box(values):
    return tuple(sc(v) for v in values)


def font(path, size):
    return ImageFont.truetype(path, sc(size))


def draw_text(draw, xy, text, text_font, fill, anchor=None):
    draw.text((sc(xy[0]), sc(xy[1])), text, font=text_font, fill=fill, anchor=anchor)


def fit_font(text, path, max_size, max_width):
    """Largest font (<= max_size) whose rendered width fits within max_width design px."""
    size = max_size
    while size > 11:
        f = ImageFont.truetype(path, sc(size))
        if f.getlength(text) <= sc(max_width):
            return f
        size -= 1
    return ImageFont.truetype(path, sc(11))


def gradient(size, top, bottom):
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        fill = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (size[0], y)], fill=fill)
    return img.convert("RGBA")


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box(xy), radius=sc(radius), fill=fill, outline=outline, width=sc(width))


def soft_shadow(img, xy, radius=28, alpha=42, offset=(0, 12)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    shifted = (xy[0] + offset[0], xy[1] + offset[1], xy[2] + offset[0], xy[3] + offset[1])
    rounded(draw, shifted, radius, (30, 82, 150, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(sc(16))))


def card(img, xy, radius=28):
    soft_shadow(img, xy, radius=radius)
    draw = ImageDraw.Draw(img, "RGBA")
    rounded(draw, xy, radius, (255, 255, 255, 238), (213, 228, 249, 255), 1)


def line(draw, points, fill, width=2):
    draw.line([(sc(x), sc(y)) for x, y in points], fill=fill, width=sc(width))


def draw_background(img):
    draw = ImageDraw.Draw(img, "RGBA")
    for x in range(42, W, 72):
        line(draw, [(x, 0), (x, H)], (255, 255, 255, 70), 1)
    for y in range(34, H, 72):
        line(draw, [(0, y), (W, y)], (255, 255, 255, 64), 1)

    for cx, cy, r, fill in [
        (1010, 116, 156, (92, 156, 246, 34)),
        (805, 520, 145, (76, 190, 142, 28)),
        (320, 92, 112, (255, 255, 255, 94)),
    ]:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer, "RGBA")
        d.ellipse(box((cx - r, cy - r, cx + r, cy + r)), fill=fill)
        img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(sc(28))))


def draw_left_copy(img):
    draw = ImageDraw.Draw(img, "RGBA")
    badge_font = font(BOLD, 22)
    title_font = font(BOLD, 76)
    sub_font = font(REGULAR, 28)
    foot_font = font(REGULAR, 20)

    rounded(draw, (82, 82, 346, 130), 24, (229, 242, 255, 255), (178, 213, 255, 255), 1)
    draw.ellipse(box((104, 100, 116, 112)), fill=BLUE)
    draw_text(draw, (132, 94), "전국 초·중·고 공시 35종", badge_font, BLUE)

    draw_text(draw, (82, 172), "우리 학교", title_font, NAVY)
    draw_text(draw, (82, 258), "알리미", title_font, NAVY)

    draw_text(draw, (84, 365), "학교 이름 하나로,", sub_font, MUTED)
    draw_text(draw, (84, 407), "급식·수행평가·학사일정까지 한 번에", sub_font, MUTED)

    line(draw, [(84, 520), (498, 520)], (184, 207, 238, 255), 1)
    line(draw, [(84, 520), (205, 520)], BLUE, 4)
    draw_text(draw, (84, 548), "school-mcp.fly.dev · 설치·가입 없이 무료", foot_font, (91, 119, 153))


def draw_school(img):
    draw = ImageDraw.Draw(img, "RGBA")
    soft_shadow(img, (710, 230, 1055, 520), radius=32, alpha=34, offset=(0, 14))

    draw.polygon([box((740, 300))[0:2], box((882, 190))[0:2], box((1024, 300))[0:2]], fill=(67, 139, 230), outline=(35, 106, 206))
    draw.rectangle(box((775, 300, 989, 500)), fill=(255, 255, 255), outline=(190, 213, 243), width=sc(2))
    draw.rectangle(box((745, 330, 1019, 504)), fill=(237, 246, 255), outline=(190, 213, 243), width=sc(2))
    draw.rectangle(box((856, 412, 908, 504)), fill=(25, 78, 137))
    draw.rectangle(box((870, 426, 894, 504)), fill=(48, 119, 197))

    for x in (778, 830, 934, 986):
        draw.rounded_rectangle(box((x, 350, x + 34, 386)), radius=sc(8), fill=(255, 255, 255), outline=(167, 207, 247), width=sc(2))
        line(draw, [(x + 17, 352), (x + 17, 384)], (189, 220, 249), 1)
        line(draw, [(x + 2, 368), (x + 32, 368)], (189, 220, 249), 1)

    draw.rectangle(box((845, 286, 919, 326)), fill=(255, 255, 255), outline=(167, 207, 247), width=sc(2))
    draw_text(draw, (882, 291), "SCHOOL", font(BOLD, 15), BLUE, anchor="ma")

    line(draw, [(882, 188), (882, 130)], NAVY, 3)
    draw.polygon([box((884, 132))[0:2], box((944, 148))[0:2], box((884, 164))[0:2]], fill=ORANGE)
    draw.rectangle(box((700, 500, 1062, 524)), fill=(201, 224, 249))
    draw.rectangle(box((738, 524, 1022, 542)), fill=(173, 207, 245))


def draw_meal_icon(draw, cx, cy):
    draw.ellipse(box((cx - 31, cy - 21, cx + 31, cy + 41)), fill=(235, 246, 255), outline=(57, 132, 226), width=sc(4))
    draw.ellipse(box((cx - 17, cy - 7, cx + 17, cy + 27)), outline=(112, 178, 242), width=sc(3))
    line(draw, [(cx - 47, cy - 24), (cx - 47, cy + 42)], GREEN, 4)
    for x in (-54, -47, -40):
        line(draw, [(cx + x, cy - 24), (cx + x, cy - 3)], GREEN, 2)
    line(draw, [(cx + 50, cy - 24), (cx + 42, cy + 42)], ORANGE, 4)


def draw_check_icon(draw, cx, cy):
    draw.rounded_rectangle(box((cx - 42, cy - 48, cx + 42, cy + 50)), radius=sc(10), fill=(246, 251, 255), outline=(64, 137, 227), width=sc(3))
    for y in (-22, 5, 32):
        draw.rectangle(box((cx - 24, cy + y - 6, cx + 26, cy + y - 2)), fill=(174, 204, 238))
    line(draw, [(cx - 28, cy - 24), (cx - 18, cy - 14), (cx - 3, cy - 34)], GREEN, 4)


def draw_calendar_icon(draw, cx, cy):
    draw.rounded_rectangle(box((cx - 45, cy - 42, cx + 45, cy + 45)), radius=sc(12), fill=(247, 252, 255), outline=(64, 137, 227), width=sc(3))
    draw.rectangle(box((cx - 45, cy - 42, cx + 45, cy - 16)), fill=BLUE)
    for x in (-22, 0, 22):
        for y in (2, 24):
            draw.ellipse(box((cx + x - 5, cy + y - 5, cx + x + 5, cy + y + 5)), fill=(132, 182, 235))


def draw_dday_icon(draw, cx, cy):
    draw.ellipse(box((cx - 44, cy - 44, cx + 44, cy + 44)), fill=(255, 247, 235), outline=ORANGE, width=sc(4))
    draw.ellipse(box((cx - 27, cy - 27, cx + 27, cy + 27)), outline=(249, 184, 102), width=sc(4))
    draw_text(draw, (cx, cy + 1), "D-7", font(BOLD, 23), (214, 116, 38), anchor="mm")


def icon_card(img, xy, title, accent, icon_func):
    card(img, xy, radius=24)
    draw = ImageDraw.Draw(img, "RGBA")
    x1, y1, x2, y2 = xy
    draw.ellipse(box((x1 + 24, y1 + 24, x1 + 44, y1 + 44)), fill=accent)
    tx = x1 + 58
    title_font = fit_font(title, BOLD, 21, x2 - tx - 18)
    draw_text(draw, (tx, y1 + 23), title, title_font, NAVY)
    icon_func(draw, (x1 + x2) / 2, y1 + 94)
    draw.rounded_rectangle(box((x1 + 28, y2 - 22, x2 - 28, y2 - 16)), radius=sc(3), fill=(218, 233, 251))
    draw.rounded_rectangle(box((x1 + 28, y2 - 22, x1 + 92, y2 - 16)), radius=sc(3), fill=accent)


def draw_infographic(img):
    draw_school(img)
    icon_card(img, (628, 92, 823, 244), "급식", BLUE, draw_meal_icon)
    icon_card(img, (918, 86, 1112, 238), "학사일정", GREEN, draw_calendar_icon)
    icon_card(img, (594, 398, 800, 566), "수행평가", GREEN, draw_check_icon)
    icon_card(img, (920, 378, 1132, 548), "시험 D-day", ORANGE, draw_dday_icon)

    draw = ImageDraw.Draw(img, "RGBA")
    for pts, fill in [
        ([(820, 226), (765, 284)], (58, 130, 224, 64)),
        ([(950, 226), (934, 286)], (76, 190, 142, 64)),
        ([(790, 436), (838, 402)], (76, 190, 142, 64)),
        ([(980, 424), (938, 404)], (245, 159, 84, 70)),
    ]:
        line(draw, pts, fill, 3)

    for xy, color in [((1050, 292, 1070, 312), YELLOW), ((654, 318, 670, 334), GREEN), ((1102, 318, 1118, 334), BLUE)]:
        draw.ellipse(box(xy), fill=color)


def main():
    size = (W * SCALE, H * SCALE)
    img = gradient(size, (245, 249, 255), (227, 238, 255))
    draw_background(img)
    draw_left_copy(img)
    draw_infographic(img)

    img = img.resize((W, H), Image.Resampling.LANCZOS)
    img.convert("RGB").save(OUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
