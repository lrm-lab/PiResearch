// Where a mascot looks: the pointer's offset mapped to the Rive file's lookX / lookY, each in
// [-1, 1]. 0 is straight ahead, +x right, +y down.

export interface MascotLook {
  x: number;
  y: number;
}

export const STRAIGHT_AHEAD: MascotLook = { x: 0, y: 0 };

const LOOK_FULL_DISTANCE_PX = 350;

export function lookToward(dx: number, dy: number): MascotLook {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance === 0) return STRAIGHT_AHEAD;
  const progress = Math.min(distance / LOOK_FULL_DISTANCE_PX, 1);
  const deflection = 1 - (1 - progress) ** 2;
  return { x: (dx / distance) * deflection, y: (dy / distance) * deflection };
}
