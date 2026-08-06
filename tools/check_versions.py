# -*- coding: utf-8 -*-
"""
check_versions.py — 40 城规范更新监测
原理：抓取 versions.json 中各城 monitor_sources 列表页，提取"标题+链接"，与上次快照比对；
     新条目命中关键词即报警（疑似版本事件），人工复核后更新台账 verified_at。
用法：
    python repo/tools/check_versions.py            # 全量检查
    python repo/tools/check_versions.py 重庆 福州   # 指定城市
快照存 repo/data/monitor_snapshot.json；报告打印 + 写 repo/data/monitor_report.md
"""
import json, os, re, sys, time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.join(ROOT, "repo")
SNAPSHOT = os.path.join(REPO, "data", "monitor_snapshot.json")
REPORT = os.path.join(REPO, "data", "monitor_report.md")

KEYWORDS = re.compile(r"技术规定|技术标准|标准与准则|配建|停车|容积率|日照|间距|退让|征求意见|废止|修订|修正|修改|失效")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}

RE_TITLE = re.compile(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*(?:title=[\"']([^\"']+)[\"'])?[^>]*>(.*?)</a>", re.S | re.I)
RE_TAG = re.compile(r"<[^>]+>")


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        return urllib.request.urlopen(req, timeout=25).read()
    except Exception:
        # 兜底：部分政府站（如 qingdao.gov.cn）与 urllib 的 TLS 握手失败，curl 正常
        import subprocess
        return subprocess.run(
            ["curl", "-s", "-L", "-A", UA["User-Agent"], "--connect-timeout", "20", url],
            capture_output=True, timeout=40).stdout


def extract_titles(html_bytes):
    for enc in ("utf-8", "gbk"):
        try:
            html = html_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return []
    out = []
    for m in RE_TITLE.finditer(html):
        href, title_attr, inner = m.group(1), m.group(2), m.group(3)
        text = (title_attr or RE_TAG.sub("", inner)).strip()
        text = re.sub(r"\s+", " ", text)
        if len(text) >= 6 and re.search(r"[一-鿿]", text):
            out.append(text)
    # 去重保序
    seen, res = set(), []
    for t in out:
        if t not in seen:
            seen.add(t)
            res.append(t)
    return res[:80]


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    versions = json.load(open(os.path.join(REPO, "data", "versions.json"), encoding="utf-8"))
    snapshot = {}
    if os.path.exists(SNAPSHOT):
        snapshot = json.load(open(SNAPSHOT, encoding="utf-8"))

    alerts, errors, checked = [], [], 0
    for c in versions["cities"]:
        city = c["city"]
        if only and city not in only:
            continue
        urls = c.get("monitor_sources") or []
        if not urls:
            continue
        for url in urls:
            checked += 1
            key = f"{city}|{url}"
            try:
                titles = extract_titles(fetch(url))
            except Exception as e:
                errors.append(f"{city} {url} 抓取失败：{str(e)[:60]}")
                continue
            old = set(snapshot.get(key, []))
            had_key = key in snapshot
            new_items = [t for t in titles if t not in old]
            hits = [t for t in new_items if KEYWORDS.search(t)]
            if had_key and hits:  # 只有存在历史快照时才报警（首次建快照不算事件）
                for t in hits[:10]:
                    alerts.append(f"{city} | {t} | {url}")
            snapshot[key] = titles
            time.sleep(0.5)

    json.dump(snapshot, open(SNAPSHOT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    lines = [f"# 监测报告 {time.strftime('%Y-%m-%d %H:%M')}", "",
             f"检查源 {checked} 个；疑似版本事件 {len(alerts)} 条；抓取失败 {len(errors)} 个", ""]
    if alerts:
        lines.append("## 疑似版本事件（命中关键词的新条目）")
        lines += [f"- {a}" for a in alerts]
    if errors:
        lines.append("\n## 抓取失败（可能反爬/改版，需人工看）")
        lines += [f"- {e}" for e in errors]
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines))
    print("\n".join(lines[:40]))
    print(f"\n快照已更新；报告 -> {REPORT}")


if __name__ == "__main__":
    main()
