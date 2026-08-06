# -*- coding: utf-8 -*-
"""
md2corpus2.py — 通用 markdown 转语料 JSON（任务⑧产出物专用）
配置驱动：chapter/section/article 正则 + 多文件合并（天津1040 = 聚合版 + 补充5-7章）
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.join(ROOT, "repo")
OUTSRC = os.path.join(ROOT, "_outsource")

DOCS = {
    "tianjin-db1040": {
        "city": "天津", "doc": "DB12/T 1040-2021 建筑工程规划管理技术规范",
        "doc_version": "2021-03-15实施",
        "src": ["任务08结果_天津DB12T1040-2021文字版.md", "任务08结果_天津DB12T1040-2021文字版_补充5-7章.md"],
        "chapter": r"^#\s+(\d+\s+.+)", "section": r"^##\s+(\d+\.\d+\s*.*)", "article": r"^###\s*(\d+\.\d+\.\d+)",
        "note": "聚合版+扫描件补转写（5、6.1-6.2、7章）；3处表格占位",
    },
    "xian-2018": {
        "city": "西安", "doc": "西安市城乡规划管理技术规定（试行—第二版）",
        "doc_version": "2018-06印发",
        "src": ["任务08结果_西安市城乡规划管理技术规定转写.md"],
        "chapter": r"^#\s+(第.+[部分章].*)", "section": r"^#{2,3}\s+(第.+节.*)", "article": r"^(\d+\.\d+)(?!\d)",
        "note": "RapidOCR 图像转写；表格为平铺文本；㎡ 有识别为 m 的噪声",
    },
    "beijing-tongze-2003": {
        "city": "北京", "doc": "北京地区建设工程规划设计通则（试行）",
        "doc_version": "市规发〔2003〕514号（2018废止→2020恢复）",
        "src": ["任务08结果_北京通则文字版.md"],
        "chapter": r"^#\s+(第.+章.*)", "section": r"^##\s+(第.+节.*)", "article": r"^###\s*(\d+\.\d+\.\d+)",
        "note": "源自 .doc（OLE2 解析），无页码",
    },
    # ---- 任务⑨：扫描配套文件转写（表格数值顺序不可靠，展示以截图为准） ----
    "sh-dgtj08-7": {"city": "上海", "doc": "DG/TJ 08-7-2021 建筑工程交通设计及停车库（场）设置标准",
        "doc_version": "2021", "src": ["任务09结果_上海DG TJ08-7-2021转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+\.\d+)(?!\d)",
        "note": "RapidOCR 转写；表格数值顺序以原文截图为准", "pdf_for_shots": "06直辖市/上海/DG TJ 08-7-2021 建筑工程交通设计及停车库(场)设置标准.pdf"},
    "zj-parking-std": {"city": "浙江省", "doc": "浙江省《城市建筑工程停车场（库）设置规则和配建指标标准》",
        "doc_version": "现行", "src": ["任务09结果_浙江停车配建省标转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+\.\d+)(?!\d)",
        "note": "RapidOCR 转写；表格数值顺序以原文截图为准", "pdf_for_shots": "05浙江省/《城市建筑工程停车场（库）设置规则和配建指标标准》.pdf"},
    "hz-parking-rule": {"page_mode": True, "city": "杭州", "doc": "杭州市执行浙江省停车配建标准的补充实施细则",
        "doc_version": "现行", "src": ["任务09结果_杭州补充细则转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "05浙江省/杭州/关于杭州市执行浙江省〈城市建筑工程停车场（库）设置规则和配建指标标准〉的补充实施细则.pdf"},
    "suzhou-rule1": {"city": "苏州", "doc": "苏州市实施细则之一·指标核定规则（2018年版）",
        "doc_version": "苏规规〔2018〕1号", "src": ["任务09结果_苏州指标核定规则转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "01江苏省/苏州/江苏省城市规划管理技术规定——苏州市实施细则之一“指标核定规则”（2018年版）.pdf"},
    "suzhou-rule2": {"city": "苏州", "doc": "苏州市实施细则之二·日照分析规则（2018年版）",
        "doc_version": "苏规规〔2018〕3号", "src": ["任务09结果_苏州日照分析规则转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "01江苏省/苏州/江苏省城市规划管理技术规定——苏州市实施细则之二“日照分析规则”（2018年版）.pdf"},
    "xuzhou-parking": {"city": "徐州", "doc": "徐州市建筑物配建停车设施设置标准与准则",
        "doc_version": "徐规字〔2011〕75号", "src": ["任务09结果_徐州配建标准转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "01江苏省/徐州/徐州市建筑物配建停车设施设置标准与准则-2011-75号.pdf"},
    "xian-parking": {"city": "西安", "doc": "西安市建设项目停车位配建标准",
        "doc_version": "市资源发〔2023〕3号", "src": ["任务09结果_西安配建标准通知转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "07其他省份省会城市/西安/√西安市自然资源和规划局关于印发西安市建设项目停车位配建标准的通知（印发版）.pdf"},
    "xian-parking-194": {"page_mode": True, "city": "西安", "doc": "西安市建设项目停车位配建标准实施细则（试行）",
        "doc_version": "市资源发〔2020〕194号", "src": ["任务09结果_西安194号实施细则转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "07其他省份省会城市/西安/❤市资源发〔2020〕194号关于印发《西安市建设项目停车位配建标准实施细则（试行）》的通知（最新停车位）.pdf"},
    "putian-sunlight": {"page_mode": True, "city": "莆田", "doc": "莆田市建筑工程日照分析技术管理规则",
        "doc_version": "莆自然资规〔2022〕3号", "src": ["任务09结果_莆田日照规则转写.md"],
        "chapter": r"^#\s+(.+)", "section": r"^##\s+(.+)", "article": r"^(\d+\.\d+(\.\d+)?)(?!\d)",
        "note": "RapidOCR 转写", "pdf_for_shots": "02福建省/莆田/《莆田市建筑工程日照分析技术管理规则》.pdf"},
}

RE_PAGE = re.compile(r"^\[\[page (\d+)\]\]")
RE_TOC = re.compile(r"\.{4,}|…{2,}|·{4,}")

def convert_page_mode(doc_id, cfg):
    """页级兜底：无条号结构的通知类文件，每页一条"""
    articles = []
    page = None
    buf = []
    for fname in cfg["src"]:
        for ln in open(os.path.join(OUTSRC, fname), encoding="utf-8").read().splitlines():
            s = ln.strip()
            pm = RE_PAGE.match(s)
            if pm:
                if buf and page:
                    articles.append({"chapter": "", "section": "", "article": f"第{page}页",
                                     "page": page, "text": "\n".join(buf), "pages": [page]})
                page = int(pm.group(1))
                buf = []
                continue
            if s:
                buf.append(s)
    if buf and page:
        articles.append({"chapter": "", "section": "", "article": f"第{page}页",
                         "page": page, "text": "\n".join(buf), "pages": [page]})
    for i, a in enumerate(articles, 1):
        a["id"] = f"{doc_id}-{i:03d}"
        a["source_path"] = cfg["src"][0]
    out = {"city": cfg["city"], "doc": cfg["doc"], "doc_version": cfg["doc_version"],
           "doc_id": doc_id, "note": cfg.get("note", ""), "article_count": len(articles), "articles": articles}
    out_path = os.path.join(REPO, "data", "corpus", f"{doc_id}.json")
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{doc_id}: {len(articles)} 页级条目 ({os.path.getsize(out_path)//1024}KB)")


def convert(doc_id, cfg):
    if cfg.get("page_mode"):
        return convert_page_mode(doc_id, cfg)
    articles = []
    cur = None
    chapter, section, page = "", "", None
    for fname in cfg["src"]:
        for ln in open(os.path.join(OUTSRC, fname), encoding="utf-8").read().splitlines():
            s = ln.strip()
            if not s:
                continue
            if RE_TOC.search(s):
                continue  # 目录引导点行
            pm = RE_PAGE.match(s)
            if pm:
                page = int(pm.group(1))
                continue
            cm = re.match(cfg["chapter"], s)
            if cm:
                chapter = cm.group(1).strip()
                section = ""
                continue
            sm = re.match(cfg["section"], s)
            if sm:
                if cur:
                    articles.append(cur)
                section = sm.group(1).strip()
                # 节级伪条文：聚合文本常把内容直接挂在节下（无条号），先开伪条文承接
                secnum = re.match(r"^(\d+\.\d+)", section)
                cur = {"chapter": chapter, "section": section,
                       "article": secnum.group(1) if secnum else section[:12],
                       "page": page, "text": section, "pages": [page] if page else [], "_pseudo": True}
                continue
            am = re.match(cfg["article"], s)
            if am:
                if cur:
                    if not (cur.get("_pseudo") and len(cur["text"].strip()) <= len(cur["section"]) + 2):
                        articles.append(cur)
                cur = {"chapter": chapter, "section": section, "article": am.group(1),
                       "page": page, "text": s.lstrip("#").strip(), "pages": [page] if page else []}
                continue
            if cur is None:
                continue
            cur["text"] += "\n" + s
            if page and (not cur["pages"] or page != cur["pages"][-1]):
                cur["pages"].append(page)
    if cur:
        articles.append(cur)

    for i, a in enumerate(articles, 1):
        a["id"] = f"{doc_id}-{i:03d}"
        a["source_path"] = cfg["src"][0]
    out = {"city": cfg["city"], "doc": cfg["doc"], "doc_version": cfg["doc_version"],
           "doc_id": doc_id, "note": cfg.get("note", ""), "article_count": len(articles), "articles": articles}
    out_path = os.path.join(REPO, "data", "corpus", f"{doc_id}.json")
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{doc_id}: {len(articles)} 条 ({os.path.getsize(out_path)//1024}KB)")

if __name__ == "__main__":
    for k, v in DOCS.items():
        convert(k, v)
