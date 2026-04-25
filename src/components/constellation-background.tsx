"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type StarRecord = {
  id: number;
  name: string;
  raHours: number;
  decDeg: number;
  mag: number;
  constellation: string;
};

const SKY_RADIUS = 120;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function sphericalToCartesian(raHours: number, decDeg: number, radius = SKY_RADIUS) {
  const raRad = (raHours * Math.PI) / 12;
  const decRad = (decDeg * Math.PI) / 180;

  const x = radius * Math.cos(decRad) * Math.cos(raRad);
  const y = radius * Math.sin(decRad);
  const z = radius * Math.cos(decRad) * Math.sin(raRad);

  return new THREE.Vector3(x, y, z);
}

function magnitudeToBrightness(mag: number) {
  return THREE.MathUtils.clamp((6 - mag) / 7, 0.2, 1);
}

function magnitudeToSize(mag: number) {
  return THREE.MathUtils.clamp(5.5 - mag * 0.6, 1.4, 6);
}

function rand01(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildTangentBasis(normal: THREE.Vector3) {
  const up = Math.abs(normal.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { tangent, bitangent };
}

export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let animationId = 0;

    let disposed = false;
    const cleanupFns: Array<() => void> = [];

    async function init() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const stars = await fetch("/data/stars-sample.json").then(
        (res) => res.json() as Promise<StarRecord[]>,
      );

      if (disposed) return;

      const scene = new THREE.Scene();
      const skyRoot = new THREE.Group();
      scene.add(skyRoot);

      const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        2000,
      );
      camera.position.set(0, 0, 220);

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.rotateSpeed = 0.35;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.16;

      const starPositionById = new Map<number, THREE.Vector3>();
      stars.forEach((star) => {
        starPositionById.set(star.id, sphericalToCartesian(star.raHours, star.decDeg));
      });

      const mainCount = stars.length;
      const mainPositions = new Float32Array(mainCount * 3);
      const mainSizes = new Float32Array(mainCount);
      const mainBrightness = new Float32Array(mainCount);
      const idByIndex: number[] = [];

      stars.forEach((star, i) => {
        const p = starPositionById.get(star.id)!;
        mainPositions[i * 3] = p.x;
        mainPositions[i * 3 + 1] = p.y;
        mainPositions[i * 3 + 2] = p.z;
        mainSizes[i] = magnitudeToSize(star.mag);
        mainBrightness[i] = magnitudeToBrightness(star.mag);
        idByIndex[i] = star.id;
      });

      const ambientPositions: number[] = [];
      const ambientSizes: number[] = [];
      const ambientBrightness: number[] = [];

      stars.forEach((star, idx) => {
        const base = starPositionById.get(star.id)!.clone().normalize();
        const { tangent, bitangent } = buildTangentBasis(base);
        const cloneCount = star.mag < 1 ? 120 : star.mag < 2.5 ? 80 : 45;

        for (let j = 0; j < cloneCount; j += 1) {
          const s1 = rand01(star.id * 0.17 + j * 1.13 + idx * 0.37);
          const s2 = rand01(star.id * 0.31 + j * 0.91 + idx * 0.73);
          const s3 = rand01(star.id * 0.53 + j * 1.71 + idx * 0.27);

          const angle = s1 * Math.PI * 2;
          const spread = THREE.MathUtils.lerp(0.4, 3.3, s2) * (1 + Math.max(star.mag, 0) * 0.06);
          const depth = THREE.MathUtils.lerp(-4.5, 4.5, s3);

          const p = base
            .clone()
            .multiplyScalar(SKY_RADIUS + depth)
            .add(tangent.clone().multiplyScalar(Math.cos(angle) * spread))
            .add(bitangent.clone().multiplyScalar(Math.sin(angle) * spread))
            .normalize()
            .multiplyScalar(SKY_RADIUS + depth);

          ambientPositions.push(p.x, p.y, p.z);
          ambientSizes.push(THREE.MathUtils.lerp(0.8, 2.0, s3));
          ambientBrightness.push(THREE.MathUtils.lerp(0.08, 0.34, s2));
        }
      });

      const shellCount = 2600;
      for (let i = 0; i < shellCount; i += 1) {
        const y = 1 - (2 * (i + 0.5)) / shellCount;
        const radial = Math.sqrt(1 - y * y);
        const theta = GOLDEN_ANGLE * i;
        const x = Math.cos(theta) * radial;
        const z = Math.sin(theta) * radial;

        const noise = rand01(i * 0.618 + 4.2);
        const radius = SKY_RADIUS + THREE.MathUtils.lerp(-7, 7, noise);
        ambientPositions.push(x * radius, y * radius, z * radius);
        ambientSizes.push(THREE.MathUtils.lerp(0.6, 1.5, noise));
        ambientBrightness.push(THREE.MathUtils.lerp(0.03, 0.16, noise));
      }

      const mainGeometry = new THREE.BufferGeometry();
      mainGeometry.setAttribute("position", new THREE.BufferAttribute(mainPositions, 3));
      mainGeometry.setAttribute("aSize", new THREE.BufferAttribute(mainSizes, 1));
      mainGeometry.setAttribute("aBrightness", new THREE.BufferAttribute(mainBrightness, 1));

      const ambientGeometry = new THREE.BufferGeometry();
      ambientGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(ambientPositions), 3),
      );
      ambientGeometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(ambientSizes), 1));
      ambientGeometry.setAttribute(
        "aBrightness",
        new THREE.BufferAttribute(new Float32Array(ambientBrightness), 1),
      );

      const starMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          attribute float aSize;
          attribute float aBrightness;
          varying float vBrightness;
          uniform float uPixelRatio;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z);
            vBrightness = aBrightness;
          }
        `,
        fragmentShader: `
          varying float vBrightness;
          void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, dist) * vBrightness;
            gl_FragColor = vec4(vec3(1.0), alpha);
          }
        `,
      });

      const ambientPoints = new THREE.Points(ambientGeometry, starMaterial);
      const starsPoints = new THREE.Points(mainGeometry, starMaterial);
      skyRoot.add(ambientPoints);
      skyRoot.add(starsPoints);

      const brightStars = stars
        .filter((star) => star.mag <= 2.6)
        .map((star) => ({ star, p: starPositionById.get(star.id)!.clone() }));

      const triangleKey = new Set<string>();
      const polygonVertices: number[] = [];
      for (let i = 0; i < brightStars.length; i += 1) {
        const base = brightStars[i];
        const nearest = brightStars
          .filter((_, j) => j !== i)
          .map((item) => ({ item, d2: base.p.distanceToSquared(item.p) }))
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, 2)
          .map((entry) => entry.item);

        if (nearest.length < 2) continue;
        const ids = [base.star.id, nearest[0].star.id, nearest[1].star.id].sort((a, b) => a - b);
        const key = ids.join("-");
        if (triangleKey.has(key)) continue;
        triangleKey.add(key);

        const p1 = starPositionById.get(ids[0])!;
        const p2 = starPositionById.get(ids[1])!;
        const p3 = starPositionById.get(ids[2])!;
        polygonVertices.push(
          p1.x,
          p1.y,
          p1.z,
          p2.x,
          p2.y,
          p2.z,
          p3.x,
          p3.y,
          p3.z,
        );
      }

      const polygonGeometry = new THREE.BufferGeometry();
      polygonGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(polygonVertices), 3),
      );
      const polygonMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.065,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const polygonMesh = new THREE.Mesh(polygonGeometry, polygonMaterial);
      skyRoot.add(polygonMesh);

      const hoverGeometry = new THREE.BufferGeometry();
      hoverGeometry.setAttribute("position", new THREE.Float32BufferAttribute([9999, 9999, 9999], 3));
      const hoverMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 9,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const hoverPoint = new THREE.Points(hoverGeometry, hoverMaterial);
      skyRoot.add(hoverPoint);

      const raycaster = new THREE.Raycaster();
      raycaster.params.Points = { threshold: 3.5 };
      const pointer = new THREE.Vector2();
      let hoveredStarIndex: number | null = null;

      const onPointerMove = (event: PointerEvent) => {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObject(starsPoints, false);

        if (intersections.length === 0) {
          hoveredStarIndex = null;
          hoverGeometry.attributes.position.setXYZ(0, 9999, 9999, 9999);
          hoverGeometry.attributes.position.needsUpdate = true;
          return;
        }

        const i = intersections[0].index ?? null;
        hoveredStarIndex = i;
        if (i === null) return;
        const starId = idByIndex[i];
        const p = starPositionById.get(starId);
        if (!p) return;
        hoverGeometry.attributes.position.setXYZ(0, p.x, p.y, p.z);
        hoverGeometry.attributes.position.needsUpdate = true;
      };

      const onResize = () => {
        if (!renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener("resize", onResize);
      canvas.addEventListener("pointermove", onPointerMove);

      cleanupFns.push(() => window.removeEventListener("resize", onResize));
      cleanupFns.push(() => canvas.removeEventListener("pointermove", onPointerMove));

      const animate = () => {
        animationId = requestAnimationFrame(animate);
        controls?.update();

        skyRoot.rotation.y += 0.0003;
        skyRoot.rotation.x = Math.sin(performance.now() * 0.00008) * 0.07;
        polygonMesh.rotation.y -= 0.00012;

        renderer?.render(scene, camera);
      };
      animate();

      cleanupFns.push(() => {
        cancelAnimationFrame(animationId);
        controls?.dispose();
        mainGeometry.dispose();
        ambientGeometry.dispose();
        starMaterial.dispose();
        polygonGeometry.dispose();
        polygonMaterial.dispose();
        hoverGeometry.dispose();
        hoverMaterial.dispose();
        renderer?.dispose();
      });
    }

    void init();

    return () => {
      disposed = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="constellation-layer" aria-hidden>
      <canvas ref={canvasRef} className="constellation-canvas" />
    </div>
  );
}
