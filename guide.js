(() => {
  "use strict";
  const catalog = Array.isArray(window.MONSTER_CATALOG) ? window.MONSTER_CATALOG : [];
  const zhOverrides = window.MONSTER_ZH_OVERRIDES || {};
  let customNames = JSON.parse(localStorage.getItem("sw-codex-names") || "{}");
  const elementZh = { Fire: "火", Water: "水", Wind: "风", Light: "光", Dark: "暗" };
  const guideSlots = [null, null, null];
  let activeSlot = 0;
  let editingKey = null;
  let aliasDraft = [];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const toast = $("#toast");
  let toastTimer;
  const HAN_INITIALS = Object.fromEntries("水s 雷l 帝d 光g 暗a 火h 风f 龙l 鸡j 牛n 猴h 子z 瓦w 奥a 萝l 莉l 天t 使s 神s 谕y 王w 仙x 人r 熊x 猫m 豹b 狼l 虎h 狮s 鹰y 鬼g 妖y 女n 男n 剑j 骑q 士s 斗d 忍r 者z 魔m 法f 朋p 友y 牌p 炮p 狙j 击j 枪q 舞w 姬j 琴q 师s 死s 亡w 传c 说s 战z 机j 器q 僧s 兽s 召z 唤h 觉j 醒x 骨g 头t 影y 刺c 客k 盗d 船c 长z 海h 南n 北b 东d 西x 赤c 炎y 冰b 雪x 森s 林l 云y 石s 兔t 蛇s 蝎x 鸟n 鹿l 象x 狐h 狸l 花h 树s 精j 灵l 炸z 弹d 画h 伯b 术s 拳q 功g 夫f 魅m 恶e 毒d 诅z 咒z 探t 冒m 险x 勇y 旅l 行x 终z 祢n 炭t 治z 郎l 惠h 悟w 丝s 菲f 莲l 伦l 克k 休x 尔e 尤y 贝b 辛x 美m 弗f 里l 斯s 特t 维w 姆m 伊y 之z 平p 八b 保b 罗l 妮n 娜n 威w 廉l 佛f 多d 甘g 阿a 拉l 咕g 嘴z 米m 苏s 卡k 迪d 亚y 赛s 杰j 洛l 露l 达d 芙f 莎s 因y 格g 德d 蒙m 古g 盖g 加j 马m 泰t 戈g 耶y 萨s 乌w 丹d 恩e 诺n 安a 提t 曼m 迦j 布b 鲁l 乔q 奇q 纳n 麦m 索s 凯k 斐f 薇w 托t 赞z 梅m 西x 蒂d 蕾l 芬f 丽l 瑞r 塔t 夏x 巴b 赫h".split(" ").map((pair) => pair.split("")));

  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function toInitials(value) { return [...String(value || "")].map((char) => HAN_INITIALS[char] || (/[a-z0-9]/i.test(char) ? char.toLowerCase() : "")).join(""); }
  function normalizeSearch(value) { return String(value || "").toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, ""); }
  function pinyinForms(value) {
    const normalized = normalizeSearch(value);
    if (!value || !window.pinyinPro?.pinyin) return [normalized, toInitials(value)].filter(Boolean);
    const syllables = window.pinyinPro.pinyin(String(value), { toneType: "none", type: "array", nonZh: "consecutive" });
    return [...new Set([normalized, syllables.join(""), syllables.map((syllable) => syllable[0] || "").join("")].map(normalizeSearch).filter(Boolean))];
  }
  function isSubsequence(query, target) {
    let index = 0;
    for (const char of target) if (char === query[index]) index += 1;
    return index === query.length;
  }
  function hydrate(monster) {
    const familyKey = monster.nameEn.replace(/^(Fire|Water|Wind|Light|Dark)\s+/, "");
    const preset = zhOverrides[monster.nameEn] || zhOverrides[familyKey] || {};
    const custom = customNames[monster.key] || {};
    const nameZh = custom.nameZh ?? (monster.nameZh || preset.name || "");
    const awakenedNameZh = custom.awakenedNameZh ?? (monster.awakenedNameZh || "");
    const aliases = [...new Set([...(custom.aliases ?? [...(monster.aliases || []), ...(preset.aliases || [])]), nameZh ? `${elementZh[monster.element] || ""}${nameZh}` : ""].filter(Boolean))];
    const searchNames = [nameZh, awakenedNameZh, ...aliases, monster.nameEn, monster.awakenedNameEn];
    return { ...monster, nameZh, awakenedNameZh, aliases, searchForms: [...new Set(searchNames.flatMap(pinyinForms))] };
  }
  function matchScore(monster, query) {
    const normalized = normalizeSearch(query);
    if (!normalized) return 0;
    const forms = [...monster.searchForms, ...monster.ids.map(String)];
    if (forms.some((form) => form === normalized)) return 100;
    if (forms.some((form) => form.startsWith(normalized))) return 80;
    if (forms.some((form) => form.includes(normalized))) return 60;
    if (normalized.length >= 3 && forms.some((form) => isSubsequence(normalized, form))) return 30;
    return 0;
  }
  function guideId(monster) { return monster ? (monster.ids[monster.ids.length - 1] || monster.ids[0]) : ""; }
  function showToast(message) { clearTimeout(toastTimer); toast.textContent = message; toast.className = "toast visible"; toastTimer = setTimeout(() => { toast.className = "toast"; }, 2200); }
  async function loadCustomNames() {
    try {
      const response = await fetch("/api/monster-edits", { cache: "no-store" });
      if (!response.ok) throw new Error("编辑信息服务不可用");
      customNames = (await response.json()).edits || {};
      localStorage.setItem("sw-codex-names", JSON.stringify(customNames));
    } catch { /* Browser fallback keeps the page usable when opened as a static file. */ }
  }
  async function saveCustomName(key, value) {
    try {
      const response = await fetch(`/api/monster-edits/${encodeURIComponent(key)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error("SQLite 保存失败");
    } catch { showToast("SQLite 服务不可用，已暂存到当前浏览器"); }
  }
  function renderResults() {
    const query = $("#guideSearch").value.trim();
    const results = query ? catalog.map(hydrate).map((monster) => ({ monster, score: matchScore(monster, query) })).filter((item) => item.score).sort((a, b) => b.score - a.score || a.monster.familyId - b.monster.familyId).slice(0, 80).map((item) => item.monster) : [];
    $("#guideResultCount").textContent = query ? `${results.length} 个结果` : "输入关键词开始搜索";
    $("#guideResults").innerHTML = results.length ? results.map((monster) => `<button class="guide-result-card ${guideSlots.some((item) => item?.key === monster.key) ? "guide-selected" : ""}" type="button" draggable="true" data-key="${escapeHtml(monster.key)}"><img src="${escapeHtml(monster.image)}" alt=""><span><strong>${escapeHtml(monster.awakenedNameZh || monster.nameZh || monster.awakenedNameEn)}</strong><small>${escapeHtml(monster.awakenedNameEn || monster.nameEn)} · ${escapeHtml(elementZh[monster.element] || monster.element)} · ID ${guideId(monster)}</small></span></button>`).join("") : `<p class="guide-empty">${query ? "没有找到匹配的魔灵" : "搜索中文名、别名或首字母"}</p>`;
  }
  function renderTeam() {
    $$('[data-guide-slot]').forEach((slot, index) => {
      const monster = guideSlots[index];
      slot.classList.toggle("active", index === activeSlot);
      slot.draggable = Boolean(monster);
      slot.querySelector(".guide-slot-image").innerHTML = monster ? `<img src="${escapeHtml(monster.image)}" alt="">` : "";
      slot.querySelector("strong").textContent = monster ? (monster.awakenedNameEn || monster.nameEn) : "未选择";
      slot.querySelector("small").textContent = monster ? `${elementZh[monster.element] || monster.element} · ID ${guideId(monster)}` : "点击搜索结果加入";
    });
    const params = new URLSearchParams({ searchBy: "type", showFilters: "N", monsterLeader: guideId(guideSlots[0]), monster2: guideId(guideSlots[1]), monster3: guideId(guideSlots[2]) });
    const hasMonster = guideSlots.some(Boolean);
    const link = $("#guideLink");
    link.href = `https://swgt.io/3mdc/?${params.toString()}`;
    link.classList.toggle("disabled", !hasMonster);
    link.setAttribute("aria-disabled", String(!hasMonster));
    link.tabIndex = hasMonster ? 0 : -1;
    $("#editGuideMonster").disabled = !guideSlots[activeSlot];
    renderResults();
  }
  function renderAliases() {
    $("#guideAliasList").innerHTML = aliasDraft.length ? aliasDraft.map((alias, index) => `<span class="alias-chip">${escapeHtml(alias)}<button type="button" data-alias-remove="${index}" aria-label="删除别名 ${escapeHtml(alias)}">×</button></span>`).join("") : `<span class="guide-empty">暂未添加别名</span>`;
  }
  function addAlias() {
    const input = $("#guideAliasInput");
    const values = input.value.split(/[,，\n\r]/).map((alias) => alias.trim()).filter(Boolean);
    aliasDraft = [...new Set([...aliasDraft, ...values])].slice(0, 30);
    input.value = "";
    renderAliases();
  }
  function openEditor() {
    const monster = guideSlots[activeSlot];
    if (!monster) return;
    editingKey = monster.key;
    $("#guideEditMonsterPreview").innerHTML = `<img src="${escapeHtml(monster.image)}" alt=""><div><strong>${escapeHtml(monster.awakenedNameEn || monster.nameEn)}</strong><span>${escapeHtml(monster.nameEn)} · ${escapeHtml(elementZh[monster.element] || monster.element)}属性 · 原生${monster.stars}星</span></div>`;
    $("#guideEditNameZh").value = monster.nameZh || "";
    $("#guideEditAwakenedNameZh").value = monster.awakenedNameZh || "";
    const source = catalog.find((item) => item.key === monster.key);
    const familyKey = source.nameEn.replace(/^(Fire|Water|Wind|Light|Dark)\s+/, "");
    const preset = zhOverrides[source.nameEn] || zhOverrides[familyKey] || {};
    aliasDraft = [...new Set(customNames[monster.key]?.aliases ?? [...(source.aliases || []), ...(preset.aliases || [])])];
    $("#guideAliasInput").value = "";
    renderAliases();
    $("#guideEditDialog").showModal();
  }
  async function saveEditor() {
    if (!editingKey) return;
    const value = {
      nameZh: $("#guideEditNameZh").value.trim(),
      awakenedNameZh: $("#guideEditAwakenedNameZh").value.trim(),
      aliases: aliasDraft
    };
    customNames[editingKey] = value;
    localStorage.setItem("sw-codex-names", JSON.stringify(customNames));
    await saveCustomName(editingKey, value);
    const index = guideSlots.findIndex((monster) => monster?.key === editingKey);
    if (index >= 0) guideSlots[index] = hydrate(catalog.find((monster) => monster.key === editingKey));
    $("#guideEditDialog").close();
    renderTeam();
    showToast("魔灵信息已保存");
  }
  $("#guideSearch").addEventListener("input", renderResults);
  $$("[data-guide-slot]").forEach((slot) => slot.addEventListener("click", () => { activeSlot = Number(slot.dataset.guideSlot); renderTeam(); }));
  $$("[data-guide-slot]").forEach((slot) => {
    slot.addEventListener("dragstart", (event) => {
      const index = Number(slot.dataset.guideSlot);
      if (!guideSlots[index]) return event.preventDefault();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `slot:${index}`);
      slot.closest(".guide-slot-wrap").classList.add("dragging");
    });
    slot.addEventListener("dragend", () => slot.closest(".guide-slot-wrap").classList.remove("dragging"));
    slot.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; slot.classList.add("drag-over"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const target = Number(slot.dataset.guideSlot);
      const [kind, value] = event.dataTransfer.getData("text/plain").split(":");
      if (kind === "slot") {
        const source = Number(value);
        [guideSlots[source], guideSlots[target]] = [guideSlots[target], guideSlots[source]];
      } else if (kind === "monster") {
        const monster = catalog.find((item) => item.key === value);
        if (monster) guideSlots[target] = hydrate(monster);
      }
      activeSlot = target;
      renderTeam();
    });
  });
  $$("[data-guide-clear]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); guideSlots[Number(button.dataset.guideClear)] = null; activeSlot = Number(button.dataset.guideClear); renderTeam(); }));
  $("#guideResults").addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-key]");
    if (!card) return;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `monster:${card.dataset.key}`);
  });
  $("#guideResults").addEventListener("dragend", (event) => event.target.closest("[data-key]")?.classList.remove("dragging"));
  document.addEventListener("dragend", () => { $$(".drag-over").forEach((item) => item.classList.remove("drag-over")); $$(".dragging").forEach((item) => item.classList.remove("dragging")); });
  $("#guideResults").addEventListener("click", (event) => {
    const card = event.target.closest("[data-key]");
    if (!card) return;
    const monster = hydrate(catalog.find((item) => item.key === card.dataset.key));
    guideSlots[activeSlot] = monster;
    const nextEmpty = guideSlots.findIndex((slot) => !slot);
    if (nextEmpty >= 0) activeSlot = nextEmpty;
    renderTeam();
    showToast(`已选择 ${monster.awakenedNameEn || monster.nameEn}`);
  });
  $("#clearGuide").addEventListener("click", () => { guideSlots.fill(null); activeSlot = 0; renderTeam(); });
  $("#editGuideMonster").addEventListener("click", openEditor);
  $("#addGuideAlias").addEventListener("click", addAlias);
  $("#guideAliasInput").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addAlias(); } });
  $("#guideAliasList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-alias-remove]");
    if (!button) return;
    aliasDraft.splice(Number(button.dataset.aliasRemove), 1);
    renderAliases();
  });
  $("#saveGuideEdit").addEventListener("click", saveEditor);
  $("#guideLink").addEventListener("click", (event) => { if (!guideSlots.some(Boolean)) event.preventDefault(); });
  renderTeam();
  loadCustomNames().then(renderTeam);
})();
