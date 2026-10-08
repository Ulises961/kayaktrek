// Whether a reload should show the phone's route or the server's.
//
// The phone's route is the right one whenever the server may not have caught up with it: the
// leader has edits not yet sent, a conflict is parked, or a push is in the air. A reload takes
// the server's copy over the network, and the edit and its push can both complete inside that
// wait, so the question is asked before the fetch as well as after. Asked only afterwards it finds
// everything sent and shows the older server copy.

export type RouteSample = {
  /** The leader has edits the server has not received. */
  hasLocalChanges: boolean
  /** A route conflict is parked, awaiting the leader's choice. */
  inConflict: boolean
  /** A push is in flight right now. */
  pushing: boolean
}

export function routeIsOnPhone(samples: RouteSample[]): boolean {
  return samples.some((sample) => sample.hasLocalChanges || sample.inConflict || sample.pushing)
}
