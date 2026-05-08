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
  globalExcludedTagsEnvVar?: string;
  globalExcludedTagsPattern?: RegExp;
  ignoreGlobalExcludesEnvVar?: string;
  includeTagsEnvVar: string;
  suiteTag?: string;
};

export type ResolvedTagFilters = {
  availableTags: string[];
  configPath: string;
  excludedTags: string[];
  excludedTagsSource: "env" | "file";
  globalExcludedTags: string[];
  grep?: RegExp;
  grepInvert?: RegExp;
  ignoredGlobalExcludedTags: string[];
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

const truthy = new Set(["1", "true", "yes", "on"]);

const resolveBooleanEnvFlag = (value: string | undefined): boolean =>
  truthy.has(value?.trim().toLowerCase() ?? "");

const mergeTags = (...tagGroups: string[][]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tags of tagGroups) {
    for (const tag of tags) {
      if (seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      merged.push(tag);
    }
  }
  return merged;
};

const matchesTagPattern = (tag: string, pattern: RegExp): boolean => {
  pattern.lastIndex = 0;
  return pattern.test(tag);
};

const resolveGlobalExcludedTags = ({
  env,
  globalExcludedTagsEnvVar,
  globalExcludedTagsPattern,
  ignoreGlobalExcludesEnvVar
}: {
  env: EnvMap;
  globalExcludedTagsEnvVar?: string;
  globalExcludedTagsPattern?: RegExp;
  ignoreGlobalExcludesEnvVar?: string;
}): { globalExcludedTags: string[]; ignoredGlobalExcludedTags: string[]; ignoreGlobalExcludes: boolean } => {
  if (!globalExcludedTagsEnvVar) {
    return {
      globalExcludedTags: [],
      ignoredGlobalExcludedTags: [],
      ignoreGlobalExcludes: false
    };
  }

  const configuredGlobalTags = splitTagInput(env[globalExcludedTagsEnvVar]).filter((tag) => tag !== "@none");
  const ignoreGlobalExcludes = resolveBooleanEnvFlag(env[ignoreGlobalExcludesEnvVar ?? "PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES"]);

  if (ignoreGlobalExcludes) {
    return {
      globalExcludedTags: [],
      ignoredGlobalExcludedTags: configuredGlobalTags,
      ignoreGlobalExcludes
    };
  }

  if (!globalExcludedTagsPattern) {
    return {
      globalExcludedTags: configuredGlobalTags,
      ignoredGlobalExcludedTags: [],
      ignoreGlobalExcludes
    };
  }

  const globalExcludedTags = configuredGlobalTags.filter((tag) => matchesTagPattern(tag, globalExcludedTagsPattern));
  return {
    globalExcludedTags,
    ignoredGlobalExcludedTags: configuredGlobalTags.filter((tag) => !globalExcludedTags.includes(tag)),
    ignoreGlobalExcludes
  };
};

export function resolveTagFilters({
  configPathEnvVar,
  defaultConfigPath,
  env = process.env,
  excludedTagsEnvVar,
  globalExcludedTagsEnvVar,
  globalExcludedTagsPattern,
  ignoreGlobalExcludesEnvVar,
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
  const { globalExcludedTags, ignoredGlobalExcludedTags, ignoreGlobalExcludes } = resolveGlobalExcludedTags({
    env,
    globalExcludedTagsEnvVar,
    globalExcludedTagsPattern,
    ignoreGlobalExcludesEnvVar
  });
  const combinedExcludedTags = mergeTags(excludedTags, globalExcludedTags);

  validateKnownTags(configuredExcludedTags, allowedTags, `Config excludes in ${configPath}`, configPath);
  validateKnownTags(includeTags, allowedTags, includeTagsEnvVar, configPath);
  validateKnownTags(excludedTags, allowedTags, excludedTagsEnvVar, configPath);
  validateKnownTags(globalExcludedTags, allowedTags, globalExcludedTagsEnvVar ?? "Global excluded tags", configPath);

  const normalizedIncludeTags =
    suiteTag && includeTags.includes(suiteTag) && includeTags.length > 1
      ? includeTags.filter((tag) => tag !== suiteTag)
      : includeTags;

  if (suiteTag && !env.PLAYWRIGHT_ALLOW_EMPTY_TAG_SELECTION) {
    const featureTags = availableTags.filter((tag) => tag !== suiteTag);
    const requested = normalizedIncludeTags.length ? normalizedIncludeTags : featureTags;
    if (combinedExcludedTags.includes(suiteTag) || requested.filter((tag) => !combinedExcludedTags.includes(tag)).length === 0) {
      throw new Error(`Tag filters from ${includeTagsEnvVar}/${excludedTagsEnvVar} leave no tagged functional tests for ${suiteTag}.`);
    }
  }

  return {
    availableTags,
    configPath,
    excludedTags: combinedExcludedTags,
    excludedTagsSource:
      overrideExcludedTags.length || clearsExcludedTags || globalExcludedTags.length || ignoreGlobalExcludes ? "env" : "file",
    globalExcludedTags,
    grep: buildTagRegex(normalizedIncludeTags),
    grepInvert: buildTagRegex(combinedExcludedTags),
    ignoredGlobalExcludedTags,
    includeTags: normalizedIncludeTags,
    suiteTag
  };
}

const formatTagLogValue = (tags: string[]): string => tags.length ? tags.join(",") : "<none>";

export function logResolvedTagFilters(suiteName: string, filters: ResolvedTagFilters, env: EnvMap = process.env): void {
  if (!env.CI && !resolveBooleanEnvFlag(env.PLAYWRIGHT_LOG_TAG_FILTERS)) {
    return;
  }

  process.stdout.write(
    [
      `[playwright-tags] ${suiteName}`,
      `include=${formatTagLogValue(filters.includeTags)}`,
      `exclude=${formatTagLogValue(filters.excludedTags)}`,
      `globalApplied=${formatTagLogValue(filters.globalExcludedTags)}`,
      `globalIgnored=${formatTagLogValue(filters.ignoredGlobalExcludedTags)}`,
      `source=${filters.excludedTagsSource}`,
      `config=${path.relative(process.cwd(), filters.configPath)}`
    ].join(" | ") + "\n"
  );
}
