# Adding "ox-alpha GLM-5.3 Flash" to DeepSeek Harness

Research notes. Question: how do I add the model someone described as "ox-alpha GLm5.3 flash" to DSH? Date: 2026-08-31.

## What the model actually is

"ox-alpha" is the name the model went by while it was anonymous. "Ox Alpha" was a mysterious model circulating in mid-2026 that people later identified as Zhipu's tech. Zhipu AI (Z.ai) released it under its real name: GLM-5.3-Flash.

The chain is: `ox-alpha` (stealth alias on OpenRouter/OpenCode, ~Aug 20-26 2026) = GLM-5.3-Flash = the open-weight "Flash" variant of Zhipu's GLM-5.3. These are three names for one model. The canonical model id to use is `glm-5.3-flash`; `ox-alpha` is a stale alias on third-party routers, not the id against Z.ai's own API.

Sources:

- Zhipu official GLM-5.3 model card, published 2026/08/14: [zhipuai.cn/zh/research/162](https://www.zhipuai.cn/zh/research/162)
- Zhipu technical blog: [z.ai/blog/glm-5.3](https://z.ai/blog/glm-5.3)
- Business Insider Taiwan, identifying Ox Alpha as Z.ai's model: [businessinsider.tw/article/6394](https://www.businessinsider.tw/article/6394)
- Korean report naming the open-weight release "GLM-5.3-Flash": [aitimes.kr/news/articleView.html?idxno=41624](https://www.aitimes.kr/news/articleView.html?idxno=41624)
- Z.ai official model page, model code `glm-5.3` (text, 1M ctx, 128K out, reasoning forced on): [docs.z.ai/guides/llm/glm-5.3](https://docs.z.ai/guides/llm/glm-5.3)
- Z.ai official model page, model code `glm-5.3-flash` (natively multimodal, 320B/18B MoE, 1M ctx, 128K out): [docs.z.ai/guides/vlm/glm-5.3-flash](https://docs.z.ai/guides/vlm/glm-5.3-flash)
- Z.ai pricing page, which lists GLM-5.3-Flash / GLM-5.3 / GLM-5.2 as "Latest Models" and the free Flash line (GLM-4.5-Flash, GLM-4.7-Flash): [docs.z.ai/guides/overview/pricing](https://docs.z.ai/guides/overview/pricing)

Two facts about GLM-5.3 that differ from the earlier GLM-5.2 the local catalog ships:

- GLM-5.3-Flash is the first natively multimodal GLM-5-series model: it accepts image, video, text, and file input, so its input modalities are not text-only.
- Reasoning is forced on for GLM-5.3 and GLM-5.3-Flash. Sending `thinking.type: "disabled"` is rejected; you must send `thinking.type: "enabled"` and control depth with `reasoning_effort` of `low`/`high`/`max` (default `max`). Recommended sampling per the migration guide: `temperature: 1`, `top_p: 0.95`, and `stream: true` with `tool_stream: true`.
- These come from the model pages above and the migration guide [docs.z.ai/guides/overview/migrate-to-glm-new](https://docs.z.ai/guides/overview/migrate-to-glm-new).

There is no "glm-5.3-flash" in the pi-ai catalog installed in this checkout (see below). The closest cataloged names are glm-4.5-air, glm-5-turbo, glm-5.1, glm-5.2, glm-5v-turbo, glm-4.7.

## How DSH models providers and models

DSH (the deepseek-harness submodule) routes every LLM through one adapter package: `packages/llm/llm-pi-ai`, which wraps the npm package `@earendil-works/pi-ai`. A provider is a "route" keyed by id. A route serves a list of models. The installed pi-ai catalog supplies defaults keyed by provider id; a profile's own config overrides those field by field.

The config shape lives in `llm-pi-ai/src/config.ts` as `PiAiProviderProfile`. Each route is an entry in a `providers` dict. Relevant fields:

- `api` — wire protocol: `openai-completions`, `openai-responses`, `anthropic-messages`.
- `baseURL` — endpoint override.
- `apiKeyEnv` — credential reference (environment-variable name), resolved through `ctx.credentials`, never the secret itself.
- `models` — an explicit replacement catalog; each entry has `id`, and optionally `name`, `contextWindow`, `maxTokens`, `input`, `reasoningEfforts`, `compat`.
- `modelOverrides` — per-model tweaks over the installed catalog entry of the same id.

Key behavior from `catalog.ts` and `provider.ts`:

- A route id that matches a built-in pi-ai provider reuses that catalog provider, inheriting its baseURL, protocol, model list, and compat settings. No config needed at all to use it.
- A route id pi-ai does not know must declare `api`, `baseURL`, and its own models. It is built from `createProvider` over three protocol factories only: `openai-completions`, `openai-responses`, `anthropic-messages`.
- Wrong key or bad value fails loud at profile resolution (the earliest point that can name the offending key).

## What pi-ai already ships for Zhipu/Z.ai

The installed pi-ai is 0.82.1 (per `packages/experimental/webworker-runtime/.../pi-ai.ts` and the pnpm store path). It ships two Zhipu providers:

Provider `zai` (global), `dist/providers/zai.js`:

- id `zai`, name `Z.AI`
- baseUrl `https://api.z.ai/api/coding/paas/v4`
- auth: `ZAI_API_KEY` env var
- api: OpenAI completions

Provider `zai-coding-cn` (China), `dist/providers/zai-coding-cn.js`:

- id `zai-coding-cn`, name `Z.AI Coding CN`
- baseUrl `https://open.bigmodel.cn/api/coding/paas/v4`
- auth: `ZAI_CODING_CN_API_KEY` env var
- api: OpenAI completions

Models shipped by both (from `dist/providers/data/zai.json` and `zai-coding-cn.json`): glm-4.5-air, glm-4.7, glm-5-turbo, glm-5.1, glm-5.2, glm-5v-turbo. The `glm-5.2` entry carries a thinkingLevelMap and `supportsReasoningEffort: true`; the others set `thinkingFormat: "zai"`.

No "glm-5.3" and no "flash" string appears anywhere in the installed catalog.

pi-ai's model list is generated at build time from the models.dev live catalog, not hardcoded in the pi monorepo. models.dev currently lists `glm-5.3` and `glm-5.3-flash` under the zai provider, so a pi-ai bump pulls them in automatically ([pi's `scripts/generate-models.ts`](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/scripts/generate-models.ts)). The installed 0.82.1 predates those ids.

One historical gotcha: pi-ai's zai provider migrated from the Anthropic wire format to OpenAI-compatible in [pi PR #358](https://github.com/earendil-works/pi/pull/358). This checkout's `dist/providers/zai.js` already uses `openAICompletionsApi()` with the `/api/coding/paas/v4` base, so it is on the OpenAI side; an older checkout would still point at an Anthropic `/api/anthropic` base and need the bump before anything works.

## How to add the model

### Broad answer: you usually do not edit code

Use the Models settings surface (the `minimax-cn` flow in `apps/web/tests/models-settings.e2e.ts` is the template): pick or add a provider route, set baseURL and API key, and the model catalog is served or hand-declared. Results land in `settings.yaml`, stored under the derived credential reference. This is configuration, not a code change.

### Concrete steps for GLM-5.3-Flash

1. Treat it as a `zai` route. pi-ai already knows Z.AI, so name the route `zai` (or `zai-coding-cn` for the China endpoint) and you inherit baseURL, protocol, auth, and the whole model catalog for free.

2. Because the installed pi-ai catalog (0.82.1) predates GLM-5.3, `glm-5.3-flash` is not in it. `modelOverrides` is refused both when the id is missing from the installed catalog and when a `models` list is already present (see `catalog.ts` `resolveRouteModels`). So a brand-new id requires either:
   - declaring a full `models` list (replacement), or
   - upgrading pi-ai so the catalog ships the id, then using `modelOverrides` if you want to tweak it.

   The model id is `glm-5.3-flash`, confirmed against [docs.z.ai/guides/vlm/glm-5.3-flash](https://docs.z.ai/guides/vlm/glm-5.3-flash) ("Model Code") and models.dev's zai catalog (the upstream payload pi-ai's generator consumes). `glm-5.3` is the flagship text model, also valid.

3. Set the credential. `apiKeyEnv: ZAI_API_KEY` (or `ZAI_CODING_CN_API_KEY`), and put the key in `.env` / the credential store. The harness resolves it per request; the secret never lands in `settings.yaml`. Auth is `Authorization: Bearer <api key>`, not a JWT ([docs.z.ai/api-reference/introduction](https://docs.z.ai/api-reference/introduction)).

4. If you need full control (custom baseURL, a private gateway, a different model list), declare a fresh route:

```yaml
providers:
  glm53:
    displayName: GLM-5.3 Flash
    api: openai-completions
    baseURL: https://api.z.ai/api/coding/paas/v4
    apiKeyEnv: ZAI_API_KEY
    models:
      - id: glm-5.3-flash
        name: GLM-5.3 Flash
        input: [text, image]
        reasoningEfforts:
          low: low
          high: high
          max: max
```

   Two things worth getting right in this entry, both because GLM-5.3 differs from the glm-5.2 sibling in the local catalog:
   - `input: [text, image]` — GLM-5.3-Flash is multimodal (image/video/text/file), not text-only. In the harness, declaring images is what makes a hand-declared vision model usable.
   - Reasoning is forced on, and `off` is rejected by the endpoint. So do not declare an `off` level. The wire spellings for `low`/`high`/`max` should be copied from the closest catalog sibling (glm-5.2's thinkingLevelMap) and the `thinkingFormat: "zai"` compat kept, then confirmed against Zhipu's current docs.

### If you must change code

Three ways, in increasing blast radius:

1. Bump the `@earendil-works/pi-ai` dependency so its catalog ships GLM-5.3-Flash. This is the cleanest, and the model then appears under `zai` with zero config. The harness gates (drift gates in `catalog.ts`) exist precisely to catch a pi-ai upgrade that adds models/modalities/fields, so a bump is accompanied by compilation errors you then resolve. This is an upstream submodule edit plus a lockfile change, kept separate from desktop behavior changes per the pinned-submodule rule.

2. Add the model id locally as a `modelOverrides` entry after (1) lands, if you only want to tweak fields.

3. Edit nothing in `deepseek-harness/`. That directory is a pinned upstream submodule and must not be edited from a desktop feature branch. Model additions are configuration or a pi-ai dependency bump, not a patch to harness source.

## Ownership note

`deepseek-harness/` is a pinned upstream git submodule. The rule (repo AGENTS.md): never edit files inside it from a desktop feature branch. Adding this model is configuration in `settings.yaml` or a pi-ai dependency version bump, not a harness source edit. Any dependency bump is an upstream operation (`corepack yarn upstream:*`) kept in its own commit, separate from desktop changes.
