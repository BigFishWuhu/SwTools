(() => {
  "use strict";

  const catalog = Array.isArray(window.MONSTER_CATALOG) ? window.MONSTER_CATALOG : [];
  const zhOverrides = window.MONSTER_ZH_OVERRIDES || {};
  let customNames = JSON.parse(localStorage.getItem("sw-codex-names") || "{}");
  const elementZh = { Fire: "火", Water: "水", Wind: "风", Light: "光", Dark: "暗", Pure: "纯" };
  const elementOrder = { Fire: 1, Water: 2, Wind: 3, Light: 4, Dark: 5, Pure: 6 };
  const state = { ownedIds: new Set(), status: "all", element: "all", stars: "featured", search: "", grouping: "element", showNames: false, showMissingLd: false, profile: null, editingKey: null };
  const HAN_INITIALS = Object.fromEntries("水s 雷l 帝d 光g 暗a 火h 风f 龙l 鸡j 牛n 猴h 子z 瓦w 奥a 萝l 莉l 天t 使s 神s 谕y 王w 仙x 人r 熊x 猫m 豹b 狼l 虎h 狮s 鹰y 鬼g 妖y 女n 男n 剑j 骑q 士s 斗d 忍r 者z 魔m 法f 朋p 友y 牌p 炮p 狙j 击j 枪q 舞w 姬j 琴q 师s 死s 亡w 传c 说s 战z 机j 器q 僧s 兽s 召z 唤h 觉j 醒x 骨g 头t 影y 刺c 客k 盗d 船c 长z 海h 南n 北b 东d 西x 赤c 炎y 冰b 雪x 森s 林l 朱z 云y 叶y 岩y 石s 软r 糖t 兔t 蛇s 蝎x 蟹x 龟g 鸟n 鹿l 象x 犀x 狐h 狸l 童t 朵d 兰l 花h 藤t 松s 树s 精j 灵l 炸z 弹d 纸z 画h 伯b 术s 甲j 虫c 拳q 功g 夫f 霜s 魅m 恶e 毒d 诅z 咒z 探t 冒m 险x 勇y 旅l 行x 终z 焉y 祢n 炭t 治z 郎l 惠h 悟w 丝s 菲f 莲l 伦l 克k 休x 尔e 尤y 贝b 辛x 美m 弗f 里l 斯s 特t 维w 姆m 伊y 之z 平p 八b 保b 罗l 妮n 娜n 威w 廉l 佛f 多d 甘g 阿a 拉l 咕g 嘴z 佑y 米m 苏s 卡k 迪d 亚y 赛s 杰j 洛l 露l 达d 芙f 莎s 因y 格g 德d 蒙m 古g 盖g 加j 马m 泰t 戈g 耶y 稣s 萨s 乌w 丹d 丁d 恩e 诺n 安a 提t 曼m 迦j 楼l 布b 鲁l 乔q 奇q 纳n 麦m 索s 凯k 斐f 薇w 托t 赞z 梅m 西x 蒂d 蕾l 芬f 丽l 瑞r 塔t 夏x 巴b 赫h".split(" ").map((pair) => pair.split("")));
  const familyStars = new Map();
  catalog.forEach((monster) => {
    if (!familyStars.has(monster.familyId)) familyStars.set(monster.familyId, new Set());
    familyStars.get(monster.familyId).add(monster.stars);
  });
  const mixed45FamilyIds = new Set([...familyStars].filter(([, stars]) => stars.has(4) && stars.has(5)).map(([familyId]) => familyId));
  let filteredMonsters = [];
  let toastTimer;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const el = {
    grid: $("#monsterGrid"), empty: $("#emptyState"), file: $("#fileInput"), profile: $("#profileLine"),
    owned: $("#ownedCount"), total: $("#totalCount"), progress: $("#progressBar"), progressText: $("#progressText"),
    elementalNat5: $("#elementalNat5Count"), elementalNat5Total: $("#elementalNat5Total"),
    summonLd5: $("#summonLd5Count"), summonLd5Total: $("#summonLd5Total"),
    visible: $("#visibleCount"), toast: $("#toast"), exportDialog: $("#exportDialog"), editDialog: $("#editDialog")
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  async function loadCustomNames() {
    try {
      const response = await fetch("/api/monster-edits", { cache: "no-store" });
      if (!response.ok) throw new Error("编辑信息服务不可用");
      const payload = await response.json();
      customNames = payload.edits || {};
      localStorage.setItem("sw-codex-names", JSON.stringify(customNames));
    } catch { /* Static file previews can still use the browser fallback. */ }
  }

  async function saveCustomName(key, value) {
    try {
      await fetch(`/api/monster-edits/${encodeURIComponent(key)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    } catch { showToast("SQLite 服务不可用，已暂存到当前浏览器"); }
  }

  function hydrateMonster(monster) {
    const familyKey = monster.nameEn.replace(/^(Fire|Water|Wind|Light|Dark)\s+/, "");
    const preset = zhOverrides[monster.nameEn] || zhOverrides[familyKey] || {};
    const custom = customNames[monster.key] || {};
    const familyZh = custom.nameZh ?? (monster.nameZh || preset.name || "");
    const awakenedZh = custom.awakenedNameZh ?? (monster.awakenedNameZh || "");
    const baseAliases = custom.aliases ?? [...(monster.aliases || []), ...(preset.aliases || [])];
    const aliases = [...new Set(baseAliases.filter(Boolean))];
    const elementalAliases = familyZh ? [elementZh[monster.element] + familyZh, ...aliases.map((alias) => elementZh[monster.element] + alias)] : [];
    const allNames = [familyZh, awakenedZh, ...aliases, ...elementalAliases].filter(Boolean);
    return { ...monster, nameZh: familyZh, awakenedNameZh: awakenedZh, aliases: [...new Set([...aliases, ...elementalAliases])], searchInitials: [...new Set(allNames.map(toInitials).filter(Boolean))] };
  }

  function isOwned(monster) {
    return monster.ids.some((id) => state.ownedIds.has(Number(id)));
  }

  function displayName(monster) {
    return monster.awakenedNameZh || monster.nameZh || monster.awakenedNameEn || monster.nameEn;
  }

  function allMonsters() {
    return catalog.map(hydrateMonster);
  }

  function toInitials(value) {
    return [...String(value || "")].map((char) => HAN_INITIALS[char] || (/[a-z0-9]/i.test(char) ? char.toLowerCase() : "")).join("");
  }

  function matchesSearch(monster, query) {
    if (!query) return true;
    const normalized = query.replace(/\s+/g, "");
    const haystack = [monster.nameZh, monster.awakenedNameZh, monster.nameEn, monster.awakenedNameEn, ...monster.aliases, ...monster.ids].join(" ").toLocaleLowerCase();
    return haystack.includes(query) || monster.searchInitials.some((initials) => initials.includes(normalized));
  }

  function getFiltered({ ignoreStatus = false, ignoreLdVisibility = false } = {}) {
    const query = state.search.trim().toLocaleLowerCase();
    return allMonsters().filter((monster) => {
      const owned = isOwned(monster);
      return (ignoreStatus || state.status === "all" || (state.status === "owned" ? owned : !owned))
        && (monster.gift || monster.stars === 4 || ignoreLdVisibility || state.showMissingLd || !["Light", "Dark"].includes(monster.element) || owned)
        && (state.element === "all" || monster.element === state.element)
        && (state.stars === "all"
          || (state.stars === "mixed45"
            ? mixed45FamilyIds.has(monster.familyId) && [4, 5].includes(monster.stars)
            : state.stars === "featured" ? monster.stars === 5 || (monster.stars === 4 && ["Light", "Dark"].includes(monster.element)) : monster.stars === Number(state.stars)))
        && matchesSearch(monster, query);
    });
  }

  function renderCard(monster) {
    const owned = isOwned(monster);
    const title = displayName(monster);
    const subtitleParts = [monster.awakenedNameEn || monster.nameEn];
    if (monster.nameZh && monster.nameZh !== title) subtitleParts.push(`未觉醒：${monster.nameZh}`);
    const aliasText = monster.aliases.slice(0, 2).join(" · ");
    if (aliasText) subtitleParts.push(aliasText);
    return `<button class="monster-card ${owned ? "owned" : ""}" type="button" data-key="${escapeHtml(monster.key)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}，${owned ? "已点亮" : "未点亮"}">
      <span class="monster-image"><img src="${escapeHtml(monster.image)}" alt="" loading="lazy"></span>
      <span class="monster-stars">${"★".repeat(monster.stars)}</span>
      <span class="monster-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
      <span class="monster-subtitle" title="${escapeHtml(subtitleParts.join(" · "))}">${escapeHtml(subtitleParts.join(" · "))}</span>
    </button>`;
  }

  function familyName(monsters) {
    const representative = monsters[0];
    if (representative.nameZh) {
      const prefix = elementZh[representative.element] || "";
      return prefix && representative.nameZh.startsWith(prefix) ? representative.nameZh.slice(prefix.length) : representative.nameZh;
    }
    return representative.nameEn.replace(/^(Fire|Water|Wind|Light|Dark)\s+/, "");
  }

  function groupedMonsters(monsters) {
    const groups = new Map();
    monsters.forEach((monster) => {
      let key = String(monster.familyId);
      if (state.grouping === "element") {
        if (monster.gift) key = "gift";
        else if (monster.stars === 4 && ["Light", "Dark"].includes(monster.element)) key = `${monster.element}4`;
        else key = monster.element;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(monster);
    });
    const entries = [...groups.entries()];
    if (state.grouping === "element") {
      const groupOrder = { gift: 0, Light: 1, Dark: 2, Fire: 3, Water: 4, Wind: 5, Light4: 6, Dark4: 7, Pure: 8 };
      entries.sort(([a], [b]) => (groupOrder[a] ?? 99) - (groupOrder[b] ?? 99));
    } else {
      entries.forEach(([, family]) => family.sort((a, b) => (elementOrder[a.element] || 99) - (elementOrder[b.element] || 99)));
    }
    return entries;
  }

  function render() {
    filteredMonsters = getFiltered();
    const totalsByGroup = new Map(groupedMonsters(getFiltered({ ignoreStatus: true, ignoreLdVisibility: true })).map(([key, monsters]) => [key, monsters]));
    el.visible.textContent = filteredMonsters.length.toLocaleString("zh-CN");
    el.empty.hidden = filteredMonsters.length > 0;
    el.grid.hidden = filteredMonsters.length === 0;
    el.grid.classList.toggle("show-names", state.showNames);
    el.grid.innerHTML = groupedMonsters(filteredMonsters).map(([key, monsters]) => {
      let title = familyName(monsters);
      if (state.grouping === "element") {
        if (key === "gift") title = "赠送魔灵（胎五）";
        else if (key === "Light4") title = "光属性胎四";
        else if (key === "Dark4") title = "暗属性胎四";
        else title = `${elementZh[key] || key}属性${["featured", "5"].includes(state.stars) ? "胎五" : ""}`;
      }
      const groupTotal = totalsByGroup.get(key) || monsters;
      const owned = groupTotal.filter(isOwned).length;
      const percent = groupTotal.length ? Math.round(owned / groupTotal.length * 100) : 0;
      const count = state.grouping === "element"
        ? `<div class="group-progress"><strong>${percent}%</strong><span>已点亮 ${owned} / ${groupTotal.length}</span><i><b style="width:${percent}%"></b></i></div>`
        : `<span class="group-count">${monsters.length} 只</span>`;
      return `<section class="monster-group" data-group-key="${escapeHtml(key)}">
        <div class="monster-group-head"><h3>${escapeHtml(title)}</h3>${count}</div>
        <div class="monster-grid">${monsters.map(renderCard).join("")}</div>
      </section>`;
    }).join("");
    updateStats();
    updateExportEstimate();
  }

  function updateStats() {
    const monsters = allMonsters();
    const owned = monsters.filter(isOwned).length;
    const elementalNat5 = monsters.filter((monster) => monster.stars === 5 && ["Fire", "Water", "Wind"].includes(monster.element));
    const summonLd5 = monsters.filter((monster) => monster.stars === 5 && ["Light", "Dark"].includes(monster.element) && !monster.gift);
    const elementalNat5Owned = elementalNat5.filter(isOwned).length;
    const summonLd5Owned = summonLd5.filter(isOwned).length;
    const percent = monsters.length ? Math.round(owned / monsters.length * 100) : 0;
    el.owned.textContent = owned.toLocaleString("zh-CN");
    el.total.textContent = monsters.length.toLocaleString("zh-CN");
    el.progress.style.width = `${percent}%`;
    el.progressText.textContent = state.profile ? `完成度 ${percent}%` : "等待导入";
    el.elementalNat5.textContent = elementalNat5Owned;
    el.elementalNat5Total.textContent = `共 ${elementalNat5.length} 只`;
    el.summonLd5.textContent = summonLd5Owned;
    el.summonLd5Total.textContent = `共 ${summonLd5.length} 只`;
  }

  function findArray(root, key) {
    if (!root || typeof root !== "object") return null;
    if (Array.isArray(root[key])) return root[key];
    for (const value of Object.values(root)) {
      if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value[key])) return value[key];
    }
    return null;
  }

  function parseProfile(data) {
    const collection = findArray(data, "unit_collection");
    const units = findArray(data, "unit_list") || [];
    if (!collection && !units.length) throw new Error("未找到 unit_collection 或 unit_list，文件可能不是有效的账号导出 JSON。");
    const ids = new Set();
    (collection || []).forEach((entry) => {
      if (entry && (entry.open === 1 || entry.open === true || entry.open === "1") && entry.unit_master_id) ids.add(Number(entry.unit_master_id));
    });
    units.forEach((entry) => { if (entry?.unit_master_id) ids.add(Number(entry.unit_master_id)); });
    const wizard = data.wizard_info || data.data?.wizard_info || {};
    return { ids, name: String(wizard.wizard_name || data.wizard_name || "召唤师").slice(0, 40), id: wizard.wizard_id || data.wizard_id || "", level: wizard.wizard_level || "" };
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseProfile(JSON.parse(text.replace(/^\uFEFF/, "")));
      state.ownedIds = parsed.ids;
      state.profile = parsed;
      el.profile.textContent = `${parsed.name}${parsed.level ? ` · Lv.${parsed.level}` : ""}${parsed.id ? ` · ID ${parsed.id}` : ""} · 已读取 ${parsed.ids.size.toLocaleString("zh-CN")} 条点亮记录`;
      $("#resetButton").disabled = false;
      render();
      showToast(`导入成功：已识别 ${parsed.ids.size.toLocaleString("zh-CN")} 个魔灵形态`);
    } catch (error) {
      showToast(error instanceof SyntaxError ? "JSON 格式无法解析，请确认文件完整" : error.message, true);
    } finally {
      el.file.value = "";
    }
  }

  function resetProfile() {
    state.ownedIds.clear();
    state.profile = null;
    el.profile.textContent = "导入 SWEX / 代理导出的账号 JSON，在本机生成图鉴点亮状态。";
    $("#resetButton").disabled = true;
    render();
    showToast("已清除导入的账号数据");
  }

  function showToast(message, error = false) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = `toast visible${error ? " error" : ""}`;
    toastTimer = setTimeout(() => { el.toast.className = "toast"; }, 3000);
  }

  function getExportMonsters() {
    const chosen = new Map();
    const add = (monster) => chosen.set(monster.key, monster);
    const monsters = allMonsters();
    if ($("#exportNat5").checked) monsters.filter((monster) => monster.stars === 5).forEach(add);
    if ($("#exportLd4").checked) monsters.filter((monster) => monster.stars === 4 && ["Light", "Dark"].includes(monster.element)).forEach(add);
    if ($("#exportVisible").checked) filteredMonsters.forEach(add);
    return [...chosen.values()].sort((a, b) => b.stars - a.stars || elementOrder[a.element] - elementOrder[b.element] || a.familyId - b.familyId);
  }

  function updateExportEstimate() {
    const target = $("#exportEstimate");
    if (target) target.textContent = `${getExportMonsters().length.toLocaleString("zh-CN")} 个魔灵`;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
    return `${output}…`;
  }

  async function exportPng() {
    const monsters = getExportMonsters();
    if (!monsters.length) return showToast("请至少选择一个导出范围", true);
    const button = $("#confirmExport");
    const progress = $("#exportProgress");
    button.disabled = true;
    progress.hidden = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const columns = 10;
      const width = 1600;
      const margin = 64;
      const gap = 10;
      const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
      const cardHeight = 178;
      const headerHeight = 206;
      const rows = Math.ceil(monsters.length / columns);
      const height = headerHeight + margin + rows * (cardHeight + gap) + 62;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#11130f";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#1a1d18";
      ctx.fillRect(0, 0, width, headerHeight);
      ctx.fillStyle = "#d8ad58";
      ctx.fillRect(margin, 54, 42, 4);
      ctx.fillStyle = "#f3f1e8";
      ctx.font = '500 44px Georgia, "Microsoft YaHei", serif';
      ctx.fillText(`${state.profile?.name || "召唤师"}的魔灵图鉴`, margin, 112);
      const owned = monsters.filter(isOwned).length;
      ctx.fillStyle = "#92988b";
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillText(`已点亮 ${owned} / ${monsters.length}  ·  完成度 ${Math.round(owned / monsters.length * 100)}%`, margin, 154);
      ctx.textAlign = "right";
      ctx.fillStyle = "#d8ad58";
      ctx.font = '600 18px "Microsoft YaHei", sans-serif';
      ctx.fillText("召唤师图鉴 · MONSTER CODEX", width - margin, 101);
      ctx.fillStyle = "#6f756a";
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText(new Date().toLocaleDateString("zh-CN"), width - margin, 133);
      ctx.textAlign = "left";

      const images = await Promise.all(monsters.map((monster) => loadImage(monster.image)));
      monsters.forEach((monster, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = margin + column * (cardWidth + gap);
        const y = headerHeight + margin + row * (cardHeight + gap);
        const ownedItem = isOwned(monster);
        ctx.fillStyle = ownedItem ? "#24261f" : "#191b17";
        ctx.strokeStyle = ownedItem ? "#806e42" : "#343a31";
        ctx.lineWidth = 2;
        roundedRect(ctx, x, y, cardWidth, cardHeight, 5);
        ctx.fill(); ctx.stroke();
        ctx.save();
        roundedRect(ctx, x + 7, y + 7, cardWidth - 14, 112, 3);
        ctx.clip();
        ctx.filter = ownedItem ? "none" : "grayscale(1) brightness(.43)";
        const image = images[index];
        if (image) ctx.drawImage(image, x + 7, y + 7, cardWidth - 14, 112);
        else { ctx.fillStyle = "#292d26"; ctx.fillRect(x + 7, y + 7, cardWidth - 14, 112); }
        ctx.restore();
        ctx.fillStyle = { Fire: "#b24d3e", Water: "#437bac", Wind: "#819d4b", Light: "#cfbb68", Dark: "#735c8d" }[monster.element] || "#777";
        ctx.fillRect(x + 12, y + 12, 22, 18);
        ctx.fillStyle = monster.element === "Light" ? "#191711" : "#fff";
        ctx.font = '700 11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(elementZh[monster.element] || "?", x + 23, y + 25);
        ctx.textAlign = "left";
        if (ownedItem) {
          ctx.fillStyle = "#f1cb79";
          ctx.beginPath(); ctx.arc(x + cardWidth - 20, y + 20, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#17160f"; ctx.font = '800 13px sans-serif'; ctx.textAlign = "center"; ctx.fillText("✓", x + cardWidth - 20, y + 25); ctx.textAlign = "left";
        }
        ctx.fillStyle = "#d8ad58";
        ctx.font = '10px sans-serif';
        ctx.fillText("★".repeat(monster.stars), x + 10, y + 135);
        ctx.fillStyle = ownedItem ? "#f3f1e8" : "#888d82";
        ctx.font = '700 14px "Microsoft YaHei", sans-serif';
        ctx.fillText(fitText(ctx, displayName(monster), cardWidth - 20), x + 10, y + 154);
        ctx.fillStyle = "#73796e";
        ctx.font = '10px Arial, sans-serif';
        ctx.fillText(fitText(ctx, monster.awakenedNameEn || monster.nameEn, cardWidth - 20), x + 10, y + 169);
      });
      ctx.fillStyle = "#5f655b";
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText("数据仅在浏览器本地处理 · 图鉴资料来源：SWGT", margin, height - 26);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("浏览器未能生成图片");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${state.profile?.name || "召唤师"}-魔灵图鉴-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      el.exportDialog.close();
      showToast(`图片已生成：${monsters.length} 个魔灵`);
    } catch (error) {
      showToast(`导出失败：${error.message}`, true);
    } finally {
      button.disabled = false;
      progress.hidden = true;
    }
  }

  function openEditor(key) {
    const monster = allMonsters().find((item) => item.key === key);
    if (!monster) return;
    state.editingKey = key;
    $("#editMonster").innerHTML = `<img src="${escapeHtml(monster.image)}" alt=""><div><strong>${escapeHtml(monster.awakenedNameEn || monster.nameEn)}</strong><span>${escapeHtml(monster.nameEn)} · ${elementZh[monster.element]}属性 · 原生${monster.stars}星</span></div>`;
    $("#editNameZh").value = monster.nameZh || "";
    $("#editAwakenedNameZh").value = monster.awakenedNameZh || "";
    const elementalPrefix = elementZh[monster.element];
    $("#editAliases").value = monster.aliases.filter((alias) => !alias.startsWith(elementalPrefix)).join(", ");
    el.editDialog.showModal();
  }

  function saveEditor() {
    if (!state.editingKey) return;
    customNames[state.editingKey] = {
      nameZh: $("#editNameZh").value.trim(),
      awakenedNameZh: $("#editAwakenedNameZh").value.trim(),
      aliases: $("#editAliases").value.split(/[,，\n\r]/).map((item) => item.trim()).filter(Boolean)
    };
    localStorage.setItem("sw-codex-names", JSON.stringify(customNames));
    saveCustomName(state.editingKey, customNames[state.editingKey]);
    el.editDialog.close();
    render();
    showToast("中文名称与别名已保存");
  }

  $("#importButton").addEventListener("click", () => el.file.click());
  el.file.addEventListener("change", () => importFile(el.file.files[0]));
  $("#resetButton").addEventListener("click", resetProfile);
  $("#exportButton").addEventListener("click", () => { updateExportEstimate(); el.exportDialog.showModal(); });
  $("#confirmExport").addEventListener("click", exportPng);
  $("#saveEdit").addEventListener("click", saveEditor);
  ["#exportNat5", "#exportLd4", "#exportVisible"].forEach((selector) => $(selector).addEventListener("change", updateExportEstimate));
  $("#searchInput").addEventListener("input", (event) => { state.search = event.target.value; render(); });
  $("#starFilter").addEventListener("change", (event) => { state.stars = event.target.value; render(); });
  $$("[data-status]").forEach((button) => button.addEventListener("click", () => {
    state.status = button.dataset.status;
    $$("[data-status]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  $$("[data-element]").forEach((button) => button.addEventListener("click", () => {
    state.element = button.dataset.element;
    $$("[data-element]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  $$("[data-grouping]").forEach((button) => button.addEventListener("click", () => {
    state.grouping = button.dataset.grouping;
    const mixedFamilyOption = $("#mixedFamilyOption");
    const familyMode = state.grouping === "family";
    mixedFamilyOption.hidden = !familyMode;
    mixedFamilyOption.disabled = !familyMode;
    if (!familyMode && state.stars === "mixed45") {
      state.stars = "featured";
      $("#starFilter").value = state.stars;
    }
    $$("[data-grouping]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    render();
  }));
  $("#showNames").addEventListener("change", (event) => {
    state.showNames = event.target.checked;
    el.grid.classList.toggle("show-names", state.showNames);
  });
  $("#showMissingLd").addEventListener("change", (event) => {
    state.showMissingLd = event.target.checked;
    render();
  });
  el.grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-key]");
    if (card) openEditor(card.dataset.key);
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => { event.preventDefault(); dragDepth += 1; $("#dropOverlay").classList.add("visible"); });
  window.addEventListener("dragleave", (event) => { event.preventDefault(); dragDepth -= 1; if (dragDepth <= 0) $("#dropOverlay").classList.remove("visible"); });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault(); dragDepth = 0; $("#dropOverlay").classList.remove("visible");
    importFile([...event.dataTransfer.files].find((file) => file.name.toLowerCase().endsWith(".json")));
  });

  render();
  loadCustomNames().then(render);
})();
