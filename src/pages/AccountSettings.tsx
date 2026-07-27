import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { useDarkMode } from "../hooks/useDarkMode";
import Backup from "./Backup";
import { useSchoolYears } from "../hooks/useSchoolYears";
import SchoolYearSetupModal from "../components/SchoolYearSetupModal";

const cleanPin = (value: string) => value.replace(/\D/g, "").slice(0, 6);
type ToastType = "success" | "error";
const RECOVERY_EMAIL_UNLOCK_KEY = "recovery_email_unlocked";

const maskEmail = (value: string) => {
  const [, domain = "gmail.com"] = value.split("@");
  return `*****@${domain || "gmail.com"}`;
};

export default function AccountSettings() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"profile" | "backup">(
    currentTabParam === "backup" ? "backup" : "profile"
  );

  useEffect(() => {
    if (currentTabParam === "backup") {
      setActiveTab("backup");
    } else {
      setActiveTab("profile");
    }
  }, [currentTabParam]);

  const handleTabChange = (tab: "profile" | "backup") => {
    setActiveTab(tab);
    if (tab === "backup") {
      setSearchParams({ tab: "backup" });
    } else {
      setSearchParams({});
    }
  };
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryEmailBeforeEdit, setRecoveryEmailBeforeEdit] = useState("");
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isPinEditing, setIsPinEditing] = useState(false);
  const [isPinChangeOtpOpen, setIsPinChangeOtpOpen] = useState(false);
  const [pinChangeOtp, setPinChangeOtp] = useState("");
  const [pinChangeOtpSending, setPinChangeOtpSending] = useState(false);
  const [pinChangeOtpVerifying, setPinChangeOtpVerifying] = useState(false);
  const [showRecoveryEmail, setShowRecoveryEmail] = useState(false);
  const [isRecoveryEditing, setIsRecoveryEditing] = useState(false);
  const [isRecoveryUnlocked, setIsRecoveryUnlocked] = useState(
    () => sessionStorage.getItem(RECOVERY_EMAIL_UNLOCK_KEY) === "true"
  );
  const [isRecoveryOtpOpen, setIsRecoveryOtpOpen] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryOtpSending, setRecoveryOtpSending] = useState(false);
  const [recoveryOtpVerifying, setRecoveryOtpVerifying] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const { currentYear, setYear, refreshYears } = useSchoolYears();
  const [showSchoolYearModal, setShowSchoolYearModal] = useState(false);

  const [pinVerificationAction, setPinVerificationAction] = useState<"export" | "import" | null>(null);
  const [verificationPin, setVerificationPin] = useState("");
  const [showVerificationPin, setShowVerificationPin] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [isVerificationModalClosing, setIsVerificationModalClosing] = useState(false);

  // Gemini AI State
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<"not_configured" | "connected" | "invalid">("not_configured");

  const handleOpenVerification = (action: "export" | "import") => {
    setPinVerificationAction(action);
    setVerificationPin("");
    setIsVerificationModalClosing(false);
  };

  const handleCloseVerification = () => {
    setIsVerificationModalClosing(true);
    window.setTimeout(() => {
      setPinVerificationAction(null);
      setIsVerificationModalClosing(false);
    }, 200);
  };

  const handleVerifyAndExecute = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePin(verificationPin)) {
      showToast("error", "PIN must be exactly 6 digits.");
      return;
    }

    setVerificationBusy(true);
    try {
      const isValid = await invoke<boolean>("verify_pin", { pin: verificationPin });
      if (!isValid) {
        showToast("error", "Incorrect PIN.");
        setVerificationBusy(false);
        return;
      }

      handleCloseVerification();

      if (pinVerificationAction === "export") {
        await executeExport();
      } else if (pinVerificationAction === "import") {
        await executeImport();
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setVerificationBusy(false);
    }
  };

  const executeExport = async () => {
    try {
      const targetPath = await save({
        filters: [{ name: "Database", extensions: ["db"] }],
        defaultPath: "guidance_backup.db"
      });
      if (!targetPath) return;

      await invoke("export_db_file", { destPath: targetPath });
      showToast("success", "Database exported successfully for migration.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const executeImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: "Database", extensions: ["db"] }]
      });
      if (!selectedPath) return;

      const confirmImport = window.confirm("WARNING: Importing this database file will overwrite your current database. This action cannot be undone. Do you want to proceed?");
      if (!confirmImport) return;

      await invoke("import_db_file", { srcPath: selectedPath });
      showToast("success", "Database imported successfully! The app will now reload.");
      window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    }
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

  useEffect(() => {
    invoke<string>("get_recovery_email")
      .then((email) => {
        setRecoveryEmail(email);
        setRecoveryEmailBeforeEdit(email);
      })
      .catch((err) => showToast("error", err instanceof Error ? err.message : String(err)));

    invoke<string>("get_gemini_api_key")
      .then((key) => {
        setGeminiKey(key);
        if (key) {
          setGeminiStatus("connected"); // Default to connected if key exists, or you could auto-test
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveGeminiKey = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedKey = geminiKey.trim();
    setIsSavingGeminiKey(true);

    if (!trimmedKey) {
      try {
        await invoke("set_gemini_api_key", { apiKey: "" });
        setGeminiStatus("not_configured");
        showToast("success", "Gemini API key cleared.");
      } catch (err) {
        console.error("[Gemini Save Error]", err);
        showToast("error", err instanceof Error ? err.message : String(err));
      } finally {
        setIsSavingGeminiKey(false);
      }
      return;
    }

    try {
      console.log("[Gemini API] Verifying key with gemini-3.1-flash-lite...");
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${trimmedKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Ping" }] }],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gemini API Error] gemini-3.1-flash-lite returned ${response.status}:`, errText);
        setGeminiStatus("invalid");
        showToast("error", `Invalid API Key or Gemini error (${response.status}). Check console (F12).`);
        return;
      }

      await invoke("set_gemini_api_key", { apiKey: trimmedKey });
      setGeminiStatus("connected");
      showToast("success", "Gemini 3.1 Flash Lite API key verified and saved successfully!");
    } catch (err) {
      setGeminiStatus("invalid");
      console.error("[Gemini API Save Exception]", err);
      showToast("error", `Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleTestGeminiConnection = async () => {
    if (!geminiKey.trim()) return;
    setIsTestingGemini(true);
    try {
      console.log("[Gemini API] Testing connection with gemini-3.1-flash-lite...");
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gemini API Error] gemini-3.1-flash-lite returned ${response.status}:`, errText);
        setGeminiStatus("invalid");
        showToast("error", `Connection failed (${response.status}). Check console (F12).`);
        return;
      }

      setGeminiStatus("connected");
      showToast("success", "Connection to Gemini 3.1 Flash Lite API successful!");
    } catch (err) {
      setGeminiStatus("invalid");
      console.error("[Gemini Test Exception]", err);
      showToast("error", "Failed to connect. Please check your API key.");
    } finally {
      setIsTestingGemini(false);
    }
  };

  const validatePin = (value: string) => /^\d{6}$/.test(value);

  const handleChangePin = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePin(currentPin) || !validatePin(newPin)) {
      showToast("error", "PINs must be exactly 6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      showToast("error", "The new PINs do not match.");
      return;
    }

    setPinBusy(true);
    try {
      await invoke("change_pin", { currentPin, newPin });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setIsPinEditing(false);
      showToast("success", "PIN changed successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPinBusy(false);
    }
  };

  const handlePinEdit = async () => {
    setPinChangeOtpSending(true);
    try {
      await invoke("request_pin_change_otp");
      setPinChangeOtp("");
      setIsPinChangeOtpOpen(true);
      showToast("success", "A PIN verification code was sent to the recovery email.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Please wait")) {
        setPinChangeOtp("");
        setIsPinChangeOtpOpen(true);
      }
      showToast("error", message);
    } finally {
      setPinChangeOtpSending(false);
    }
  };

  const handleVerifyPinChangeOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePin(pinChangeOtp)) {
      showToast("error", "Enter the 6-digit verification code.");
      return;
    }

    setPinChangeOtpVerifying(true);
    try {
      const isValid = await invoke<boolean>("verify_pin_change_otp", { code: pinChangeOtp });
      if (!isValid) {
        showToast("error", "Incorrect verification code.");
        return;
      }

      setIsPinEditing(true);
      setIsPinChangeOtpOpen(false);
      setPinChangeOtp("");
      showToast("success", "Email verified. You can now change the PIN.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPinChangeOtpVerifying(false);
    }
  };

  const handleUpdateRecoveryEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) {
      showToast("error", "Recovery email cannot be empty.");
      return;
    }

    setEmailBusy(true);
    try {
      await invoke("update_recovery_email", {
        recoveryEmail: recoveryEmail.trim(),
      });
      setRecoveryEmail(recoveryEmail.trim());
      setRecoveryEmailBeforeEdit(recoveryEmail.trim());
      setIsRecoveryEditing(false);
      setShowRecoveryEmail(false);
      showToast("success", "Recovery email settings updated.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleRecoveryVisibility = async () => {
    if (isRecoveryUnlocked) {
      setShowRecoveryEmail((value) => !value);
      return;
    }

    setRecoveryOtpSending(true);
    try {
      await invoke("request_recovery_email_otp");
      setRecoveryOtp("");
      setIsRecoveryOtpOpen(true);
      showToast("success", "A verification code was sent to the recovery email.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Please wait")) {
        setRecoveryOtp("");
        setIsRecoveryOtpOpen(true);
      }
      showToast("error", message);
    } finally {
      setRecoveryOtpSending(false);
    }
  };

  const handleVerifyRecoveryOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePin(recoveryOtp)) {
      showToast("error", "Enter the 6-digit verification code.");
      return;
    }

    setRecoveryOtpVerifying(true);
    try {
      const isValid = await invoke<boolean>("verify_recovery_email_otp", { code: recoveryOtp });
      if (!isValid) {
        showToast("error", "Incorrect verification code.");
        return;
      }

      sessionStorage.setItem(RECOVERY_EMAIL_UNLOCK_KEY, "true");
      setIsRecoveryUnlocked(true);
      setShowRecoveryEmail(true);
      setIsRecoveryOtpOpen(false);
      setRecoveryOtp("");
      showToast("success", "Recovery email unlocked for this session.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setRecoveryOtpVerifying(false);
    }
  };

  const inputClass = "w-full h-10 bg-surface dark:bg-surface-container border border-outline-variant rounded-lg px-3 py-0 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent";
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
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {toast && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${
          toast.type === "success"
            ? "border border-green-500/30 bg-green-50 text-green-900"
            : "border border-error/30 bg-error-container text-on-error-container"
        } ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className={`material-symbols-outlined ${toast.type === "success" ? "text-green-600" : "text-error"}`} style={{ fontSize: 18 }}>
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          <p className="text-xs font-bold">{toast.message}</p>
        </div>,
        document.body
      )}

      {/* Sub-tabs inside Settings & Security */}
      <div className="flex items-center gap-2 border-b border-outline-variant pb-3 mb-1">
        <button
          type="button"
          onClick={() => handleTabChange("profile")}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
            activeTab === "profile"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          <span>General Settings</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("backup")}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
            activeTab === "backup"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">backup</span>
          <span>Backup & Recovery</span>
        </button>
      </div>

      {activeTab === "backup" ? (
        <Backup />
      ) : (
        <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">Account</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="h-full bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
          <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
            Change PIN
          </h3>
          <p className="text-xs text-secondary mt-1">Use this for normal PIN changes when you still know the current PIN.</p>
        </div>
        <form onSubmit={handleChangePin} className="p-6 grid grid-cols-1 gap-4">
          {!isPinEditing ? (
            <button
              type="button"
              onClick={() => void handlePinEdit()}
              disabled={pinChangeOtpSending}
              className="btn-primary w-fit justify-self-center animate-none"
            >
              {pinChangeOtpSending ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[20px]">lock_reset</span>
              )}
              <span>{pinChangeOtpSending ? "Sending code..." : "Change PIN"}</span>
            </button>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Current PIN</label>
                {renderSecretInput(currentPin, setCurrentPin, showCurrentPin, () => setShowCurrentPin((value) => !value), {
                  className: secretPinClass,
                  inputMode: "numeric",
                  placeholder: "000000",
                  cleanValue: cleanPin,
                })}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">New PIN</label>
                {renderSecretInput(newPin, setNewPin, showNewPin, () => setShowNewPin((value) => !value), {
                  className: secretPinClass,
                  inputMode: "numeric",
                  placeholder: "000000",
                  cleanValue: cleanPin,
                })}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Confirm New PIN</label>
                {renderSecretInput(confirmPin, setConfirmPin, showConfirmPin, () => setShowConfirmPin((value) => !value), {
                  className: secretPinClass,
                  inputMode: "numeric",
                  placeholder: "000000",
                  cleanValue: cleanPin,
                })}
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsPinEditing(false);
                    setCurrentPin("");
                    setNewPin("");
                    setConfirmPin("");
                  }}
                  className="btn-secondary"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  disabled={pinBusy}
                  className="btn-primary"
                >
                  {pinBusy ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">save</span>
                  )}
                  <span>{pinBusy ? "Saving..." : "Save New PIN"}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <div className="h-full bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
          <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
            Recovery Email
          </h3>
          <p className="text-xs text-secondary mt-1">This is where PIN reset codes are sent.</p>
        </div>
        <form onSubmit={handleUpdateRecoveryEmail} className="p-6 grid grid-cols-1 gap-4">
          <div className="max-w-xl">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Recovery Email</label>
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] gap-2">
              <div className="relative min-w-0">
                <input
                  type={isRecoveryEditing && !showRecoveryEmail ? "password" : isRecoveryEditing ? "email" : "text"}
                  value={isRecoveryEditing ? recoveryEmail : showRecoveryEmail ? recoveryEmail : maskEmail(recoveryEmail)}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  disabled={!isRecoveryEditing}
                  className={`${inputClass} pr-11 disabled:opacity-100 disabled:cursor-default`}
                  placeholder="Where reset codes are sent"
                />
                <button
                  type="button"
                  onClick={handleRecoveryVisibility}
                  disabled={recoveryOtpSending}
                  aria-label={isRecoveryUnlocked && showRecoveryEmail ? "Hide recovery email" : "Show recovery email"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-secondary hover:text-primary transition-colors duration-500 disabled:opacity-60"
                >
                  <span className={`material-symbols-outlined text-[20px] ${recoveryOtpSending ? "animate-spin" : ""}`}>
                    {recoveryOtpSending ? "progress_activity" : showRecoveryEmail ? "visibility" : "visibility_off"}
                  </span>
                </button>
              </div>
              {isRecoveryUnlocked ? (
                <button
                  type={isRecoveryEditing ? "submit" : "button"}
                  onClick={isRecoveryEditing ? undefined : (event) => {
                    event.preventDefault();
                    setRecoveryEmailBeforeEdit(recoveryEmail);
                    setIsRecoveryEditing(true);
                  }}
                  disabled={emailBusy}
                  aria-label={isRecoveryEditing ? "Save recovery email" : "Edit recovery email"}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-outline-variant transition-colors duration-500 disabled:opacity-60 ${
                    isRecoveryEditing ? "bg-primary text-on-primary" : "text-secondary hover:text-primary"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${emailBusy ? "animate-spin" : ""}`}>
                    {emailBusy ? "progress_activity" : isRecoveryEditing ? "save" : "edit"}
                  </span>
                </button>
              ) : (
                <span aria-hidden="true" className="h-10 w-10" />
              )}
              {isRecoveryEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryEmail(recoveryEmailBeforeEdit);
                    setIsRecoveryEditing(false);
                  }}
                  aria-label="Cancel recovery email edit"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant text-secondary hover:text-error transition-colors duration-500"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              ) : (
                <span aria-hidden="true" className="h-10 w-10" />
              )}
            </div>
          </div>
        </form>
      </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">Academic Year Management</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
            <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
              Current Academic Year
            </h3>
            <p className="text-xs text-secondary mt-1">Manage the active academic school year for your reports and cases.</p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Active Year: <span className="text-primary text-base ml-2">{currentYear || "Not Set"}</span></p>
              <p className="mt-1 text-xs text-secondary">
                Starting a new academic year will change the default filter for the dashboard and reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSchoolYearModal(true)}
              className="btn-primary shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>Start New School Year</span>
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">Preference</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
            <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
              Appearance
            </h3>
            <p className="text-xs text-secondary mt-1">Choose the display mode used throughout the application.</p>
          </div>
          <div className="p-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Dark Mode</p>
              <p className="mt-1 text-xs text-secondary">
                {isDark ? "Dark mode is currently enabled." : "Use a darker color scheme."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Dark mode"
              aria-checked={isDark}
              onClick={toggleDarkMode}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
                isDark ? "bg-primary" : "bg-outline-variant"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                  isDark ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">AI Settings</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
            <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
              Guidance AI Assistant
            </h3>
            <p className="text-xs text-secondary mt-1">
              Enter your Gemini API key. This key is stored locally and is never transmitted anywhere except directly to Google's Gemini API.
            </p>
          </div>
          <form onSubmit={handleSaveGeminiKey} className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Model</label>
                <input
                  type="text"
                  value="Gemini 3.1 Flash Lite"
                  disabled
                  className={`${inputClass} bg-surface-container-low dark:bg-surface-container-high/40 text-secondary cursor-not-allowed`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Gemini API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className={secretInputClass}
                      placeholder="AIza..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey((value) => !value)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-secondary hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {showGeminiKey ? "visibility" : "visibility_off"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingGeminiKey}
                  className="btn-primary"
                >
                  {isSavingGeminiKey ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">save</span>
                  )}
                  <span>Save Key</span>
                </button>
                <button
                  type="button"
                  onClick={handleTestGeminiConnection}
                  disabled={isTestingGemini || !geminiKey.trim()}
                  className="btn-secondary"
                >
                  {isTestingGemini ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">network_check</span>
                  )}
                  <span>Test Connection</span>
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Connection Status</label>
              <div className="flex items-center gap-3 p-4 rounded-lg border border-outline-variant bg-surface-container-lowest">
                {geminiStatus === "connected" ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 shrink-0">
                      <span className="material-symbols-outlined">check_circle</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Connected</p>
                      <p className="text-xs text-secondary mt-0.5">Ready to answer questions</p>
                    </div>
                  </>
                ) : geminiStatus === "invalid" ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error shrink-0">
                      <span className="material-symbols-outlined">error</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Invalid API Key</p>
                      <p className="text-xs text-secondary mt-0.5">Please check your key and try again</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                      <span className="material-symbols-outlined">help</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Not Configured</p>
                      <p className="text-xs text-secondary mt-0.5">Enter an API key to enable AI features</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">Academic Year Management</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
            <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
              Academic Year
            </h3>
            <p className="text-xs text-secondary mt-1">Start a new academic year to keep cases organized.</p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1">
              <p className="text-sm text-on-surface font-medium">Current Active Year: {currentYear}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSchoolYearModal(true)}
              className="btn-primary"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Start New School Year</span>
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-section-header text-sm font-bold uppercase tracking-[0.14em] text-secondary">Data Management</h2>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <div className="flex flex-col h-full bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
              <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
                System Backup & Recovery
              </h3>
              <p className="text-xs text-secondary mt-1">Access automatic backup configurations, manual backups, and restore points.</p>
            </div>
            <div className="p-6 flex-1 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-on-surface">Database Backups</p>
                <p className="text-xs text-secondary mt-0.5">Manage automated schedules, create manual backups, or restore data.</p>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange("backup")}
                className="btn-primary shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">backup</span>
                <span>Access Backup Tab</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col h-full bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40">
              <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
                Database Migration
              </h3>
              <p className="text-xs text-secondary mt-1">Export or import the full database for migration.</p>
            </div>
            <div className="p-6 flex-1 flex items-center justify-end sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => handleOpenVerification("export")}
                className="btn-primary flex-1"
              >
                <span className="material-symbols-outlined text-[18px]">upload</span>
                <span>Export Database</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenVerification("import")}
                className="btn-secondary flex-1"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>Import Database</span>
              </button>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {pinVerificationAction !== null && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className={`absolute inset-0 bg-black/45 ${
              isVerificationModalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={handleCloseVerification}
          />
          <form 
            onSubmit={handleVerifyAndExecute}
            className={`relative bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-outline-variant ${
              isVerificationModalClosing ? "modal-panel-exit" : "modal-panel-enter"
            }`}
          >
            <div className="flex items-center gap-3 text-primary dark:text-[#7f9cf8] mb-3">
              <span className="material-symbols-outlined text-[28px]">lock</span>
              <h3 className="text-xl font-bold">Verify PIN</h3>
            </div>
            <p className="text-secondary text-sm mb-6 leading-relaxed">
              Please enter your 6-digit counselor PIN to authorize this database action.
            </p>
            <div className="mb-6">
              {renderSecretInput(verificationPin, setVerificationPin, showVerificationPin, () => setShowVerificationPin((value) => !value), {
                className: secretPinClass,
                inputMode: "numeric",
                placeholder: "000000",
                cleanValue: cleanPin,
              })}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCloseVerification}
                className="btn-secondary"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={verificationBusy}
                className="btn-primary"
              >
                {verificationBusy ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">lock_open</span>
                )}
                <span>Verify & Proceed</span>
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {isRecoveryOtpOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45 modal-backdrop-enter"
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={() => setIsRecoveryOtpOpen(false)}
          />
          <form
            onSubmit={handleVerifyRecoveryOtp}
            className="relative bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-outline-variant modal-panel-enter"
          >
            <div className="flex items-center gap-3 text-primary dark:text-[#7f9cf8] mb-3">
              <span className="material-symbols-outlined text-[28px]">mark_email_read</span>
              <h3 className="text-xl font-bold">Verify Recovery Email</h3>
            </div>
            <p className="text-secondary text-sm mb-6 leading-relaxed">
              Enter the 6-digit code sent to {maskEmail(recoveryEmail)}. This unlocks visibility and editing until the app closes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={recoveryOtp}
              onChange={(e) => setRecoveryOtp(cleanPin(e.target.value))}
              className={`${pinClass} mb-6`}
              placeholder="000000"
              autoFocus
              autoComplete="one-time-code"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsRecoveryOtpOpen(false)}
                className="btn-secondary flex-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={recoveryOtpVerifying || !validatePin(recoveryOtp)}
                className="btn-primary flex-1"
              >
                {recoveryOtpVerifying ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                )}
                <span>Verify</span>
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {isPinChangeOtpOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45 modal-backdrop-enter"
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={() => setIsPinChangeOtpOpen(false)}
          />
          <form
            onSubmit={handleVerifyPinChangeOtp}
            className="relative bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-outline-variant modal-panel-enter"
          >
            <div className="flex items-center gap-3 text-primary dark:text-[#7f9cf8] mb-3">
              <span className="material-symbols-outlined text-[28px]">password</span>
              <h3 className="text-xl font-bold">Verify PIN Change</h3>
            </div>
            <p className="text-secondary text-sm mb-6 leading-relaxed">
              Enter the 6-digit code sent to {maskEmail(recoveryEmail)}. The PIN fields will appear after verification.
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={pinChangeOtp}
              onChange={(e) => setPinChangeOtp(cleanPin(e.target.value))}
              className={`${pinClass} mb-6`}
              placeholder="000000"
              autoFocus
              autoComplete="one-time-code"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsPinChangeOtpOpen(false)}
                className="btn-secondary flex-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={pinChangeOtpVerifying || !validatePin(pinChangeOtp)}
                className="btn-primary flex-1"
              >
                {pinChangeOtpVerifying ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                )}
                <span>Verify</span>
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {showSchoolYearModal && (
        <SchoolYearSetupModal
          onComplete={async (y) => {
            await setYear(y);
            await refreshYears();
            setShowSchoolYearModal(false);
          }}
          onCancel={() => setShowSchoolYearModal(false)}
          title="Start New Academic Year"
          description="Enter the starting year for the new academic year. Your previous cases will remain accessible under their respective years."
        />
      )}
    </div>
  );
}
