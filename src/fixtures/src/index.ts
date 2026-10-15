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
export {
  createCorpus,
  parseDataset,
  parseFixture,
  type Corpus,
  type CorpusFiles,
  type DatasetFile,
  type Expect,
  type FirstPaint,
  type Fixture,
  type LoadedFixture,
  type Story,
} from "./corpus";
