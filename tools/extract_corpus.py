# -*- coding: utf-8 -*-
"""
extract_corpus.py — 规范原文 PDF → 语料 JSON（条文级，含页码/表格/原文截图）

用法（在 03-work-地方规范查询工具 目录下运行）：
    python repo/tools/extract_corpus.py 青岛            # 单个
    python repo/tools/extract_corpus.py 青岛 --shots    # 同时渲染原文页截图
    python repo/tools/extract_corpus.py --batch         # 全部配置
    python repo/tools/extract_corpus.py --list          # 列出配置

pattern 类型：
  tiao    —— 第X章/第X节/第X条（中文数字）
  numeric —— x.x.x 数字条（兼容全角．）；章可为 第N章
  paren   —— 一、二、为节；（一）（二）为条
"""
import json, os, re, sys

import pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.join(ROOT, "repo")
CN = "一二三四五六七八九十百零〇两"

PATTERNS = {
    "tiao": {
        "chapter": rf"^第[{CN}]+章", "section": rf"^第[{CN}]+节", "article": rf"^第[{CN}]+条",
    },
    "numeric": {
        "chapter": r"^第\d+章", "section": r"^\d+\.\d+\s+\D", "article": r"^\d+(\.\d+){2,}",
    },
    "paren": {
        "chapter": r"^$", "section": rf"^[{CN}]+、", "article": rf"^（[{CN}]+）",
    },
    "chengdu": {  # 成都2024分册：第X章 → x.x/x.x.x 节 → "1."式条文
        "chapter": rf"^第[{CN}]+章", "section": r"^\d+\.\d+(?:\.\d+)?(?!\d)", "article": r"^\d+[、．.](?!\d)",
    },
}

DOCS = {
    "青岛": {"doc_id": "qingdao-2025", "city": "青岛", "doc": "青岛市国土空间规划管理技术规定（试行）",
        "doc_version": "2025-06-30施行", "pdf": "04山东省/青岛/青岛市国土空间规划管理技术规定（试行）2025版.pdf",
        "pattern": "tiao", "stop_marker": "附录一", "page_footer": r"^\d{1,3}$"},
    "上海": {"doc_id": "shanghai-2010", "city": "上海", "doc": "上海市城市规划管理技术规定（土地使用建筑管理）",
        "doc_version": "2003令12号+2010令52号修正", "pdf": "06直辖市/上海/上海市城市规划管理技术规定（土地使用建筑管理）/上海市城市规划管理技术规定（土地使用建筑管理）.pdf",
        "pattern": "tiao", "stop_marker": "附录一"},
    "济南": {"doc_id": "jinan-2026", "city": "济南", "doc": "济南市国土空间规划管理技术规定",
        "doc_version": "2026-04-15施行", "pdf": "04山东省/济南/济南市国土空间规划管理技术规定2026版.pdf",
        "pattern": "tiao", "stop_marker": "附录"},
    "广州": {"doc_id": "guangzhou-2019", "city": "广州", "doc": "广州市城乡规划技术规定",
        "doc_version": "令71号+168号第三次修订", "pdf": "03广东省/广州/广州市城乡规划技术规定.pdf",
        "pattern": "tiao", "stop_marker": "附录"},
    "重庆": {"doc_id": "chongqing-2018", "city": "重庆", "doc": "重庆市城市规划管理技术规定",
        "doc_version": "渝府令318号 2018-03-01施行", "txt": "06直辖市/重庆/重庆市城市规划管理技术规定（渝府令318号·全文）.txt",
        "pattern": "tiao", "stop_marker": "附录",
        "source_url": "https://www.cq.gov.cn/zwgk/zfxxgkml/szfwj/zfgz/zfgz/201801/t20180127_8836458.html"},
    "深圳": {"doc_id": "shenzhen-2025", "city": "深圳", "doc": "深圳市城市规划标准与准则（2025修订汇总版）",
        "doc_version": "2025-11-04发布（20251112）", "pdf": "03广东省/深圳/深圳市城市规划标准与准则（2025修订汇总版）/《深圳市城市规划标准与准则》（修订汇总版）20251112/《深圳市城市规划标准与准则》修订汇总版20251112.pdf",
        "pattern": "numeric", "dedup_ocr": True, "stop_marker": "附录",
        "line_deny": [r"^\d+\s*深圳市城市规划标准与准则$", r"^深圳市城市规划标准与准则\s*\d*$"]},
    "江苏省规2025": {"doc_id": "jiangsu-2025", "city": "江苏省", "doc": "江苏省城市规划管理技术规定（2025年版）",
        "doc_version": "苏自然资发〔2025〕291号 2026-03-01施行", "pdf": "01江苏省/江苏省城市规划管理技术规定2025.pdf",
        "pattern": "numeric", "stop_marker": "附录"},
    "郑州": {"doc_id": "zhengzhou-2024", "city": "郑州", "doc": "郑州市城市规划管理技术规定",
        "doc_version": "郑政〔2024〕18号 2024-12-06印发", "pdf": "07其他省份省会城市/郑州/郑州市城市规划管理技术规定-郑政2024-18号.pdf",
        "pattern": "numeric", "attachment_articles": True},
    "成都": {"doc_id": "chengdu-2024", "city": "成都", "doc": "成都市城市规划管理技术规定（2024）用地和建筑分册",
        "doc_version": "成府复〔2024〕41号", "pdf": "07其他省份省会城市/成都/城市规划管理技术规定（2024）用地和建筑分册.pdf",
        "pattern": "chengdu", "stop_marker": "附录"},
    "杭州": {"doc_id": "hangzhou-2026", "city": "杭州", "doc": "杭州市城市规划管理技术规定",
        "doc_version": "杭规划资源发〔2026〕4号 2026-04-01施行", "pdf": "05浙江省/杭州/杭州市城市规划管理技术规定.pdf",
        "pattern": "paren", "stop_marker": "附录"},
    "GB55037": {"doc_id": "gb55037-2022", "city": "国标", "doc": "GB 55037-2022 建筑防火通用规范",
        "doc_version": "2022", "pdf": "00-国标/GB55037-2022 建筑防火通用规范（文字版）.pdf",
        "pattern": "numeric", "stop_marker": "附录"},
    "GB50016": {"doc_id": "gb50016-2018", "city": "国标", "doc": "GB 50016-2014（2018年版）建筑设计防火规范",
        "doc_version": "2018年版", "pdf": "00-国标/GB+50016-2014(2018年版)+建筑设计防火规范.pdf",
        "pattern": "numeric", "stop_marker": "附录"},
    "JGJ100": {"doc_id": "jgj100-2015", "city": "国标", "doc": "JGJ 100-2015 车库建筑设计规范",
        "doc_version": "2015", "pdf": "00-国标/JGJ100-2015 车库建筑设计规范.pdf",
        "pattern": "numeric", "stop_marker": "附录"},
    "JGJ36": {"doc_id": "jgj36-2016", "city": "国标", "doc": "JGJ 36-2016 宿舍建筑设计规范",
        "doc_version": "2016", "pdf": "00-国标/宿舍建筑设计规范JGJ+36-2016.pdf",
        "pattern": "numeric", "stop_marker": "附录"},
    "GBT50353": {"doc_id": "gbt50353-2013", "city": "国标", "doc": "GB/T 50353-2013 建筑工程建筑面积计算规范",
        "doc_version": "2013", "pdf": "00-国标/GBT50353-2013建筑工程建筑面积计算规范.pdf",
        "pattern": "numeric", "stop_marker": "附录", "line_deny": [r"^https?://"]},
}

TOC_DOTS = re.compile(r"\.{4,}|…{2,}|·{4,}")


def dedup_line(s):
    """OCR 重影修复（深圳2025汇总版）：整行单字双写 + 行内双字词双写"""
    n = len(s)
    if n >= 4 and n % 2 == 0:
        pairs = sum(1 for i in range(0, n - 1, 2) if s[i] == s[i + 1])
        if pairs / (n // 2) > 0.6:
            return "".join(s[i] for i in range(0, n, 2))
    # 行内单字双写（大大类类→大类）：该行有 ≥2 处双写才触发，避免误伤"人人"类合法词
    if len(re.findall(r"(.)\1", s)) >= 2:
        s = re.sub(r"(.)\1", r"\1", s)
    return s


def clean_lines(text, cfg):
    out = []
    footer = cfg.get("page_footer")
    deny = [re.compile(p) for p in cfg.get("line_deny", [])]
    for ln in (text or "").splitlines():
        s = ln.strip()
        if not s:
            continue
        s = s.replace("．", ".").replace("。", "。")  # 全角点归一
        if footer and re.match(footer, s):
            continue
        if TOC_DOTS.search(s):
            continue
        if any(d.search(s) for d in deny):
            continue
        if cfg.get("dedup_ocr"):
            s = dedup_line(s)
        out.append(s)
    return out


def extract(key, with_shots=False):
    cfg = DOCS[key]
    pat = {k: re.compile(v) for k, v in PATTERNS[cfg["pattern"]].items() if v != "^$"}
    articles = []
    cur = None
    chapter, section = "", ""
    stopped = False

    if cfg.get("txt"):
        # 纯文本输入（如重庆 .doc 经 antiword 转出的全文），无页码/表格
        with open(os.path.join(ROOT, cfg["txt"]), encoding="utf-8", errors="ignore") as f:
            for ln in clean_lines(f.read(), cfg):
                if cfg.get("stop_marker") and cur is not None and ln.startswith(cfg["stop_marker"]):
                    break
                if "chapter" in pat and pat["chapter"].match(ln):
                    chapter = ln; section = ""; continue
                if not chapter and cfg["pattern"] == "tiao":
                    continue
                if "section" in pat and pat["section"].match(ln):
                    section = ln; continue
                m = pat["article"].match(ln)
                if m:
                    if cur:
                        articles.append(cur)
                    cur = {"chapter": chapter, "section": section, "article": m.group(0),
                           "page": None, "text": ln, "pages": []}
                    continue
                if cur is None:
                    continue
                cur["text"] += "\n" + ln
            if cur:
                articles.append(cur)
        return finalize(key, cfg, articles, with_shots)

    pdf_path = os.path.join(ROOT, cfg["pdf"])

    with pdfplumber.open(pdf_path) as pdf:
        page_tables = {}
        for pno, page in enumerate(pdf.pages, start=1):
            try:
                tbls = page.extract_tables()
                if tbls:
                    page_tables[pno] = tbls
            except Exception:
                pass

        for pno, page in enumerate(pdf.pages, start=1):
            if stopped:
                break
            for ln in clean_lines(page.extract_text(), cfg):
                sm = cfg.get("stop_marker")
                if cur is not None and len(articles) >= 10 and sm and (ln.startswith(sm) or ln == sm.rstrip("一二三四五六七八九十")):
                    stopped = True  # 正文达到一定条数后才响应截断标记，防前言/目录误触发
                    break
                if "chapter" in pat and pat["chapter"].match(ln):
                    chapter = ln
                    section = ""
                    continue
                if not chapter and cfg["pattern"] == "tiao":
                    continue  # 前言丢弃（第一章之前）
                if "section" in pat and pat["section"].match(ln):
                    section = ln
                    continue
                am = cfg.get("attachment_articles") and re.match(r"^附件\s*\d+", ln)
                m = pat["article"].match(ln)
                if m or am:
                    if cur:
                        articles.append(cur)
                    cur = {"chapter": chapter, "section": section, "article": am.group(0) if am else m.group(0),
                           "page": pno, "text": ln, "pages": [pno]}
                    continue
                if cur is None:
                    continue
                cur["text"] += "\n" + ln
                if pno != cur["pages"][-1]:
                    cur["pages"].append(pno)
        if cur:
            articles.append(cur)

    for art in articles:
        tbls = []
        for pno in art["pages"]:
            for t in page_tables.get(pno, []):
                tbls.append({"page": pno, "rows": t})
        if tbls:
            art["tables"] = tbls

    return finalize(key, cfg, articles, with_shots)


def finalize(key, cfg, articles, with_shots):
    for i, art in enumerate(articles, start=1):
        art["id"] = f"{cfg['doc_id']}-{i:03d}"
        art["source_path"] = cfg.get("source_url") or f"{cfg.get('pdf', cfg.get('txt'))}#page={art['page']}"

    out = {"city": cfg["city"], "doc": cfg["doc"], "doc_version": cfg["doc_version"],
           "doc_id": cfg["doc_id"], "article_count": len(articles), "articles": articles}
    os.makedirs(os.path.join(REPO, "data", "corpus"), exist_ok=True)
    out_path = os.path.join(REPO, "data", "corpus", f"{cfg['doc_id']}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{key}: {len(articles)} 条 -> {cfg['doc_id']}.json ({os.path.getsize(out_path)//1024}KB)")

    if with_shots and cfg.get("pdf"):
        shots_dir = os.path.join(ROOT, "_corpus_shots", cfg["doc_id"])
        os.makedirs(shots_dir, exist_ok=True)
        with pdfplumber.open(os.path.join(ROOT, cfg["pdf"])) as pdf:
            for pno, page in enumerate(pdf.pages, start=1):
                fp = os.path.join(shots_dir, f"p{pno:03d}.png")
                if not os.path.exists(fp):
                    page.to_image(resolution=110).save(fp)
        print(f"  截图 -> {shots_dir} ({len(os.listdir(shots_dir))} 张)")
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--list" in sys.argv:
        for k, v in DOCS.items():
            print(f"{k}: {v['doc']} [{v['pattern']}]")
        sys.exit(0)
    keys = list(DOCS) if "--batch" in sys.argv else (args or ["青岛"])
    for k in keys:
        try:
            extract(k, with_shots="--shots" in sys.argv)
        except Exception as e:
            print(f"{k}: FAILED {e}")
