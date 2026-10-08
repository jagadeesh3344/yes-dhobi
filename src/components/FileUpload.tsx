import React, { useRef, useState } from 'react';
import { Camera, FileText, CheckCircle2, X, Loader2, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  label: string;
  subtext?: string;
  acceptedTypes?: string;
  maxSizeMB?: number;
  value?: string | null;
  onChange?: (fileUrl: string | null) => void;
  required?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  subtext = 'Click to upload or drag & drop. JPG, PNG or PDF, max 10MB',
  acceptedTypes = '.jpg,.jpeg,.png,.webp,.pdf',
  maxSizeMB = 10,
  value,
  onChange,
  required = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read selected image'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file format'));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            const maxDim = 1400; // Balanced size for legible ID verification (~150-250KB)
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(e.target?.result as string);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            resolve(dataUrl);
          } catch (canvasErr) {
            console.warn('Canvas compression error, falling back to original:', canvasErr);
            resolve(e.target?.result as string);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (file: File) => {
    setErrorMsg(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrorMsg(`File size exceeds maximum limit of ${maxSizeMB}MB.`);
      return;
    }

    setIsProcessing(true);
    try {
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        if (onChange) {
          onChange(compressed);
        }
      } else {
        // PDF or other document
        const reader = new FileReader();
        reader.onload = () => {
          if (onChange) {
            onChange(reader.result as string);
          }
        };
        reader.onerror = () => {
          setErrorMsg('Failed to process document. Please try a different file.');
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error('Error processing document file:', err);
      setErrorMsg(err?.message || 'Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={acceptedTypes}
        className="hidden"
      />

      {value ? (
        <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center overflow-hidden shrink-0">
              {value.startsWith('data:image') || value.startsWith('http') ? (
                <img src={value} alt="Uploaded preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Document Uploaded</span>
              </div>
              <span className="text-[11px] text-slate-500">Ready for verification</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              if (onChange) onChange(null);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isProcessing) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
            isDragging
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/80 bg-white'
          } ${isProcessing ? 'opacity-80 pointer-events-none' : ''}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-1">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
              <span className="text-xs font-semibold text-slate-700">Compressing & preparing image...</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Optimizing for fast verification</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <Camera className="w-5 h-5" />
              </div>
              <h5 className="text-xs font-bold text-slate-900 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
              </h5>
              <p className="text-[11px] text-slate-500 max-w-xs">{subtext}</p>
            </>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
