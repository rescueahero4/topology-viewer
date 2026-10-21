import datasetAccess from "../data/datasets/access.json" with { type: "json" };
import datasetCatalog from "../data/datasets/catalog.json" with { type: "json" };
import datasetExtend from "../data/datasets/extend.json" with { type: "json" };
import datasetGovernance from "../data/datasets/governance.json" with { type: "json" };
import datasetStress from "../data/datasets/stress.json" with { type: "json" };
import sAccess from "../data/scenarios/s-access.json" with { type: "json" };
import sBadroot from "../data/scenarios/s-badroot.json" with { type: "json" };
import sChain from "../data/scenarios/s-chain.json" with { type: "json" };
import sCjkLabels from "../data/scenarios/s-cjk-labels.json" with { type: "json" };
import sConstraintViolation from "../data/scenarios/s-constraint-violation.json" with { type: "json" };
import sCustomActive from "../data/scenarios/s-custom-active.json" with { type: "json" };
import sCustomPassive from "../data/scenarios/s-custom-passive.json" with { type: "json" };
import sDesigned from "../data/scenarios/s-designed.json" with { type: "json" };
import sDesignedGlyph from "../data/scenarios/s-designed-glyph.json" with { type: "json" };
import sDirty from "../data/scenarios/s-dirty.json" with { type: "json" };
import sEdgesOnly from "../data/scenarios/s-edges-only.json" with { type: "json" };
import sEmpty from "../data/scenarios/s-empty.json" with { type: "json" };
import sExtend from "../data/scenarios/s-extend.json" with { type: "json" };
import sFieldsVsEdge from "../data/scenarios/s-fields-vs-edge.json" with { type: "json" };
import sInvalid from "../data/scenarios/s-invalid.json" with { type: "json" };
import sIslands from "../data/scenarios/s-islands.json" with { type: "json" };
import sLadder from "../data/scenarios/s-ladder.json" with { type: "json" };
import sLineage from "../data/scenarios/s-lineage.json" with { type: "json" };
import sManyPreds from "../data/scenarios/s-many-preds.json" with { type: "json" };
import sMergeNamesakes from "../data/scenarios/s-merge-namesakes.json" with { type: "json" };
import sMixed from "../data/scenarios/s-mixed.json" with { type: "json" };
import sMixedDesigned from "../data/scenarios/s-mixed-designed.json" with { type: "json" };
import sNohint from "../data/scenarios/s-nohint.json" with { type: "json" };
import sNoidAll from "../data/scenarios/s-noid-all.json" with { type: "json" };
import sNoidSome from "../data/scenarios/s-noid-some.json" with { type: "json" };
import sNotGraph from "../data/scenarios/s-not-graph.json" with { type: "json" };
import sRootOnly from "../data/scenarios/s-root-only.json" with { type: "json" };
import sSingle from "../data/scenarios/s-single.json" with { type: "json" };
import sStar from "../data/scenarios/s-star.json" with { type: "json" };
import sStress from "../data/scenarios/s-stress.json" with { type: "json" };
import sUndeclared from "../data/scenarios/s-undeclared.json" with { type: "json" };
import sUnsafeColors from "../data/scenarios/s-unsafe-colors.json" with { type: "json" };
import sUnsafeGlyph from "../data/scenarios/s-unsafe-glyph.json" with { type: "json" };
import sVague from "../data/scenarios/s-vague.json" with { type: "json" };
import sVocabMeta from "../data/scenarios/s-vocab-meta.json" with { type: "json" };
import qFullVocabulary from "../data/qdic/q-full-vocabulary.json" with { type: "json" };
import qSemanticLayerSteward from "../data/qdic/q-semantic-layer-steward.json" with { type: "json" };
import qSpecScenarios from "../data/qdic/q-spec-scenarios.json" with { type: "json" };

export const datasetFiles: readonly unknown[] = [
  datasetAccess,
  datasetCatalog,
  datasetExtend,
  datasetGovernance,
  datasetStress,
];

export const scenarioFiles: readonly unknown[] = [
  sAccess,
  sBadroot,
  sChain,
  sCjkLabels,
  sConstraintViolation,
  sCustomActive,
  sCustomPassive,
  sDesigned,
  sDesignedGlyph,
  sDirty,
  sEdgesOnly,
  sEmpty,
  sExtend,
  sFieldsVsEdge,
  sInvalid,
  sIslands,
  sLadder,
  sLineage,
  sManyPreds,
  sMergeNamesakes,
  sMixed,
  sMixedDesigned,
  sNohint,
  sNoidAll,
  sNoidSome,
  sNotGraph,
  sRootOnly,
  sSingle,
  sStar,
  sStress,
  sUndeclared,
  sUnsafeColors,
  sUnsafeGlyph,
  sVague,
  sVocabMeta,
];

export const qdicFiles: readonly unknown[] = [
  qFullVocabulary,
  qSemanticLayerSteward,
  qSpecScenarios,
];
