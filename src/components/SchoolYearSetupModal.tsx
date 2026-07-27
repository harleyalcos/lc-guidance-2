import React, { useState } from 'react';

interface SchoolYearSetupModalProps {
  onComplete: (startYear: string) => Promise<void>;
  onCancel?: () => void;
  title?: string;
  description?: string;
}

const SchoolYearSetupModal: React.FC<SchoolYearSetupModalProps> = ({ 
  onComplete, 
  onCancel,
  title = "Set Academic Year", 
  description = "Please enter the starting year for the current academic school year. This will be used to organize your cases and reports." 
}) => {
  const [startYear, setStartYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleCancel = () => {
    if (!onCancel || isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onCancel();
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!startYear || !/^\d{4}$/.test(startYear)) {
      setError("Please enter a valid 4-digit year (e.g. 2025)");
      return;
    }

    setIsSubmitting(true);
    setIsClosing(true);
    setTimeout(async () => {
      try {
        await onComplete(startYear);
      } catch (err: any) {
        setError(err.toString());
        setIsSubmitting(false);
        setIsClosing(false);
      }
    }, 200);
  };

  const endYear = startYear && /^\d{4}$/.test(startYear) ? parseInt(startYear) + 1 : '';

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <div 
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
        }`}
        onClick={handleCancel}
      />
      <div className={`bg-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden z-10 ${
        isClosing ? "modal-panel-exit" : "modal-panel-enter"
      }`}>
        <div className="px-6 py-4 border-b border-outline-variant">
          <h2 className="text-xl font-bold text-on-surface">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-secondary mb-6">
            {description}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Start Year
              </label>
              <input
                type="text"
                maxLength={4}
                value={startYear}
                onChange={(e) => setStartYear(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 2025"
                className="w-full px-4 py-3 bg-background border border-outline-variant rounded-xl text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-lg transition-all"
                autoFocus
              />
            </div>
            
            <div className="bg-background rounded-xl p-4 border border-outline-variant/50 flex items-center justify-between">
              <span className="text-sm text-secondary">Academic Year</span>
              <span className="font-mono text-lg text-primary font-medium">
                {startYear && endYear ? `${startYear}-${endYear}` : '----'}
              </span>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400">
                <span className="material-symbols-outlined text-xl">error</span>
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2.5 bg-surface text-on-surface rounded-xl hover:bg-surface-container-high transition-colors font-medium border border-outline-variant"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !startYear}
              className="px-6 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  Saving...
                </>
              ) : (
                'Save and Continue'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SchoolYearSetupModal;
