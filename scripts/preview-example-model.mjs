import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const bundled = await build({
  stdin: {
    contents: `
    import * as T from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    const host = document.querySelector('#model');
    const renderer = new T.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setSize(host.clientWidth,host.clientHeight);
    renderer.setPixelRatio(1.5);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const scene=new T.Scene();
    scene.add(new T.HemisphereLight('#f3f7ff','#33454c',2));
    const light=new T.DirectionalLight('#fff6df',3);
    light.position.set(-3,6,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);
    const ground=new T.Mesh(new T.CircleGeometry(2.6,64),new T.MeshStandardMaterial({color:'#253e3e',roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    const gltf=await new GLTFLoader().loadAsync('/character.glb');
    for(const [x,rotation] of [[-0.85,0.12],[0.85,Math.PI+0.12]]){
      const model=gltf.scene.clone(true);
      model.position.x=x;model.rotation.y=rotation;
      model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
      scene.add(model);
    }
    const camera=new T.PerspectiveCamera(32,host.clientWidth/host.clientHeight,0.1,50);
    camera.position.set(0,2.65,7.8);camera.lookAt(0,1.2,0);
    renderer.render(scene,camera);document.body.dataset.ready='true';
  `,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'esm',
  minify: true,
});
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><title>Contoh aset Penalty Battle</title>
<style>*{box-sizing:border-box}body{margin:0;width:1200px;height:800px;background:#0c151d;color:#e8edf2;font-family:Arial,sans-serif;padding:48px}header small{color:#c5e883;letter-spacing:3px}h1{font-size:34px;margin:12px 0 8px}p{color:#94a6b4;line-height:1.6;font-size:15px}main{display:grid;grid-template-columns:300px 1fr;gap:28px;margin-top:24px}section{border:1px solid #2c424d;border-radius:18px;background:#111f29;padding:24px;text-align:center}img{width:230px;height:230px;object-fit:contain}h2{font-size:19px;color:#c5e883;margin:14px 0}#model{width:100%;height:420px}footer{margin-top:22px;color:#94a6b4;font-size:13px}.labels{display:flex;justify-content:space-around;color:#c5e883;font-size:13px;letter-spacing:2px}</style>
<header><small>PENALTY BATTLE · CONTOH ASET</small><h1>Logo gambar. Karakter GLB.</h1><p>Contoh untuk menguji ukuran, warna, arah hadap, dan hasil unggah pada game.</p></header>
<main><section><img src="/logo.png" alt="Logo PB"><h2>logo-pb.png</h2><p>PNG transparan<br>1254 × 1254 piksel<br>Warna lime + navy</p></section><section><div id="model"></div><div class="labels"><span>TAMPAK DEPAN</span><span>TAMPAK BELAKANG</span></div><h2>character-pb.glb</h2><p>4.276 segitiga · animasi Idle · mandiri tanpa tekstur eksternal</p></section></main>
<footer>Unggah melalui Admin → Klub. Model 3D di kanan adalah render dari berkas GLB contoh yang sama.</footer><script type="module" src="/preview.js"></script></html>`;
const server = createServer((request, response) => {
  void (async () => {
    if (request.url === '/preview.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(bundled.outputFiles[0].text);
      return;
    }
    if (request.url === '/character.glb') {
      response.end(await readFile('public/examples/character-pb.glb'));
      return;
    }
    if (request.url === '/logo.png') {
      response.setHeader('Content-Type', 'image/png');
      response.end(await readFile('public/examples/logo-pb.png'));
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  })().catch((error) => {
    response.statusCode = 500;
    response.end(String(error));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.screenshot({ path: 'public/examples/preview.png' });
  console.log('public/examples/preview.png');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
