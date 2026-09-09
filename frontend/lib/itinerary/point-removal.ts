import type { DraftBoundary } from "./boundaries"

// Re-anchors any draft boundary ending on the removed point to its predecessor
// in pointOrder, so the day shrinks by one instead of falling back to
// resolveDraft's anchor-loss clamp (which would collapse it to zero length).
// Pure — callers still own dispatching the point removal and persisting the
// delete. Shared by point-list-pane's sidebar delete and the map's on-marker
// undo-the-last-drop control so the two don't carry parallel copies of the
// same re-anchor logic.
export function repointDraftAfterPointRemoval(
  draft: DraftBoundary[],
  pointOrder: string[],
  pointId: string,
): DraftBoundary[] {
  const idx = pointOrder.indexOf(pointId)
  const predecessor = idx > 0 ? pointOrder[idx - 1] : null
  return draft.map((boundary) =>
    boundary.endPointId === pointId ? { ...boundary, endPointId: predecessor } : boundary,
  )
}
