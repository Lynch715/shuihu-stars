#!/usr/bin/env python3
"""
水浒群星录 V10 · 构建

  python3 build.py

把 src/ 下的源文件 + data/gameData_v10.json 组装成一个 HTML。
图片不再内嵌：html 里只写相对路径，浏览器按需去取，service worker 负责缓存和离线。

为什么拆：内嵌时整包 gzip 后 4.3MB，其中图片 4.18MB、代码加数据只有 144KB，
而且游戏要等整页下完才启动 —— 首次打开要干等 4.3MB。拆开后首屏只要一百多 KB，
每次上线更新也只重下这一百多 KB，图片留在缓存里不动。
代价：不再是单文件。本地双击 html 照样能玩（相对路径），但要连 assets/ 一起拷。

  src/style.css      样式
  src/engine.js      引擎（数据/存档/数值/战斗/养成/结算）
  src/view.js        渲染与演出
  data/gameData_v10.json
  assets/portraits/web/*.webp   → window.PORTRAITS  （一人一张）
  assets/portraits/arch/*.webp  → window.ARCHETYPES （范式，多人共用）
  assets/scenes/web/*.webp      → window.SCENES     （章节场景）
  三者的值都是「相对路径?v=内容哈希」。换了图哈希就变，缓存不会拿旧图顶上。
"""
import hashlib, json, os, sys, glob, re

ROOT = os.path.dirname(os.path.abspath(__file__))
def p(*a): return os.path.join(ROOT, *a)

OUT = p('水浒群星录_V10.6.2.html')
VERSION = 'V10.6.2'
# --noassets：不带图构建（模拟与回归在没有 assets/ 的机器上跑时用），产物只用于测试
NOASSETS = '--noassets' in sys.argv

def read(path):
    with open(path, encoding='utf-8') as f: return f.read()

# 图片引用：相对路径 + 内容哈希
BYTES = {}
def ref(f):
    b = open(f, 'rb').read()
    rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
    BYTES[rel] = len(b)
    return f'{rel}?v={hashlib.md5(b).hexdigest()[:8]}'

# ── 素材 ─────────────────────────────────────────────────────────────
css = read(p('src', 'style.css'))
engine = read(p('src', 'engine.js'))
view = read(p('src', 'view.js'))
pwa = read(p('src', 'pwa.js'))
data = read(p('data', 'gameData_v10.json'))

# 范式立绘：十二张兜底图，多人共用（见 data/assign_archetype.py）
arch = {}
for f in sorted(glob.glob(p('assets', 'portraits', 'arch', '*.webp'))):
    aid = os.path.splitext(os.path.basename(f))[0]
    arch[aid] = ref(f)

portraits = {}
for f in sorted(glob.glob(p('assets', 'portraits', 'web', '*.webp'))):
    hid = os.path.splitext(os.path.basename(f))[0]
    if hid.endswith('_h'):           # 旧的头像档，不再使用
        continue
    portraits[hid] = ref(f)

SCENE_IDS = {'sc_shangang', 'sc_shuipo', 'sc_zhuang', 'sc_zhoucheng',
             'sc_xueyuan', 'sc_kuangye', 'sc_jiangnan', 'sc_dianting'}
scenes = {}
for f in sorted(glob.glob(p('assets', 'scenes', 'web', '*.webp'))):
    sid = os.path.splitext(os.path.basename(f))[0]
    if sid not in SCENE_IDS:
        print('!! 未登记的场景 ID：', sid); sys.exit(1)
    scenes[sid] = ref(f)
if set(scenes) != SCENE_IDS and not NOASSETS:
    print('!! 场景图缺失：', '、'.join(sorted(SCENE_IDS - set(scenes)))); sys.exit(1)

# 校验：立绘的 hid 必须在数据里
ids = set(json.loads(data)['heroes'])
orphan = [k for k in portraits if k not in ids]
if orphan:
    print('!! 这些立绘对不上角色 ID：', '、'.join(orphan)); sys.exit(1)

HILLS = ('<svg viewBox="0 0 800 200" preserveAspectRatio="none">'
  '<path d="M0,200 L0,132 L52,96 L96,124 L150,74 L208,120 L252,98 L300,140 L352,106 L404,150 '
  'L448,118 L500,88 L556,130 L604,104 L660,144 L710,112 L760,138 L800,116 L800,200 Z" fill="#2a251f"/>'
  '<path d="M0,200 L0,164 L64,144 L120,168 L182,140 L240,172 L306,148 L370,176 L438,152 L500,180 '
  'L566,156 L630,182 L700,158 L760,180 L800,162 L800,200 Z" fill="#2a251f" opacity=".7"/></svg>')

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#e9e2d0">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="icon/icon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon/icon-180.png">
<link rel="manifest" href="site.webmanifest">
<meta name="apple-mobile-web-app-title" content="群星录">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>文字水浒 · 群星录 {VERSION}</title>
<style>
{css}</style>
</head>
<body>
<div class="hills">{HILLS}</div>
<div class="app">
  <div id="res" class="res"></div>
  <div id="nav" class="nav"></div>
  <div id="content"></div>
</div>
<div id="modal"></div>
<div id="toast"></div>

<script type="application/json" id="gameData">{data}</script>
<script>window.PORTRAITS={json.dumps(portraits)};window.ARCHETYPES={json.dumps(arch)};window.SCENES={json.dumps(scenes)};</script>
<script>
{engine}
</script>
<script>
{view}
</script>
<script>
{pwa}
</script>
</body>
</html>
'''

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

size = os.path.getsize(OUT)
lines = html.count('\n') + 1
sz = lambda d: sum(BYTES[v.split('?')[0]] for v in d.values())
pb = sz(portraits)
print(f'已构建 {os.path.basename(OUT)}')
print(f'  大小 {size/1024/1024:.2f}MB　行数 {lines}')
ab = sz(arch)
sb = sz(scenes)
print(f'  外置图片（按需加载）')
print(f'  数据 {len(data)/1024:.0f}KB　立绘 {len(portraits)} 张 / {pb/1024:.0f}KB'
      f'　范式 {len(arch)} 张 / {ab/1024:.0f}KB　场景 {len(scenes)} 张 / {sb/1024:.0f}KB')
print(f'  样式 {len(css)/1024:.0f}KB　引擎 {len(engine)/1024:.0f}KB　视图 {len(view)/1024:.0f}KB')

# 重复函数定义自检 —— 这次重构的核心约束
body = engine + '\n' + view
# 自检前剥掉注释与字符串，避免把约束说明里的关键词算成代码
probe = re.sub(r'/\*[\s\S]*?\*/', '', body)
probe = re.sub(r'^\s*//.*$', '', probe, flags=re.M)
names = re.findall(r'^\s*function\s+([A-Za-z_$][\w$]*)\s*\(', probe, re.M)
dup = {n for n in names if names.count(n) > 1}
print(f'  重复函数定义 {len(dup)}' + (f'：{"、".join(sorted(dup))}' if dup else ' ✓'))
wrap = len(re.findall(r'window\.\w+\s*=\s*function', probe))
print(f'  window.X = function 覆盖 {wrap}' + (' ✓' if wrap == 0 else ' !!'))
inline = len(re.findall(r'onclick\s*=', probe))
print(f'  内联 onclick {inline}' + (' ✓' if inline == 0 else ' !!'))
iv = len(re.findall(r'setInterval', probe))
print(f'  setInterval {iv}' + (' ✓' if iv == 0 else ' !!'))
