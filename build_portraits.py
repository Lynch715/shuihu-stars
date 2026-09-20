#!/usr/bin/env python3
"""
水浒群星录 · 立绘处理流水线
用法：把 GPT 出的原图放进 assets/portraits/source/<hid>.png，然后
      python3 build_portraits.py
输出：assets/portraits/web/<hid>.webp   480x640  一张通吃
      assets/portraits/web/manifest.json

一个角色只出一张。三处显示全靠 CSS 缩放，整张 3:4 不裁切：
  人物牌   满铺卡面（object-fit:cover，底部纸色渐变压名字）
  详情页   150px 宽
  战阵     88 / 60 / 40px，按上阵人数自动切档

处理链：
  1. 各图绢底拉齐到全组平均（消除批次间色温漂移，限幅 ±12%）
  2. 整体向纸色 #e9e2d0 提亮 LIFT，让立绘与 UI 同色系
  3. 0.5px 高斯降噪，压掉绢纹高频噪点（体积省约三成，线条无损）
  4. WebP q62 / method 6
"""
from PIL import Image, ImageFilter
import numpy as np, glob, os, json

# 两条流水线共用同一套处理参数，保证画风一致
#   source/     一人一张   → web/
#   arch_source/ 范式底图   → arch/   （多人共用，见 data/assign_archetype.py）
PAIRS = [('assets/portraits/source', 'assets/portraits/web', False),
         ('assets/portraits/arch_source', 'assets/portraits/arch', True)]
PAPER   = np.array([233, 226, 208], dtype=np.float64)
LIFT    = 0.35      # 向纸色提亮比例
BLUR    = 0.5       # 降噪半径
Q_BIG     = 62
BIG       = (480, 640)

# 范式底图额外出一张半身特写。一张全身图给四五十个人共用，
# 光靠镜像和色偏，隔两格看过去还是同一个人；换个取景才真换一张脸。
# 只裁上半部再放大到同样尺寸，卡面构图就从「全身像」变成「胸像」。
BUST      = 0.58    # 取原图上方这个比例，再拉回 3:4
Q_BUST    = 58

def silkbg(a):
    h, w, _ = a.shape
    k = int(min(h, w) * 0.07)
    ps = [a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:]]
    return np.mean([p.reshape(-1, 3).mean(0) for p in ps], axis=0)

def run(SRC_DIR, OUT_DIR, bust=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(glob.glob(f'{SRC_DIR}/*.png') + glob.glob(f'{SRC_DIR}/*.jpg'))
    if not files:
        print(f'（{SRC_DIR}/ 里没有原图，跳过）'); return
    arrs = {f: np.asarray(Image.open(f).convert('RGB')).astype(np.float64) for f in files}
    grp  = np.mean([silkbg(a) for a in arrs.values()], axis=0)
    tgt  = grp + (PAPER - grp) * LIFT

    manifest, total = {}, 0
    for f in files:
        hid = os.path.splitext(os.path.basename(f))[0]
        a = arrs[f]
        g = np.clip(grp / silkbg(a), 0.88, 1.12) * (tgt / grp)
        im = Image.fromarray(np.clip(a * g, 0, 255).astype(np.uint8))
        big = im.resize(BIG, Image.LANCZOS).filter(ImageFilter.GaussianBlur(BLUR))
        big.save(f'{OUT_DIR}/{hid}.webp', 'WEBP', quality=Q_BIG, method=6)

        b = os.path.getsize(f'{OUT_DIR}/{hid}.webp')
        total += b
        manifest[hid] = {'portrait': f'{hid}.webp', 'bytes': b}
        line = f'{hid:<16} {b/1024:>6.1f}KB'

        if bust:
            W, H = im.size
            ch = int(H * BUST)
            cw = int(ch * 3 / 4)
            im2 = im.crop(((W - cw) // 2, 0, (W - cw) // 2 + cw, ch))
            im2 = im2.resize(BIG, Image.LANCZOS).filter(ImageFilter.GaussianBlur(BLUR))
            im2.save(f'{OUT_DIR}/{hid}~b.webp', 'WEBP', quality=Q_BUST, method=6)
            b2 = os.path.getsize(f'{OUT_DIR}/{hid}~b.webp')
            total += b2
            manifest[hid]['bust'] = f'{hid}~b.webp'
            line += f'   + 半身 {b2/1024:>5.1f}KB'
        print(line)

    json.dump(manifest, open(f'{OUT_DIR}/manifest.json', 'w'),
              ensure_ascii=False, indent=1)
    n = len(files) * (2 if bust else 1)
    print('-' * 52)
    print(f'{SRC_DIR} → {n} 张合计 {total/1024:.1f}KB，单张均 {total/n/1024:.1f}KB'
          f'（内嵌后约 {total*1.33/1024:.1f}KB）\n')

if __name__ == '__main__':
    for a, b, c in PAIRS:
        run(a, b, c)
