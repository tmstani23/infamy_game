// Presentation only: a teleport, place change or new followed hero releases a detached camera.
// Compare successive hero positions, not the camera distance (intentional pans can be far away).
export function cameraDiscontinuity(previous, current) {
  return !previous || previous.id !== current.id || previous.place !== current.place || Math.hypot(current.x - previous.x, current.z - previous.z) > 60;
}
