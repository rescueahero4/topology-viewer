import { createCorpus } from "./corpus";
import { datasetFiles, qdicFiles, scenarioFiles } from "./files";

const corpus = createCorpus({
  datasets: datasetFiles,
  scenarios: scenarioFiles,
  qdic: qdicFiles,
});

export const fixtures = corpus.fixtures;
export const datasets = corpus.datasets;
export const loadFixture = corpus.load;
export * as generate from "./generate";
export { producers, type Producer } from "./producers";
export {
  createCorpus,
  type Corpus,
  type CorpusFiles,
  type LoadedFixture,
} from "./corpus";
