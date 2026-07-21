// Downscales an image file client-side before it's stored as a data URL in
// businessInfo.logo — that JSON blob is re-sent on every account-data save
// throughout the app, so a multi-MB original would slow down unrelated
// actions. maxDim bounds the longer side; aspect ratio is preserved.
export function resizeImageToDataUrl(file, maxDim = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image file.'));
    };
    img.src = objectUrl;
  });
}
