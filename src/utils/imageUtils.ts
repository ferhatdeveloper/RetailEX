/**
 * Image Utilities for ExRetailOS
 * Handles image compression and Base64 conversion
 */

export const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context could not be created'));
                    return;
                }

                // Use white background for JPEGs (to handle transparency)
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to Base64 JPEG with specified quality
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const getBase64Size = (base64String: string): number => {
    const padding = base64String.endsWith('==') ? 2 : base64String.endsWith('=') ? 1 : 0;
    return (base64String.length * (3 / 4)) - padding;
};

export const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};


