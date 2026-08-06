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

  /* 已提取语料的城市 → doc_id 数组（主规定 + 配套文件） */
  const CORPUS_MAP = {
    '青岛': ['qingdao-2025', 'qingdao-guide-2025'],
    '上海': ['shanghai-2010', 'shanghai-area-calc', 'shanghai-appnote', 'sh-dgtj08-7'],
    '济南': ['jinan-2026', 'jinan-parking-2023'],
    '广州': ['guangzhou-2019'], '重庆': ['chongqing-2018'], '深圳': ['shenzhen-2025'],
    '郑州': ['zhengzhou-2024'], '成都': ['chengdu-2024'], '杭州': ['hangzhou-2026', 'hz-parking-rule', 'zj-parking-std'],
    // 江苏各市共用省规 2025 + 市细则
    '苏州': ['jiangsu-2025', 'suzhou-rule1', 'suzhou-rule2'], '南京': ['jiangsu-2025'],
    '无锡': ['jiangsu-2025', 'wuxi-parking'],
    '常州': ['jiangsu-2025', 'changzhou-2012'], '徐州': ['jiangsu-2025', 'xuzhou-parking'],
    '扬州': ['jiangsu-2025', 'yangzhou-2019'], '盐城': ['jiangsu-2025'], '连云港': ['jiangsu-2025'],
    // 第二批
    '福州': ['fuzhou-2024'], '泉州': ['quanzhou-2018'], '漳州': ['zhangzhou-2026'],
    '厦门': ['xiamen-2016', 'xiamen-parking-2020'], '宁波': ['ningbo-2014', 'zj-parking-std'],
    '台州': ['taizhou-2025', 'zj-parking-std'],
    '嘉兴': ['jiaxing-2018', 'zj-parking-std'], '珠海': ['zhuhai-2021'], '东莞': ['dongguan-2020'],
    '佛山': ['foshan-2021'], '惠州': ['huizhou-2026'], '江门': ['jiangmen-2026'],
    '武汉': ['wuhan-2024'], '南昌': ['nanchang-2014', 'nanchang-guide'], '南宁': ['nanning-2011', 'nanning-guide-2025'],
    '合肥': ['hefei-2013'], '淄博': ['zibo-2005'], '莆田': ['fujian-2017', 'putian-sunlight'],
    // 第三批
    '温州': ['wenzhou-2017', 'wenzhou-parking-2024', 'zj-parking-std'],
    '贵阳': ['guiyang-2024'],
    '北京': ['beijing-dbt1813-2020', 'beijing-jz2025-25', 'beijing-tongze-2003'],
    '天津': ['tianjin-db990-2020', 'tianjin-db1040'],
    '西安': ['xian-2018', 'xian-parking', 'xian-parking-194']
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
    compareExpanded: null,
    atlasPage: 1      // 图集当前页
  };
  const data = {
    versions: null,
    groups: {},
    corpus: {},      // doc_id -> corpus JSON（懒加载缓存）
    corpusStatus: {}, // doc_id -> 'loading' | 'ok' | 'missing'
    policies: null,   // policies.json（懒加载）
    atlas: {},       // 图集目录（id -> JSON）
    cards: null      // 条文卡片（懒加载）
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
    const docIds = CORPUS_MAP[city];
    if (!docIds || !docIds.length) { data.corpusStatus['city:' + city] = 'missing'; return Promise.resolve(false); }
    return Promise.all(docIds.map(loadDoc));
  }
  function loadPolicies() {
    if (data.policies) return Promise.resolve(true);
    return fetch(`${DATA_BASE}/policies.json`)
      .then(r => r.json())
      .then(j => { data.policies = j.data || {}; return true; })
      .catch(() => { data.policies = {}; return false; });
  }
  function loadAtlas(stdId) {
    const fid = stdId.toLowerCase();
    if (data.atlas[fid]) return Promise.resolve(true);
    return fetch(`${DATA_BASE}/atlas/${fid}.json`)
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(j => { data.atlas[fid] = j; return true; })
      .catch(() => false);
  }
  function loadCards() {
    if (data.cards) return Promise.resolve(true);
    return fetch(`${DATA_BASE}/cards.json`)
      .then(r => r.json())
      .then(j => { data.cards = j.cards || []; return true; })
      .catch(() => { data.cards = []; return false; });
  }
  /* 某城已核验卡片（按类别 id 归组） */
  function confirmedCardsOf(city) {
    const out = {};
    (data.cards || []).forEach(c => {
      if (c.city !== city || c.status !== 'confirmed') return;
      (c.category || []).forEach(catLabel => {
        const cat = K.CATEGORIES.find(x => x.label === catLabel);
        if (cat) {
          out[cat.id] = out[cat.id] || [];
          out[cat.id].push(c);
        }
      });
    });
    return out;
  }
  function policiesOf(cityEntry) {
    if (!data.policies || !cityEntry) return { city: null, prov: null };
    const prov = cityEntry.province || '';
    return {
      city: data.policies[cityEntry.city] || null,
      prov: data.policies[prov] || data.policies[prov + '省'] || data.policies[prov + '市'] || null
    };
  }
  /* 多文档：返回该城市已加载的语料数组 */
  function corporaOfCity(city) {
    return (CORPUS_MAP[city] || []).map(id => data.corpus[id]).filter(Boolean);
  }
  function corpusStateOfCity(city) {
    const ids = CORPUS_MAP[city] || [];
    if (!ids.length) return data.corpusStatus['city:' + city] || 'missing';
    if (ids.some(id => data.corpusStatus[id] === 'loading')) return 'loading';
    return ids.some(id => data.corpus[id]) ? 'ok' : 'missing';
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
    R.tabs(document.getElementById('tabs'), state.view, v => {
      state.view = v;
      if (v === 'standards') state.std = null;  // 点页签回到国标列表
      renderAll();
    });
    renderView();
    persist();
  }

  function renderView() {
    const view = document.getElementById('view');
    const cityEntry = (data.versions.cities || []).find(c => c.city === state.city);
    switch (state.view) {
      case 'overview':
        if (cityEntry && !data.policies) { loadPolicies().then(renderAll); }
        if (cityEntry && !data.cards) { loadCards().then(renderAll); }
        if (cityEntry && corpusStateOfCity(cityEntry.city) === 'missing' && CORPUS_MAP[cityEntry.city] && !data.corpus[CORPUS_MAP[cityEntry.city][0]]) {
          loadCorpus(cityEntry.city).then(renderAll);
        }
        {
          const p = cityEntry ? policiesOf(cityEntry) : { city: null, prov: null };
          let counts = null;
          if (cityEntry) {
            const arts = [];
            corporaOfCity(cityEntry.city).forEach(c => arts.push(...c.articles));
            if (arts.length) {
              counts = {};
              K.CATEGORIES.forEach(c => { counts[c.id] = K.filterByCategory(arts, c.id).length; });
            }
          }
          const cardsByCat = cityEntry ? confirmedCardsOf(cityEntry.city) : {};
          R.overview(view, cityEntry, TODAY, p.city, p.prov, counts, catId => {
            state.categoryId = catId;
            state.view = 'search';
            renderAll();
          }, cardsByCat);
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
    const corpora = corporaOfCity(state.city);
    if (st === 'missing' || !corpora.length) {
      R.placeholder(view, `「${state.city}」语料待提取（任务⑧/⑨进行中）`);
      return;
    }
    if (!state.query && !state.categoryId) {
      R.placeholder(view, '输入关键词检索，或点击顶部类别标签筛选');
      return;
    }
    // 多文档合并检索
    let merged = [];
    let total = 0;
    corpora.forEach(corpus => {
      const res = K.search(corpus, state.query, { categoryId: state.categoryId, limit: 50 });
      if (res.error) return;
      res.results.forEach(r => { r.docId = corpus.doc_id; });
      merged = merged.concat(res.results);
      total += res.total;
    });
    merged.sort((a, b) => b.score - a.score);
    const res = { results: merged.slice(0, 50), total };
    if (state.expanded) {
      let art = null, docId = null;
      corpora.forEach(corpus => {
        const a = corpus.articles.find(x => x.id === state.expanded);
        if (a) { art = a; docId = corpus.doc_id; }
      });
      res.results.forEach(r => { if (r.id === state.expanded && art) { r.fullText = art.text; r.shots = shotsFor(docId, art.pages); } });
    }
    R.searchResults(view, res, state.query, state.expanded, id => {
      state.expanded = id;
      renderView();
    });
  }

  function renderCompare(view) {
    const available = (data.versions.cities || []).map(c => c.city).filter(c => CORPUS_MAP[c]);
    const cols = state.compareCities.map(city => {
      const corpora = corporaOfCity(city);
      if (!corpora.length) return { city, status: corpusStateOfCity(city) === 'loading' ? 'loading' : 'missing', articles: [] };
      const docName = corpora.map(c => c.doc).join('；');
      let pool = [];
      corpora.forEach(corpus => {
        let p = corpus.articles;
        if (state.categoryId) p = K.filterByCategory(p, state.categoryId);
        if (state.query) {
          const res = K.search(corpus, state.query, { categoryId: state.categoryId, limit: 5 });
          p = res.results.map(r => corpus.articles.find(a => a.id === r.id)).filter(Boolean);
        }
        pool = pool.concat(p.map(a => Object.assign({}, a, { shots: shotsFor(corpus.doc_id, a.pages) })));
      });
      return { city, doc: docName, status: 'ok', articles: pool.slice(0, 5) };
    });
    R.compare(view, cols, available, state.compareCities, c => {
      const i = state.compareCities.indexOf(c);
      if (i >= 0) state.compareCities.splice(i, 1);
      else if (state.compareCities.length < 3) state.compareCities.push(c);
      else return;
      (CORPUS_MAP[c] || []).forEach(id => { if (!data.corpus[id]) loadDoc(id).then(renderAll); });
      renderAll();
    }, state.compareExpanded, key => {
      state.compareExpanded = key;
      renderView();
    });
  }

  function renderStandards(view) {
    const list = data.versions.national_standards || [];
    if (!state.std) {
      R.standards(view, list, STD_MAP, s => {
        state.std = s.id;
        state.expanded = null;
        state.atlasPage = 1;
        if (s.status === '图集') loadAtlas(s.id).then(renderAll);
        renderView();
      });
      return;
    }
    const std = list.find(x => x.id === state.std);
    // 图集浏览模式
    if (std && std.status === '图集') {
      const meta = data.atlas[state.std.toLowerCase()];
      if (!meta) { R.placeholder(view, '图集目录加载中…'); return; }
      R.atlas(view, meta, state.atlasPage, `${SHOTS_BASE}/${std.id.toLowerCase()}`,
        p => { state.atlasPage = p; renderView(); },
        () => { if (state.atlasPage > 1) { state.atlasPage--; renderView(); } },
        () => { if (state.atlasPage < meta.total_pages) { state.atlasPage++; renderView(); } });
      return;
    }
    const docId = STD_MAP[state.std];
    if (!docId) { R.placeholder(view, '该标准语料提取中（扫描件转写/获取中）'); return; }
    const st = data.corpusStatus[docId];
    if (st === 'loading') { R.placeholder(view, '语料加载中…'); return; }
    if (!data.corpus[docId]) { R.placeholder(view, '语料加载失败'); return; }
    const corpus = data.corpus[docId];
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
    state.atlasPage = 1;
    if (s.status === '图集') loadAtlas(s.id).then(renderAll);
    else {
      const docId = STD_MAP[s.id];
      if (docId && data.corpusStatus[docId] === undefined) loadDoc(docId).then(renderAll);
    }
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
