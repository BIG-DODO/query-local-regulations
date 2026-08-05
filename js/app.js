/*
 * app.js — 入口逻辑：状态管理、数据加载（fetch 后注入内核）、事件绑定
 * 数据地址：默认 ./data，迁移公司服务器时只改 DATA_BASE。
 */
(function () {
  'use strict';
  const K = window.RegulationKernel;
  const R = window.RegulationRender;
  const S = window.RegulationStorage;

  const DATA_BASE = 'data'; // TODO: 迁移公司服务器时改为 https://data.example.com/regulations
  const SHOTS_BASE = 'shots'; // 原文页截图（本地 junction；上服务器后改绝对 URL）
  const TODAY = new Date().toISOString().slice(0, 10);

  function shotsFor(docId, pages) {
    if (!pages || !pages.length || !pages[0]) return [];
    return pages.map(p => `${SHOTS_BASE}/${docId}/p${String(p).padStart(3, '0')}.png`);
  }

  /* 已提取语料的城市 → doc_id */
  const CORPUS_MAP = {
    '青岛': 'qingdao-2025', '上海': 'shanghai-2010', '济南': 'jinan-2026',
    '广州': 'guangzhou-2019', '重庆': 'chongqing-2018', '深圳': 'shenzhen-2025',
    '郑州': 'zhengzhou-2024', '成都': 'chengdu-2024', '杭州': 'hangzhou-2026',
    // 江苏各市共用省规 2025（市细则语料后续补充）
    '苏州': 'jiangsu-2025', '南京': 'jiangsu-2025', '无锡': 'jiangsu-2025',
    '常州': 'jiangsu-2025', '徐州': 'jiangsu-2025', '扬州': 'jiangsu-2025',
    '盐城': 'jiangsu-2025', '连云港': 'jiangsu-2025',
    // 第二批（2026-08-05）
    '福州': 'fuzhou-2024', '泉州': 'quanzhou-2018', '漳州': 'zhangzhou-2026',
    '厦门': 'xiamen-2016', '宁波': 'ningbo-2014', '台州': 'taizhou-2025',
    '嘉兴': 'jiaxing-2018', '珠海': 'zhuhai-2021', '东莞': 'dongguan-2020',
    '佛山': 'foshan-2021', '惠州': 'huizhou-2026', '江门': 'jiangmen-2026',
    '武汉': 'wuhan-2024', '南昌': 'nanchang-2014', '南宁': 'nanning-2011',
    '合肥': 'hefei-2013', '淄博': 'zibo-2005', '莆田': 'fujian-2017',
    // 第三批（2026-08-05）
    '温州': 'wenzhou-2017', '扬州': 'yangzhou-2019', '常州': 'changzhou-2012',
    '贵阳': 'guiyang-2024'
  };

  /* 国标 → doc_id（已语料化 8 份；两份图集按页图使用） */
  const STD_MAP = {
    'GB55037-2022': 'gb55037-2022',
    'GB50016-2014(2018版)': 'gb50016-2018',
    'GB55031-2022': 'gb55031-2022',
    'GB50352-2019': 'gb50352-2019',
    'GBT50353-2013': 'gbt50353-2013',
    'JGJ100-2015': 'jgj100-2015',
    'GB55025-2022': 'gb55025-2022',
    'JGJ36-2016': 'jgj36-2016'
  };

  const state = {
    view: 'overview',
    city: null,
    std: null,          // 选中的国标 id
    categoryId: null,
    query: '',
    expanded: null,
    compareCities: [],  // 并排对比选中的城市
    compareExpanded: null
  };
  const data = {
    versions: null,
    groups: {},
    corpus: {},      // doc_id -> corpus JSON（懒加载缓存）
    corpusStatus: {}, // doc_id -> 'loading' | 'ok' | 'missing'
    policies: null   // policies.json（懒加载）
  };

  /* ---------- 数据加载 ---------- */
  function loadVersions() {
    return fetch(`${DATA_BASE}/versions.json`).then(r => r.json());
  }
  function loadDoc(docId) {
    if (!docId) return Promise.resolve(false);
    if (data.corpus[docId]) return Promise.resolve(true);
    data.corpusStatus[docId] = 'loading';
    return fetch(`${DATA_BASE}/corpus/${docId}.json`)
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(j => { data.corpus[docId] = j; data.corpusStatus[docId] = 'ok'; return true; })
      .catch(() => { data.corpusStatus[docId] = 'missing'; return false; });
  }
  function loadCorpus(city) {
    const docId = CORPUS_MAP[city];
    if (!docId) { data.corpusStatus['city:' + city] = 'missing'; return Promise.resolve(false); }
    return loadDoc(docId);
  }
  function loadPolicies() {
    if (data.policies) return Promise.resolve(true);
    return fetch(`${DATA_BASE}/policies.json`)
      .then(r => r.json())
      .then(j => { data.policies = j.data || {}; return true; })
      .catch(() => { data.policies = {}; return false; });
  }
  function policiesOf(cityEntry) {
    if (!data.policies || !cityEntry) return { city: null, prov: null };
    const prov = cityEntry.province || '';
    return {
      city: data.policies[cityEntry.city] || null,
      prov: data.policies[prov] || data.policies[prov + '省'] || data.policies[prov + '市'] || null
    };
  }
  function corpusOfCity(city) {
    return data.corpus[CORPUS_MAP[city]];
  }
  function corpusStateOfCity(city) {
    return data.corpus[CORPUS_MAP[city]] ? 'ok' : (data.corpusStatus[CORPUS_MAP[city]] || data.corpusStatus['city:' + city]);
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    R.sidebar(document.getElementById('sidebar'), data.groups,
      (data.versions && data.versions.national_standards) || [],
      state.city, onCity, onStd);
    R.catbar(document.getElementById('catbar'), state.categoryId, id => {
      state.categoryId = (state.categoryId === id ? null : id);
      if (state.categoryId && state.city && state.view !== 'search') state.view = 'search';
      renderAll();
    });
    R.tabs(document.getElementById('tabs'), state.view, v => { state.view = v; renderAll(); });
    renderView();
    persist();
  }

  function renderView() {
    const view = document.getElementById('view');
    const cityEntry = (data.versions.cities || []).find(c => c.city === state.city);
    switch (state.view) {
      case 'overview':
        if (cityEntry && !data.policies) { loadPolicies().then(renderAll); }
        {
          const p = cityEntry ? policiesOf(cityEntry) : { city: null, prov: null };
          R.overview(view, cityEntry, TODAY, p.city, p.prov);
        }
        break;
      case 'search':
        renderSearch(view);
        break;
      case 'compare':
        renderCompare(view);
        break;
      case 'standards':
        renderStandards(view);
        break;
      case 'versions':
        R.versions(view, data.versions, TODAY);
        break;
    }
  }

  function renderSearch(view) {
    if (!state.city) { R.placeholder(view, '← 请先在左侧选择城市'); return; }
    const st = corpusStateOfCity(state.city);
    if (st === 'loading') { R.placeholder(view, '语料加载中…'); return; }
    if (st === 'missing' || !corpusOfCity(state.city)) {
      R.placeholder(view, `「${state.city}」语料待提取<br>目前 L1 九城 + 江苏省规已入库，其余陆续补齐`);
      return;
    }
    if (!state.query && !state.categoryId) {
      R.placeholder(view, '输入关键词检索，或点击顶部类别标签筛选');
      return;
    }
    const corpus = corpusOfCity(state.city);
    const res = K.search(corpus, state.query, { categoryId: state.categoryId });
    if (res.error) { R.placeholder(view, '检索出错：' + res.error); return; }
    if (state.expanded) {
      const art = corpus.articles.find(a => a.id === state.expanded);
      res.results.forEach(r => { if (r.id === state.expanded && art) { r.fullText = art.text; r.shots = shotsFor(CORPUS_MAP[state.city], art.pages); } });
    }
    R.searchResults(view, res, state.query, state.expanded, id => {
      state.expanded = id;
      renderView();
    });
  }

  function renderCompare(view) {
    const available = (data.versions.cities || []).map(c => c.city).filter(c => CORPUS_MAP[c]);
    const cols = state.compareCities.map(city => {
      const corpus = corpusOfCity(city);
      if (!corpus) return { city, status: data.corpusStatus[CORPUS_MAP[city]] === 'loading' ? 'loading' : 'missing', articles: [] };
      let pool = corpus.articles;
      if (state.categoryId) pool = K.filterByCategory(pool, state.categoryId);
      if (state.query) {
        const res = K.search(corpus, state.query, { categoryId: state.categoryId, limit: 5 });
        pool = res.results.map(r => corpus.articles.find(a => a.id === r.id)).filter(Boolean);
      }
      return { city, doc: corpus.doc, docId: CORPUS_MAP[city], status: 'ok',
        articles: pool.slice(0, 5).map(a => Object.assign({}, a, { shots: shotsFor(CORPUS_MAP[city], a.pages) })) };
    });
    R.compare(view, cols, available, state.compareCities, c => {
      const i = state.compareCities.indexOf(c);
      if (i >= 0) state.compareCities.splice(i, 1);
      else if (state.compareCities.length < 3) state.compareCities.push(c);
      else return;
      const docId = CORPUS_MAP[c];
      if (docId && !data.corpus[docId]) loadDoc(docId).then(renderAll);
      renderAll();
    }, state.compareExpanded, key => {
      state.compareExpanded = key;
      renderView();
    });
  }

  function renderStandards(view) {
    const list = data.versions.national_standards || [];
    if (!state.std) {
      R.standards(view, list, STD_MAP, s => { state.std = s.id; state.expanded = null; renderView(); });
      return;
    }
    const docId = STD_MAP[state.std];
    if (!docId) { R.placeholder(view, '该标准语料提取中（扫描件转写/获取中）'); return; }
    const st = data.corpusStatus[docId];
    if (st === 'loading') { R.placeholder(view, '语料加载中…'); return; }
    if (!data.corpus[docId]) { R.placeholder(view, '语料加载失败'); return; }
    const corpus = data.corpus[docId];
    const std = list.find(x => x.id === state.std);
    let res;
    if (state.query) {
      res = K.search(corpus, state.query, {});
    } else {
      res = { total: corpus.articles.length, results: corpus.articles.slice(0, 60).map(a => ({
        id: a.id, city: corpus.city, doc: corpus.doc, chapter: a.chapter, section: a.section,
        article: a.article, page: a.page, score: 0, snippet: K.snippet(a.text, [], 80)
      })) };
    }
    if (state.expanded) {
      const art = corpus.articles.find(a => a.id === state.expanded);
      res.results.forEach(r => { if (r.id === state.expanded && art) { r.fullText = art.text; r.shots = shotsFor(docId, art.pages); } });
    }
    R.standardDetail(view, std, corpus, res, state.query, state.expanded,
      () => { state.std = null; state.expanded = null; renderView(); },
      id => { state.expanded = id; renderView(); });
  }

  /* ---------- 事件 ---------- */
  function onCity(city) {
    state.city = city;
    state.expanded = null;
    if (data.corpusStatus[city] === undefined) loadCorpus(city).then(renderAll);
    if (state.view === 'versions' || state.view === 'standards') state.view = 'overview';
    renderAll();
    if (window.innerWidth < 720) document.getElementById('sidebar').classList.add('closed');
  }
  function onStd(s) {
    state.std = s.id;
    state.view = 'standards';
    state.expanded = null;
    const docId = STD_MAP[s.id];
    if (docId && data.corpusStatus[docId] === undefined) loadDoc(docId).then(renderAll);
    renderAll();
  }
  function persist() {
    S.saveState({ city: state.city, view: state.view });
  }

  /* ---------- 启动 ---------- */
  function init() {
    const saved = S.loadState();
    if (saved.city) state.city = saved.city;
    if (saved.view) state.view = saved.view;

    document.getElementById('sidebarToggle').onclick = () =>
      document.getElementById('sidebar').classList.toggle('closed');

    /* 原文截图点击放大（lightbox）：再点/Esc 退出 */
    const lb = document.createElement('div');
    lb.className = 'lightbox hidden';
    lb.innerHTML = '<img alt="放大查看">';
    document.body.appendChild(lb);
    const lbImg = lb.querySelector('img');
    lb.onclick = () => lb.classList.add('hidden');
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.add('hidden'); });
    document.addEventListener('click', e => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.closest('.shots')) {
        lbImg.src = t.src;
        lb.classList.remove('hidden');
        e.stopPropagation();
      }
    }, true);

    let timer = null;
    const input = document.getElementById('searchInput');
    input.addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.query = e.target.value.trim();
        state.expanded = null;
        if (state.query && state.view !== 'search') state.view = 'search';
        renderAll();
      }, 250);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        state.query = e.target.value.trim();
        state.expanded = null;
        if (state.query && state.view !== 'search') state.view = 'search';
        renderAll();
      }
    });

    loadVersions().then(v => {
      data.versions = v;
      data.groups = K.groupCities(v);
      if (state.city) loadCorpus(state.city);
      renderAll();
    }).catch(() => {
      R.placeholder(document.getElementById('view'), 'versions.json 加载失败');
    });
  }

  init();
})();
