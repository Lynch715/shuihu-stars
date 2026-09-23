#!/usr/bin/env python3
"""将八张场景原画按《场景原画生产规范.md》写入章节题词数据。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'gameData_v10.json'
SCENES = {
    1:'sc_shangang', 2:'sc_xueyuan', 3:'sc_shangang', 4:'sc_zhoucheng',
    5:'sc_zhuang', 6:'sc_kuangye', 7:'sc_zhuang', 8:'sc_zhoucheng',
    9:'sc_shuipo', 10:'sc_kuangye', 11:'sc_shuipo', 12:'sc_xueyuan',
    13:'sc_shangang', 14:'sc_zhoucheng', 15:'sc_jiangnan', 16:'sc_jiangnan',
    17:'sc_shangang', 18:'sc_shuipo', 19:'sc_shuipo', 20:'sc_xueyuan',
    21:'sc_zhuang', 22:'sc_kuangye', 23:'sc_kuangye', 24:'sc_kuangye',
    25:'sc_dianting', 26:'sc_zhoucheng', 27:'sc_dianting', 28:'sc_zhoucheng',
    29:'sc_jiangnan', 30:'sc_jiangnan', 31:'sc_jiangnan', 32:'sc_jiangnan', 33:'sc_shuipo',
}

data = json.loads(DATA.read_text())
chapters = data['story']['chapters']
assert set(map(int, chapters)) == set(SCENES), '章节或场景映射不完整'
for ch, scene in SCENES.items(): chapters[str(ch)]['scene'] = scene
# 尾声借水泊：从哪里散的，回哪里收
data['story']['epilogue']['scene'] = 'sc_shuipo'
DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
print(f'已写入 {len(SCENES)} 个章节场景映射')
