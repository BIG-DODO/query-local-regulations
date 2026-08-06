# -*- coding: utf-8 -*-
"""
build_atlas.py — 生成两份图集的浏览数据 data/atlas/<id>.json
- 18J811-1：解析任务03B目录（章节起始页偏移表 + 节目录），section 粒度：atlas页/PDF页/图名
- 20J813：有文字层，直接逐页取首行图名
"""
import json, os, re
import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.join(ROOT, "repo")
OUT = os.path.join(REPO, "data", "atlas")
os.makedirs(OUT, exist_ok=True)

# 章节起始 PDF 页（任务03B 验收修正版）
OFFSETS = {"1": 8, "2": 9, "3": 15, "4": 56, "5": 68, "6": 162, "7": 198,
           "8": 216, "9": 227, "10": 229, "11": 234, "12": 247, "FL": 250}

def build_18j():
    md = open(os.path.join(ROOT, "_outsource", "任务03B结果_18J811-1图集目录.md"), encoding="utf-8").read()
    entries = [{"pdf_page": 1, "atlas_page": "封面", "title": "封面/扉页"},
               {"pdf_page": 5, "atlas_page": "目录1", "title": "目录"},
               {"pdf_page": 7, "atlas_page": "3", "title": "编制说明"}]
    # 形如 "- 3.4 厂房的防火间距 ... 3-19" 或 "**3 厂房和仓库**"
    for m in re.finditer(r"^\s*-\s+(?:\*\*)?(\d+(?:\.\d+)?)\s+(.+?)(?:\*\*)?\s*[.…·]+\s*(\d+-\d+|FL-\d+|\d+)\s*$", md, re.M):
        num, title, ap = m.group(1), m.group(2).strip(), m.group(3)
        if num.count(".") == 0:
            continue  # 章级行跳过（有节级起始页）
        ch = num.split(".")[0]
        if ch not in OFFSETS:
            continue
        y = int(ap.split("-")[1])
        entries.append({"pdf_page": OFFSETS[ch] + y - 1, "atlas_page": ap,
                        "title": f"{num} {title}"})
    # 附录
    for m in re.finditer(r"附录\s*([A-D]).{0,30}?\.{4,}\s*FL-(\d+)", md):
        entries.append({"pdf_page": 250 + int(m.group(2)) - 1,
                        "atlas_page": f"FL-{m.group(2)}", "title": f"附录{m.group(1)}"})
    entries.sort(key=lambda e: e["pdf_page"])
    out = {"id": "18J811-1", "name": "建筑设计防火规范图示（2019更正版）", "total_pages": 276, "entries": entries}
    json.dump(out, open(os.path.join(OUT, "18j811-1.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"18J811-1: {len(entries)} 个目录项")

def build_20j():
    entries = []
    path = os.path.join(ROOT, "00-国标", "20J813：《民用建筑设计统一标准》图示.pdf")
    with pdfplumber.open(path) as pdf:
        n = len(pdf.pages)
        for pno, page in enumerate(pdf.pages, 1):
            t = (page.extract_text() or "").strip()
            lines = [l.strip() for l in t.splitlines() if l.strip()]
            title = ""
            for l in lines:
                if 4 < len(l) < 40 and not re.match(r"^\d+$", l):
                    title = l
                    break
            entries.append({"pdf_page": pno, "atlas_page": str(pno), "title": title or f"第{pno}页"})
    out = {"id": "20J813", "name": "民用建筑设计统一标准图示", "total_pages": n, "entries": entries}
    json.dump(out, open(os.path.join(OUT, "20j813.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"20J813: {len(entries)} 页")

if __name__ == "__main__":
    build_18j()
    build_20j()
