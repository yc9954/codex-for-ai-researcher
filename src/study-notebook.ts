import type { StudyInspection } from "./study-types";

export function notebookIdForStudy(study: StudyInspection): string {
  return `${study.studyId}-evidence-notebook`;
}
