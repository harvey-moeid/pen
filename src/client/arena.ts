import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Snapshot } from '../game/engine';
import type { Club } from '../game/model';
import { SkillEffects } from './effects';
const colors = [0xffffff, 0xff7736, 0x49cfff, 0xbd78ff, 0xffd16a];
const clamp = T.MathUtils.clamp;
const smooth = (x: number) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
function material(color: T.ColorRepresentation, roughness = 0.65, metalness = 0) {
  return new T.MeshStandardMaterial({ color, roughness, metalness });
}
function box(
  parent: T.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: T.Material,
) {
  const m: T.Mesh<T.BufferGeometry, T.Material> = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(parent: T.Object3D, r: number, x: number, y: number, z: number, mat: T.Material) {
  const m = new T.Mesh(new T.SphereGeometry(r, 18, 14), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function textTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${h * 0.52}px system-ui`;
  ctx.fillText(text, w / 2, h / 2, w * 0.94);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
function banner(
  parent: T.Object3D,
  text: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  bg = '#131e29',
  fg = '#b9ef69',
) {
  const m = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({ map: textTexture(text, bg, fg), side: T.DoubleSide }),
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
type Person = {
  root: T.Group;
  body: T.Group;
  leftLeg: T.Bone;
  rightLeg: T.Bone;
  leftArm: T.Bone;
  rightArm: T.Bone;
  head: T.Mesh;
  home: number;
  club: Club;
  label: HTMLDivElement;
  mixer?: T.AnimationMixer;
  model?: T.Group;
};
function makePerson(club: Club, keeper = false): Omit<Person, 'home' | 'label' | 'club'> {
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const jersey = material(club.primaryColor),
    trim = material(club.secondaryColor),
    skin = material('#c68f6d'),
    boots = material('#101821'),
    socks = material('#e9eef3');
  const torso = box(body, 0.6, 0.68, 0.32, 0, 1.15, 0, jersey);
  torso.geometry = new T.CapsuleGeometry(0.29, 0.34, 4, 10);
  torso.scale.set(1, 0.95, 0.62);
  box(body, 0.52, 0.25, 0.32, 0, 0.77, 0, trim);
  sphere(body, 0.105, 0, 1.56, 0, skin);
  const head = sphere(body, 0.235, 0, 1.81, 0, skin);
  head.scale.set(0.88, 1.08, 0.95);
  const hair = sphere(body, 0.24, 0, 1.91, 0.01, material('#241f1d'));
  hair.scale.set(0.89, 0.62, 0.95);
  // Faces point toward negative Z, i.e. the goal, while jersey numbers face the camera.
  sphere(body, 0.048, 0, 1.8, -0.22, skin);
  for (const x of [-0.083, 0.083]) sphere(body, 0.021, x, 1.85, -0.206, boots);
  const number = banner(
    body,
    String(club.number),
    0.3,
    0.3,
    0,
    1.23,
    0.205,
    club.primaryColor,
    club.secondaryColor,
  );
  number.renderOrder = 1;
  const limb = (x: number, y: number, length: number, leg: boolean) => {
    const bone = new T.Bone();
    bone.position.set(x, y, 0);
    body.add(bone);
    box(bone, leg ? 0.19 : 0.16, length, 0.18, 0, -length / 2, 0, leg ? skin : jersey);
    const joint = new T.Bone();
    joint.position.y = -length;
    bone.add(joint);
    box(
      joint,
      leg ? 0.17 : 0.13,
      leg ? 0.3 : 0.25,
      0.16,
      0,
      leg ? -0.15 : -0.125,
      0,
      leg ? socks : skin,
    );
    if (leg) box(joint, 0.22, 0.13, 0.38, 0, -0.33, -0.09, boots);
    else sphere(joint, 0.09, 0, -0.28, 0, keeper ? material('#d7f4e9') : skin);
    return bone;
  };
  const leftLeg = limb(-0.17, 0.72, 0.3, true),
    rightLeg = limb(0.17, 0.72, 0.3, true),
    leftArm = limb(-0.4, 1.42, 0.32, false),
    rightArm = limb(0.4, 1.42, 0.32, false);
  leftArm.rotation.z = -0.15;
  rightArm.rotation.z = 0.15;
  return { root, body, leftLeg, rightLeg, leftArm, rightArm, head };
}
export class Arena {
  private scene = new T.Scene();
  private camera = new T.OrthographicCamera();
  private renderer: T.WebGLRenderer;
  private resize: ResizeObserver;
  private frame = 0;
  private clock = new T.Clock();
  private elapsed = 0;
  private snapshot: Snapshot;
  private players: Person[] = [];
  private keeper: ReturnType<typeof makePerson>;
  private ball = new T.Group();
  private trail: T.Points;
  private trailPositions = new Float32Array(240 * 3);
  private positions: T.Vector3[] = [];
  private key = '';
  private lastKick = '';
  private onResult?: (result: string) => void;
  private disposed = false;
  private lastTime = 0;
  private frames = 0;
  private fpsAt = performance.now();
  private quality = '';
  private keeperColor = '';
  private spotlight: T.PointLight;
  private effects = new SkillEffects();
  constructor(
    private host: HTMLDivElement,
    initial: Snapshot,
    onResult?: (result: string) => void,
  ) {
    this.snapshot = initial;
    this.onResult = onResult;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x09141d, 1);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new T.Fog(0x09141d, 30, 75);
    this.scene.add(new T.HemisphereLight(0xe3eeff, 0x33513b, 1.8));
    const sun = new T.DirectionalLight(0xfff2d4, 2.3);
    sun.position.set(-7, 18, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new T.DirectionalLight(0x78b9ff, 1.5);
    fill.position.set(8, 10, -8);
    this.scene.add(fill);
    this.spotlight = new T.PointLight(0xffad48, 0, 12);
    this.scene.add(this.spotlight);
    this.buildStadium();
    this.scene.add(this.effects.root);
    this.keeper = makePerson(
      {
        ...initial.clubs[0],
        primaryColor: initial.visual.keeperColor,
        secondaryColor: '#162333',
        number: 1,
      },
      true,
    );
    this.keeper.root.position.set(0, 0.06, -6.7);
    this.keeper.root.rotation.y = Math.PI;
    this.scene.add(this.keeper.root);
    const ballMat = material('#fafafa', 0.28);
    sphere(this.ball, 0.19, 0, 0, 0, ballMat);
    for (let i = 0; i < 12; i++) {
      const theta = Math.acos(1 - (2 * (i + 0.5)) / 12),
        phi = i * 2.399963;
      const patch = new T.Mesh(new T.CircleGeometry(0.058, 5), material('#172333'));
      patch.position.setFromSphericalCoords(0.193, theta, phi);
      patch.lookAt(patch.position.clone().multiplyScalar(2));
      this.ball.add(patch);
    }
    this.ball.position.set(0, 0.21, 0.3);
    this.scene.add(this.ball);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(this.trailPositions, 3));
    this.trail = new T.Points(
      geometry,
      new T.PointsMaterial({
        color: 0xffab53,
        size: 0.14,
        transparent: true,
        opacity: 0.85,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.update(initial);
    this.fit();
    this.animate();
  }
  private buildStadium() {
    const s = this.scene;
    box(s, 20, 0.65, 25, 0, -0.55, -1, material('#152d31'));
    box(s, 18, 0.18, 23, 0, -0.12, -1, material('#286b4c'));
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 128;
    grassCanvas.height = 128;
    const grassCtx = grassCanvas.getContext('2d')!;
    const pixels = grassCtx.createImageData(128, 128);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const noise = 180 + (((i * 1664525 + 1013904223) >>> 8) % 70);
      pixels.data[i] = noise;
      pixels.data[i + 1] = noise;
      pixels.data[i + 2] = noise;
      pixels.data[i + 3] = 255;
    }
    grassCtx.putImageData(pixels, 0, 0);
    const grass = new T.CanvasTexture(grassCanvas);
    grass.wrapS = grass.wrapT = T.RepeatWrapping;
    grass.repeat.set(8, 1);
    grass.colorSpace = T.SRGBColorSpace;
    for (let i = 0; i < 12; i++)
      box(
        s,
        17.8,
        0.025,
        1.9,
        0,
        -0.011,
        -11.45 + i * 1.9,
        new T.MeshStandardMaterial({
          color: i % 2 ? '#256245' : '#2a6c4b',
          map: grass,
          roughness: 1,
        }),
      );
    const white = new T.LineBasicMaterial({ color: 0xc5e5d5, transparent: true, opacity: 0.7 });
    const line = (points: number[][]) => {
      const g = new T.BufferGeometry().setFromPoints(
        points.map(([x, z]) => new T.Vector3(x, 0.025, z)),
      );
      s.add(new T.Line(g, white));
    };
    line([
      [-8, 9],
      [-8, -10],
      [8, -10],
      [8, 9],
      [-8, 9],
    ]);
    line([
      [-6, -10],
      [-6, -2],
      [6, -2],
      [6, -10],
    ]);
    line([
      [-3.8, -10],
      [-3.8, -6],
      [3.8, -6],
      [3.8, -10],
    ]);
    line(
      Array.from({ length: 49 }, (_, i) => {
        const a = (Math.PI * i) / 48;
        return [3 * Math.cos(a), -2 + 3 * Math.sin(a)];
      }),
    );
    const spot = new T.Mesh(
      new T.CircleGeometry(0.11, 20),
      new T.MeshBasicMaterial({ color: 0xffffff }),
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.035, 0.3);
    s.add(spot);
    const frame = material('#f0f8ff', 0.3, 0.4);
    box(s, 0.13, 2.8, 0.13, -3.3, 1.4, -7.4, frame);
    box(s, 0.13, 2.8, 0.13, 3.3, 1.4, -7.4, frame);
    box(s, 6.73, 0.13, 0.13, 0, 2.8, -7.4, frame);
    const net: number[] = [];
    const segment = (a: number[], b: number[]) => net.push(...a, ...b);
    for (let x = -3.3; x <= 3.31; x += 0.3) {
      segment([x, 0, -8.7], [x, 2.8, -8.7]);
      segment([x, 2.8, -8.7], [x, 2.8, -7.4]);
    }
    for (let y = 0; y <= 2.81; y += 0.28) {
      segment([-3.3, y, -8.7], [3.3, y, -8.7]);
      segment([-3.3, y, -8.7], [-3.3, y, -7.4]);
      segment([3.3, y, -8.7], [3.3, y, -7.4]);
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(net, 3));
    s.add(
      new T.LineSegments(
        geom,
        new T.LineBasicMaterial({ color: 0xc7e2db, transparent: true, opacity: 0.38 }),
      ),
    );
    // Hundreds of seats share one draw call and no individual shadow pass.
    const seats: { position: T.Vector3; color: string }[] = [];
    for (let tier = 0; tier < 5; tier++) {
      box(
        s,
        21,
        0.65,
        1.2,
        0,
        0.3 + tier * 0.66,
        -12 - tier * 0.95,
        material(tier % 2 ? '#1c3343' : '#223e50'),
      );
      for (let i = 0; i < 39; i++)
        seats.push({
          position: new T.Vector3(-10 + i * 0.52, 0.78 + tier * 0.66, -12 - tier * 0.95),
          color: ['#385060', '#89a19c', '#cdad79', '#306650'][(i * 7 + tier * 3) % 4],
        });
    }
    for (const side of [-1, 1])
      for (let tier = 0; tier < 3; tier++) {
        box(s, 1.1, 0.65, 21, side * (10 + tier), 0.3 + tier * 0.65, -1.7, material('#1b3441'));
        for (let i = 0; i < 25; i++)
          seats.push({
            position: new T.Vector3(side * (10 + tier), 0.8 + tier * 0.65, -11.3 + i * 0.8),
            color: i % 3 ? '#4f6d73' : '#b8aa7d',
          });
      }
    const seating = new T.InstancedMesh(
      new T.BoxGeometry(0.32, 0.24, 0.36),
      material('#ffffff'),
      seats.length,
    );
    const matrix = new T.Matrix4();
    seats.forEach((seat, i) => {
      matrix.makeTranslation(seat.position);
      seating.setMatrixAt(i, matrix);
      seating.setColorAt(i, new T.Color(seat.color));
    });
    seating.receiveShadow = true;
    seating.instanceMatrix.needsUpdate = true;
    s.add(seating);
    banner(s, 'P E N A L T Y   B A T T L E', 13, 1.1, 0, 1, -11.05);
    for (const x of [-8.5, 8.5]) {
      box(s, 0.13, 8, 0.13, x, 4, -10, material('#5b727f', 0.4, 0.8));
      box(s, 2.4, 0.55, 0.4, x, 8, -10, material('#d9f1ff'));
      const glow = new T.Mesh(
        new T.PlaneGeometry(2.2, 0.35),
        new T.MeshBasicMaterial({ color: 0xe7faff }),
      );
      glow.position.set(x, 8, -9.78);
      s.add(glow);
    }
    const sideline = banner(s, 'LIVE  •  YOUR CLUB. YOUR MOMENT.', 12, 0.65, 0, 0.35, 10.6);
    sideline.rotation.x = -0.55;
  }
  update(snapshot: Snapshot) {
    this.snapshot = snapshot;
    if (this.keeperColor !== snapshot.visual.keeperColor) {
      this.keeperColor = snapshot.visual.keeperColor;
      this.scene.remove(this.keeper.root);
      this.disposeObject(this.keeper.root);
      this.keeper = makePerson(
        {
          ...snapshot.clubs[0],
          primaryColor: this.keeperColor,
          secondaryColor: '#162333',
          number: 1,
        },
        true,
      );
      this.keeper.root.position.set(0, 0.06, -6.7);
      this.keeper.root.rotation.y = Math.PI;
      this.scene.add(this.keeper.root);
    }
    const newKey = JSON.stringify(snapshot.clubs);
    if (newKey !== this.key) {
      this.key = newKey;
      for (const p of this.players) {
        this.scene.remove(p.root);
        this.disposeObject(p.root);
        p.label.remove();
      }
      this.players = [];
      const gap = Math.min(2.7, 14 / Math.max(1, snapshot.clubs.length - 1));
      snapshot.clubs.forEach((club, i) => {
        const p = makePerson(club);
        p.root.scale.setScalar(1.2);
        const home = (i - (snapshot.clubs.length - 1) / 2) * gap;
        p.root.position.set(home, 0.06, 5.8);
        this.scene.add(p.root);
        const label = document.createElement('div');
        label.className = 'player-label';
        label.textContent = club.code;
        label.style.setProperty('--club', club.primaryColor);
        this.host.appendChild(label);
        const person: Person = { ...p, home, club, label };
        this.players.push(person);
        if (club.characterAssetKey) {
          new GLTFLoader().load(
            '/media/' + club.characterAssetKey,
            (gltf) => {
              if (this.disposed || !this.players.includes(person)) {
                this.disposeObject(gltf.scene);
                return;
              }
              const bounds = new T.Box3().setFromObject(gltf.scene),
                size = bounds.getSize(new T.Vector3());
              const scale = 2 / Math.max(size.y, 0.01);
              gltf.scene.scale.setScalar(scale);
              gltf.scene.position.y = -bounds.min.y * scale;
              gltf.scene.rotation.y = Math.PI;
              person.body.visible = false;
              person.root.add(gltf.scene);
              person.model = gltf.scene;
              person.mixer = new T.AnimationMixer(gltf.scene);
              gltf.animations.slice(0, 1).forEach((clip) => person.mixer!.clipAction(clip).play());
            },
            undefined,
            () => {
              this.host.dataset.assetWarning = 'GLB gagal dimuat; karakter bawaan digunakan';
            },
          );
        }
      });
    }
    if (this.quality !== snapshot.visual.quality) {
      this.quality = snapshot.visual.quality;
      this.renderer.setPixelRatio(
        Math.min(devicePixelRatio, this.quality === 'Low' ? 1 : this.quality === 'High' ? 2 : 1.5),
      );
      this.renderer.shadowMap.enabled = this.quality !== 'Low';
      this.fit();
    }
  }
  private fit() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const width = Math.max(20, aspect * 22),
      height = width / aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.position.set(0, 17, 25);
    this.camera.lookAt(0, 0, -1.5);
    this.camera.updateProjectionMatrix();
  }
  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    const now = Date.now() + Number(this.host.dataset.clockOffset || 0),
      s = this.snapshot,
      k = s.active;
    const progress = k?.startedAt
      ? clamp((now - k.startedAt) / (k.endsAt! - k.startedAt), 0, 1)
      : 0;
    const tier = k
      ? ['NORMAL', 'SKILL_1', 'SKILL_2', 'SKILL_3', 'ULTIMATE'].indexOf(k.skill.id)
      : 0;
    if (k?.id !== this.lastKick) {
      this.lastKick = k?.id ?? '';
      this.positions = [];
      this.lastTime = 0;
      if (k && progress < 0.2) this.onResult?.('WHISTLE');
    }
    for (const [i, p] of this.players.entries()) {
      const active = k?.clubId === p.club.id;
      const walk = (active && progress < 0.22) || (active && progress > 0.79);
      const leave = active
        ? progress < 0.22
          ? smooth(progress / 0.22)
          : progress > 0.79
            ? 1 - smooth((progress - 0.79) / 0.21)
            : 1
        : 0;
      p.root.position.set(
        T.MathUtils.lerp(p.home, -0.26, leave),
        0.06,
        T.MathUtils.lerp(5.8, 1.25, leave),
      );
      p.root.rotation.set(0, 0, 0);
      p.body.position.y = walk
        ? Math.abs(Math.sin(this.elapsed * 13)) * 0.07
        : Math.sin(this.elapsed * 2 + i) * 0.025;
      const swing = walk
        ? Math.sin(this.elapsed * 13) * 0.55
        : Math.sin(this.elapsed * 2 + i) * 0.06;
      p.leftLeg.rotation.set(swing, 0, 0);
      p.rightLeg.rotation.set(-swing, 0, 0);
      p.leftArm.rotation.x = -swing;
      p.rightArm.rotation.x = swing;
      p.leftArm.rotation.z = -0.14;
      p.rightArm.rotation.z = 0.14;
      p.body.rotation.set(0, 0, 0);
      if (active && progress >= 0.22 && progress < 0.5) {
        const t = (progress - 0.22) / 0.28,
          energy = Math.sin(t * Math.PI);
        p.rightLeg.rotation.x = -Math.sin(t * Math.PI * 1.4) * 1.5;
        p.leftArm.rotation.z = -energy * 0.8;
        p.rightArm.rotation.z = energy * 0.8;
        if (tier === 1) {
          p.body.rotation.x = -energy * 0.3;
          p.rightLeg.rotation.x *= 1.35;
        }
        if (tier === 2) {
          p.body.rotation.y = energy * 1.5;
          p.leftLeg.rotation.z = energy * 0.22;
        }
        if (tier === 3) {
          p.root.rotation.y = t * Math.PI * 2;
          p.body.position.y += energy * 0.55;
          p.leftLeg.rotation.x = energy * 0.5;
        }
        if (tier === 4) {
          p.body.position.y += energy * 1.4;
          p.body.rotation.x = -energy * 0.85;
          p.leftArm.rotation.z = -energy * 1.5;
          p.rightArm.rotation.z = energy * 1.5;
        }
      }
      if (active && progress > 0.65 && progress < 0.79 && k?.outcome === 'GOAL') {
        p.leftArm.rotation.z = -2.6;
        p.rightArm.rotation.z = 2.6;
        p.body.position.y += Math.abs(Math.sin(progress * 50)) * 0.17;
      }
      p.mixer?.update(delta);
      const point = new T.Vector3(p.root.position.x, 3, p.root.position.z).project(this.camera);
      p.label.style.transform = `translate(-50%,-50%) translate(${(point.x * 0.5 + 0.5) * this.host.clientWidth}px,${(-point.y * 0.5 + 0.5) * this.host.clientHeight}px)`;
      p.label.classList.toggle('active', active);
      p.label.style.opacity = point.z > 1 ? '0' : '1';
    }
    const flight = smooth((progress - 0.45) / 0.2),
      side = k ? (k.sequence % 2 ? 1 : -1) : 1;
    const outcome = k?.outcome;
    const targetX = outcome === 'MISS' ? side * 4.6 : outcome === 'SAVE' ? side * 1.2 : side * 2.55;
    if (k && progress > 0.45 && progress < 0.8) {
      const x = targetX * flight + (tier === 2 ? Math.sin(flight * Math.PI) * -side * 2 : 0);
      const y =
        0.21 +
        Math.sin(flight * Math.PI) * (tier === 4 ? 4 : tier === 3 ? 2.5 : 1.3) +
        (outcome === 'GOAL' ? flight * 0.65 : 0);
      let z = 0.3 - 7.9 * flight;
      if (outcome === 'SAVE' && flight > 0.85) z = -6.4 + (flight - 0.85) * 5;
      this.ball.position.set(x, y, z);
      this.ball.rotation.x -= delta * 14;
      this.ball.rotation.z += delta * 8;
    } else this.ball.position.set(0, 0.21, 0.3);
    this.ball.visible = !k || progress < 0.82;
    this.ball.scale.setScalar(tier === 4 && progress > 0.35 && progress < 0.65 ? 1.5 : 1);
    this.spotlight.position.copy(this.ball.position);
    this.spotlight.color.setHex(colors[tier]);
    this.spotlight.intensity = k && tier && progress > 0.3 && progress < 0.74 ? 7 : 0;
    const keeper = this.keeper;
    const dive = k ? smooth((progress - 0.49) / 0.14) : 0;
    const recover = progress > 0.76 ? 1 - smooth((progress - 0.76) / 0.2) : 1;
    const keeperSide = outcome === 'GOAL' ? -side : side;
    keeper.root.position.x = dive * keeperSide * (outcome === 'MISS' ? 1 : 1.8) * recover;
    keeper.root.rotation.z = -dive * keeperSide * 0.95 * recover;
    keeper.root.position.y = 0.06 + Math.sin(dive * Math.PI) * 0.3 * recover;
    keeper.leftArm.rotation.z = -0.7 - dive;
    keeper.rightArm.rotation.z = 0.7 + dive;
    if (tier > 0 && k && progress > 0.45 && progress < 0.7) {
      this.positions.unshift(this.ball.position.clone());
      this.positions = this.positions.slice(0, this.quality === 'Low' ? 16 : 60);
    } else this.positions = this.positions.slice(0, Math.max(0, this.positions.length - 2));
    const count = this.quality === 'High' ? 240 : 120;
    for (let i = 0; i < count; i++) {
      const p = this.positions[Math.floor(i / 4)];
      const o = i * 3;
      this.trailPositions[o] = p ? p.x + Math.sin(this.elapsed * 9 + i) * 0.12 : 0;
      this.trailPositions[o + 1] = p ? p.y + Math.cos(i * 3) * 0.13 : -100;
      this.trailPositions[o + 2] = p ? p.z + Math.sin(i) * 0.1 : 0;
    }
    this.trail.geometry.setDrawRange(0, count);
    this.trail.geometry.attributes.position.needsUpdate = true;
    (this.trail.material as T.PointsMaterial).color.setHex(colors[tier]);
    (this.trail.material as T.PointsMaterial).size = tier === 4 ? 0.25 : 0.13;
    // A small cinematic push preserves the full horizontal formation at all times.
    const zoom =
      s.visual.cinematic && tier > 0 && k
        ? 1 + Math.sin(clamp((progress - 0.22) / 0.56, 0, 1) * Math.PI) * 0.08
        : 1;
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    if (k && progress >= 0.45 && this.lastTime < 0.45) this.onResult?.('KICK');
    if (k && progress >= 0.65 && this.lastTime < 0.65) this.onResult?.(k.outcome ?? '');
    this.lastTime = progress;
    this.effects.update(tier, progress, this.ball.position, this.elapsed, Boolean(k));
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (performance.now() - this.fpsAt > 1000) {
      this.host.dataset.fps = String(
        Math.round((this.frames * 1000) / (performance.now() - this.fpsAt)),
      );
      this.fpsAt = performance.now();
      this.frames = 0;
    }
  };
  private disposeObject(root: T.Object3D) {
    root.traverse((obj) => {
      if (obj instanceof T.Mesh || obj instanceof T.Line || obj instanceof T.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if ('map' in mat && mat.map instanceof T.Texture) mat.map.dispose();
          mat.dispose();
        });
      }
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.players.forEach((p) => p.label.remove());
    this.disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
