import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { extensionFromPath } from '@/lib/artifact-preview-modes';

interface ArtifactModel3DPreviewProps {
  previewUrl: string;
  filePath: string;
}

async function loadModelObject(buffer: ArrayBuffer, extension: string): Promise<THREE.Object3D> {
  if (extension === 'gltf' || extension === 'glb') {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, '');
    return gltf.scene;
  }

  if (extension === 'obj') {
    const loader = new OBJLoader();
    return loader.parse(new TextDecoder().decode(buffer));
  }

  if (extension === 'stl') {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.2, roughness: 0.6 }),
    );
  }

  if (extension === 'fbx') {
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

function applyDefaultMaterials(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && !mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        metalness: 0.15,
        roughness: 0.65,
      });
    }
  });
}

export default function ArtifactModel3DPreview({ previewUrl, filePath }: ArtifactModel3DPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const extension = extensionFromPath(filePath);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let disposed = false;
    let animationId = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    async function mount(): Promise<void> {
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
        scene.background = new THREE.Color('#0f172a');
        scene.add(object);

        const bounds = new THREE.Box3().setFromObject(object);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        object.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z, 1);
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(maxDim * 1.8, maxDim * 1.4, maxDim * 1.8);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.replaceChildren(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
        keyLight.position.set(4, 6, 2);
        scene.add(keyLight);

        const render = (): void => {
          if (disposed || !renderer) {
            return;
          }
          controls.update();
          renderer.render(scene, camera);
          animationId = window.requestAnimationFrame(render);
        };
        render();

        const onResize = (): void => {
          if (!renderer) {
            return;
          }
          const width = container.clientWidth;
          const height = container.clientHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        window.addEventListener('resize', onResize);

        return () => {
          window.removeEventListener('resize', onResize);
        };
      } catch (loadError) {
        if (!disposed) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to render 3D model';
          setError(message);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    const cleanupPromise = mount();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      renderer?.dispose();
      container.replaceChildren();
      void cleanupPromise;
    };
  }, [extension, previewUrl]);

  if (error) {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="relative h-full min-h-0 bg-slate-950" data-testid="chat-artifact-model-3d-preview">
      <div ref={containerRef} className="h-full w-full" />
      {loading ? (
        <p className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4 text-sm text-gray-300">
          Loading 3D model…
        </p>
      ) : null}
      <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[10px] text-white">
        Drag to orbit · scroll to zoom · .{extension}
      </p>
    </div>
  );
}
