import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { fitOverview, type FitPoint, type FitView } from "./framing";

/** Place a camera the way camera-controls does: spherical pose + focal offset. */
function cameraFor(view: FitView, distance: number, fx: number, fy: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(view.fov, view.width / view.height, 0.05, 1000);
  const back = new Vector3().setFromSphericalCoords(distance, view.polar, view.azimuth);
  camera.position.copy(back);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  camera.position.addScaledVector(right, fx).addScaledVector(up, fy);
  camera.updateMatrixWorld();
  return camera;
}

function pixels(points: FitPoint[], view: FitView, camera: PerspectiveCamera) {
  return points.map((p) => {
    const v = new Vector3(p.x, p.y, p.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * view.width, y: (0.5 - v.y * 0.5) * view.height, p };
  });
}

const cloud: FitPoint[] = [
  [-9, 0.4, 2],
  [7, -0.6, -3],
  [3, 0.2, 8],
  [-2, 1, -7],
  [12, 0, 1],
  [0, 0, 0],
].map(([x, y, z]) => ({ x: x!, y: y!, z: z!, padX: 30, padTop: 20, padBottom: 2 }));

describe("fitOverview", () => {
  for (const [name, width, height, top] of [
    ["landscape", 1440, 900, 76],
    ["portrait", 390, 844, 104],
  ] as const) {
    it(`fits every point into the fill rectangle (${name})`, () => {
      const view: FitView = { polar: Math.acos(0.62), azimuth: 0.35, fov: 45, width, height, top, fill: 0.8 };
      const fit = fitOverview(cloud, view);
      const shown = pixels(cloud, view, cameraFor(view, fit.distance, fit.focalX, fit.focalY));
      const mx = 0.1 * width;
      const my = 0.1 * (height - top);
      for (const { x, y, p } of shown) {
        expect(x - p.padX).toBeGreaterThanOrEqual(mx - 0.5);
        expect(x + p.padX).toBeLessThanOrEqual(width - mx + 0.5);
        expect(y - p.padTop).toBeGreaterThanOrEqual(top + my - 0.5);
        expect(y + p.padBottom).toBeLessThanOrEqual(height - my + 0.5);
      }
      // Tight on at least one axis: the bounds touch the fill rectangle.
      const minX = Math.min(...shown.map(({ x, p }) => x - p.padX));
      const maxX = Math.max(...shown.map(({ x, p }) => x + p.padX));
      const minY = Math.min(...shown.map(({ y, p }) => y - p.padTop));
      const maxY = Math.max(...shown.map(({ y, p }) => y + p.padBottom));
      const wFill = (maxX - minX) / (width - 2 * mx);
      const hFill = (maxY - minY) / (height - top - 2 * my);
      expect(Math.max(wFill, hFill)).toBeGreaterThan(0.99);
      if (name === "portrait") expect(wFill).toBeGreaterThan(0.99);
    });
  }
});
