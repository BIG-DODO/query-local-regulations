# -*- coding: utf-8 -*-
"""
merge_policies.py — 把 _policy_search/*.md 合并为 repo/data/policies.json
输出结构：
{ "meta": {...}, "data": { "青岛": {"17": [entry...], ...}, "山东省": {...}, ... } }
entry = { title, doc_no, summary, url, confidence, timeliness, raw }
"""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "_policy_search")
OUT = os.path.join(ROOT, "repo", "data", "policies.json")

CITIES = ["上海","杭州","宁波","温州","台州","嘉兴","苏州","南京","无锡","扬州","盐城","常州","徐州","连云港","合肥",
          "深圳","广州","东莞","佛山","珠海","惠州","江门","福州","泉州","厦门","漳州","莆田",
          "北京","济南","青岛","西安","郑州","淄博","天津",
          "重庆","成都","武汉","南昌","南宁","贵阳"]
PROVINCES = ["江苏省","浙江省","福建省","广东省","山东省","四川省","湖北省","河南省","陕西省","安徽省","江西省","贵州省","广西"]

FILE_SCOPE = {  # 单城/单省文件
    "浙江省_台州市.md": "台州", "浙江省_嘉兴市.md": "嘉兴",
    "浙江省_宁波市（计划单列市，注意宁波市级政策可能独立于浙江省政策）.md": "宁波",
    "浙江省_杭州市（浙江省会）.md": "杭州", "浙江省_温州市.md": "温州",
    "浙江省_省级普适政策.md": "浙江省",
    "直辖市_上海.md": "上海", "直辖市_北京.md": "北京",
    "直辖市_天津.md": "天津", "直辖市_重庆.md": "重庆",
}

FILE_PROVINCE = {  # 多城文件里"省级政策（对全省适用）"无省名，用文件名兜底
    "广东省.md": "广东省", "江苏省_上.md": "江苏省", "江苏省_下.md": "江苏省",
    "山东省.md": "山东省", "福建省.md": "福建省",
}

RE_TOPIC = re.compile(r"^(?:主题\s*)?(1[7-9]|2[0-3])\s*[.、 ]")
RE_PREFIX = re.compile(r"^[一二三四五六七八九十]+、")

def norm_scope(h, prov_hint=None):
    """H2 标题 → 城市/省 key；不是 scope 返回 None"""
    s = RE_PREFIX.sub("", h).strip()
    if "检索" in s or "缺口" in s or "附录" in s or "说明" in s or "总览" in s:
        return None
    if "省级" in s or ("省" in s and "政策" in s):
        for p in PROVINCES:
            if p.rstrip("省") in s or p in s:
                return p
        if "广西" in s: return "广西"
        return prov_hint
    for c in CITIES:
        if s.startswith(c):
            return c
    return None

def parse_conf(text):
    m = re.search(r"置信度[：: ]*\s*(高|中|低)", text)
    if m: return m.group(1)
    if "⭐⭐⭐" in text: return "高"
    if "⭐⭐" in text: return "中"
    if "⭐" in text: return "低"
    m = re.search(r"\|\s*(高|中|低)\s*(?:（[^）]*）)?\s*\|?\s*$", text.strip(), re.M)
    if m: return m.group(1)
    return ""

def parse_entry(raw):
    e = {"title": "", "doc_no": "", "summary": "", "url": "", "confidence": parse_conf(raw), "timeliness": "", "raw": raw.strip()}
    m = re.search(r"《[^》]+》", raw)
    if m: e["title"] = m.group(0)
    m = re.search(r"[一-鿿]+〔\d{4}〕\d+号|[一-鿿]+\[\d{4}\]\d+号|令\s*第?\d+号|〔\d{4}〕\d+号", raw)
    if m: e["doc_no"] = m.group(0).strip()
    m = re.search(r"https?://[^\s|）)\]]+", raw)
    if m: e["url"] = m.group(0)
    if "已废止" in raw or "已失效" in raw: e["timeliness"] = "已废止/失效"
    elif "时效待核" in raw: e["timeliness"] = "时效待核"
    elif "现行" in raw: e["timeliness"] = "现行"
    # summary：去掉首条 title/文号/url 后的首句，取 120 字
    body = re.sub(r"https?://\S+", "", raw)
    body = re.sub(r"^[0-9\-*.\s]*", "", body).strip()
    e["summary"] = body[:120]
    return e

def split_entries(block):
    """按条拆分主题块：以 - / 数字. / ### 条目 起始"""
    parts = re.split(r"\n(?=\s*(?:[-*]\s|\d+[.、]\s|#{3,4}\s|条目\s*\d))", block)
    out = []
    for p in parts:
        p = p.strip()
        if len(p) < 20: continue
        if p.startswith("#"): p = re.sub(r"^#+\s*(条目\s*[\d-]+\s*)?", "", p).strip()
        out.append(p)
    return out

data = {}
stats = {}
for f in sorted(glob.glob(os.path.join(SRC, "*.md"))):
    base = os.path.basename(f)
    if "任务" in base or "报告" in base: continue
    text = open(f, encoding="utf-8").read()
    scope0 = FILE_SCOPE.get(base)
    # 切分：H2/H3 标题驱动
    tokens = re.split(r"^(#{2,3})\s+(.+)$", text, flags=re.M)
    # tokens: [pre, lvl, title, body, lvl, title, body, ...]
    scope = scope0
    topic = None
    i = 1
    while i < len(tokens) - 1:
        lvl, title, body = tokens[i], tokens[i+1], tokens[i+2] if i+2 < len(tokens) else ""
        i += 3
        tm = RE_TOPIC.match(title.strip())
        if tm:
            topic = tm.group(1)
        elif lvl == "##":
            s = norm_scope(title, FILE_PROVINCE.get(base))
            if s:
                scope = s
            topic = None  # 新的城市/省/说明节开始，重置主题
        if topic and scope:
            for raw in split_entries(body):
                e = parse_entry(raw)
                if "未检索到" in raw and len(raw) < 300:
                    e["title"] = "（未检索到）"
                if not e["title"] and not e["url"]: continue
                data.setdefault(scope, {}).setdefault(topic, []).append(e)
    stats[base] = sum(len(v) for t in data.values() for v in t.values())

total = sum(len(v) for sc in data.values() for v in sc.values())
out = {"meta": {"generated_at": "2026-08-04", "source": "_policy_search/*.md（任务①，已验收）", "topics": "17-23"}, "data": data}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"总条目: {total} | scope 数: {len(data)} | 文件大小: {os.path.getsize(OUT)//1024}KB")
cov_c = [c for c in CITIES if c in data]
print("城市覆盖:", len(cov_c), "/40; 缺:", [c for c in CITIES if c not in data])
print("省级覆盖:", [p for p in PROVINCES if p in data])
for c in ["青岛", "深圳", "江苏省"]:
    if c in data:
        print(c, {t: len(v) for t, v in sorted(data[c].items())})
EOF_MARKER_NOT_NEEDED = None
