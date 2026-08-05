/*
 * storage.js — localStorage 读写（仅用户编辑的卡片；语料不可前端编辑）
 * 页面层专用，不进内核。
 */
(function (global) {
  'use strict';
  const KEY_CARDS = 'regulation_cards_v1';
  const KEY_STATE = 'regulation_state_v1';

  function readJSON(key, fallback) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }

  global.RegulationStorage = {
    loadCards() { return readJSON(KEY_CARDS, []); },
    saveCards(cards) { return writeJSON(KEY_CARDS, cards); },
    loadState() { return readJSON(KEY_STATE, {}); },
    saveState(s) { return writeJSON(KEY_STATE, s); },
    exportCards() { return JSON.stringify(readJSON(KEY_CARDS, []), null, 2); },
    importCards(json) {
      try {
        const v = JSON.parse(json);
        if (!Array.isArray(v)) return { error: '格式错误：应为数组' };
        writeJSON(KEY_CARDS, v);
        return { ok: true, count: v.length };
      } catch (e) {
        return { error: 'JSON 解析失败' };
      }
    }
  };
})(window);
