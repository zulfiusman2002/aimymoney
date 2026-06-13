// Compress screenshots client-side before upload/extraction so large phone
// screenshots never blow past function body limits (~6MB on Netlify).
export function compressImage(file, { maxDim = 1600, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Compression failed'));
        const reader = new FileReader();
        reader.onload = () => resolve({
          blob,
          dataUrl: reader.result,
          base64: reader.result.split(',')[1],
          mediaType: 'image/jpeg',
        });
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a readable image')); };
    img.src = url;
  });
}
