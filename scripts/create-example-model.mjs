import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';

// GLTFExporter uses FileReader when composing its binary buffer in Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const scene = new T.Scene();
scene.name = 'PB_Example';
const root = new T.Group();
root.name = 'Player';
scene.add(root);
const material = (color) => new T.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
const lime = material('#c5e883'),
  navy = material('#152536'),
  skin = material('#c78e65');
const ivory = material('#f4f0df'),
  hair = material('#24222b'),
  black = material('#14202a');
function mesh(parent, geometry, mat, x, y, z) {
  const m = new T.Mesh(geometry, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const box = (parent, w, h, d, mat, x, y, z) =>
  mesh(parent, new T.BoxGeometry(w, h, d), mat, x, y, z);
const ball = (parent, radius, mat, x, y, z) =>
  mesh(parent, new T.SphereGeometry(radius, 16, 10), mat, x, y, z);
const cylinder = (parent, top, bottom, height, mat, x, y, z) =>
  mesh(parent, new T.CylinderGeometry(top, bottom, height, 12), mat, x, y, z);
for (const side of [-1, 1]) {
  const x = side * 0.19;
  box(root, 0.29, 0.2, 0.48, navy, x, 0.1, 0.1);
  box(root, 0.295, 0.045, 0.48, ivory, x, 0.025, 0.1);
  box(root, 0.3, 0.045, 0.1, lime, x, 0.16, 0.27);
  cylinder(root, 0.115, 0.105, 0.34, ivory, x, 0.37, 0);
  cylinder(root, 0.119, 0.119, 0.055, lime, x, 0.53, 0);
  cylinder(root, 0.115, 0.115, 0.2, skin, x, 0.65, 0);
  box(root, 0.32, 0.34, 0.35, navy, x, 0.9, 0);
  box(root, 0.035, 0.31, 0.36, lime, x + side * 0.135, 0.9, 0);
}
const torso = new T.Group();
torso.name = 'Torso';
torso.position.y = 1.02;
root.add(torso);
cylinder(torso, 0.36, 0.29, 0.66, lime, 0, 0.35, 0);
cylinder(torso, 0.14, 0.14, 0.12, navy, 0, 0.7, 0);
cylinder(torso, 0.11, 0.11, 0.15, skin, 0, 0.78, 0);
// A large, simple number 7 remains readable without external fonts or textures.
box(torso, 0.17, 0.045, 0.025, navy, 0, 0.43, 0.335);
const seven = box(torso, 0.045, 0.19, 0.025, navy, 0.035, 0.33, 0.335);
seven.rotation.z = -0.25;
const arms = [];
for (const side of [-1, 1]) {
  const arm = new T.Group();
  arm.name = side < 0 ? 'LeftArm' : 'RightArm';
  arm.position.set(side * 0.39, 0.57, 0);
  torso.add(arm);
  cylinder(arm, 0.13, 0.115, 0.24, lime, 0, -0.12, 0);
  cylinder(arm, 0.118, 0.118, 0.05, navy, 0, -0.24, 0);
  cylinder(arm, 0.105, 0.09, 0.25, skin, 0, -0.39, 0);
  ball(arm, 0.105, skin, 0, -0.55, 0.015);
  arms.push({ arm, side });
}
const head = new T.Group();
head.name = 'Head';
head.position.y = 1.03;
torso.add(head);
ball(head, 0.37, skin, 0, 0, 0);
for (const side of [-1, 1]) {
  ball(head, 0.075, skin, side * 0.35, -0.015, 0);
  const white = ball(head, 0.064, ivory, side * 0.125, 0.015, 0.335);
  white.scale.set(0.9, 1.1, 0.55);
  const pupil = ball(head, 0.034, black, side * 0.125, 0.016, 0.366);
  pupil.scale.z = 0.5;
  box(head, 0.09, 0.025, 0.025, hair, side * 0.125, 0.11, 0.335);
}
ball(head, 0.055, skin, 0, -0.065, 0.366);
const smile = mesh(head, new T.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), navy, 0, -0.13, 0.336);
smile.rotation.z = Math.PI;
mesh(head, new T.SphereGeometry(0.385, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.01, 0);
box(head, 0.56, 0.075, 0.11, hair, 0, 0.18, 0.29);
root.updateMatrixWorld(true);
const bounds = new T.Box3().setFromObject(root);
root.position.y -= bounds.min.y;
function rotations(name, zValues) {
  return new T.QuaternionKeyframeTrack(
    `${name}.quaternion`,
    [0, 1, 2],
    zValues.flatMap((z) => new T.Quaternion().setFromEuler(new T.Euler(0, 0, z)).toArray()),
  );
}
const idle = new T.AnimationClip('Idle', 2, [
  new T.VectorKeyframeTrack('Torso.position', [0, 1, 2], [0, 1.02, 0, 0, 1.035, 0, 0, 1.02, 0]),
  rotations('LeftArm', [-0.12, -0.17, -0.12]),
  rotations('RightArm', [0.12, 0.17, 0.12]),
]);
const output = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  animations: [idle],
  onlyVisible: true,
});
await mkdir('public/examples', { recursive: true });
await writeFile('public/examples/character-pb.glb', Buffer.from(output));
let triangles = 0;
root.traverse((node) => {
  if (node.isMesh)
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
});
console.log(
  JSON.stringify(
    {
      file: 'public/examples/character-pb.glb',
      bytes: output.byteLength,
      triangles,
      animation: 'Idle',
      front: '+Z',
      bounds: new T.Box3().setFromObject(root).getSize(new T.Vector3()).toArray(),
    },
    null,
    2,
  ),
);
