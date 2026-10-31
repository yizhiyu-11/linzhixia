# -*- coding: utf-8 -*-
"""情绪曲线图（v2）：愉悦度按 -1..1 映射，事件标签错位避免重叠。"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1440, 800
PAD_L, PAD_R, PAD_T, PAD_B = 96, 44, 156, 96

d = json.load(open('data/_affect-curve.json', encoding='utf-8'))
pts = d['points']
events = d['events']

FB = r'C:\Windows\Fonts\msyhbd.ttc'
FR = r'C:\Windows\Fonts\msyh.ttc'


def f(sz, bold=True):
    return ImageFont.truetype(FB if bold else FR, sz)


img = Image.new('RGB', (W, H), (250, 252, 255))
draw = ImageDraw.Draw(img)

draw.text((PAD_L, 30), '她的一天：情绪曲线（原型模拟）', font=f(32), fill=(16, 42, 67))
draw.text((PAD_L, 74), '事件注入后按半衰期衰减；愉悦度 -1~1（蓝），激活度/精力 0~1（橙/绿）',
          font=f(17, False), fill=(107, 130, 153))

x0, x1 = PAD_L, W - PAD_R
y0, y1 = PAD_T, H - PAD_B

# 网格
for h in range(0, 25, 3):
    x = x0 + (x1 - x0) * h / 24
    draw.line([(x, y0), (x, y1)], fill=(230, 238, 246), width=1)
    draw.text((x - 12, y1 + 10), f'{h}:00', font=f(15, False), fill=(130, 146, 164))

for frac, label in ((0, '-1.0'), (0.25, '-0.5'), (0.5, '0'), (0.75, '0.5'), (1, '1.0')):
    y = y1 - (y1 - y0) * frac
    draw.line([(x0, y), (x1, y)], fill=(232, 240, 248), width=1)
    draw.text((x0 - 52, y - 10), label, font=f(14, False), fill=(130, 146, 164))

# 0 线加粗（愉悦度零轴）
draw.line([(x0, y1 - (y1 - y0) * 0.5), (x1, y1 - (y1 - y0) * 0.5)], fill=(206, 216, 228), width=2)

px = lambda t: x0 + (x1 - x0) * t / 24
# 愉悦度：-1..1 → 1..0
pv = lambda v: y1 - (y1 - y0) * ((max(-1, min(1, v)) + 1) / 2)
# 激活度/精力：0..1 → 1..0
pa = lambda v: y1 - (y1 - y0) * max(0, min(1, v))


def line(key, color, width, mapper):
    prev = None
    for p in pts:
        cur = (px(p['t']), mapper(p[key]))
        if prev:
            draw.line([prev, cur], fill=color, width=width)
        prev = cur


line('a', (255, 152, 64), 2, pa)
line('e', (108, 190, 130), 2, pa)
line('v', (43, 127, 214), 3, pv)

# 情绪色带
band_y = y1 - 10
colors = {
    '生气': (226, 84, 84), '烦躁': (240, 158, 88), '低落': (118, 128, 190),
    '累': (150, 150, 150), '平静': (204, 214, 226), '舒服': (114, 198, 158),
    '开心': (84, 188, 118), '兴奋': (52, 168, 158), '紧张': (228, 138, 170),
}
for i in range(len(pts) - 1):
    c = colors.get(pts[i]['label'], (204, 214, 226))
    draw.line([(px(pts[i]['t']), band_y), (px(pts[i + 1]['t']), band_y)], fill=c, width=18)

# 事件
for i, ev in enumerate(events):
    x = px(ev['t'])
    draw.line([(x, y0 - 6), (x, y1 - 30)], fill=(210, 218, 228), width=1)
    draw.ellipse([x - 5, y0 - 11, x + 5, y0 - 1], fill=(255, 90, 120))
    ty = y0 - 30 if i % 2 == 0 else y0 - 54
    tw = draw.textlength(ev['label'], font=f(15, False))
    draw.text((min(x + 6, x1 - tw), ty), ev['label'], font=f(15, False), fill=(150, 90, 105))

# 图例
lx = x0 + 6
for name, color in (('愉悦度', (43, 127, 214)), ('激活度', (255, 152, 64)), ('精力', (108, 190, 130))):
    draw.line([(lx, H - 40), (lx + 36, H - 40)], fill=color, width=4)
    draw.text((lx + 44, H - 51), name, font=f(16, False), fill=(60, 74, 92))
    lx += 160

os.makedirs('docs/技术', exist_ok=True)
img.save('docs/技术/情绪曲线.png')
print('  saved docs/技术/情绪曲线.png')
