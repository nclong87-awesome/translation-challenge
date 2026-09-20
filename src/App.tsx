/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { MobileTranslationChallenge } from "./components/MobileTranslationChallenge";
import { AccessKeyModal } from "./components/AccessKeyModal";
import { EstimatedResponseProgress } from "./components/EstimatedResponseProgress";
import {
  getStoredAccessKey,
  setStoredAccessKey,
  removeStoredAccessKey,
  isStoredSampleMode,
  setStoredSampleMode,
  clearStoredSampleMode,
  initAccessKeyFromServer,
} from "./services/accessKey";

export default function App() {
  const [accessKey, setAccessKey] = useState<string | null>(() => getStoredAccessKey());
  const [isSampleMode, setIsSampleMode] = useState<boolean>(() => isStoredSampleMode());
  const [isEditingKey, setIsEditingKey] = useState(false);

  React.useEffect(() => {
    if (!accessKey && !isSampleMode) {
      initAccessKeyFromServer().then((key) => {
        if (key) {
          setAccessKey(key);
        }
      });
    }
  }, [accessKey, isSampleMode]);

  const isAppUnlocked = Boolean(accessKey || isSampleMode);

  const handleSaveKey = (newKey: string) => {
    setStoredAccessKey(newKey);
    setAccessKey(newKey);
    setStoredSampleMode(false);
    setIsSampleMode(false);
    setIsEditingKey(false);
  };

  const handleSkipToSampleMode = () => {
    setStoredSampleMode(true);
    setIsSampleMode(true);
    setIsEditingKey(false);
  };

  const handleClearKey = () => {
    removeStoredAccessKey();
    clearStoredSampleMode();
    setAccessKey(null);
    setIsSampleMode(false);
    setIsEditingKey(false);
  };

  return (
    <div className="min-h-screen bg-stone-200/70 sm:py-6 flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md shadow-2xl rounded-none sm:rounded-3xl overflow-hidden border-0 sm:border border-stone-300/80 bg-white min-h-[600px] flex flex-col justify-center">
        {isAppUnlocked ? (
          <MobileTranslationChallenge
            accessKey={accessKey}
            isSampleMode={isSampleMode}
            onChangeAccessKey={() => setIsEditingKey(true)}
            onClearAccessKey={handleClearKey}
          />
        ) : (
          <div
            id="gatekeeper-placeholder"
            className="p-8 flex flex-col items-center justify-center text-center gap-5 my-auto"
          >
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-xs">
              <KeyRound className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <h1 className="text-base font-bold text-stone-900 tracking-tight">
                Thử thách Dịch thuật
              </h1>
              <p className="text-xs text-stone-500 leading-relaxed">
                Vui lòng nhập mã truy cập của bạn để kích hoạt hoặc trải nghiệm với chế độ mẫu.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <button
                id="btn-reopen-access-key-dialog"
                type="button"
                onClick={() => setIsEditingKey(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs active:scale-95"
              >
                Nhập mã truy cập
              </button>
              <button
                id="btn-gatekeeper-skip-sample"
                type="button"
                onClick={handleSkipToSampleMode}
                className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition border border-stone-200 active:scale-95"
              >
                Dùng thử bản mẫu
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mã được lưu vào Local Storage trên trình duyệt</span>
            </div>
          </div>
        )}
      </div>

      {/* Access Key Modal Dialog */}
      <AccessKeyModal
        isOpen={!isAppUnlocked || isEditingKey}
        initialKey={accessKey}
        canCancel={isAppUnlocked}
        isSampleMode={isSampleMode}
        onClose={() => setIsEditingKey(false)}
        onSave={handleSaveKey}
        onSkipSampleMode={handleSkipToSampleMode}
      />

      {/* Global LLM Request Progress Modal Dialog */}
      <EstimatedResponseProgress />
    </div>
  );
}

