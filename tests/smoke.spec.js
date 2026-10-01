import { test, expect } from "@playwright/test";

test("imports a real profile and exports a filtered PNG", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:4173");
  await expect(page.locator("#totalCount")).toHaveText("940");
  const statFixture = await page.evaluate(() => {
    const monsters = window.MONSTER_CATALOG;
    const summonLd5 = monsters.filter((monster) => monster.stars === 5 && ["Light", "Dark"].includes(monster.element) && !monster.gift);
    const giftLd5 = monsters.find((monster) => monster.stars === 5 && ["Light", "Dark"].includes(monster.element) && monster.gift);
    return { summonLd5Id: summonLd5[0].ids[0], giftLd5Id: giftLd5.ids[0], summonLd5Total: summonLd5.length };
  });
  const profile = {
    wizard_info: { wizard_name: "测试召唤师", wizard_id: 123456, wizard_level: 100 },
    unit_collection: [35711, statFixture.summonLd5Id, statFixture.giftLd5Id].map((unit_master_id) => ({ unit_master_id, open: 1 })),
    unit_list: []
  };
  await page.locator("#fileInput").setInputFiles({ name: "profile.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(profile)) });
  await expect(page.locator("#profileLine")).toContainText("测试召唤师");
  await expect(page.locator("#ownedCount")).not.toHaveText("0");
  await expect(page.locator("#elementalNat5Count")).toHaveText("1");
  await expect(page.locator("#summonLd5Count")).toHaveText("1");
  await expect(page.locator("#summonLd5Total")).toHaveText(`共 ${statFixture.summonLd5Total} 只`);

  await page.locator("#searchInput").fill("Water Frieren");
  await expect(page.locator(".monster-card")).toHaveCount(1);
  await expect(page.locator(".monster-card")).toHaveClass(/owned/);
  await expect(page.locator(".monster-name")).toHaveText("水芙莉莲");
  await expect(page.locator("#emptyState")).toBeHidden();
  await page.screenshot({ path: "debug/codex-desktop.png", fullPage: false });

  await page.locator("#exportButton").click();
  await expect(page.locator("#exportNat5")).toBeChecked();
  await expect(page.locator("#exportLd4")).toBeChecked();
  await page.locator("#exportNat5").uncheck();
  await page.locator("#exportLd4").uncheck();
  await page.locator("#exportVisible").check();
  await expect(page.locator("#exportEstimate")).toHaveText("1 个魔灵");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#confirmExport").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("魔灵图鉴");
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("http://127.0.0.1:4173");
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  await page.screenshot({ path: "debug/codex-mobile.png", fullPage: false });
});

test("switches between element and family grouping", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  await expect(page.locator(".monster-group").first()).toHaveAttribute("data-group-key", "gift");
  await expect(page.locator('[data-group-key="gift"] .monster-card')).toHaveCount(22);
  await expect(page.locator('[data-group-key="Light"]')).toHaveCount(0);
  await expect(page.locator('[data-group-key="Dark"]')).toHaveCount(0);
  await expect(page.locator('[data-group-key="Light4"]')).toHaveCount(1);
  await expect(page.locator('[data-group-key="Dark4"]')).toHaveCount(1);
  await expect(page.locator('[data-group-key="Light4"] .monster-card:not(.owned)')).not.toHaveCount(0);
  await expect(page.locator('[data-group-key="Dark4"] .monster-card:not(.owned)')).not.toHaveCount(0);
  await expect(page.locator("#showMissingLd")).not.toBeChecked();
  await page.locator("#showMissingLd").check();
  await expect(page.locator('[data-group-key="gift"] .monster-card')).toHaveCount(22);
  await expect(page.locator('[data-group-key="Light4"]')).toHaveCount(1);
  await expect(page.locator('[data-group-key="Dark4"]')).toHaveCount(1);
  await page.locator("#searchInput").fill("Valkyrja");

  await expect(page.locator(".monster-group-head h3")).toHaveText(["赠送魔灵（胎五）", "光属性胎五", "暗属性胎五", "火属性胎五", "水属性胎五"]);
  await expect(page.locator(".monster-group").first().locator(".monster-group-head span")).toHaveText("已点亮 0 / 1");
  await expect(page.locator(".monster-name").first()).toBeHidden();
  await expect(page.locator(".monster-stars").first()).toBeHidden();
  await page.locator("#showNames").check();
  await expect(page.locator(".monster-name").first()).toBeVisible();
  await expect(page.locator(".monster-stars").first()).toBeVisible();

  await page.locator('[data-grouping="family"]').click();
  await expect(page.locator(".monster-group")).toHaveCount(1);
  await expect(page.locator(".monster-group-head h3")).toHaveText("瓦");
  await expect(page.locator(".monster-card")).toHaveCount(5);
  expect(await page.locator(".monster-card").evaluateAll((cards) => cards.map((card) => card.dataset.key))).toEqual([
    "13800-Fire", "13800-Water", "13800-Wind", "13800-Light", "13800-Dark"
  ]);
  await expect(page.locator('[data-grouping="family"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mixedFamilyOption")).toHaveJSProperty("disabled", false);
  await expect(page.locator("#mixedFamilyOption")).toHaveJSProperty("hidden", false);

  await page.locator("#searchInput").fill("");
  const mixedFamilyCount = await page.evaluate(() => {
    const starsByFamily = new Map();
    window.MONSTER_CATALOG.forEach((monster) => {
      if (!starsByFamily.has(monster.familyId)) starsByFamily.set(monster.familyId, new Set());
      starsByFamily.get(monster.familyId).add(monster.stars);
    });
    return [...starsByFamily.values()].filter((stars) => stars.has(4) && stars.has(5)).length;
  });
  await page.locator("#starFilter").selectOption("mixed45");
  await expect(page.locator(".monster-group")).toHaveCount(mixedFamilyCount);
  const displayedStars = await page.locator(".monster-card").evaluateAll((cards) => cards.map((card) => {
    const monster = window.MONSTER_CATALOG.find((item) => item.key === card.dataset.key);
    return monster.stars;
  }));
  expect(new Set(displayedStars)).toEqual(new Set([4, 5]));

  await page.locator('[data-grouping="element"]').click();
  await expect(page.locator("#starFilter")).toHaveValue("featured");
  await expect(page.locator("#mixedFamilyOption")).toHaveJSProperty("disabled", true);
});

test("maps collaboration IDs to their replacement monsters", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173");
  const profile = {
    wizard_info: { wizard_name: "联动测试" },
    unit_collection: [{ unit_master_id: 24012, open: 1 }],
    unit_list: []
  };
  await page.locator("#fileInput").setInputFiles({
    name: "collaboration.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(profile))
  });

  await expect(page.locator('[data-key="24500-Fire"]')).toHaveClass(/owned/);
  expect(await page.locator('[data-key="24500-Fire"]').evaluate((card) => getComputedStyle(card, "::after").content)).toBe("none");
  await expect(page.locator('[data-key="24000-Fire"]')).toHaveCount(0);
  await page.locator("#searchInput").fill("RYU");
  await expect(page.locator(".monster-card")).toHaveCount(3);
  await page.locator("#showMissingLd").check();
  await expect(page.locator(".monster-card")).toHaveCount(5);
});

test("searches Chinese aliases and builds an SWGT siege guide link", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/guide.html");
  await page.locator("#guideSearch").fill("水雷帝");
  await expect(page.locator(".guide-result-card").first()).toBeVisible();
  await page.locator(".guide-result-card").first().click();
  await expect(page.locator('[data-guide-slot="0"] strong')).toHaveText("Bolverk");
  await expect(page.locator("#guideLink")).toHaveAttribute("href", /monsterLeader=22611/);

  await page.locator('[data-guide-slot="1"]').click();
  await page.locator("#guideSearch").fill("sld");
  await expect(page.locator(".guide-result-card").first()).toBeVisible();
  await page.locator(".guide-result-card").first().click();
  await expect(page.locator('[data-guide-slot="1"] strong')).toHaveText("Bolverk");
  await expect(page.locator("#guideLink")).toHaveAttribute("href", /monster2=22611/);
  await page.locator('[data-guide-clear="1"]').click();
  await expect(page.locator('[data-guide-slot="1"] strong')).toHaveText("未选择");
  await expect(page.locator("#guideLink")).toHaveAttribute("href", /monster2=&/);
  await page.locator('[data-guide-slot="0"]').click();
  await page.locator("#editGuideMonster").click();
  await page.locator("#guideAliasInput").fill("雷神");
  await page.locator("#addGuideAlias").click();
  await page.locator("#guideAliasInput").fill("小雷");
  await page.locator("#addGuideAlias").click();
  await expect(page.locator(".alias-chip")).toContainText(["雷神", "小雷"]);
  await page.locator("#saveGuideEdit").click();
  await page.locator("#guideSearch").fill("小雷");
  await expect(page.locator(".guide-result-card").first()).toBeVisible();
  await page.locator("#guideSearch").fill("shuileidi");
  await expect(page.locator(".guide-result-card").first()).toContainText("Bolverk");
  await page.locator("#guideSearch").fill("shuild");
  await expect(page.locator(".guide-result-card").first()).toContainText("Bolverk");
  await page.locator("#guideSearch").fill("水豹子");
  const resultTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator(".guide-result-card").first().dispatchEvent("dragstart", { dataTransfer: resultTransfer });
  await page.locator('[data-guide-slot="2"]').dispatchEvent("drop", { dataTransfer: resultTransfer });
  await expect(page.locator('[data-guide-slot="2"] strong')).toHaveText("Barbara");
  const slotTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator('[data-guide-slot="2"]').dispatchEvent("dragstart", { dataTransfer: slotTransfer });
  await page.locator('[data-guide-slot="1"]').dispatchEvent("drop", { dataTransfer: slotTransfer });
  await expect(page.locator('[data-guide-slot="1"] strong')).toHaveText("Barbara");
  await expect(page.locator('[data-guide-slot="2"] strong')).toHaveText("未选择");
  await page.reload();
  await page.locator("#guideSearch").fill("小雷");
  await expect(page.locator(".guide-result-card").first()).toBeVisible();
});
