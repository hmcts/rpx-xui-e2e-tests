import { readFileSync } from "node:fs";
import path from "node:path";

type EnvMap = Record<string, string | undefined>;
type TagFilterConfig = {
  availableServiceTags?: string[];
  availableTags?: string[];
  excludedTags?: string[];
};

type ResolveTagFiltersOptions = {
  configPathEnvVar: string;
  defaultConfigPath: string;
  env?: EnvMap;
  excludedTagsEnvVar: string;
  includeTagsEnvVar: string;
  suiteTag?: string;
};

export type ResolvedTagFilters = {
  availableTags: string[];
  configPath: string;
  excludedTags: string[];
  excludedTagsSource: "env" | "file";
  grep?: RegExp;
  grepInvert?: RegExp;
  includeTags: string[];
  suiteTag?: string;
};

const ensureTagPrefix = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

const splitTagInput = (raw?: string): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const token of raw?.split(/[\s,]+/) ?? []) {
    const tag = ensureTagPrefix(token);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
};

const buildTagRegex = (tags: string[]): RegExp | undefined =>
  tags.length ? new RegExp(`(${tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`) : undefined;

const resolveConfigPath = (env: EnvMap, envVar: string, defaultConfigPath: string): string => {
  const configured = env[envVar]?.trim();
  const candidate = configured || defaultConfigPath;
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
};

const readTagConfig = (configPath: string): TagFilterConfig => {
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as TagFilterConfig;
  if (!parsed || typeof parsed !== "object") {
    throw new TypeError(`Tag filter config at "${configPath}" must be an object`);
  }
  return parsed;
};

const normaliseConfiguredTags = (values?: string[]): string[] => splitTagInput(values?.join(","));

const validateKnownTags = (tags: string[], allowed: Set<string>, source: string, configPath: string): void => {
  const unknown = tags.filter((tag) => !allowed.has(tag));
  if (unknown.length) {
    throw new Error(`${source} contains unknown tag(s): ${unknown.join(", ")}. Allowed tags come from "${configPath}".`);
  }
};

export function resolveTagFilters({
  configPathEnvVar,
  defaultConfigPath,
  env = process.env,
  excludedTagsEnvVar,
  includeTagsEnvVar,
  suiteTag
}: ResolveTagFiltersOptions): ResolvedTagFilters {
  const configPath = resolveConfigPath(env, configPathEnvVar, defaultConfigPath);
  const config = readTagConfig(configPath);
  const availableTags = normaliseConfiguredTags(config.availableTags ?? config.availableServiceTags);
  if (!availableTags.length) {
    throw new Error(`Tag filter config at "${configPath}" must define availableTags or availableServiceTags`);
  }

  const allowedTags = new Set(availableTags);
  if (suiteTag && !allowedTags.has(suiteTag)) {
    throw new Error(`Tag filter config at "${configPath}" must include suite tag "${suiteTag}"`);
  }

  const includeTags = splitTagInput(env[includeTagsEnvVar]);
  const configuredExcludedTags = normaliseConfiguredTags(config.excludedTags);
  const rawExcludedOverride = splitTagInput(env[excludedTagsEnvVar]);
  const clearsExcludedTags = rawExcludedOverride.includes("@none");
  const overrideExcludedTags = rawExcludedOverride.filter((tag) => tag !== "@none");
  const excludedTags = clearsExcludedTags
    ? overrideExcludedTags
    : overrideExcludedTags.length
      ? overrideExcludedTags
      : configuredExcludedTags;

  validateKnownTags(configuredExcludedTags, allowedTags, `Config excludes in ${configPath}`, configPath);
  validateKnownTags(includeTags, allowedTags, includeTagsEnvVar, configPath);
  validateKnownTags(excludedTags, allowedTags, excludedTagsEnvVar, configPath);

  const normalizedIncludeTags =
    suiteTag && includeTags.includes(suiteTag) && includeTags.length > 1
      ? includeTags.filter((tag) => tag !== suiteTag)
      : includeTags;

  if (suiteTag && !env.PLAYWRIGHT_ALLOW_EMPTY_TAG_SELECTION) {
    const featureTags = availableTags.filter((tag) => tag !== suiteTag);
    const requested = normalizedIncludeTags.length ? normalizedIncludeTags : featureTags;
    if (excludedTags.includes(suiteTag) || requested.filter((tag) => !excludedTags.includes(tag)).length === 0) {
      throw new Error(`Tag filters from ${includeTagsEnvVar}/${excludedTagsEnvVar} leave no tagged functional tests for ${suiteTag}.`);
    }
  }

  return {
    availableTags,
    configPath,
    excludedTags,
    excludedTagsSource: overrideExcludedTags.length || clearsExcludedTags ? "env" : "file",
    grep: buildTagRegex(normalizedIncludeTags),
    grepInvert: buildTagRegex(excludedTags),
    includeTags: normalizedIncludeTags,
    suiteTag
  };
}
