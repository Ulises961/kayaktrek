// Which route points the map lets a finger pick up.
//
// Only in edit mode, and only the selected one. Every point being draggable meant any swipe or
// pan that began on, or passed over, a point took hold of it and moved it; selecting first makes
// moving a point a deliberate act and leaves a pan across the map alone. View mode drags nothing.
export function isPointDraggable({
  editing,
  pointId,
  selectedPointId,
}: {
  editing: boolean
  pointId: string | undefined
  selectedPointId: string | null
}): boolean {
  return editing && pointId !== undefined && pointId === selectedPointId
}
