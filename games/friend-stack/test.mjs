// Automated check with the SDK's mock wallet and sample Friend. Run from the SDK root:
//   node games/friend-stack/test.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { testGame } from "../../scripts/testing.mjs";

// FRIEND_STACK_CHROME=chrome uses the installed Google Chrome when Playwright's own Chromium is unavailable.
if (process.env.FRIEND_STACK_CHROME) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = options => launch({ ...options, channel: process.env.FRIEND_STACK_CHROME });
}

const directory = fileURLToPath(new URL(".", import.meta.url));

function helpers({ page, game }) {
  const canvas = game.locator("canvas.stack-canvas");
  const read = async name => await canvas.getAttribute(`data-${name}`);
  const button = name => game.getByRole("button", { name, exact: true });
  const confirm = () => page.getByRole("button", { name: "Confirm preview", exact: true }).click();
  const shot = path => page.locator(".rf-game-frame").screenshot({ path });
  const towerDown = () => game.getByRole("heading", { name: "Tower down" });
  /** Waits until a piece is hovering; optionally restarts if the tower toppled. */
  const ready = async ({ restart = true } = {}) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (restart && await towerDown().count()) await button("Stack again").click();
      if (await button("Drop").isEnabled()) return;
      await page.waitForTimeout(100);
    }
    throw new Error("No piece became ready to drop");
  };
  return { canvas, read, button, confirm, shot, towerDown, ready };
}

async function desktop(context) {
  const { page, game } = context, { canvas, read, button, confirm, shot, towerDown, ready } = helpers(context);
  await game.getByRole("heading", { name: "Friend Stack" }).waitFor();
  await shot("artifacts/friend-stack-intro.png");
  await game.getByRole("button", { name: /^Free Stack / }).click();
  await game.locator('canvas[data-mode="free"]').waitFor();
  // The fixture Friend is Generation 1, so Free Stack uses the widest land.
  await game.locator('canvas[data-land="5.2"]').waitFor();

  let dropped = 0;
  for (; dropped < 16; dropped++) {
    await ready();
    if (dropped % 3 === 1) await canvas.press("ArrowUp");
    await button("Drop").click();
    if (Number(await read("height")) >= 3.2) break;
  }
  await ready();
  const result = { dropped: dropped + 1, height: Number(await read("height")), crate: "not attempted", revive: "not attempted" };

  await game.getByRole("button", { name: /^Crates · / }).click();
  await button("Buy crate · 1 RF").click();
  await confirm();
  await game.getByText(/1 crate in pack/).waitFor();
  await game.getByRole("button", { name: "Close Summit Crates" }).click();
  // A crate can slide off an uneven top and return to the pack; carry it up again when that happens.
  let outcome = "blocked", attempts = 0;
  for (; attempts < 4 && outcome !== "confirm"; attempts++) {
    await ready();
    while (Number(await read("height")) < 3.2) { await button("Drop").click(); await ready(); }
    await game.getByRole("button", { name: /^Crates · / }).click();
    const carry = button("Carry a crate up");
    if (await carry.isDisabled()) { await game.getByRole("button", { name: "Close Summit Crates" }).click(); continue; }
    await carry.click();
    await game.getByText(/^Summit Crate! Land it on your tower/).waitFor();
    await button("Drop").click();
    await game.locator('canvas[data-crate="placed"]').waitFor();
    const opened = page.getByRole("button", { name: "Confirm preview", exact: true }).waitFor().then(() => "confirm", () => "timeout");
    const returned = game.locator('canvas[data-crate="none"]').waitFor().then(() => "returned", () => "timeout");
    outcome = await Promise.race([opened, returned]);
  }
  if (outcome !== "confirm") result.crate = `bought; not opened after ${attempts} carries (${outcome})`;
  else {
    await confirm();
    await game.getByRole("heading", { name: "Crate opened" }).waitFor();
    result.crate = `opened on carry ${attempts}: ${await game.locator(".stack-reveal h3").textContent()}`;
    await shot("artifacts/friend-stack-reveal.png");
    await game.getByRole("button", { name: /^(Wear it|Crown my tower|Wear Prism Coat)$/ }).click();
    await game.getByRole("button", { name: "Coats", exact: true }).click();
    await game.getByText(/Collection \d\/3/).first().waitFor();
    await game.getByRole("button", { name: "Close Coats" }).click();
  }

  // Lose all three lives on purpose: steer each piece past the platform edge.
  await ready();
  for (let life = 0; life < 3 && !(await towerDown().count()); life++) {
    await ready({ restart: false });
    await canvas.press("ArrowLeft", { delay: 1300 });
    await button("Drop").click();
    await page.waitForTimeout(1800);
  }
  await towerDown().waitFor({ timeout: 10_000 });
  await game.locator(".stack-card img").waitFor();
  assert.match(await game.locator(".stack-card img").getAttribute("src"), /^data:image\/png;base64,/);
  await shot("artifacts/friend-stack-over.png");
  assert.doesNotMatch(await game.locator(".stack-over").innerText(), /NaN/);
  assert.match(await game.locator(".stack-land").innerText(), /Gen 1 land: 10\.4 m Gold platform/);
  assert.match(await game.locator(".stack-revive").innerText(), /1,000 RF, then 2,000 RF, then 3,000 RF on mainnet/);

  const revive = game.getByRole("button", { name: /^(Buy 1 & revive|Revive · open 1 crate)/ });
  const needsPurchase = (await revive.textContent()).startsWith("Buy");
  await revive.click();
  if (needsPurchase) await confirm();
  await confirm();
  await game.getByRole("heading", { name: "Revived!" }).waitFor();
  await shot("artifacts/friend-stack-revived.png");
  await button("Keep stacking").click();
  await ready({ restart: false });
  await game.getByText(/revived ×1/).waitFor();
  result.revive = `revived with ${needsPurchase ? "a purchased" : "an owned"} crate`;
  await game.getByRole("button", { name: /^Crates · / }).click();
  const spendText = await game.locator(".stack-spend").innerText();
  assert.match(spendText, /Spent on crates\s+[12],000 RF/i);
  assert.doesNotMatch(spendText, /NaN/);
  result.spend = spendText.replace(/\s+/g, " ").match(/Spent on crates .*?Prize pool result \S+ RF/i)?.[0];
  await game.getByRole("button", { name: "Close Summit Crates" }).click();

  await game.getByRole("button", { name: "Settings and help" }).click();
  await button("Change mode").click();
  await game.getByRole("button", { name: /^Daily Tower · / }).click();
  await game.locator('canvas[data-mode="daily"]').waitFor();
  const dailyLand = await read("land");
  assert(["3", "4"].includes(dailyLand), `Daily Tower must ignore generation land (got ${dailyLand})`);
  await ready();
  await button("Drop").click();
  result.daily = `started on the standard ${Number(dailyLand) * 2} m platform`;
  return result;
}

async function phone(context) {
  const { game } = context, { read, button, ready } = helpers(context);
  await game.getByRole("button", { name: /^Daily Tower · / }).click();
  await game.locator('canvas[data-mode="daily"]').waitFor();
  for (let index = 0; index < 3; index++) { await ready(); await button("Drop").click(); }
  await ready();
  return { dropped: 3, pieces: Number(await read("pieces")) };
}

const results = [];
for (const options of [
  { width: 960, height: 800, screenshot: "artifacts/friend-stack-desktop.png", run: desktop },
  { width: 390, height: 780, screenshot: "artifacts/friend-stack-phone.png", run: phone },
]) {
  let summary;
  const run = await testGame(directory, { width: options.width, height: options.height, screenshot: options.screenshot, timeout: 20_000,
    check: async context => {
      try { summary = await options.run(context); }
      catch (error) {
        await context.page.screenshot({ path: `artifacts/friend-stack-failure-${options.width}.png` });
        console.error("Failure state:", await context.game.locator("#root").evaluate(root => ({
          text: root.innerText.slice(0, 800), canvas: { ...root.querySelector("canvas")?.dataset } })));
        throw error;
      }
    } });
  results.push({ width: run.width, screenshot: run.screenshot, ...summary });
}
console.log(JSON.stringify(results, null, 2));
