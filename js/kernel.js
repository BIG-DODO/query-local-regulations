/*
 * kernel.js — 地方规范查询工具 检索/筛选/版本判断内核（纯函数，双端导出）
 * 约定（见《小程序集成约定》）：
 *   - 禁止 document/window/localStorage/fetch/alert 与 Node 内置模块
 *   - 入参出参均为 plain object；错误用 {error} 返回，不 throw
 *   - 数据由页面层加载后注入，内核不直接 fetch
 */
(function (global) {
  'use strict';
  const NS = {};

  /* ---------- 23 类标签（v1.2 定稿，勿改 label 字面量） ---------- */
  const CATEGORIES = [
    { id: 1,  group: '规划', label: '用地规划指标',       keywords: ['容积率', '建筑密度', '限高', '建筑高度', 'M0', 'M1', 'M2', 'M3', '用地性质'] },
    { id: 2,  group: '规划', label: '工业用地绿地率',     keywords: ['绿地率'] },
    { id: 3,  group: '规划', label: '计容面积规则',       keywords: ['计容', '建筑面积计算', '双倍计容', '核增', '核减', '架空层', '阳台', '地下室'] },
    { id: 4,  group: '规划', label: '工业用地配套用房占比', keywords: ['配套用房', '行政办公', '生活服务设施', '配套设施'] },
    { id: 5,  group: '规划', label: '车位配建',           keywords: ['停车', '车位', '配建', '机动车', '非机动车'] },
    { id: 6,  group: '规划', label: '日照要求',           keywords: ['日照', '大寒日', '冬至日'] },
    { id: 7,  group: '规划', label: '建筑间距',           keywords: ['建筑间距', '间距', '防火间距'] },
    { id: 8,  group: '规划', label: '连续面宽',           keywords: ['面宽', '连续面宽'] },
    { id: 9,  group: '规划', label: '建筑物退让',         keywords: ['退让', '退界', '退线', '退距', '蓝线', '绿线', '高压'] },
    { id: 10, group: '规划', label: '地下建筑退让',       keywords: ['地下空间', '地下建筑', '覆土'] },
    { id: 11, group: '规划', label: '海绵城市',           keywords: ['海绵', '径流'] },
    { id: 12, group: '政策', label: '市政配套费',         keywords: ['配套费', '市政公用'] },
    { id: 13, group: '政策', label: '产业扶持',           keywords: ['出让金', '地价', '工业上楼', '扶持'] },
    { id: 14, group: '建筑', label: '消防规范',           keywords: ['消防', '防火', '丙类', '丁类', '戊类', '疏散'] },
    { id: 15, group: '结构', label: '装配式建筑',         keywords: ['装配式', '预制', '装配率'] },
    { id: 16, group: '机电', label: '供电标准',           keywords: ['供电', '用电', '负荷', '变电'] },
    { id: 17, group: '政策', label: '土地出让年限与方式', keywords: ['出让年限', '弹性年期', '先租后让', '租赁'] },
    { id: 18, group: '政策', label: '分割转让政策',       keywords: ['分割转让', '分割', '转让'] },
    { id: 19, group: '政策', label: '工业上楼专项',       keywords: ['工业上楼', '上楼'] },
    { id: 20, group: '政策', label: '低效用地再开发',     keywords: ['低效', '再开发', '盘活', '存量'] },
    { id: 21, group: '政策', label: '招商准入门槛',       keywords: ['亩均', '投资强度', '准入', '产业目录'] },
    { id: 22, group: '政策', label: '税收返还/优惠',      keywords: ['税收', '优惠', '返还', '补贴'] },
    { id: 23, group: '政策', label: '环评/安评特殊要求',  keywords: ['环评', '环境影响', '安评', '防护距离', '排放'] }
  ];
  NS.CATEGORIES = CATEGORIES;

  const REGIONS = ['长三角', '华南', '北方', '中西部'];
  NS.REGIONS = REGIONS;

  /* ---------- 查询分词：按空白拆，去空 ---------- */
  function tokenize(query) {
    if (typeof query !== 'string') return [];
    return query.split(/[\s,，、]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  NS.tokenize = tokenize;

  function countOccur(hay, needle) {
    if (!hay || !needle) return 0;
    let n = 0, i = hay.indexOf(needle);
    while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }

  /* ---------- 摘要片段：以首个命中词为中心开窗，命中词包 <mark> ---------- */
  function snippet(text, tokens, win) {
    win = win || 60;
    if (!text) return '';
    let pos = -1;
    for (let t = 0; t < tokens.length; t++) {
      const p = text.indexOf(tokens[t]);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos === -1) pos = 0;
    const start = Math.max(0, pos - Math.floor(win / 2));
    const end = Math.min(text.length, pos + win);
    let s = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    tokens.forEach(function (tk) {
      s = s.split(tk).join('<mark>' + tk + '</mark>');
    });
    return s;
  }
  NS.snippet = snippet;

  /* ---------- 全文检索 ----------
   * corpusData: 单个语料 JSON（{city, doc, articles:[...]}）
   * query: 空白分隔多词，AND 语义
   * opts: { categoryId, limit }
   * 返回 { results: [...], total } 或 { error }
   */
  function search(corpusData, query, opts) {
    if (!corpusData || !Array.isArray(corpusData.articles)) return { error: 'corpus invalid' };
    opts = opts || {};
    const tokens = tokenize(query);
    if (tokens.length === 0 && !opts.categoryId) return { results: [], total: 0 };
    let pool = corpusData.articles;
    if (opts.categoryId) pool = filterByCategory(pool, opts.categoryId);
    const out = [];
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      const title = (a.chapter || '') + ' ' + (a.section || '') + ' ' + (a.article || '');
      let score = 0, ok = true;
      for (let t = 0; t < tokens.length; t++) {
        const tk = tokens[t];
        const inTitle = countOccur(title, tk);
        const inText = countOccur(a.text, tk);
        if (inTitle + inText === 0) { ok = false; break; }
        score += inTitle * 3 + inText;
      }
      if (!ok) continue;
      out.push({
        id: a.id, city: corpusData.city, doc: corpusData.doc,
        chapter: a.chapter, section: sectionOf(a), article: a.article,
        page: a.page, score: score,
        snippet: snippet(a.text, tokens)
      });
    }
    out.sort(function (x, y) { return y.score - x.score; });
    const total = out.length;
    const limit = opts.limit || 50;
    return { results: out.slice(0, limit), total: total };
  }
  NS.search = search;

  function sectionOf(a) { return a.section || ''; }

  /* ---------- 类别筛选：关键词预映射（后续可由人工标注升级） ---------- */
  function filterByCategory(articles, categoryId) {
    const cat = null;
    let target = null;
    for (let i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === Number(categoryId)) { target = CATEGORIES[i]; break; }
    }
    if (!target) return [];
    return articles.filter(function (a) {
      const s = (a.chapter || '') + ' ' + (a.section || '') + ' ' + (a.article || '') + ' ' + (a.text || '');
      for (let k = 0; k < target.keywords.length; k++) {
        if (s.indexOf(target.keywords[k]) !== -1) return true;
      }
      return false;
    });
  }
  NS.filterByCategory = filterByCategory;

  /* ---------- 版本状态判断 ----------
   * cityEntry: versions.json 中单个城市对象
   * today: 'YYYY-MM-DD'
   * staleDays: 标黄阈值（默认 90）
   * 返回 { light: 'green'|'yellow'|'gray', stale, days, notes[] }
   * 规则：无 verified_at 或 confidence=低 → gray（未核验）
   *       days > staleDays → stale=true（标黄）
   *       watch 非空或主规定 status 含"过渡/试行/延期/临近" → yellow
   */
  function versionStatus(cityEntry, today, staleDays) {
    staleDays = staleDays || 90;
    const res = { light: 'green', stale: false, days: null, notes: [] };
    if (!cityEntry) return { light: 'gray', stale: false, days: null, notes: ['无版本记录'] };
    if (cityEntry.confidence === '低' || !cityEntry.verified_at) {
      res.light = 'gray';
      res.notes.push('未核验或置信度低');
    }
    if (cityEntry.verified_at && today) {
      const d = Math.floor((Date.parse(today) - Date.parse(cityEntry.verified_at)) / 86400000);
      res.days = d;
      if (d > staleDays) { res.stale = true; res.notes.push('核验已超 ' + staleDays + ' 天'); }
    }
    const watch = cityEntry.watch || [];
    const mainStatus = (cityEntry.regulations && cityEntry.regulations[0] && cityEntry.regulations[0].status) || '';
    if (watch.length > 0 || /过渡|延期|临近|征求意见|编制中/.test(mainStatus)) {
      if (res.light === 'green') res.light = 'yellow';
      watch.forEach(function (w) { res.notes.push(w); });
      if (/过渡|延期|临近|征求意见|编制中/.test(mainStatus)) res.notes.push(mainStatus);
    }
    if (res.stale && res.light === 'green') res.light = 'yellow';
    return res;
  }
  NS.versionStatus = versionStatus;

  /* ---------- 城市分组（侧栏，按用户文件夹目录：fgroup） ---------- */
  const FGROUPS = ['江苏省', '福建省', '广东省', '山东省', '浙江省', '直辖市', '其他省会城市'];
  NS.FGROUPS = FGROUPS;

  function groupCities(versionsData) {
    const groups = {};
    FGROUPS.forEach(function (g) { groups[g] = []; });
    (versionsData.cities || []).forEach(function (c) {
      const g = c.fgroup || '其他省会城市';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });
    return groups;
  }
  NS.groupCities = groupCities;

  global.RegulationKernel = NS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) {
  const _g = typeof window !== 'undefined' ? window : globalThis;
  module.exports = _g.RegulationKernel;
}
