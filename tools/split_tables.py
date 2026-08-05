# -*- coding: utf-8 -*-
"""
split_tables.py — 把语料 JSON 里的 tables 拆到 <doc_id>.tables.json（按需懒加载）
主语料文件只保留条文文本，体积减半；表格展示/截图兜底时再加载表格文件。
幂等：无 tables 的文件跳过；已拆过的跳过。
"""
import glob, json, os

CORPUS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "corpus")

for path in sorted(glob.glob(os.path.join(CORPUS, "*.json"))):
    if path.endswith(".tables.json"):
        continue
    d = json.load(open(path, encoding="utf-8"))
    tbl = {}
    for a in d["articles"]:
        if a.get("tables"):
            tbl[a["id"]] = a.pop("tables")
    if not tbl:
        continue
    tpath = path.replace(".json", ".tables.json")
    json.dump({"doc_id": d["doc_id"], "tables": tbl}, open(tpath, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{d['doc_id']}: {len(tbl)} 条表格拆出 -> {os.path.getsize(tpath)//1024}KB，主文件剩 {os.path.getsize(path)//1024}KB")
