// Node ordering shared by the scene (label/Tab order) and the HUD.
// Mirrors the server's `task_order` (constellation/serve.py _attach_live):
// numeric value of the digits in the id, then the id itself. The goal comes first.

interface Orderable {
  id: string;
  goal?: boolean;
}

function digitsOf(id: string): number {
  const digits = id.replace(/\D+/g, "");
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

export function compareNodes(a: Orderable, b: Orderable): number {
  if (Boolean(a.goal) !== Boolean(b.goal)) return a.goal ? -1 : 1;
  const da = digitsOf(a.id);
  const db = digitsOf(b.id);
  if (da !== db) return da < db ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
