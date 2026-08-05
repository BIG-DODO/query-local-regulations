# -*- coding: utf-8 -*-
"""
md2corpus.py — 把外包转写的国标 markdown 转为语料 JSON
支持格式：[[page N]] 页标记 / # 章 / ## 节 / **X.X.X** 或 X.X.X 条号 / markdown 表格保留为文本
用法：python repo/tools/md2corpus.py  （处理内置清单）
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.join(ROOT, "repo")
OUTSRC = os.path.join(ROOT, "_outsource")

DOCS = {
    "GB55025": {"doc_id": "gb55025-2022", "doc": "GB 55025-2022 宿舍、旅馆建筑项目规范",
                "doc_version": "2022", "src": "任务05结果_GB55025转写.md"},
    "GB55031": {"doc_id": "gb55031-2022", "doc": "GB 55031-2022 民用建筑通用规范",
                "doc_version": "2022", "src": "任务05结果_GB55031转写.md"},
    "GB50352": {"doc_id": "gb50352-2019", "doc": "GB 50352-2019 民用建筑设计统一标准",
                "doc_version": "2019", "src": "任务05结果_GB50352转写.md"},
}

RE_PAGE = re.compile(r"^\[\[page (\d+)\]\]")
RE_CH = re.compile(r"^#\s+(\d+)\s+(.+)")
RE_SEC = re.compile(r"^##?\s+(\d+\.\d+)\s+(.+)")
RE_ART = re.compile(r"^\*\*(\d+\.\d+\.\d+)\*\*|^(\d+\.\d+\.\d+)\s")

def convert(key):
    cfg = DOCS[key]
    lines = open(os.path.join(OUTSRC, cfg["src"]), encoding="utf-8").read().splitlines()
    articles = []
    cur = None
    chapter, section, page = "", "", None
    started = False
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        pm = RE_PAGE.match(s)
        if pm:
            page = int(pm.group(1))
            continue
        cm = RE_CH.match(s)
        if cm:
            chapter = f"第{cm.group(1)}章 {cm.group(2).strip()}"
            continue
        sm = RE_SEC.match(s)
        if sm:
            section = f"{sm.group(1)} {sm.group(2).strip()}"
            continue
        am = RE_ART.match(s)
        if am:
            num = am.group(1) or am.group(2)
            if not num.startswith(("0", "1", "2")) and chapter == "":
                continue
            started = True
            if cur:
                articles.append(cur)
            text = RE_ART.sub(num, s, count=1)
            cur = {"chapter": chapter, "section": section, "article": num,
                   "page": page, "text": text, "pages": [page] if page else []}
            continue
        if cur is None:
            continue
        cur["text"] += "\n" + s
        if page and (not cur["pages"] or page != cur["pages"][-1]):
            cur["pages"].append(page)
    if cur:
        articles.append(cur)

    for i, a in enumerate(articles, 1):
        a["id"] = f"{cfg['doc_id']}-{i:03d}"
        a["source_path"] = f"00-国标转写#page={a['page']}"
    out = {"city": "国标", "doc": cfg["doc"], "doc_version": cfg["doc_version"],
           "doc_id": cfg["doc_id"], "article_count": len(articles), "articles": articles}
    out_path = os.path.join(REPO, "data", "corpus", f"{cfg['doc_id']}.json")
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{key}: {len(articles)} 条 -> {cfg['doc_id']}.json ({os.path.getsize(out_path)//1024}KB)")

if __name__ == "__main__":
    for k in DOCS:
        convert(k)
