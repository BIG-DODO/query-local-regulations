/*
 * test-kernel.js — kernel.js 的 Node 自检（vm 沙箱 mock window → 调内核 → 断言）
 * 运行：node test-kernel.js
 * 约定：改内核必跑；新功能同步补断言。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name); }
}

// 载入内核（vm 沙箱，window mock）
const sandbox = { window: {}, module: undefined };
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, 'js', 'kernel.js'), 'utf8');
vm.runInContext(src, sandbox);
const K = sandbox.window.RegulationKernel;
ok(K && typeof K.search === 'function', '内核加载（RegulationKernel.search 存在）');

// 禁用符号静态检查（小程序运行时没有这些）——剥离注释后扫描，命中注释不算
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const banned = ['document', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'alert(', 'navigator', 'location.', 'require('];
banned.forEach(b => ok(!codeOnly.includes(b), `内核不含禁用符号: ${b}`));

// 测试数据
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'corpus', 'qingdao-2025.json'), 'utf8'));
const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'versions.json'), 'utf8'));

// --- 检索 ---
console.log('\n[检索]');
const r1 = K.search(corpus, '车位');
ok(!r1.error && r1.total > 0, `检索"车位"有命中（${r1.total} 条）`);
ok(r1.results.some(x => x.article === '第九十六条'), '命中含第九十六条（配建停车位执行标准）');
const r2 = K.search(corpus, '日照');
ok(r2.results.some(x => x.article === '第四十条'), '检索"日照"命中第四十条');
const r3 = K.search(corpus, '建筑 间距');
ok(r3.results.length > 0 && r3.results.every(x => (x.chapter + x.section + x.article).length > 0), '多词 AND 检索"建筑 间距"');
ok(K.search(corpus, '量子力学').total === 0, '无结果查询 total=0');
ok(K.search(null, '车位').error, '空语料返回 {error}');
ok(r1.results[0].snippet.includes('<mark>'), '摘要含 <mark> 高亮');

// --- 类别筛选 ---
console.log('\n[类别筛选]');
const parking = K.filterByCategory(corpus.articles, 5);
ok(parking.length > 3 && parking.length < corpus.articles.length, `类别5 车位配建 筛出 ${parking.length} 条（子集）`);
ok(parking.some(a => a.article === '第九十六条'), '车位类别含第九十六条');
const sunlight = K.filterByCategory(corpus.articles, 6);
ok(sunlight.some(a => a.article === '第四十条'), '类别6 日照 含第四十条');
ok(K.filterByCategory(corpus.articles, 999).length === 0, '非法类别返回空数组');
const r5 = K.search(corpus, '', { categoryId: 5 });
ok(r5.total === parking.length, '空关键词+类别=类别全集');

// --- 版本状态 ---
console.log('\n[版本状态]');
const cq = versions.cities.find(c => c.city === '重庆');
const vs1 = K.versionStatus(cq, '2026-07-31');
ok(vs1.light === 'yellow' && vs1.notes.length > 0, '重庆（watch 非空）→ 黄灯');
const qd = versions.cities.find(c => c.city === '青岛');
const vs2 = K.versionStatus(qd, '2026-08-01');
ok(vs2.light === 'yellow' && vs2.stale === false, '青岛（试行转正窗口，30 天内）→ 黄灯不标 stale');
const vs3 = K.versionStatus(qd, '2026-12-01');
ok(vs3.stale === true, '青岛 90 天后 → stale=true');
const lyg = versions.cities.find(c => c.city === '连云港');
ok(K.versionStatus(lyg, '2026-07-31').light === 'gray', '连云港（confidence 低）→ 灰灯');
ok(K.versionStatus(null, '2026-07-31').light === 'gray', '空城市记录 → 灰灯');

// --- 分组（按文件夹目录） ---
console.log('\n[分组]');
const g = K.groupCities(versions);
ok(g['江苏省'].length === 8 && g['福建省'].length === 5 && g['广东省'].length === 7 && g['山东省'].length === 3 && g['浙江省'].length === 5 && g['直辖市'].length === 4 && g['其他省会城市'].length === 8, '文件夹分组 8/5/7/3/5/4/8');
ok(Object.keys(g)[0] === '江苏省' && Object.keys(g)[6] === '其他省会城市', '分组顺序与用户目录一致');
ok(g['江苏省'][0].city === '南京' && g['广东省'][5].city === '深圳', '组内顺序与用户目录一致');
ok(versions.national_standards.length === 10, '国标 10 份');
const c12 = K.CATEGORIES.find(c => c.id === 12), c13 = K.CATEGORIES.find(c => c.id === 13);
ok(c12.group === '政策' && c13.group === '政策', '12市政配套费/13产业扶持 归政策类');
ok(K.CATEGORIES.filter(c => c.group === '政策').length === 9, '政策类共 9 项（12,13,17-23）');
ok(K.CATEGORIES.filter(c => c.group === '规划').length === 11, '规划类共 11 项（1-11）');

console.log(`\n=== ${pass}/${pass + fail} 通过 ===`);
process.exit(fail ? 1 : 0);
