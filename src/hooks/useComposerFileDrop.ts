import { useCallback, useRef, useState, type DragEvent } from 'react';

export function dataTransferHasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

export function useComposerFileDrop(onFiles: (files: File[]) => void | Promise<void>) {
  const [isActive, setIsActive] = useState(false);
  const depthRef = useRef(0);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setIsActive(false);
  }, []);

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    depthRef.current += 1;
    setIsActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setIsActive(false);
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      reset();
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        void onFiles(files);
      }
    },
    [onFiles, reset],
  );

  return { isActive, onDragEnter, onDragLeave, onDragOver, onDrop };
}
