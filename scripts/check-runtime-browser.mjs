// Automated fixture only: the actual public runner/runtime with mocked wallet and RPC.
// Run after npm run build and npx playwright install chromium.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, encodeEventTopics, padHex, parseAbi, zeroAddress } from "viem";
import { buildGame, createGameServer } from "./dev-game.mjs";

const OWNER = "0x1111111111111111111111111111111111111111";
const SECOND_OWNER = "0x2222222222222222222222222222222222222222";
const FRIEND_WALLET = "0x3333333333333333333333333333333333333333";
const COLLECTION = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function balanceOf(address account) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function generation(uint256 tokenId) view returns (uint8)",
  "function tokenBoundAccount(uint256 tokenId) view returns (address)",
]);
const ownerId = owner => owner.toLowerCase() === OWNER.toLowerCase() ? 7730n : 3412n;
const tokenOwner = id => id === 7730n ? OWNER : SECOND_OWNER;

export async function installFixture(page, origin, { artworkCall } = {}) {
  const state = { mode: "eligible", requests: [], ownerReads: 0, hold: null, release: null };
  await page.addInitScript(({ owner }) => {
    // Internal automation is the only place an account/identity may be mocked.
    const listeners = new Map();
    const state = { accounts: [], chainId: "0x1237", requests: [] };
    const emit = (event, value) => { for (const listener of listeners.get(event) ?? []) listener(value); };
    window.ethereum = {
      async request({ method }) {
        state.requests.push(method);
        if (method === "eth_accounts") return state.accounts;
        if (method === "eth_requestAccounts") { state.accounts = [owner]; return state.accounts; }
        if (method === "eth_chainId") return state.chainId;
        throw new Error(`Unexpected signing or wallet method: ${method}`);
      },
      on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
      removeListener(event, listener) { listeners.get(event)?.delete(listener); },
    };
    window.__friendWalletTest = {
      state,
      accounts(accounts) { state.accounts = accounts; emit("accountsChanged", accounts); },
      chain(chainId) { state.chainId = chainId; emit("chainChanged", chainId); },
      disconnect() { state.accounts = []; emit("disconnect", { code: 4900, message: "Fixture disconnected" }); },
    };
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = array => array instanceof Uint32Array && array.length === 1 ? (array[0] = 1500, array) : random(array);
  }, { owner: OWNER });

  async function answer(request) {
    state.requests.push(request);
    if (state.mode === "loading") await state.hold;
    if (state.mode === "rpc-error") return { jsonrpc: "2.0", id: request.id, error: { code: -32001, message: "Fixture RPC unavailable" } };
    let result;
    if (request.method === "eth_chainId") result = "0x1237";
    else if (request.method === "eth_blockNumber") result = "0x100";
    else if (request.method === "eth_getLogs") {
      const filter = request.params[0];
      assert.equal(filter.address.toLowerCase(), COLLECTION.toLowerCase());
      assert(filter.topics?.[1] || filter.topics?.[2], "Discovery must filter Transfer logs by the connected owner");
      const topic = filter.topics[2] || filter.topics[1];
      assert([padHex(OWNER, { size: 32 }), padHex(SECOND_OWNER, { size: 32 })].includes(topic.toLowerCase()), "Only owner-indexed history is allowed");
      const owner = `0x${topic.slice(-40)}`;
      result = filter.topics[1] ? [] : [{ address: COLLECTION, blockNumber: "0x10", blockHash: padHex("0x10", { size: 32 }),
        data: "0x", logIndex: "0x0", transactionHash: padHex("0x1234", { size: 32 }), transactionIndex: "0x0", removed: false,
        topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: zeroAddress, to: owner, tokenId: ownerId(owner) } }) }];
    } else if (request.method === "eth_call") {
      if (request.params[0].to.toLowerCase() !== COLLECTION.toLowerCase()) {
        assert.equal(typeof artworkCall, "function", "Read only the pinned collection unless artwork is explicitly mocked");
        result = await artworkCall(request.params[0]);
      } else {
        const { functionName, args } = decodeFunctionData({ abi: ABI, data: request.params[0].data });
        let value;
        if (functionName === "balanceOf") value = state.mode === "unowned" ? 0n : 1n;
        else {
          assert([7730n, 3412n].includes(args[0]), "Do not enumerate token IDs or scan the collection");
          if (functionName === "ownerOf") {
            state.ownerReads++;
            value = state.mode === "owner-changed" && state.ownerReads > 1 ? SECOND_OWNER : tokenOwner(args[0]);
          } else if (functionName === "generation") value = state.mode === "unhardwired" ? 0 : 1;
          else if (functionName === "tokenBoundAccount") value = FRIEND_WALLET;
          else throw new Error(`Unsupported collection read ${functionName}`);
        }
        result = encodeFunctionResult({ abi: ABI, functionName, result: value });
      }
    } else throw new Error(`Unexpected public RPC method: ${request.method}`);
    return { jsonrpc: "2.0", id: request.id, result };
  }
  await page.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
    assert.equal(new URL(url).hostname, "rpc.mainnet.chain.robinhood.com", "No external app, indexer key or developer service is required");
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type",
    } });
    const request = route.request().postDataJSON();
    const response = Array.isArray(request) ? await Promise.all(request.map(answer)) : await answer(request);
    return route.fulfill({ json: response, headers: { "access-control-allow-origin": "*" } });
  });
  return state;
}

export async function assertBounds(page) {
  assert.deepEqual(await page.evaluate(() => {
    const frame = document.querySelector(".rf-game-frame"), problems = [];
    if (!frame) return ["Missing standard SDK frame"];
    if (document.querySelectorAll(".rf-game-frame").length !== 1) problems.push("Nested SDK frames");
    const bounds = frame.getBoundingClientRect();
    if (Math.abs(bounds.width / bounds.height - 1.5) > .01) problems.push("Changed 960:640 aspect ratio");
    if (document.documentElement.scrollWidth > innerWidth) problems.push("Page overflow");
    if ([...document.querySelectorAll("nav,footer")].some(node => !frame.contains(node))) problems.push("Unrequested website scaffolding");
    for (const node of document.querySelectorAll("button,input,select,iframe")) {
      if (!frame.contains(node)) problems.push("Control outside game container");
    }
    for (const node of document.querySelectorAll(".rf-frame-menu")) {
      const box = node.getBoundingClientRect();
      if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) problems.push("Menu escaped container");
    }
    return problems;
  }), []);
}

export async function checkRuntimeBrowser() {
const directory = await mkdtemp(join(tmpdir(), "friendsdk-runtime-browser-"));
let build, server, browser;
try {
  build = await buildGame(resolve("examples/fishing"), { outdir: join(directory, "dist"), watch: false });
  server = createGameServer(build.outdir);
  // Exercise generated assets under ordinary static hosting without CORS setup.
  server.prependListener("request", (_request, response) => {
    const writeHead = response.writeHead.bind(response);
    response.writeHead = (status, headers = {}) => {
      delete headers["Access-Control-Allow-Origin"];
      return writeHead(status, headers);
    };
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });

  for (const width of [1100, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce", hasTouch: width < 500 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const fixture = await installFixture(page, origin);
    const child = () => page.frameLocator("iframe");
    const hostButton = name => page.getByRole("button", { name: name === "Connect wallet" ? /^Connect (wallet|Browser wallet)$/ : name, exact: true });
    const gameButton = name => child().getByRole("button", { name, exact: true });
    const loaded = () => child().getByRole("region", { name: "Fishing game", exact: true }).waitFor();
    const chooseFriend = id => page.getByRole("button", { name: new RegExp(`^Friend #${id}\\b`) }).click();
    await page.goto(origin);
    await hostButton("Connect wallet").waitFor();
    assert.equal(await page.locator("iframe").count(), 0, "No child before a wallet and eligible NFT");
    assert.equal(await page.evaluate(() => window.__friendWalletTest.state.requests.includes("eth_requestAccounts")), false);
    assert.equal(fixture.requests.length, 0, "No owned NFT requests before connection");
    await assertBounds(page);
    await hostButton("Connect wallet").click();
    await page.getByRole("button", { name: /^Friend #7730\b/ }).waitFor();
    if (width === 1100) {
      fixture.hold = new Promise(resolve => { fixture.release = resolve; });
      fixture.mode = "loading";
    }
    await chooseFriend(7730);
    if (width === 1100) {
      await page.getByText("Checking ownership and hardwired eligibility…", { exact: true }).waitFor();
      assert.equal(await page.locator("iframe").count(), 0, "Eligibility loading never enables the game");
      fixture.mode = "eligible";
      fixture.release();
    }
    await loaded();
    assert(fixture.ownerReads >= 2, "Verify selected ownership freshly after discovery");
    assert.equal(await page.locator("iframe").getAttribute("sandbox"), "allow-scripts");
    assert.equal(await child().locator("body").evaluate(() => { try { return Boolean(parent.document); } catch { return false; } }), false);
    assert.equal(await child().locator(".rf-game-frame").count(), 0, "Child is a game component without a nested frame");
    await assertBounds(page);
    await gameButton("Bait & tackle").click();
    await gameButton("Buy bait").click();
    await hostButton("Confirm preview").waitFor();
    await assertBounds(page);
    await hostButton("Confirm preview").click();
    await child().getByText("Bought 1 bait with simulated RF.", { exact: true }).waitFor();
    await gameButton("Back to the pond").click();
    await gameButton("Close The lake").first().click();
    assert.equal(await child().getByTestId("bait").textContent(), "1");
    const canvas = child().locator(".fv1-world canvas");
    const beforeMovement = await canvas.getAttribute("data-x");
    await canvas.focus();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(150);
    await page.keyboard.up("ArrowRight");
    assert.notEqual(await canvas.getAttribute("data-x"), beforeMovement, "Owned Friend moves with keyboard controls");
    if (width < 500) {
      const beforeTouch = await canvas.getAttribute("data-x");
      await canvas.tap();
      await page.waitForTimeout(150);
      assert.notEqual(await canvas.getAttribute("data-x"), beforeTouch, "Owned Friend moves with touch controls");
    }

    // Changing the wallet cancels the exact open confirmation and stale bridge.
    await gameButton("Bait & tackle").click();
    await gameButton("Buy bait").click();
    await hostButton("Confirm preview").waitFor();
    await page.evaluate(account => window.__friendWalletTest.accounts([account]), SECOND_OWNER);
    await chooseFriend(3412);
    await loaded();
    assert.equal(await hostButton("Confirm preview").count(), 0);
    assert.equal(await child().getByTestId("bait").textContent(), "0");
    await page.evaluate(() => window.__friendWalletTest.chain("0x1"));
    await page.locator("iframe").waitFor({ state: "detached" });
    await page.getByText(/4663/).waitFor();
    await assertBounds(page);
    await page.evaluate(() => window.__friendWalletTest.chain("0x1237"));
    await chooseFriend(3412);
    await loaded();
    await page.evaluate(() => window.__friendWalletTest.disconnect());
    await page.locator("iframe").waitFor({ state: "detached" });
    await hostButton("Connect wallet").waitFor();
    assert((await page.evaluate(() => window.__friendWalletTest.state.requests)).every(method => ["eth_accounts", "eth_requestAccounts", "eth_chainId"].includes(method)));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS public runtime ${width}px: connection, owner-indexed discovery, fresh gate, sandbox, simulated purchase, account/network/disconnect cancellation, container bounds.`);
  }

  for (const mode of ["unowned", "unhardwired", "owner-changed", "rpc-error"]) {
    const page = await browser.newPage();
    const fixture = await installFixture(page, origin);
    fixture.mode = mode;
    await page.goto(origin);
    await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
    if (mode === "owner-changed") {
      await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
      await page.getByRole("button", { name: "Retry eligibility", exact: true }).waitFor();
    } else {
      await page.getByRole("button", { name: "Refresh Friends", exact: true }).waitFor();
      // Wait for a terminal state after wallet connection, not the initial empty picker.
      if (mode === "rpc-error") await page.getByRole("alert").filter({ hasText: /Fixture RPC unavailable|could not/i }).waitFor({ timeout: 20_000 });
      else await page.getByText("No playable Friends found.", { exact: true }).waitFor();
    }
    assert.equal(await page.locator("iframe").count(), 0, `No playable game for ${mode}`);
    await assertBounds(page);
    await page.close();
    console.log(`PASS public runtime eligibility failure: ${mode}.`);
  }
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await build?.close();
  await rm(directory, { recursive: true, force: true });
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkRuntimeBrowser();
