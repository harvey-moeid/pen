import * as T from 'three';
// Pooled skill geometry: no allocations or new scene objects per gift.
export class SkillEffects {
  readonly root = new T.Group();
  private ring: T.Mesh;
  private lightning: T.LineSegments;
  private bolts = new Float32Array(120 * 3);
  private dragon = new T.Group();
  private scales: T.Mesh[] = [];
  private ghosts: T.Group[] = [];
  private flame: T.Mesh[] = [];
  constructor() {
    const additive = (color: number, opacity = 0.7) =>
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
      });
    this.ring = new T.Mesh(new T.TorusGeometry(0.9, 0.025, 6, 64), additive(0xffb35c));
    this.ring.rotation.x = Math.PI / 2;
    this.root.add(this.ring);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.bolts, 3));
    this.lightning = new T.LineSegments(
      g,
      new T.LineBasicMaterial({
        color: 0x8eeaff,
        transparent: true,
        opacity: 0.9,
        blending: T.AdditiveBlending,
      }),
    );
    this.lightning.frustumCulled = false;
    this.root.add(this.lightning);
    const gold = new T.MeshStandardMaterial({
      color: 0xfacb54,
      emissive: 0xe98719,
      emissiveIntensity: 1.2,
      metalness: 0.55,
      roughness: 0.3,
    });
    const head = new T.Mesh(new T.ConeGeometry(0.25, 0.8, 6), gold);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.3;
    this.dragon.add(head);
    for (const side of [-1, 1]) {
      const horn = new T.Mesh(new T.ConeGeometry(0.065, 0.45, 5), gold);
      horn.position.set(side * 0.2, 0.25, 0);
      horn.rotation.z = side * -0.5;
      this.dragon.add(horn);
      const eye = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), additive(0xffffff, 1));
      eye.position.set(side * 0.12, 0.12, -0.35);
      this.dragon.add(eye);
      const wing = new T.Mesh(new T.ConeGeometry(0.5, 0.9, 3), gold);
      wing.rotation.z = side * 1.2;
      wing.rotation.y = Math.PI / 2;
      wing.scale.z = 0.1;
      wing.position.set(side * 0.6, 0, 0.2);
      this.dragon.add(wing);
    }
    this.root.add(this.dragon);
    for (let i = 0; i < 16; i++) {
      const scale = new T.Mesh(new T.OctahedronGeometry(0.16), gold);
      this.scales.push(scale);
      this.root.add(scale);
    }
    for (let i = 0; i < 4; i++) {
      const ghost = new T.Group(),
        mat = additive(0xb87dff, 0.12 + i * 0.03);
      const body = new T.Mesh(new T.CapsuleGeometry(0.29, 0.7, 3, 8), mat);
      body.position.y = 1.1;
      ghost.add(body);
      const head = new T.Mesh(new T.SphereGeometry(0.23, 8, 6), mat);
      head.position.y = 1.9;
      ghost.add(head);
      this.ghosts.push(ghost);
      this.root.add(ghost);
    }
    for (let i = 0; i < 12; i++) {
      const flame = new T.Mesh(
        new T.ConeGeometry(0.08, 0.5, 5),
        additive(i % 2 ? 0xff5c16 : 0xffce55, 0.8),
      );
      this.flame.push(flame);
      this.root.add(flame);
    }
  }
  update(tier: number, p: number, ball: T.Vector3, time: number, active: boolean) {
    const charge = active && p > 0.23 && p < 0.72;
    this.root.visible = charge && tier > 0;
    if (!this.root.visible) return;
    this.ring.visible = true;
    this.ring.position.set(ball.x, 0.08, ball.z);
    this.ring.scale.setScalar(0.6 + Math.sin(time * 6) * 0.1 + (tier === 4 ? 1.4 : 0));
    (this.ring.material as T.MeshBasicMaterial).color.setHex(
      [0xffffff, 0xff8c34, 0x6edfff, 0xc08aff, 0xffda70][tier],
    );
    this.lightning.visible = tier === 2;
    this.dragon.visible = tier === 4;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 6;
      const radius = 0.4 + Math.sin(i * 2.7 + time * 30) * 0.25;
      const o = i * 6;
      this.bolts[o] = ball.x + Math.cos(a) * radius;
      this.bolts[o + 1] = ball.y + Math.sin(a) * radius;
      this.bolts[o + 2] = ball.z + i * 0.045;
      this.bolts[o + 3] = ball.x + Math.cos(a + 0.35) * radius;
      this.bolts[o + 4] = ball.y + Math.sin(a + 0.35) * radius;
      this.bolts[o + 5] = ball.z + (i + 1) * 0.045;
    }
    this.lightning.geometry.attributes.position.needsUpdate = true;
    this.dragon.position.copy(ball);
    this.dragon.rotation.z = Math.sin(time * 8) * 0.2;
    this.scales.forEach((scale, i) => {
      scale.visible = tier === 4;
      scale.position.set(
        ball.x + Math.sin(i * 0.5 - time * 6) * (0.2 + i * 0.025),
        ball.y + Math.cos(i * 0.5 - time * 6) * 0.2,
        ball.z + i * 0.19,
      );
      scale.scale.setScalar(1 - i * 0.035);
    });
    this.ghosts.forEach((ghost, i) => {
      ghost.visible = tier === 3 && p < 0.6;
      ghost.position.set(-0.26 + (i - 2) * 0.55, 0.07, 1.4 + i * 0.35);
      ghost.rotation.y = time * 4 - i * 0.3;
    });
    this.flame.forEach((flame, i) => {
      flame.visible = tier === 1;
      const a = i * 2.4;
      flame.position.set(
        ball.x + Math.sin(a + time * 9) * 0.2,
        ball.y + 0.1 + Math.cos(a) * 0.15,
        ball.z + 0.12 + i * 0.09,
      );
      flame.rotation.x = Math.PI / 2 + Math.sin(time * 5 + i) * 0.3;
      flame.scale.setScalar(0.5 + Math.abs(Math.sin(time * 14 + i)));
    });
  }
}
