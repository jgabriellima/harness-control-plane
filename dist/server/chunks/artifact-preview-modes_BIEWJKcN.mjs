function extensionFromPath(filePath) {
  return filePath.split(".").pop()?.toLowerCase() ?? "";
}

export { extensionFromPath as e };
