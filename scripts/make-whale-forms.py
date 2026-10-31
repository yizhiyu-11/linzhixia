# -*- coding: utf-8 -*-
"""大肥鱼形象候选：官方 logo 抠图 + 矢量重绘（徽章/侧游/Q版）+ 组合对照表。"""
import os

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # 超采样倍数
OUT = os.path.join('docs', '商业', '参考形象', '大肥鱼')
BLUE = (77, 107, 254)
DEEP = (52, 84, 209)
WHITE = (255, 255, 255)
BELLY = (236, 242, 255)


def canvas(w, h):
    return Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))


def done(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def whale_badge(size=1024):
    """官方 logo 的矢量重绘：蓝色圆形 + 白色鲸鱼剪影。"""
    img = canvas(size, size)
    d = ImageDraw.Draw(img)
    s = size * SS
    d.ellipse([0, 0, s, s], fill=BLUE)

    # 身体：一个胖胖的水滴形
    body = [
        (0.18 * s, 0.52 * s), (0.20 * s, 0.38 * s), (0.30 * s, 0.28 * s),
        (0.44 * s, 0.25 * s), (0.58 * s, 0.27 * s), (0.70 * s, 0.34 * s),
        (0.78 * s, 0.45 * s), (0.80 * s, 0.58 * s), (0.74 * s, 0.68 * s),
        (0.62 * s, 0.74 * s), (0.46 * s, 0.76 * s), (0.32 * s, 0.72 * s),
        (0.22 * s, 0.64 * s),
    ]
    d.polygon(body, fill=WHITE)

    # 尾巴（右上方两片）
    d.polygon([(0.72 * s, 0.34 * s), (0.90 * s, 0.20 * s), (0.86 * s, 0.40 * s)], fill=WHITE)
    d.polygon([(0.72 * s, 0.34 * s), (0.92 * s, 0.44 * s), (0.80 * s, 0.50 * s)], fill=WHITE)

    # 腹部留白（蓝底透出）
    d.ellipse([0.24 * s, 0.52 * s, 0.66 * s, 0.74 * s], fill=BLUE)

    # 眼睛
    d.ellipse([0.52 * s, 0.44 * s, 0.58 * s, 0.50 * s], fill=BLUE)
    return done(img, size, size)


def whale_swim(w=1600, h=1000):
    """侧游的大肥鱼：蓝身、白肚、尾巴上卷。"""
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    s = min(w, h) * SS

    cx, cy = 0.46 * w * SS, 0.55 * h * SS
    rw, rh = 0.30 * w * SS, 0.22 * h * SS

    # 身体
    d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=BLUE)
    # 头部圆一点
    d.ellipse([cx + rw * 0.30, cy - rh * 0.78, cx + rw * 0.95, cy + rh * 0.55], fill=BLUE)
    # 尾巴
    tail_x = cx - rw * 0.92
    d.polygon(
        [
            (tail_x, cy),
            (tail_x - 0.10 * w * SS, cy - 0.20 * h * SS),
            (tail_x - 0.06 * w * SS, cy - 0.02 * h * SS),
            (tail_x - 0.14 * w * SS, cy + 0.10 * h * SS),
        ],
        fill=BLUE,
    )
    # 白肚
    d.ellipse([cx - rw * 0.80, cy - rh * 0.10, cx + rw * 0.55, cy + rh * 0.92], fill=BELLY)
    # 眼睛
    d.ellipse([cx + rw * 0.52, cy - rh * 0.30, cx + rw * 0.62, cy - rh * 0.16], fill=WHITE)
    d.ellipse([cx + rw * 0.555, cy - rh * 0.27, cx + rw * 0.60, cy - rh * 0.205], fill=DEEP)
    # 水花/气泡
    for i, (bx, by, br) in enumerate(
        [(0.78, 0.24, 18), (0.83, 0.33, 11), (0.74, 0.17, 9)]
    ):
        d.ellipse(
            [(bx * w - br) * SS, (by * h - br) * SS, (bx * w + br) * SS, (by * h + br) * SS],
            fill=(77, 107, 254, 120),
        )
    return done(img, w, h)


def whale_q(w=1024, h=1024):
    """Q 版大头：圆脸鲸鱼，眼睛大，腮红。"""
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    s = min(w, h) * SS
    cx, cy = s * 0.5, s * 0.54
    r = s * 0.30

    # 身体
    d.ellipse([cx - r, cy - r * 0.92, cx + r, cy + r * 0.92], fill=BLUE)
    # 尾巴在右上
    d.polygon(
        [
            (cx + r * 0.55, cy - r * 0.75),
            (cx + r * 1.25, cy - r * 1.35),
            (cx + r * 1.05, cy - r * 0.95),
            (cx + r * 1.32, cy - r * 0.72),
        ],
        fill=BLUE,
    )
    # 白肚
    d.ellipse([cx - r * 0.62, cy + r * 0.05, cx + r * 0.62, cy + r * 0.80], fill=BELLY)
    # 眼睛
    for sx in (-1, 1):
        d.ellipse(
            [cx + sx * r * 0.36 - r * 0.13, cy - r * 0.30, cx + sx * r * 0.36 + r * 0.13, cy - r * 0.02],
            fill=WHITE,
        )
        d.ellipse(
            [cx + sx * r * 0.36 - r * 0.075, cy - r * 0.22, cx + sx * r * 0.36 + r * 0.075, cy - r * 0.06],
            fill=DEEP,
        )
        # 腮红
        d.ellipse(
            [cx + sx * r * 0.55 - r * 0.11, cy + r * 0.02, cx + sx * r * 0.55 + r * 0.11, cy + r * 0.16],
            fill=(255, 150, 180, 120),
        )
    # 嘴
    d.arc([cx - r * 0.16, cy + r * 0.12, cx + r * 0.16, cy + r * 0.34], 20, 160, fill=DEEP, width=int(r * 0.05))
    return done(img, w, h)


def sheet(tiles, path, cols=2, pad=40, label_h=70):
    """把几张图拼成对照表"""
    from PIL import ImageFont

    fnt = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 34)
    tw = max(t[0].width for t in tiles)
    th = max(t[0].height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    W = cols * tw + (cols + 1) * pad
    H = rows * (th + label_h) + (rows + 1) * pad
    out = Image.new('RGB', (W, H), (247, 249, 252))
    d = ImageDraw.Draw(out)
    for i, (im, label) in enumerate(tiles):
        r, c = divmod(i, cols)
        x = pad + c * (tw + pad)
        y = pad + r * (th + label_h + pad)
        out.paste(im, (x, y), im if im.mode == 'RGBA' else None)
        d.text((x, y + th + 18), label, font=fnt, fill=(40, 44, 52))
    out.save(path)
    print('  sheet:', path)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)

    badge = whale_badge(760)
    badge.save(os.path.join(OUT, '形象1-徽章版.png'))

    swim = whale_swim(1000, 760)
    swim.save(os.path.join(OUT, '形象2-侧游版.png'))

    q = whale_q(760, 760)
    q.save(os.path.join(OUT, '形象3-Q版.png'))

    # 官方 logo（抠掉白底）
    off = Image.open(os.path.join(OUT, 'deepseek-logo-225x225.png')).convert('RGBA')
    off = off.resize((760, 760), Image.LANCZOS)

    # 鲸鱼娘头像（裁剪）
    girl = Image.open(os.path.join('docs', '商业', '角色', '角色-社区风-03-挥手.png')).convert('RGB')
    gw, gh = girl.size
    head = girl.crop((int(gw * 0.28), 0, int(gw * 0.95), int(gh * 0.42))).resize((760, 760), Image.LANCZOS)

    sheet(
        [
            (off, '① 官方 logo（DeepSeek 原图）'),
            (badge, '② 矢量徽章版（我画的，可放大可改色）'),
            (swim, '③ 侧游版（可当封面主体）'),
            (q, '④ Q 版（可爱向）'),
        ],
        os.path.join(OUT, '形象对照表.png'),
    )
    print('done')
