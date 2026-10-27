import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Sample } from '../physics/cart';
import { CART_MASS, GRAVITY } from '../physics/constants';
import { normalForce } from '../physics/forces';
import type { Spline } from '../track/spline';
import type { CameraMode, Track } from '../track/types';

interface SceneOptions {
  showForces: boolean;
  comfortMode: boolean;
  reducedMotion: boolean;
  camera: CameraMode;
}

export class SceneManager {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly trackGroup = new THREE.Group();
  private readonly supportsGroup = new THREE.Group();
  private readonly cart: THREE.Group;
  private gravityArrow: THREE.ArrowHelper;
  private normalArrow: THREE.ArrowHelper;
  private velocityArrow: THREE.ArrowHelper;
  private spline: Spline | null = null;
  private sample: Sample | null = null;
  private trackKey = '';
  private active = false;
  private pendingBuild: number | null = null;
  private pendingTrack: Track | null = null;
  private pendingSpline: Spline | null = null;
  private options: SceneOptions;
  private readonly resizeObserver: ResizeObserver;
  private frameId = 0;
  private lastTime = performance.now();
  private trackCenter = new THREE.Vector3();
  private trackSize = new THREE.Vector3(50, 20, 20);
  private followInitialized = false;
  private builtTrackId = '';

  constructor(host: HTMLElement, options: SceneOptions) {
    this.host = host;
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D 트랙 뷰. 궤도 카메라는 마우스로 회전할 수 있고, 화면의 카메라 버튼으로 시점을 바꿀 수 있습니다.'
    );
    host.append(this.renderer.domElement);

    this.scene.fog = new THREE.Fog('#e8edf1', 140, 460);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
    this.camera.position.set(40, 30, 70);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 260;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.enabled = options.camera === 'orbit';

    const hemisphere = new THREE.HemisphereLight('#ffffff', '#8e959d', 1.45);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#ffffff', 3.4);
    sun.position.set(55, 95, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 280;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#ffd9c8', 0.55);
    rim.position.set(-40, 30, -50);
    this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: '#edf0f2', roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(500, 100, '#bcc2c9', '#d2d7db');
    grid.position.y = 0;
    this.scene.add(grid);

    this.scene.add(this.trackGroup, this.supportsGroup);
    this.cart = this.buildCart();
    this.scene.add(this.cart);

    this.gravityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(),
      6,
      '#4b4f57',
      1.5,
      0.7
    );
    this.normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      5,
      '#0072b2',
      1.4,
      0.7
    );
    this.velocityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      5,
      '#ff4f00',
      1.4,
      0.7
    );
    this.scene.add(this.gravityArrow, this.normalArrow, this.velocityArrow);
    this.setShowForces(options.showForces);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.animate();
  }

  setTrack(spline: Spline, track: Track): void {
    this.spline = spline;
    this.renderer.domElement.setAttribute(
      'aria-label',
      `3D 트랙 뷰: ${track.nameKo}. 궤도 카메라는 마우스로 회전할 수 있고, 화면의 카메라 버튼으로 시점을 바꿀 수 있습니다.`
    );
    let signature = `${track.id}:${track.points.length}`;
    for (const point of track.points) {
      signature += `|${point.x.toFixed(1)},${point.y.toFixed(1)},${(point.z ?? 0).toFixed(1)}`;
    }
    if (signature === this.trackKey) {
      this.updateCart();
      return;
    }
    const isNewTrack = track.id !== this.builtTrackId || !this.trackKey;
    this.trackKey = signature;
    this.pendingSpline = spline;
    this.pendingTrack = track;
    if (this.pendingBuild !== null) {
      window.clearTimeout(this.pendingBuild);
      this.pendingBuild = null;
    }
    if (!this.active) {
      this.updateCart();
      return;
    }
    const build = () => {
      this.pendingBuild = null;
      if (!this.pendingSpline) return;
      this.buildTrack(this.pendingSpline);
      this.builtTrackId = this.pendingTrack?.id ?? '';
      this.resize();
      if (isNewTrack) {
        this.frameCamera(this.options.camera === 'follow' ? 'orbit' : this.options.camera);
        this.followInitialized = false;
      }
      this.updateCart();
      this.pendingSpline = null;
      this.pendingTrack = null;
    };
    if (isNewTrack) build();
    else this.pendingBuild = window.setTimeout(build, 110);
  }

  setCartSample(sample: Sample | null): void {
    this.sample = sample;
    this.followInitialized = false;
    this.updateCart();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      if (this.pendingBuild !== null) {
        window.clearTimeout(this.pendingBuild);
        this.pendingBuild = null;
      }
      if (this.pendingSpline) {
        const pendingId = this.pendingTrack?.id ?? '';
        const idChanged = pendingId !== this.builtTrackId;
        this.buildTrack(this.pendingSpline);
        this.builtTrackId = pendingId;
        this.pendingSpline = null;
        this.pendingTrack = null;
        this.resize();
        if (idChanged) {
          this.frameCamera(this.options.camera === 'follow' ? 'orbit' : this.options.camera);
          this.followInitialized = false;
        }
        this.updateCart();
      }
      this.resize();
      this.controls.update();
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.options.camera = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      this.followInitialized = false;
      this.frameCamera('orbit');
      this.controls.target.copy(this.trackCenter);
      this.controls.update();
    } else {
      this.followInitialized = false;
      if (mode === 'side') this.frameCamera('side');
    }
  }

  setShowForces(show: boolean): void {
    this.options.showForces = show;
    this.updateForces();
  }

  setComfortMode(comfort: boolean): void {
    this.options.comfortMode = comfort;
  }

  setReducedMotion(reduced: boolean): void {
    this.options.reducedMotion = reduced;
    if (reduced) this.followInitialized = false;
  }

  private buildCart(): THREE.Group {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#ff4f00',
      roughness: 0.42,
      metalness: 0.25
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#1e2024',
      roughness: 0.6,
      metalness: 0.15
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 2.45), bodyMaterial);
    body.position.y = 0.42;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.26, 0.6), bodyMaterial);
    nose.position.set(0, 0.38, 1.45);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.22, 0.88), darkMaterial);
    seat.position.set(0, 0.7, -0.28);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.66, 0.16), darkMaterial);
    back.position.set(0, 0.95, -0.68);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), darkMaterial);
    torso.position.set(0, 1.1, -0.32);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), darkMaterial);
    head.position.set(0, 1.6, -0.32);
    group.add(body, nose, seat, back, torso, head);
    const wheelGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.18, 10);
    for (const x of [-0.79, 0.79]) {
      for (const z of [-0.78, 0.82]) {
        const wheel = new THREE.Mesh(wheelGeometry, darkMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.12, z);
        group.add(wheel);
      }
    }
    group.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return group;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else if (material) {
        material.dispose();
      }
    });
    group.clear();
  }

  private buildTrack(spline: Spline): void {
    this.disposeGroup(this.trackGroup);
    this.disposeGroup(this.supportsGroup);

    const step = Math.max(0.3, spline.length / 520);
    const corePoints: THREE.Vector3[] = [];
    const railA: THREE.Vector3[] = [];
    const railB: THREE.Vector3[] = [];
    const supportsAt: Array<{ position: THREE.Vector3; height: number }> = [];
    let lastSupportS = -10;
    for (let s = 0; s <= spline.length; s += step) {
      const frame = spline.pointAt(s);
      const tangent = new THREE.Vector3(frame.tx, frame.ty, frame.tz).normalize();
      const normal = new THREE.Vector3(frame.nx, frame.ny, 0);
      normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const point = new THREE.Vector3(frame.x, frame.y, frame.z);
      corePoints.push(point);
      railA.push(point.clone().addScaledVector(binormal, 0.34));
      railB.push(point.clone().addScaledVector(binormal, -0.34));
      if (frame.y > 1.4 && s - lastSupportS > 7) {
        supportsAt.push({ position: point.clone(), height: frame.y });
        lastSupportS = s;
      }
    }
    const last = spline.pointAt(spline.length);
    if (corePoints.length === 0) return;
    corePoints.push(new THREE.Vector3(last.x, last.y, last.z));
    railA.push(
      new THREE.Vector3(last.x, last.y, last.z).add(
        new THREE.Vector3(last.nx, last.ny, 0).multiplyScalar(0.34)
      )
    );
    railB.push(
      new THREE.Vector3(last.x, last.y, last.z).add(
        new THREE.Vector3(last.nx, last.ny, 0).multiplyScalar(-0.34)
      )
    );

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: '#202329',
      roughness: 0.48,
      metalness: 0.5
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: '#ff4f00',
      roughness: 0.32,
      metalness: 0.35
    });
    const tieMaterial = new THREE.MeshStandardMaterial({
      color: '#3a3e45',
      roughness: 0.62,
      metalness: 0.35
    });
    const coreCurve = new THREE.CatmullRomCurve3(corePoints, false, 'centripetal');
    const coreTube = new THREE.Mesh(
      new THREE.TubeGeometry(coreCurve, Math.min(1800, corePoints.length * 2), 0.32, 9, false),
      coreMaterial
    );
    coreTube.castShadow = true;
    coreTube.receiveShadow = true;
    this.trackGroup.add(coreTube);
    for (const railPoints of [railA, railB]) {
      const curve = new THREE.CatmullRomCurve3(railPoints, false, 'centripetal');
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.min(1600, railPoints.length * 2), 0.1, 6, false),
        railMaterial
      );
      tube.castShadow = true;
      this.trackGroup.add(tube);
    }

    const tieGeometry = new THREE.BoxGeometry(1.1, 0.08, 0.2);
    const tieStep = Math.max(0.8, spline.length / 260);
    const tieFrames: THREE.Matrix4[] = [];
    for (let s = 0; s <= spline.length; s += tieStep) {
      const frame = spline.pointAt(s);
      const tangent = new THREE.Vector3(frame.tx, frame.ty, frame.tz).normalize();
      const normal = new THREE.Vector3(frame.nx, frame.ny, 0);
      normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const basis = new THREE.Matrix4().makeBasis(binormal.clone().negate(), normal, tangent);
      basis.setPosition(new THREE.Vector3(frame.x, frame.y, frame.z));
      tieFrames.push(basis);
    }
    const ties = new THREE.InstancedMesh(tieGeometry, tieMaterial, tieFrames.length);
    tieFrames.forEach((matrix, index) => ties.setMatrixAt(index, matrix));
    ties.castShadow = true;
    ties.instanceMatrix.needsUpdate = true;
    this.trackGroup.add(ties);

    const supportMaterial = new THREE.MeshStandardMaterial({
      color: '#8d939a',
      roughness: 0.72,
      metalness: 0.2
    });
    for (const support of supportsAt) {
      const height = Math.max(0.4, support.position.y);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 7), supportMaterial);
      column.position.set(support.position.x, height / 2, support.position.z);
      column.castShadow = true;
      this.supportsGroup.add(column);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 9), supportMaterial);
      foot.position.set(support.position.x, 0.045, support.position.z);
      foot.receiveShadow = true;
      this.supportsGroup.add(foot);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.55), railMaterial);
      cap.position.set(support.position.x, height - 0.2, support.position.z);
      cap.castShadow = true;
      this.supportsGroup.add(cap);
    }

    this.trackCenter = coreCurve.getPointAt(0.5);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of corePoints) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    this.trackSize.set(maxX - minX, maxY - minY, maxX - minX);

    const pad = 9;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: '#bcc2c9',
      roughness: 0.9,
      metalness: 0
    });
    const frameGroup = new THREE.Group();
    const frameX = (minX + maxX) / 2;
    const frameZ = (minZ + maxZ) / 2;
    const frameW = maxX - minX + pad * 2;
    const frameD = Math.max(18, maxZ - minZ + pad * 2);
    const frameBar = (x: number, z: number, width: number, depth: number) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, depth), frameMaterial);
      bar.position.set(x, 0.02, z);
      bar.receiveShadow = true;
      frameGroup.add(bar);
    };
    frameBar(frameX, frameZ - frameD / 2, frameW, 0.14);
    frameBar(frameX, frameZ + frameD / 2, frameW, 0.14);
    frameBar(frameX - frameW / 2, frameZ, 0.14, frameD);
    frameBar(frameX + frameW / 2, frameZ, 0.14, frameD);
    this.supportsGroup.add(frameGroup);
  }

  private frameCamera(mode: CameraMode): void {
    const center = this.trackCenter;
    const width = Math.max(this.trackSize.x, 30);
    const height = Math.max(this.trackSize.y, 16);
    if (mode === 'side') {
      this.camera.position.set(center.x, center.y + 1.5, center.z + Math.max(width * 0.7, 26));
    } else {
      this.camera.position.set(
        center.x + width * 0.2,
        center.y + height * 0.3,
        center.z + Math.max(width * 0.78, 30)
      );
    }
    this.controls.target.copy(center);
    this.controls.update();
    this.camera.lookAt(center);
  }

  private effectiveSample(): Sample | null {
    if (this.sample) return this.sample;
    if (!this.spline) return null;
    const frame = this.spline.pointAt(0);
    const normal = normalForce(0, frame.curvature, frame.ny);
    return {
      s: 0,
      t: 0,
      x: frame.x,
      y: frame.y,
      z: frame.z,
      speed: 0,
      kinetic: 0,
      potential: 0,
      thermal: 0,
      normalForce: normal,
      gForce: normal / (CART_MASS * GRAVITY),
      curvature: frame.curvature
    };
  }

  private updateCart(): void {
    const sample = this.effectiveSample();
    if (!this.spline || !sample) return;
    const frame = this.spline.pointAt(sample.s);
    const tangent = new THREE.Vector3(frame.tx, frame.ty, frame.tz).normalize();
    const normal = new THREE.Vector3(frame.nx, frame.ny, 0);
    normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const basis = new THREE.Matrix4().makeBasis(binormal.clone().negate(), normal, tangent);
    this.cart.position.copy(new THREE.Vector3(frame.x, frame.y, frame.z)).addScaledVector(normal, 0.58);
    this.cart.quaternion.setFromRotationMatrix(basis);
    this.updateForces();
  }

  private updateForces(): void {
    const sample = this.effectiveSample();
    if (!this.spline || !sample || !this.options.showForces) {
      this.gravityArrow.visible = false;
      this.normalArrow.visible = false;
      this.velocityArrow.visible = false;
      return;
    }
    this.gravityArrow.visible = true;
    this.normalArrow.visible = true;
    this.velocityArrow.visible = sample.speed > 0.1;
    const frame = this.spline.pointAt(sample.s);
    const tangent = new THREE.Vector3(frame.tx, frame.ty, frame.tz).normalize();
    const normal = new THREE.Vector3(frame.nx, frame.ny, 0);
    normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    const origin = new THREE.Vector3(frame.x, frame.y, frame.z).addScaledVector(normal, 1.2);
    const gravityOrigin = origin.clone().add(new THREE.Vector3(1.6, 0, 0));
    this.gravityArrow.position.copy(gravityOrigin);
    this.gravityArrow.setDirection(new THREE.Vector3(0, -1, 0));
    this.gravityArrow.setLength(6, 1.5, 0.7);

    this.normalArrow.position.copy(origin);
    const normalDirection = normal.clone().multiplyScalar(sample.normalForce >= 0 ? 1 : -1);
    this.normalArrow.setDirection(normalDirection);
    const normalLength = Math.min(11, Math.max(2.4, Math.abs(sample.gForce) * 1.3 + 2));
    this.normalArrow.setLength(normalLength, 1.3, 0.55);

    this.velocityArrow.position.copy(origin);
    this.velocityArrow.setDirection(tangent);
    const velocityLength = Math.min(11, Math.max(2, sample.speed * 0.3));
    this.velocityArrow.setLength(velocityLength, 1.3, 0.55);
  }

  private updateFollowCamera(dt: number): void {
    if (!this.sample || !this.spline) return;
    const frame = this.spline.pointAt(this.sample.s);
    const tangent = new THREE.Vector3(frame.tx, frame.ty, frame.tz).normalize();
    const normal = new THREE.Vector3(frame.nx, frame.ny, 0);
    normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    const cartPosition = new THREE.Vector3(frame.x, frame.y, frame.z).addScaledVector(normal, 0.9);
    const worldUp = new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3().crossVectors(tangent, worldUp);
    if (side.lengthSq() < 0.01) side = normal.clone();
    side.normalize();
    const desiredPosition = cartPosition
      .clone()
      .addScaledVector(tangent, -12.5)
      .addScaledVector(worldUp, 4.8)
      .addScaledVector(side, 4.2);
    const desiredTarget = cartPosition.clone().addScaledVector(tangent, 4);
    if (!this.followInitialized || this.options.reducedMotion) {
      this.camera.position.copy(desiredPosition);
      this.controls.target.copy(desiredTarget);
      this.followInitialized = true;
    } else {
      const rate = this.options.comfortMode ? 2.6 : 5.2;
      const alpha = 1 - Math.exp(-rate * dt);
      this.camera.position.lerp(desiredPosition, alpha);
      this.controls.target.lerp(desiredTarget, alpha);
    }
    this.camera.lookAt(this.controls.target);
    const targetFov =
      this.options.comfortMode || this.options.reducedMotion
        ? 58
        : 58 + Math.min(9, (this.sample.speed / 25) * 7);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2.5);
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 4 || height < 4) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private handleVisibility = (): void => {
    this.lastTime = performance.now();
  };

  private animate = (): void => {
    this.frameId = window.requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.active || document.hidden) return;
    if (this.options.camera === 'orbit') {
      this.controls.update();
    } else if (this.options.camera === 'follow') {
      this.updateFollowCamera(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    window.cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.controls.dispose();
    this.disposeGroup(this.trackGroup);
    this.disposeGroup(this.supportsGroup);
    this.renderer.dispose();
    this.host.querySelector('canvas')?.remove();
  }
}
