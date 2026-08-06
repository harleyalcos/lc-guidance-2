import { useEffect, useRef, useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import lcLogo from "../assets/lc-logo.png";

interface SignInProps {
  isSetupComplete: boolean;
  onSetupComplete: () => void;
  onSignIn: () => void;
}

type ResetStep = "request" | "verify" | "new-pin";
type ToastType = "success" | "error";

const cleanPin = (value: string) => value.replace(/\D/g, "").slice(0, 6);
const cleanAppPassword = (value: string) => value.replace(/\s/g, "");

export default function SignIn({ isSetupComplete, onSetupComplete, onSignIn }: SignInProps) {
  const [pin, setPin] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [confirmSetupPin, setConfirmSetupPin] = useState("");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [showConfirmSetupPin, setShowConfirmSetupPin] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmNewPin, setShowConfirmNewPin] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const validatePin = (value: string) => /^\d{6}$/.test(value);
  const isLoginPinComplete = validatePin(pin);

  const clearToast = () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setIsToastVisible(false);
    setToast(null);
  };

  const showToast = (type: ToastType, message: string) => {
    setToast({ type, message });
    setIsToastVisible(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setIsToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      window.setTimeout(() => setToast(null), 1000);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearToast();
    if (!validatePin(pin)) {
      showToast("error", "Enter your 6-digit PIN.");
      return;
    }

    setIsBusy(true);
    try {
      const isValid = await invoke<boolean>("verify_pin", { pin });
      if (isValid) {
        onSignIn();
      } else {
        showToast("error", "Incorrect PIN. Try again.");
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    clearToast();
    if (!validatePin(setupPin)) {
      showToast("error", "Create a 6-digit login PIN.");
      return;
    }
    if (setupPin !== confirmSetupPin) {
      showToast("error", "The setup PINs do not match.");
      return;
    }
    if (!smtpEmail.trim() || !smtpPassword.trim() || !recoveryEmail.trim()) {
      showToast("error", "Fill in the Gmail and recovery email fields.");
      return;
    }

    setIsBusy(true);
    try {
      await invoke("test_smtp", {
        smtpEmail: smtpEmail.trim(),
        smtpPassword: cleanAppPassword(smtpPassword),
      });
      await invoke("complete_setup", {
        pin: setupPin,
        smtpEmail: smtpEmail.trim(),
        smtpPassword: cleanAppPassword(smtpPassword),
        recoveryEmail: recoveryEmail.trim(),
      });
      onSetupComplete();
      showToast("success", "Setup complete. Sign in with your new PIN.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRequestOtp = async () => {
    clearToast();
    setIsBusy(true);
    try {
      await invoke("request_otp");
      setResetStep("verify");
      showToast("success", "A reset code was sent to the recovery email.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    clearToast();
    if (!validatePin(otp)) {
      showToast("error", "Enter the 6-digit reset code.");
      return;
    }

    setIsBusy(true);
    try {
      const isValid = await invoke<boolean>("verify_otp", { code: otp });
      if (isValid) {
        setResetStep("new-pin");
        showToast("success", "Code verified. Set a new PIN.");
      } else {
        showToast("error", "Incorrect reset code.");
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetPin = async (e: FormEvent) => {
    e.preventDefault();
    clearToast();
    if (!validatePin(newPin)) {
      showToast("error", "New PIN must be exactly 6 digits.");
      return;
    }
    if (newPin !== confirmNewPin) {
      showToast("error", "The new PINs do not match.");
      return;
    }

    setIsBusy(true);
    try {
      await invoke("reset_pin", { newPin });
      setShowReset(false);
      setResetStep("request");
      setPin("");
      setOtp("");
      setNewPin("");
      setConfirmNewPin("");
      showToast("success", "PIN reset complete. Sign in with the new PIN.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const renderToast = () => toast && createPortal(
    <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${
      toast.type === "success"
        ? "border border-primary/30 bg-[#EEF2FC] dark:bg-[#1A233D] text-[#002F87] dark:text-[#b4c5ff]"
        : "border border-error/30 bg-error-container text-on-error-container"
    } ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
      <span className={`material-symbols-outlined ${toast.type === "success" ? "text-primary dark:text-[#b4c5ff]" : "text-error"}`} style={{ fontSize: 18 }}>
        {toast.type === "success" ? "info" : "error"}
      </span>
      <p className="text-xs font-bold">{toast.message}</p>
    </div>,
    document.body
  );

  const inputClass = "rounded-md w-full bg-surface-container border border-outline-variant px-3 py-2.5 font-body-md text-on-surface caret-primary dark:caret-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all";
  const pinClass = `${inputClass} font-data-mono tracking-[0.35em] text-center`;
  const secretInputClass = `${inputClass} pr-11`;
  const secretPinClass = `${pinClass} pl-11 pr-11`;

  const renderSecretInput = (
    value: string,
    onChange: (value: string) => void,
    isVisible: boolean,
    onToggle: () => void,
    options: {
      className?: string;
      inputMode?: "numeric" | "text";
      placeholder?: string;
      autoFocus?: boolean;
      cleanValue?: (value: string) => string;
    } = {}
  ) => (
    <div className="relative">
      <input
        type={isVisible ? "text" : "password"}
        inputMode={options.inputMode}
        value={value}
        onChange={(e) => onChange(options.cleanValue ? options.cleanValue(e.target.value) : e.target.value)}
        className={options.className ?? secretInputClass}
        placeholder={options.placeholder}
        autoFocus={options.autoFocus}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={isVisible ? "Hide value" : "Show value"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-secondary hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">
          {isVisible ? "visibility" : "visibility_off"}
        </span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen w-full relative isolate flex items-center justify-center overflow-hidden bg-background text-on-surface">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat blur-[6px] scale-105"
        style={{ backgroundImage: `url('/lcbuildingbg.jpg')` }}
      />
      <div className="fixed inset-0 z-0 bg-black/40 dark:bg-black/60" />

      <div className="relative z-10 w-full max-w-[470px] px-4">
        <div className="bg-surface border border-surface-variant rounded-lg shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 text-center border-b border-surface-variant/50 relative flex flex-col items-center">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-primary rounded-b-md opacity-80" />
            <img src={lcLogo} alt="Laguna College Logo" className="w-20 h-20 object-contain mb-3 mt-2" />
            <h1 className="font-display-title text-primary text-3xl mb-2">Laguna College</h1>
            <p className="font-label-caps text-label-caps text-secondary tracking-widest text-[10px]">
              GUIDANCE OFFICE - CASE FILING SYSTEM
            </p>
          </div>

          {!isSetupComplete ? (
            <form onSubmit={handleSetup} className="p-8 pt-6">
              <div className="mb-5">
                <h2 className="text-base font-bold text-on-surface">First Launch Setup</h2>
                <p className="text-xs text-secondary mt-1">
                  Create a 6-digit PIN and connect the Gmail account used to send reset codes.
                </p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-label-caps text-label-caps text-secondary block mb-1.5">6-Digit PIN</label>
                    {renderSecretInput(setupPin, setSetupPin, showSetupPin, () => setShowSetupPin((value) => !value), {
                      className: secretPinClass,
                      inputMode: "numeric",
                      placeholder: "000000",
                      cleanValue: cleanPin,
                    })}
                  </div>
                  <div>
                    <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Confirm PIN</label>
                    {renderSecretInput(confirmSetupPin, setConfirmSetupPin, showConfirmSetupPin, () => setShowConfirmSetupPin((value) => !value), {
                      className: secretPinClass,
                      inputMode: "numeric",
                      placeholder: "000000",
                      cleanValue: cleanPin,
                    })}
                  </div>
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Email</label>
                  <input type="email" value={smtpEmail} onChange={(e) => setSmtpEmail(e.target.value)} className={inputClass} placeholder="lc.guidanceoffice@gmail.com" />
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Password</label>
                  {renderSecretInput(smtpPassword, setSmtpPassword, showSmtpPassword, () => setShowSmtpPassword((value) => !value), {
                    placeholder: "Password",
                  })}
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Recovery Email</label>
                  <input type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className={inputClass} placeholder="Where reset codes are sent" />
                </div>
              </div>
              <button type="submit" disabled={isBusy} className="btn-primary w-full mt-7">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>{isBusy ? "Testing Email & Saving..." : "Complete Setup"}</span>
              </button>
            </form>
          ) : showReset ? (
            <div className="p-8 pt-6">
              <div className="mb-5">
                <h2 className="text-base font-bold text-on-surface">Reset PIN</h2>
                <p className="text-xs text-secondary mt-1">A 6-digit code will be sent to the saved recovery email.</p>
              </div>
              {resetStep === "request" && (
                <div className="space-y-4">
                  <button type="button" disabled={isBusy} onClick={handleRequestOtp} className="btn-primary w-full">
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    <span>{isBusy ? "Sending Code..." : "Send Reset Code"}</span>
                  </button>
                  <button type="button" onClick={() => setShowReset(false)} className="w-full text-xs font-bold text-secondary hover:text-primary">
                    Back to sign in
                  </button>
                </div>
              )}
              {resetStep === "verify" && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Reset Code</label>
                    <input type="text" inputMode="numeric" value={otp} onChange={(e) => setOtp(cleanPin(e.target.value))} className={pinClass} placeholder="000000" />
                  </div>
                  <button type="submit" disabled={isBusy} className="btn-primary w-full">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>{isBusy ? "Checking..." : "Verify Code"}</span>
                  </button>
                </form>
              )}
              {resetStep === "new-pin" && (
                <form onSubmit={handleResetPin} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-label-caps text-label-caps text-secondary block mb-1.5">New PIN</label>
                      {renderSecretInput(newPin, setNewPin, showNewPin, () => setShowNewPin((value) => !value), {
                        className: secretPinClass,
                        inputMode: "numeric",
                        placeholder: "000000",
                        cleanValue: cleanPin,
                      })}
                    </div>
                    <div>
                      <label className="font-label-caps text-label-caps text-secondary block mb-1.5">Confirm</label>
                      {renderSecretInput(confirmNewPin, setConfirmNewPin, showConfirmNewPin, () => setShowConfirmNewPin((value) => !value), {
                        className: secretPinClass,
                        inputMode: "numeric",
                        placeholder: "000000",
                        cleanValue: cleanPin,
                      })}
                    </div>
                  </div>
                  <button type="submit" disabled={isBusy} className="btn-primary w-full">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    <span>{isBusy ? "Saving..." : "Save New PIN"}</span>
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handleLogin} className="p-8 pt-6">
              <div>
                <label className="font-label-caps text-label-caps text-secondary block mb-1.5">6-Digit PIN</label>
                {renderSecretInput(pin, setPin, showLoginPin, () => setShowLoginPin((value) => !value), {
                  className: secretPinClass,
                  inputMode: "numeric",
                  placeholder: "000000",
                  autoFocus: true,
                  cleanValue: cleanPin,
                })}
              </div>
              <button type="submit" disabled={isBusy || !isLoginPinComplete} className="btn-primary w-full mt-7">
                <span className="material-symbols-outlined text-[18px]">login</span>
                <span>{isBusy ? "Signing In..." : "Sign In"}</span>
              </button>
              <button type="button" onClick={() => { setShowReset(true); clearToast(); }} className="mt-5 w-full text-center font-body-md text-xs text-secondary hover:text-primary font-bold">
                Forgot PIN?
              </button>
            </form>
          )}
        </div>
      </div>
      {renderToast()}
    </div>
  );
}
