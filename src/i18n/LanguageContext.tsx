import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "zh";

import { DICTIONARY, MessageKey } from "./locales";

export { DICTIONARY };
export type { MessageKey };

export function formatMessage(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

export interface LanguageContextType {
  language: Language;
  isZh: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: MessageKey | (string & Record<never, never>), vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function getInitialLanguage(): Language {
  const storage = typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : typeof localStorage !== "undefined"
    ? localStorage
    : null;

  if (storage) {
    try {
      const saved = storage.getItem("groove_language") as Language | null;
      if (saved === "en" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav) {
    const navLang = nav.language || (nav as any).userLanguage || "";
    const resolved: Language = navLang.toLowerCase().startsWith("zh") ? "zh" : "en";
    if (storage) {
      try {
        storage.setItem("groove_language", resolved);
      } catch {
        // Ignore localStorage write errors
      }
    }
    return resolved;
  }

  return "zh";
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
      document.title = language === "zh" 
        ? "GROOVE LAB | 音乐曲风探索与律动工作台" 
        : "GROOVE LAB | Music Genre Learning & Sequencer";
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("groove_language", lang);
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  const t = (key: MessageKey | (string & Record<never, never>), vars?: Record<string, string | number>): string => {
    const keyStr = String(key);
    const entry = (DICTIONARY as Record<string, { en: string; zh: string }>)[keyStr];
    if (!entry) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing translation key: "${keyStr}"`);
      }
      return vars ? formatMessage(keyStr, vars) : keyStr;
    }
    const raw = String(entry[language] || entry.en || keyStr);
    return vars ? formatMessage(raw, vars) : raw;
  };

  const isZh = language === "zh";

  return (
    <LanguageContext.Provider value={{ language, isZh, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: "zh",
      isZh: true,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: MessageKey | (string & Record<never, never>), vars?: Record<string, string | number>): string => {
        const keyStr = String(key);
        const entry = (DICTIONARY as Record<string, { en: string; zh: string }>)[keyStr];
        if (!entry) return vars ? formatMessage(keyStr, vars) : keyStr;
        const raw = String(entry.zh || entry.en || keyStr);
        return vars ? formatMessage(raw, vars) : raw;
      },
    };
  }
  return context;
};
