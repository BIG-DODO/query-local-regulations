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

    # ---- 第二批：L2/L3 城市主规定 ----
    "福州": {"doc_id": "fuzhou-2024", "city": "福州", "doc": "福州市国土空间规划管理技术规定（试行）",
        "doc_version": "榕自然规〔2024〕1号", "pdf": "02福建省/福州/福州市城市规划管理技术规定2024.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "泉州": {"doc_id": "quanzhou-2018", "city": "泉州", "doc": "泉州市城市规划管理技术规定（2018年版）",
        "doc_version": "泉政办函〔2018〕11号", "pdf": "02福建省/泉州/泉州市城市规划管理技术规定（2018年版）.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "漳州": {"doc_id": "zhangzhou-2026", "city": "漳州", "doc": "漳州市国土空间规划管理技术规定",
        "doc_version": "2026-02印发", "pdf": "02福建省/漳州/漳州市国土空间规划管理技术规定.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "厦门": {"doc_id": "xiamen-2016", "city": "厦门", "doc": "厦门市城乡规划管理技术规定（2016年版）",
        "doc_version": "厦府〔2016〕408号+补充规定（一）~（十二）", "pdf": "02福建省/厦门/厦门市城乡规划管理技术规定(2016年版) (1).pdf", "pattern": "tiao", "stop_marker": "附录"},
    "福建省规": {"doc_id": "fujian-2017", "city": "福建省", "doc": "福建省城市规划管理技术规定",
        "doc_version": "闽政文〔2017〕33号", "pdf": "02福建省/2017年03月01号执行福建省城市规划管理技术规定.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "宁波": {"doc_id": "ningbo-2014", "city": "宁波", "doc": "宁波市城乡规划管理技术规定",
        "doc_version": "甬政发〔2014〕74号", "pdf": "05浙江省/宁波/宁波市城乡规划管理技术规定.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "台州": {"doc_id": "taizhou-2025", "city": "台州", "doc": "台州市城乡规划管理技术规定（建筑管理）2025版",
        "doc_version": "台自然资规发〔2025〕3号", "pdf": "05浙江省/台州/台州市城乡规划管理技术规定（建筑管理）2025版.pdf", "pattern": "paren", "stop_marker": "附录"},
    "嘉兴": {"doc_id": "jiaxing-2018", "city": "嘉兴", "doc": "嘉兴市城市规划管理技术规定",
        "doc_version": "2004批复+2015修订+2018局修", "pdf": "05浙江省/嘉兴/2018嘉兴市城市规划管理技术规定.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "珠海": {"doc_id": "zhuhai-2021", "city": "珠海", "doc": "珠海市城市规划技术标准与准则（2021版）",
        "doc_version": "2021版+2024局部修订", "pdf": "03广东省/珠海/珠海市城市规划技术标准与准则（2021 版）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "东莞": {"doc_id": "dongguan-2020", "city": "东莞", "doc": "东莞市城市规划管理技术规定（2020年文件汇编）",
        "doc_version": "东自然资〔2020〕266号", "pdf": "03广东省/东莞/【东莞市】城市规划管理技术规定.pdf", "pattern": "paren", "stop_marker": "附录"},
    "佛山": {"doc_id": "foshan-2021", "city": "佛山", "doc": "佛山市城市规划管理技术规定（2020年修编版）",
        "doc_version": "佛自然资通〔2021〕175号", "pdf": "03广东省/佛山/佛山市城市规划管理技术规定（2020年修编版）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "惠州": {"doc_id": "huizhou-2026", "city": "惠州", "doc": "惠州市城乡规划管理技术规定（2026年）",
        "doc_version": "2026-06-28批复", "pdf": "03广东省/惠州/惠州城市规划管理技术规定2026.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "江门": {"doc_id": "jiangmen-2026", "city": "江门", "doc": "江门市国土空间规划技术标准与准则",
        "doc_version": "2026-01-01施行", "pdf": "03广东省/江门/江门市国土空间规划 技术标准与准则.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "武汉": {"doc_id": "wuhan-2024", "city": "武汉", "doc": "武汉市建设工程规划管理技术规定",
        "doc_version": "令248号+令322号修改", "pdf": "07其他省份省会城市/武汉/武汉市建设工程规划管理技术规定（248号令+322号令修改·官方文字版）.pdf", "pattern": "paren", "stop_marker": "附表"},
    "南昌": {"doc_id": "nanchang-2014", "city": "南昌", "doc": "南昌市城市规划管理技术规定",
        "doc_version": "2014-11-01施行", "pdf": "07其他省份省会城市/南昌/南昌市城市规划管理技术规定2014版.pdf", "pattern": "paren", "stop_marker": "附录"},
    "南宁": {"doc_id": "nanning-2011", "city": "南宁", "doc": "南宁市城市规划管理技术规定（2011年版）",
        "doc_version": "2011年版", "pdf": "07其他省份省会城市/南宁/南宁市城市规划管理技术规定2011版.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "合肥": {"doc_id": "hefei-2013", "city": "合肥", "doc": "合肥市控制性详细规划通则（试行）",
        "doc_version": "2013-07-01施行", "pdf": "07其他省份省会城市/合肥/合肥市控制性详细规划通则（试行）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "淄博": {"doc_id": "zibo-2005", "city": "淄博", "doc": "淄博市城市规划管理技术规定",
        "doc_version": "2005年版", "pdf": "04山东省/淄博/淄博市城市规划管理技术规定2005年.pdf", "pattern": "tiao", "stop_marker": "附录"},
    "青岛导则": {"doc_id": "qingdao-guide-2025", "city": "青岛", "doc": "青岛市市区公共服务设施配套标准及规划导则",
        "doc_version": "青自然资规字〔2025〕39号", "pdf": "04山东省/青岛/青岛市市区公共服务设施配套标准及规划导则（青自然资规字2025-39号）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "温州停车": {"doc_id": "wenzhou-parking-2024", "city": "温州", "doc": "温州市区建筑工程停车配建标准（2024）",
        "doc_version": "2024版", "pdf": "05浙江省/温州/温州市区建筑工程停车配建标准（2024）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "南昌导则": {"doc_id": "nanchang-guide", "city": "南昌", "doc": "江西省城市规划管理技术导则-南昌市",
        "doc_version": "现行", "pdf": "07其他省份省会城市/南昌/江西省城市规划管理技术导则-南昌市（含表8配建标准）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "北京DB": {"doc_id": "beijing-dbt1813-2020", "city": "北京", "doc": "北京市公共建筑机动车停车配建指标",
        "doc_version": "DB11/T 1813-2020", "pdf": "06直辖市/北京/北京市公共建筑机动车停车配建指标（DB11T1813-2020）.pdf", "pattern": "numeric", "stop_marker": "附录"},
    "天津990": {"doc_id": "tianjin-db990-2020", "city": "天津", "doc": "DB12/T 990-2020 建筑类建设工程规划许可证设计方案规范",
        "doc_version": "2021-01-16实施", "pdf": "06直辖市/天津/DB12T+990-2020建筑类建设工程规划许可证设计方案规范.pdf", "pattern": "numeric", "stop_marker": "附录"},
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
