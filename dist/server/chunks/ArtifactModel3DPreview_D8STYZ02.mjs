import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { e as extensionFromPath } from './artifact-preview-modes_BIEWJKcN.mjs';

async function loadModelObject(buffer, extension) {
  if (extension === "gltf" || extension === "glb") {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, "");
    return gltf.scene;
  }
  if (extension === "obj") {
    const loader = new OBJLoader();
    return loader.parse(new TextDecoder().decode(buffer));
  }
  if (extension === "stl") {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.2, roughness: 0.6 })
    );
  }
  if (extension === "fbx") {
    const loader = new FBXLoader();
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    try {
      return await loader.loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error(`Unsupported 3D format: .${extension}`);
}
function applyDefaultMaterials(object) {
  object.traverse((child) => {
    const mesh = child;
    if (mesh.isMesh && !mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: "#94a3b8",
        metalness: 0.15,
        roughness: 0.65
      });
    }
  });
}
function ArtifactModel3DPreview({ previewUrl, filePath }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const extension = extensionFromPath(filePath);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return void 0;
    }
    let disposed = false;
    let animationId = 0;
    let renderer = null;
    async function mount() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`Failed to load 3D model (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const object = await loadModelObject(buffer, extension);
        applyDefaultMaterials(object);
        if (disposed) {
          return;
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#0f172a");
        scene.add(object);
        const bounds = new THREE.Box3().setFromObject(object);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        object.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1e3);
        camera.position.set(maxDim * 1.8, maxDim * 1.4, maxDim * 1.8);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.replaceChildren(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new THREE.AmbientLight(16777215, 0.7));
        const keyLight = new THREE.DirectionalLight(16777215, 1.1);
        keyLight.position.set(4, 6, 2);
        scene.add(keyLight);
        const render = () => {
          if (disposed || !renderer) {
            return;
          }
          controls.update();
          renderer.render(scene, camera);
          animationId = window.requestAnimationFrame(render);
        };
        render();
        const onResize = () => {
          if (!renderer) {
            return;
          }
          const width = container.clientWidth;
          const height = container.clientHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        window.addEventListener("resize", onResize);
        return () => {
          window.removeEventListener("resize", onResize);
        };
      } catch (loadError) {
        if (!disposed) {
          const message = loadError instanceof Error ? loadError.message : "Failed to render 3D model";
          setError(message);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }
    mount();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      renderer?.dispose();
      container.replaceChildren();
    };
  }, [extension, previewUrl]);
  if (error) {
    return /* @__PURE__ */ jsx("p", { className: "p-4 text-sm text-red-600", role: "alert", children: error });
  }
  return /* @__PURE__ */ jsxs("div", { className: "relative h-full min-h-0 bg-slate-950", "data-testid": "chat-artifact-model-3d-preview", children: [
    /* @__PURE__ */ jsx("div", { ref: containerRef, className: "h-full w-full" }),
    loading ? /* @__PURE__ */ jsx("p", { className: "absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4 text-sm text-gray-300", children: "Loading 3D model…" }) : null,
    /* @__PURE__ */ jsxs("p", { className: "pointer-events-none absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[10px] text-white", children: [
      "Drag to orbit · scroll to zoom · .",
      extension
    ] })
  ] });
}

export { ArtifactModel3DPreview as default };
