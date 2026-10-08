// Which route points the map lets a finger pick up.
//
// Only the selected one, and only for the leader. Every point being draggable meant any swipe or
// pan that began on, or passed over, a point took hold of it and moved it; selecting first makes
// moving a point a deliberate act and leaves a pan across the map alone.
export function isPointDraggable({
  isLeader,
  pointId,
  selectedPointId,
}: {
  isLeader: boolean
  pointId: string | undefined
  selectedPointId: string | null
}): boolean {
  return isLeader && pointId !== undefined && pointId === selectedPointId
}
