import { test, expect } from "@playwright/test";

test("private archive sign-in screen renders and fits viewport", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/vault", (route) =>
    route.fulfill({
      json: { environment: "preview", storageConfigured: false },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your intelligence, kept private." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `/tmp/knowledge-vault-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("mobile library, duplicate response, journal, and source-backed search controls", async ({
  page,
}) => {
  // Only auth and the transport are fixtures; these are UI checks, not live-provider tests.
  await page.route("**/src/firebaseConfig.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export const auth={currentUser:{getIdToken:async()=>"fixture-token"}};',
    }),
  );
  await page.route("**/node_modules/.vite/deps/firebase_auth.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export function onAuthStateChanged(auth,cb){queueMicrotask(()=>cb({uid:"fixture",isAnonymous:false}));return ()=>{}};export async function signOut(){};export class GoogleAuthProvider{};export async function signInWithPopup(){};export async function signInWithRedirect(){};export const browserLocalPersistence={};export async function setPersistence(){};',
    }),
  );
  let saved = null;
  const episode = {
    id: "apple-456",
    url: "https://podcasts.apple.com/podcast/id123?i=456",
    status: "needs_configuration",
    stage: "analyze",
    createdAt: "2026-10-23T12:00:00Z",
    metadata: {
      title: "Synthetic infrastructure conversation",
      show: "QA fixture",
      publishedAt: "2026-10-23",
    },
    reflection: {
      raw: "",
      organized: "",
      questions: [],
      listenedPercent: null,
      version: 0,
    },
    events: [],
    lastError: { message: "Fixture provider is not configured." },
  };
  await page.route("**/api/vault", async (route) => {
    const req = route.request();
    if (req.method() === "GET")
      return route.fulfill({ json: { environment: "preview" } });
    const data = req.postDataJSON();
    let out;
    if (data.action === "list") out = { episodes: [] };
    else if (data.action === "legacy") out = { legacy: null };
    else if (data.action === "add") out = { created: !saved, episode };
    else if (data.action === "get") out = { episode };
    else if (data.action === "reflect") {
      saved = data;
      episode.reflection = { ...data, version: 1 };
      out = { reflection: episode.reflection };
    } else if (data.action === "search")
      out = {
        mode: "full-text",
        results: [
          {
            episodeId: "apple-456",
            title: episode.metadata.title,
            text: "A synthetic source-backed search result.",
            topic: "Infrastructure",
            speaker: "Test guest",
            stance: "not_established",
            show: "QA fixture",
            publishedAt: "2026-10-23",
            citations: [
              {
                segmentId: "s1",
                quote: "Synthetic evidence.",
                speaker: "Test guest",
                start: 23,
                sourceUrl: "https://example.com/transcript",
              },
            ],
          },
        ],
      };
    else out = {};
    return route.fulfill({ json: out });
  });
  await page.goto("/");
  await page.getByLabel("Add a podcast").fill(episode.url);
  await page.getByRole("button", { name: "Add to vault" }).click();
  await expect(
    page.getByRole("heading", { name: episode.metadata.title }),
  ).toBeVisible();
  await page
    .getByLabel("Rough thoughts")
    .fill("I only listened to half. The power discussion stood out.");
  await page.getByLabel("How much did you listen").selectOption("50");
  await page
    .getByRole("button", { name: "Save reflection", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Personal reflection saved",
  );
  expect(saved.listenedPercent).toBe(50);
  await page
    .getByRole("button", { name: "Ask your archive", exact: true })
    .click();
  await page.getByLabel("Ask your archive").fill("electricity constraints");
  await page.getByRole("button", { name: "Find evidence" }).click();
  await expect(
    page.getByText("A synthetic source-backed search result."),
  ).toBeVisible();
  await page.getByText("Test guest · 0:23").click();
  await expect(page.getByText("Synthetic evidence.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
