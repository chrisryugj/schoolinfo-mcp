from PIL import Image, ImageDraw, ImageFont, ImageFilter


W, H = 1200, 630
OUT = "og.png"
BOLD = "C:/Windows/Fonts/malgunbd.ttf"
REGULAR = "C:/Windows/Fonts/malgun.ttf"
BLUE = (41, 151, 255)


def vertical_gradient(size, top, bottom):
    width, height = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / (height - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img.convert("RGBA")


def glow(size, center, radius, color, alpha, blur):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    for i in range(9, 0, -1):
        r = radius * i / 9
        a = int(alpha * (i / 9) ** 2)
        box = (cx - r, cy - r, cx + r, cy + r)
        draw.ellipse(box, fill=(*color, a))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def draw_grid(draw, size, spacing=72):
    width, height = size
    line = (255, 255, 255, 8)
    for x in range(-24, width + spacing, spacing):
        draw.line([(x, 0), (x, height)], fill=line, width=1)
    for y in range(18, height + spacing, spacing):
        draw.line([(0, y), (width, y)], fill=line, width=1)


def draw_text_block(draw):
    font_eyebrow = ImageFont.truetype(REGULAR, 26)
    font_title = ImageFont.truetype(BOLD, 92)
    font_subtitle = ImageFont.truetype(REGULAR, 44)
    font_footer = ImageFont.truetype(REGULAR, 25)

    x = 80
    eyebrow_y = 105
    draw.ellipse((x, eyebrow_y + 12, x + 10, eyebrow_y + 22), fill=(*BLUE, 255))
    draw.text(
        (x + 24, eyebrow_y),
        "전국 초·중·고 · 공시정보 35종",
        font=font_eyebrow,
        fill=(*BLUE, 255),
    )

    draw.text((x, 158), "우리 학교 알리미", font=font_title, fill=(245, 245, 247, 255))

    subtitle = "학교 이름 하나로,\n수행평가·급식·공시정보를 한 번에."
    draw.multiline_text(
        (x, 294),
        subtitle,
        font=font_subtitle,
        fill=(175, 180, 190, 255),
        spacing=14,
    )

    line_y = 531
    draw.line([(x, line_y), (1120, line_y)], fill=(255, 255, 255, 42), width=1)
    draw.line([(x, line_y), (336, line_y)], fill=(*BLUE, 110), width=1)

    footer_y = 557
    footer_color = (155, 160, 170, 255)
    draw.text((x, footer_y), "school-mcp.fly.dev", font=font_footer, fill=footer_color)
    right = "설치·가입 없이 · 무료"
    bbox = draw.textbbox((0, 0), right, font=font_footer)
    draw.text((1120 - (bbox[2] - bbox[0]), footer_y), right, font=font_footer, fill=footer_color)


def main():
    img = vertical_gradient((W, H), (0, 0, 0), (10, 10, 12))
    img.alpha_composite(glow((W, H), (95, 80), 410, BLUE, 66, 62))
    img.alpha_composite(glow((W, H), (1075, 545), 320, (112, 151, 220), 28, 74))
    img.alpha_composite(glow((W, H), (1210, 650), 250, (245, 245, 247), 16, 86))

    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_grid(ImageDraw.Draw(grid), (W, H))
    img.alpha_composite(grid)

    veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    veil_draw = ImageDraw.Draw(veil)
    veil_draw.rectangle((0, 0, 680, H), fill=(0, 0, 0, 24))
    img.alpha_composite(veil)

    draw_text_block(ImageDraw.Draw(img))
    img.convert("RGB").save(OUT, "PNG")


if __name__ == "__main__":
    main()
