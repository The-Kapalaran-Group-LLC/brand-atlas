import { useEffect } from 'react';
import { Info } from 'lucide-react';

interface ToastBannerProps {
  toast: string | null;
  onDismiss: () => void;
  className?: string;
}

export function ToastBanner({ toast, onDismiss, className }: ToastBannerProps) {
  const isExportSuccessToast =
    toast === 'PDF exported successfully!' || toast === 'PowerPoint exported successfully!';

  useEffect(() => {
    if (!isExportSuccessToast) {
      return;
    }

    const timer = setTimeout(() => {
      onDismiss();
    }, 3000);

    return () => clearTimeout(timer);
  }, [isExportSuccessToast, onDismiss]);

  if (!toast) {
    return null;
  }

  return (
    <div className={className || 'fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 text-sm no-print'}>
      <Info className="w-4 h-4 text-indigo-400" />
      {toast}
    </div>
  );
}
