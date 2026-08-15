import React, { useRef, useState } from 'react';
import { Camera, UploadCloud, FileText, CheckCircle2, X } from 'lucide-react';

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
  subtext = 'Click to upload or drag & drop. JPG, PNG or PDF, max 5MB',
  acceptedTypes = '.jpg,.jpeg,.png,.pdf',
  maxSizeMB = 5,
  value,
  onChange,
  required = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File size exceeds maximum limit of ${maxSizeMB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (onChange) {
        onChange(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
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
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              {value.startsWith('data:image') ? (
                <img src={value} alt="Uploaded preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Document Uploaded</span>
              </div>
              <span className="text-[11px] text-slate-500">Ready for verification</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange && onChange(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
            isDragging
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/80 bg-white'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Camera className="w-5 h-5" />
          </div>
          <h5 className="text-xs font-bold text-slate-900 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </h5>
          <p className="text-[11px] text-slate-500 max-w-xs">{subtext}</p>
        </div>
      )}
    </div>
  );
};
