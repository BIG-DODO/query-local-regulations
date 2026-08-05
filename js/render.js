/*
 * render.js — 渲染引擎（DOM 操作集中在此；数据全部来自 app.js 注入）
 */
(function (global) {
  'use strict';
  const K = global.RegulationKernel;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lightSpan(light) { return `<span class="light ${light}"></span>`; }

  /* 原文页截图（无截图的文档 onerror 隐藏） */
  function shotsHtml(shots) {
    if (!shots || !shots.length) return '';
    return '<div class="shots">' + shots.map(u =>
      `<img src="${esc(u)}" loading="lazy" onerror="this.parentNode.style.display='none'" alt="原文页">`
    ).join('') + '</div>';
  }

  /* 侧栏：区域分组城市列表 + 国标区 */
  function sidebar(container, groups, standards, selectedCity, onCity, onStd) {
    container.innerHTML = '';
    Object.keys(groups).forEach(region => {
      const list = groups[region];
      if (!list || !list.length) return;
      container.appendChild(el('div', 'region-title', `<span>▼ ${esc(region)}</span><span>${list.length}</span>`));
      list.forEach(c => {
        const vs = K.versionStatus(c, new Date().toISOString().slice(0, 10));
        const item = el('div', 'city-item' + (c.city === selectedCity ? ' active' : ''),
          `${lightSpan(vs.light)}<span>${esc(c.city)}</span><span class="city-fill">${esc(c.fill_level || '')}</span>`);
        item.onclick = () => onCity(c.city);
        container.appendChild(item);
      });
    });
    container.appendChild(el('div', 'region-title', `<span>▼ 国标</span><span>${standards.length}</span>`));
    standards.forEach(s => {
      const item = el('div', 'city-item', `<span class="light gray"></span><span>${esc(s.name)}</span>`);
      item.title = s.id + ' ' + s.name;
      item.onclick = () => onStd(s);
      container.appendChild(item);
    });
  }

  /* 类别标签栏：两行（行1 规划/建筑/结构/机电；行2 政策类） */
  function catbar(container, activeCat, onToggle) {
    container.innerHTML = '';
    const row1 = el('div', 'cat-row');
    const row2 = el('div', 'cat-row');
    const all = el('span', 'cat-chip' + (!activeCat ? ' active' : ''), '全部');
    all.onclick = () => onToggle(null);
    row1.appendChild(all);
    K.CATEGORIES.forEach(c => {
      const chip = el('span', 'cat-chip' + (activeCat === c.id ? ' active' : ''),
        `${c.id}.${esc(c.label)}`);
      chip.onclick = () => onToggle(c.id);
      (c.group === '政策' ? row2 : row1).appendChild(chip);
    });
    container.appendChild(row1);
    container.appendChild(row2);
  }

  /* 页签 */
  const TABS = [
    { id: 'overview', label: '城市速览' },
    { id: 'search', label: '条文检索' },
    { id: 'compare', label: '横向对比' },
    { id: 'standards', label: '通用条款' },
    { id: 'versions', label: '版本台账' }
  ];
  function tabs(container, active, onSwitch) {
    container.innerHTML = '';
    TABS.forEach(t => {
      const tab = el('div', 'tab' + (t.id === active ? ' active' : ''), esc(t.label));
      tab.onclick = () => onSwitch(t.id);
      container.appendChild(tab);
    });
  }

  /* 版本状态灯说明 */
  function lightLegend(vs) {
    return `<span class="tag ${vs.light === 'yellow' ? 'warn' : ''}">${lightSpan(vs.light)}${vs.light === 'green' ? '现行' : vs.light === 'yellow' ? '关注' : '未核验'}</span>`;
  }

  /* 城市速览 */
  function overview(view, cityEntry, today, policies, provPolicies) {
    view.innerHTML = '';
    if (!cityEntry) { view.appendChild(el('div', 'placeholder', '← 请在左侧选择城市')); return; }
    const vs = K.versionStatus(cityEntry, today);
    const main = cityEntry.regulations[0] || {};
    const card = el('div', 'card');
    card.innerHTML = `
      <h3>${esc(cityEntry.city)} ${lightLegend(vs)}</h3>
      <div class="meta">
        <b>${esc(main.name || '—')}</b><br>
        ${main.doc_no ? '文号：' + esc(main.doc_no) + '<br>' : ''}
        ${main.effective ? '施行：' + esc(main.effective) + '　' : ''}状态：${esc(main.status || '—')}<br>
        核验日期：${esc(cityEntry.verified_at || '—')}${vs.stale ? ' <span class="tag warn">超期未复核</span>' : ''}
        ${vs.notes.length ? '<br>' + vs.notes.map(n => `<span class="tag warn">${esc(n)}</span>`).join('') : ''}
      </div>`;
    view.appendChild(card);

    if (cityEntry.regulations.length > 1) {
      const fam = el('div', 'card');
      fam.innerHTML = '<h3>文件族</h3>' + cityEntry.regulations.slice(1).map(r =>
        `<div class="meta" style="margin-bottom:6px"><b>${esc(r.name)}</b>　<span class="tag">${esc(r.role || '')}</span><br>${r.doc_no ? '文号：' + esc(r.doc_no) + '　' : ''}${esc(r.status || '')}</div>`
      ).join('');
      view.appendChild(fam);
    }

    const grid = el('div', 'card');
    grid.innerHTML = '<h3>23 类规范速览（卡片数据待沉淀）</h3>';
    const g = el('div', 'cat-grid');
    K.CATEGORIES.forEach(c => {
      g.appendChild(el('div', 'cat-cell', `<span class="st">○ 空</span>${c.id}. ${esc(c.label)}`));
    });
    grid.appendChild(g);
    view.appendChild(grid);

    /* 政策类语料（17-23 深度搜索成果 + 省级政策） */
    if (policies || provPolicies) {
      view.appendChild(policyBlock('政策类（本市）', policies));
      if (provPolicies) view.appendChild(policyBlock('省级政策（适用于本市）', provPolicies));
    } else {
      view.appendChild(el('div', 'placeholder', '政策类语料加载中…'));
    }
  }

  const POLICY_TOPICS = ['17', '18', '19', '20', '21', '22', '23'];
  function policyBlock(title, topicMap) {
    const card = el('div', 'card');
    let html = `<h3>${esc(title)}</h3>`;
    if (!topicMap) {
      html += '<div class="meta">无数据</div>';
    } else {
      POLICY_TOPICS.forEach(tid => {
        const entries = topicMap[tid];
        if (!entries || !entries.length) return;
        const label = (K.CATEGORIES.find(c => c.id === Number(tid)) || {}).label || tid;
        html += `<div class="meta" style="margin-top:8px"><b>${tid}. ${esc(label)}</b></div>`;
        entries.forEach(e => {
          const conf = e.confidence ? `<span class="tag">${esc(e.confidence)}</span>` : '';
          const time = e.timeliness ? `<span class="tag ${/废止|失效|待核/.test(e.timeliness) ? 'warn' : ''}">${esc(e.timeliness)}</span>` : '';
          const link = e.url ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">来源</a>` : '';
          if (e.title === '（未检索到）') {
            html += `<div class="meta" style="color:var(--muted)">— 未检索到明确政策</div>`;
          } else {
            html += `<div class="meta" style="margin:3px 0">· <b>${esc(e.title || '(无题)')}</b>${e.doc_no ? ' ' + esc(e.doc_no) : ''} ${conf}${time}${link}<br><span style="color:var(--muted)">${esc(e.summary || '')}</span></div>`;
          }
        });
      });
    }
    card.innerHTML = html;
    return card;
  }

  /* 条文检索结果 */
  function searchResults(view, data, query, expandedId, onToggle) {
    view.innerHTML = '';
    const head = el('div', 'meta', `共 ${data.total} 条命中${data.total > data.results.length ? `，显示前 ${data.results.length} 条` : ''}`);
    head.style.marginBottom = '8px';
    view.appendChild(head);
    const list = el('div', 'result-list');
    data.results.forEach(r => {
      const open = r.id === expandedId;
      const card = el('div', 'card result-item' + (open ? ' open' : ''));
      card.innerHTML = `
        <h3>${esc(r.article)} <span class="tag">${esc(r.city)}</span></h3>
        <div class="meta">${esc(r.chapter)}${r.section ? ' / ' + esc(r.section) : ''}</div>
        <div class="snippet">${r.snippet}</div>
        ${open ? `<div class="article-full">${esc(r.fullText || '')}</div>${shotsHtml(r.shots)}<div class="page-ref">来源：${esc(r.doc)} · 原文第 ${r.page} 页</div>` : ''}`;
      card.onclick = () => onToggle(open ? null : r.id);
      list.appendChild(card);
    });
    view.appendChild(list);
    if (!data.results.length) view.appendChild(el('div', 'placeholder', '无命中，换个关键词试试'));
  }

  /* 通用条款区：国标列表（可点击进入全文） */
  function standards(view, list, stdMap, onSelect) {
    view.innerHTML = '';
    const tip = el('div', 'meta', '国标全文（含表格）可检索；与 23 类标签不挂钩，直接查原文。');
    tip.style.marginBottom = '8px';
    view.appendChild(tip);
    list.forEach(s => {
      const ready = !!(stdMap && stdMap[s.id]);
      const card = el('div', 'card' + (ready ? ' result-item' : ''));
      card.innerHTML = `
        <h3>${esc(s.name)}</h3>
        <div class="meta">
          <span class="tag">${esc(s.id)}</span>
          <span class="tag ${/优先/.test(s.priority) ? '' : 'warn'}">${esc(s.priority)}</span>
          ${ready ? '<span class="tag">语料已入库，点击查阅 →</span>' : '<span class="tag warn">语料提取中</span>'}
        </div>`;
      if (ready) card.onclick = () => onSelect(s);
      view.appendChild(card);
    });
  }

  /* 国标详情：章节条文浏览 + 关键词检索 */
  function standardDetail(view, std, corpus, res, query, expandedId, onBack, onToggle) {
    view.innerHTML = '';
    const head = el('div', 'card');
    head.innerHTML = `
      <h3><a href="javascript:;" id="stdBack" style="color:var(--brand)">← 返回列表</a>　${esc(std.name)}</h3>
      <div class="meta">${esc(corpus.doc)} · ${corpus.article_count} 条 · ${query ? `「${esc(query)}」命中 ${res.total} 条` : '输入顶部搜索框关键词可在本标准内检索'}</div>`;
    view.appendChild(head);
    head.querySelector('#stdBack').onclick = onBack;
    const list = el('div', 'result-list');
    res.results.forEach(r => {
      const open = r.id === expandedId;
      const card = el('div', 'card result-item' + (open ? ' open' : ''));
      card.innerHTML = `
        <h3>${esc(r.article)}</h3>
        <div class="meta">${esc(r.chapter)}${r.section ? ' / ' + esc(r.section) : ''}</div>
        <div class="snippet">${r.snippet}</div>
        ${open ? `<div class="article-full">${esc(r.fullText || '')}</div>${shotsHtml(r.shots)}<div class="page-ref">${r.page ? '原文第 ' + r.page + ' 页' : ''}</div>` : ''}`;
      card.onclick = () => onToggle(open ? null : r.id);
      list.appendChild(card);
    });
    view.appendChild(list);
    if (!res.results.length) view.appendChild(el('div', 'placeholder', '无命中'));
  }

  /* 版本台账 */
  function versions(view, data, today) {
    view.innerHTML = '';
    const staleDays = (data.meta && data.meta.stale_days) || 90;
    const note = el('div', 'meta', `核验超 ${staleDays} 天自动标黄底；数据截至 ${esc(data.meta.generated_at)}`);
    note.style.marginBottom = '8px';
    view.appendChild(note);
    const tbl = el('table', 'vtable');
    tbl.innerHTML = '<tr><th></th><th>城市</th><th>现行规定</th><th>施行/文号</th><th>核验</th></tr>';
    data.cities.forEach(c => {
      const vs = K.versionStatus(c, today, staleDays);
      const main = c.regulations[0] || {};
      const tr = el('tr', vs.stale ? 'stale' : '');
      tr.innerHTML = `
        <td>${lightSpan(vs.light)}</td>
        <td><b>${esc(c.city)}</b></td>
        <td>${esc(main.name || '—')}${vs.notes.length ? '<br>' + vs.notes.map(n => `<span class="tag warn">${esc(n)}</span>`).join('') : ''}</td>
        <td>${esc(main.effective || '')}${main.doc_no ? '<br>' + esc(main.doc_no) : ''}</td>
        <td>${esc(c.verified_at || '—')}<br><span class="tag">${esc(c.confidence)}</span></td>`;
      tbl.appendChild(tr);
    });
    view.appendChild(tbl);
  }

  /* 横向对比：并排原文 */
  function compare(view, cols, availableCities, selected, onToggleCity, expandedKey, onExpand) {
    view.innerHTML = '';
    const pick = el('div', 'card');
    pick.innerHTML = '<h3>选择 2-3 个城市对比（顶部可再选类别/关键词）</h3>';
    const chips = el('div');
    availableCities.forEach(c => {
      const on = selected.includes(c);
      const chip = el('span', 'cat-chip' + (on ? ' active' : ''), esc(c));
      chip.style.margin = '0 6px 6px 0';
      chip.onclick = () => onToggleCity(c);
      chips.appendChild(chip);
    });
    pick.appendChild(chips);
    view.appendChild(pick);

    if (!selected.length) { view.appendChild(el('div', 'placeholder', '勾选城市后开始对比')); return; }
    const grid = el('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols.length}, 1fr)`;
    grid.style.gap = '10px';
    grid.style.alignItems = 'start';
    cols.forEach(col => {
      const c = el('div');
        c.innerHTML = `<div class="card"><h3>${esc(col.city)}</h3><div class="meta">${esc(col.doc || '')}</div></div>`;
      if (col.status === 'loading') {
        c.appendChild(el('div', 'placeholder', '语料加载中…'));
      } else if (!col.articles.length) {
        c.appendChild(el('div', 'placeholder', '该类别/关键词无命中'));
      } else {
        col.articles.forEach((a, i) => {
          const key = col.city + ':' + a.id;
          const open = expandedKey === key;
          const card = el('div', 'card result-item' + (open ? ' open' : ''));
          card.innerHTML = `
            <h3>${esc(a.article)}</h3>
            <div class="meta">${esc(a.chapter)}${a.section ? ' / ' + esc(a.section) : ''}</div>
            <div class="snippet">${open ? '' : esc(a.text.slice(0, 120)) + (a.text.length > 120 ? '…' : '')}</div>
            ${open ? `<div class="article-full">${esc(a.text)}</div>${shotsHtml(a.shots)}<div class="page-ref">${a.page ? '原文第 ' + a.page + ' 页' : ''}</div>` : ''}`;
          card.onclick = () => onExpand(open ? null : key);
          c.appendChild(card);
        });
      }
      grid.appendChild(c);
    });
    view.appendChild(grid);
  }

  function placeholder(view, text) {
    view.innerHTML = '';
    view.appendChild(el('div', 'placeholder', text));
  }

  global.RegulationRender = {
    sidebar, catbar, tabs, overview, searchResults, standards, standardDetail, versions, compare, placeholder, esc
  };
})(window);
