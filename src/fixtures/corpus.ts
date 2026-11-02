import {
  loadDatasetFile,
  loadFixtureFile,
  type DatasetFile,
  type FixtureFile,
} from "#contract";

export type LoadedFixture = FixtureFile & { input: unknown };

export interface CorpusFiles {
  datasets: readonly unknown[];
  scenarios: readonly unknown[];
  qdic: readonly unknown[];
}

export interface Corpus {
  fixtures: Record<string, FixtureFile>;
  datasets: Record<string, DatasetFile>;
  load: (key: string) => LoadedFixture;
}

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function byKey<T extends { key: string }>(
  items: readonly T[],
  what: string,
): Record<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.key)) fail(what, `duplicate key "${item.key}"`);
    map.set(item.key, item);
  }
  return Object.fromEntries(map);
}

export function createCorpus(files: CorpusFiles): Corpus {
  const datasets = byKey(files.datasets.map(loadDatasetFile), "datasets");
  const fixtures = byKey(
    [...files.qdic, ...files.scenarios].map(loadFixtureFile),
    "fixtures",
  );
  for (const fixture of Object.values(fixtures)) {
    if (
      fixture.dataset !== undefined &&
      !Object.hasOwn(datasets, fixture.dataset)
    )
      fail(`fixture "${fixture.key}"`, `unknown dataset "${fixture.dataset}"`);
  }
  function load(key: string): LoadedFixture {
    if (!Object.hasOwn(fixtures, key))
      fail("loadFixture", `unknown key "${key}"`);
    const fixture = fixtures[key];
    const graph =
      fixture.dataset === undefined
        ? fixture.graph
        : {
            ...datasets[fixture.dataset].graph,
            ...(fixture.view === undefined ? {} : { view: fixture.view }),
          };
    return { ...fixture, input: structuredClone(graph) };
  }
  return { fixtures, datasets, load };
}
