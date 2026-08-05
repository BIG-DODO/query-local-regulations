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
  const TODAY = new Date().toISOString().slice(0, 10);

  /* 已提取语料的城市 → doc_id（随 Phase 0 推进逐个增加） */
  const CORPUS_MAP = {
    '青岛': 'qingdao-2025', '上海': 'shanghai-2010', '济南': 'jinan-2026',
    '广州': 'guangzhou-2019', '重庆': 'chongqing-2018', '深圳': 'shenzhen-2025',
    '郑州': 'zhengzhou-2024', '成都': 'chengdu-2024', '杭州': 'hangzhou-2026',
    // 江苏各市共用省规 2025（市细则语料后续补充）
    '苏州': 'jiangsu-2025', '南京': 'jiangsu-2025', '无锡': 'jiangsu-2025',
    '常州': 'jiangsu-2025', '徐州': 'jiangsu-2025', '扬州': 'jiangsu-2025',
    '盐城': 'jiangsu-2025', '连云港': 'jiangsu-2025'
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
    expanded: null
  };
  const data = {
    versions: null,
    groups: {},
    corpus: {},      // doc_id -> corpus JSON（懒加载缓存）
    corpusStatus: {} // doc_id -> 'loading' | 'ok' | 'missing'
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
        R.overview(view, cityEntry, TODAY);
        break;
      case 'search':
        renderSearch(view);
        break;
      case 'compare':
        R.placeholder(view, '横向对比<br>并排原文视图待 Phase 2 上线<br>（需 2-3 城语料齐备）');
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
      res.results.forEach(r => { if (r.id === state.expanded && art) r.fullText = art.text; });
    }
    R.searchResults(view, res, state.query, state.expanded, id => {
      state.expanded = id;
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
      res.results.forEach(r => { if (r.id === state.expanded && art) r.fullText = art.text; });
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
